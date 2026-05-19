import { google } from 'googleapis'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TOKEN_FILE = path.join(
  process.env.WORKSPACE_PATH ?? path.join(os.homedir(), '.openclaw', 'workspace'),
  'gmail-token.json'
)

function loadTokens() {
  // Prefer saved OAuth token (from any account the user connected)
  if (fs.existsSync(TOKEN_FILE)) {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'))
  }
  // Fallback to env vars (original hardcoded account)
  return {
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    access_token: process.env.GMAIL_ACCESS_TOKEN,
  }
}

export function getConnectedEmail(): string | null {
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8')).email ?? null
    } catch { return null }
  }
  return process.env.GOG_ACCOUNT ?? null
}

export interface ParsedEmail {
  id: string
  threadId: string
  labelIds: string[]
  folder: 'sent' | 'inbox'
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  bodyText: string
}

export function getGmailClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3001/api/gmail/callback'
  )
  auth.setCredentials(loadTokens())
  return google.gmail({ version: 'v1', auth })
}

function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  if (payload.parts) {
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, 'base64').toString('utf-8')
    }
    // recurse into nested parts
    for (const part of payload.parts) {
      const text = extractBody(part)
      if (text) return text
    }
  }
  return ''
}

function parseMessage(raw: any, folder: 'sent' | 'inbox'): ParsedEmail {
  const headers: { name: string; value: string }[] = raw.data.payload?.headers ?? []
  const get = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

  return {
    id: raw.data.id,
    threadId: raw.data.threadId,
    labelIds: raw.data.labelIds ?? [],
    folder,
    from: get('from'),
    to: get('to'),
    subject: get('subject'),
    date: get('date'),
    snippet: raw.data.snippet ?? '',
    bodyText: extractBody(raw.data.payload),
  }
}

export async function fetchEmails(): Promise<ParsedEmail[]> {
  const gmail = getGmailClient()

  const [inboxList, sentList] = await Promise.all([
    gmail.users.messages.list({ userId: 'me', labelIds: ['INBOX'], maxResults: 10 }),
    gmail.users.messages.list({ userId: 'me', labelIds: ['SENT'], maxResults: 10 }),
  ])

  const inboxIds = (inboxList.data.messages ?? []).map((m) => ({ id: m.id!, folder: 'inbox' as const }))
  const sentIds = (sentList.data.messages ?? []).map((m) => ({ id: m.id!, folder: 'sent' as const }))
  const allIds = [...inboxIds, ...sentIds]

  const messages = await Promise.all(
    allIds.map(({ id, folder }) =>
      gmail.users.messages
        .get({ userId: 'me', id, format: 'full' })
        .then((raw) => parseMessage(raw, folder))
    )
  )

  return messages
}

export async function verifyConnection(): Promise<string> {
  const gmail = getGmailClient()
  const profile = await gmail.users.getProfile({ userId: 'me' })
  return profile.data.emailAddress ?? ''
}
