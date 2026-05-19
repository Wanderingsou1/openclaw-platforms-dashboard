import { NextResponse } from 'next/server'
import { getGmailClient } from '@/lib/gmail'
import { readLatestTelegramImport } from '@/lib/telegram'
import { readLatestSlackImport } from '@/lib/slack'
import { loadTeamsConfig, readLatestTeamsImport } from '@/lib/teams'
import { getViberPresetDraft, loadViberConfig, readViberInboxPreview } from '@/lib/viber'
import { getWeChatPresetDraft, loadWeChatConfig, readWeChatInboxPreview } from '@/lib/wechat'
import { getSignalPresetDraft, loadSignalConfig, readSignalInboxPreview } from '@/lib/signal'
import { getLinePresetDraft, loadLineConfig, readLineInboxPreview } from '@/lib/line'
import { loadGoogleChatConfig, readLatestGoogleChatImport } from '@/lib/googlechat'
import fs from 'fs'
import os from 'os'
import path from 'path'

const WORKSPACE = process.env.WORKSPACE_PATH ?? path.join(os.homedir(), '.openclaw', 'workspace')
const SENT_DB = path.join(WORKSPACE, 'inbox-sent.json')

function readSentDb(): Record<string, { sentAt: string; platform: string; to: string; body: string }> {
  try {
    if (!fs.existsSync(SENT_DB)) return {}
    return JSON.parse(fs.readFileSync(SENT_DB, 'utf-8')) ?? {}
  } catch {
    return {}
  }
}

export interface IncomingMessage {
  id: string
  platform: 'email' | 'whatsapp' | 'telegram' | 'slack' | 'teams' | 'viber' | 'wechat' | 'signal' | 'line' | 'googlechat'
  sender: string
  senderEmail: string
  subject: string
  body: string
  receivedAt: string
  snippet: string
  threadName?: string
  /** Suggested reply from local fixture (skips initial AI draft). */
  presetDraft?: string
  /** Whether a reply was already approved/sent from this UI. */
  sent?: boolean
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
    for (const part of payload.parts) {
      const text = extractBody(part)
      if (text) return text
    }
  }
  return ''
}

function parseSender(from: string): { name: string; email: string } {
  // "John Doe <john@example.com>" or "john@example.com"
  const match = from.match(/^(.+?)\s*<(.+?)>$/)
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() }
  return { name: from, email: from }
}

async function fetchEmailMessages(): Promise<IncomingMessage[]> {
  const gmail = getGmailClient()
  const list = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX', 'UNREAD'],
    maxResults: 10,
  })

  const messageIds = list.data.messages ?? []
  if (messageIds.length === 0) return []

  const messages = await Promise.all(
    messageIds.map((m) =>
      gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'full' })
    )
  )

  return messages.map((raw) => {
    const headers = (raw.data.payload?.headers ?? []) as { name: string; value: string }[]
    const get = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

    const from = get('from')
    const { name, email } = parseSender(from)
    const body = extractBody(raw.data.payload)

    return {
      id: raw.data.id!,
      platform: 'email',
      sender: name || email,
      senderEmail: email,
      subject: get('subject') || '(no subject)',
      body: body.slice(0, 2000),
      receivedAt: get('date'),
      snippet: raw.data.snippet ?? '',
    }
  })
}

function fetchTelegramMessages(): IncomingMessage[] {
  const telegram = readLatestTelegramImport()
    .filter((m) => m.incoming)
    .slice(-10)
    .reverse()

  return telegram.map((m) => ({
    id: `telegram:${m.id}`,
    platform: 'telegram',
    sender: m.sender,
    senderEmail: m.chatId,
    subject: 'Telegram message',
    body: m.text.slice(0, 2000),
    receivedAt: m.date,
    snippet: m.text.slice(0, 140),
  }))
}

function fetchSlackMessages(): IncomingMessage[] {
  const slack = readLatestSlackImport()
    .filter((m) => m.incoming)
    .slice(-10)
    .reverse()

  return slack.map((m) => ({
    id: `slack:${m.id}`,
    platform: 'slack',
    sender: m.sender,
    senderEmail: m.channelId,
    subject: 'Slack message',
    body: m.text.slice(0, 2000),
    receivedAt: m.date,
    snippet: m.text.slice(0, 140),
  }))
}

function fetchTeamsMessages(): IncomingMessage[] {
  const config = loadTeamsConfig()
  if (!config) return []
  const teams = readLatestTeamsImport(10)
  return teams.map((m) => ({
    id: `teams:${m.id}`,
    platform: 'teams',
    sender: m.sender,
    senderEmail: m.chatId,
    subject: m.chatName || 'Teams message',
    body: m.text.slice(0, 2000),
    receivedAt: m.date,
    snippet: m.text.slice(0, 140),
    threadName: m.threadName,
  }))
}

function fetchViberMessages(): IncomingMessage[] {
  const config = loadViberConfig()
  if (!config?.peerUserId) return []
  const msgs = readViberInboxPreview(config.peerUserId, 10)
    .filter((m) => !m.text.startsWith('['))
    .reverse()
  return msgs.map((m) => {
    const id = `viber:${m.id}`
    return {
      id,
      platform: 'viber' as const,
      sender: m.sender,
      senderEmail: config.peerUserId,
      subject: 'Viber message',
      body: m.text.slice(0, 2000),
      receivedAt: m.date,
      snippet: m.text.slice(0, 140),
      presetDraft: getViberPresetDraft(id),
    }
  })
}

function fetchWeChatMessages(): IncomingMessage[] {
  const config = loadWeChatConfig()
  if (!config?.openId) return []
  const msgs = readWeChatInboxPreview(config.openId, 10).reverse()
  return msgs.map((m) => {
    const id = `wechat:${m.id}`
    return {
      id,
      platform: 'wechat' as const,
      sender: m.sender,
      senderEmail: config.openId,
      subject: 'WeChat message',
      body: m.text.slice(0, 2000),
      receivedAt: m.date,
      snippet: m.text.slice(0, 140),
      presetDraft: getWeChatPresetDraft(id),
    }
  })
}

function fetchSignalMessages(): IncomingMessage[] {
  const config = loadSignalConfig()
  const msgs = readSignalInboxPreview(10).reverse()
  return msgs.map((m) => {
    const id = `signal:${m.id}`
    return {
      id,
      platform: 'signal' as const,
      sender: m.sender,
      senderEmail: m.senderNumber || config?.recipientNumber || config?.phoneNumber || '',
      subject: 'Signal message',
      body: m.text.slice(0, 2000),
      receivedAt: m.date,
      snippet: m.text.slice(0, 140),
      presetDraft: getSignalPresetDraft(id),
    }
  })
}

function fetchLineMessages(): IncomingMessage[] {
  const config = loadLineConfig()
  if (!config?.userId) return []
  const msgs = readLineInboxPreview(config.userId, 10).reverse()
  return msgs.map((m) => {
    const id = `line:${m.id}`
    return {
      id,
      platform: 'line' as const,
      sender: m.sender || config.displayName || config.userId,
      senderEmail: config.userId,
      subject: 'LINE message',
      body: m.text.slice(0, 2000),
      receivedAt: m.date,
      snippet: m.text.slice(0, 140),
      presetDraft: getLinePresetDraft(id),
    }
  })
}

function fetchGoogleChatMessages(): IncomingMessage[] {
  const config = loadGoogleChatConfig()
  const msgs = readLatestGoogleChatImport(25).reverse()
  return msgs.map((m) => {
    const id = `googlechat:${m.id}`
    return {
      id,
      platform: 'googlechat' as const,
      sender: m.sender,
      senderEmail: m.spaceId || config?.defaultSpaceId || '',
      subject: m.spaceName || 'Google Chat message',
      body: m.text.slice(0, 2000),
      receivedAt: m.date,
      snippet: m.text.slice(0, 140),
      threadName: m.threadName,
      presetDraft: undefined,
    }
  })
}

export async function GET() {
  const warnings: string[] = []
  const messages: IncomingMessage[] = []
  const sentDb = readSentDb()

  try {
    messages.push(...(await fetchEmailMessages()))
  } catch (err: any) {
    warnings.push(`email: ${err.message}`)
  }

  try {
    messages.push(...fetchTelegramMessages())
  } catch (err: any) {
    warnings.push(`telegram: ${err.message}`)
  }

  try {
    messages.push(...fetchSlackMessages())
  } catch (err: any) {
    warnings.push(`slack: ${err.message}`)
  }

  try {
    messages.push(...fetchTeamsMessages())
  } catch (err: any) {
    warnings.push(`teams: ${err.message}`)
  }

  try {
    messages.push(...fetchViberMessages())
  } catch (err: any) {
    warnings.push(`viber: ${err.message}`)
  }

  try {
    messages.push(...fetchWeChatMessages())
  } catch (err: any) {
    warnings.push(`wechat: ${err.message}`)
  }

  try {
    messages.push(...fetchSignalMessages())
  } catch (err: any) {
    warnings.push(`signal: ${err.message}`)
  }

  try {
    messages.push(...fetchLineMessages())
  } catch (err: any) {
    warnings.push(`line: ${err.message}`)
  }

  try {
    messages.push(...fetchGoogleChatMessages())
  } catch (err: any) {
    warnings.push(`googlechat: ${err.message}`)
  }

  messages.sort((a, b) => new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime())
  for (const m of messages) {
    const sent = sentDb[m.id]
    if (sent && sent.platform === m.platform) m.sent = true
  }
  return NextResponse.json({ messages, warnings })
}
