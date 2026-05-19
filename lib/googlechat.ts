import { google } from 'googleapis'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getWorkspacePath, writeWorkspaceJSON } from './workspace'

const TOKEN_FILE = path.join(
  process.env.WORKSPACE_PATH ?? path.join(os.homedir(), '.openclaw', 'workspace'),
  'googlechat-token.json'
)

export const GOOGLE_CHAT_REDIRECT_URI =
  process.env.GOOGLE_CHAT_REDIRECT_URI ?? 'http://localhost:3000/api/googlechat/callback'

export const GOOGLE_CHAT_SCOPES = [
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/chat.messages',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
  'email',
]

const DEVANAGARI_RE = /[\u0900-\u097F]/
const HINDI_KEYWORDS = ['yaar', 'bhai', 'kya', 'haan', 'nahi', 'kar', 'hai', 'theek', 'abhi']

export interface GoogleChatConfig {
  access_token?: string
  refresh_token?: string
  scope?: string
  token_type?: string
  expiry_date?: number
  email?: string
  connectedAt: string
  defaultSpaceId?: string
}

export interface GoogleChatState {
  lastImportedAt?: string
  lastImportedMessageId?: string
}

export interface GoogleChatMessage {
  id: string
  spaceId: string
  spaceName: string
  sender: string
  senderId?: string
  text: string
  date: string
  incoming: boolean
  threadName?: string
}

export interface GoogleChatPolledRow {
  id: string
  spaceId: string
  spaceName: string
  sender: string
  senderId?: string
  text: string
  date: string
  incoming: boolean
  threadName?: string
}

export type GoogleChatWebhookRow = GoogleChatPolledRow

function loadTokens() {
  if (fs.existsSync(TOKEN_FILE)) {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'))
  }
  return {
    refresh_token: process.env.GOOGLE_CHAT_REFRESH_TOKEN,
    access_token: process.env.GOOGLE_CHAT_ACCESS_TOKEN,
  }
}

export function loadGoogleChatConfig(): GoogleChatConfig | null {
  if (!fs.existsSync(TOKEN_FILE)) return null
  return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'))
}

export function saveGoogleChatConfig(config: GoogleChatConfig) {
  writeWorkspaceJSON('googlechat-token.json', config)
}

function loadGoogleChatState(): GoogleChatState {
  const file = getWorkspacePath('googlechat-state.json')
  if (!fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as GoogleChatState
  } catch {
    return {}
  }
}

function saveGoogleChatState(state: GoogleChatState) {
  writeWorkspaceJSON('googlechat-state.json', state)
}

export function getGoogleChatOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_CHAT_REDIRECT_URI
  )
}

export function getGoogleChatClient() {
  const auth = getGoogleChatOAuthClient()
  auth.setCredentials(loadTokens())
  return google.chat({ version: 'v1', auth })
}

export async function verifyGoogleChatConnection() {
  const auth = getGoogleChatOAuthClient()
  auth.setCredentials(loadTokens())
  const oauth2 = google.oauth2({ version: 'v2', auth })
  const profile = await oauth2.userinfo.get()
  return profile.data.email ?? ''
}

async function listAllSpaces() {
  const chat = getGoogleChatClient()
  const spaces: Array<{ name?: string; displayName?: string; spaceType?: string }> = []
  let pageToken: string | undefined
  do {
    const res = await chat.spaces.list({
      pageSize: 100,
      pageToken,
      filter: 'spaceType = "SPACE" OR spaceType = "GROUP_CHAT" OR spaceType = "DIRECT_MESSAGE"',
    })
    spaces.push(...((res.data.spaces ?? []) as Array<{ name?: string; displayName?: string; spaceType?: string }>))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return spaces
}

async function listMessagesForSpace(spaceName: string, createdAfter?: string) {
  const chat = getGoogleChatClient()
  const rows: Array<Record<string, any>> = []
  let pageToken: string | undefined
  do {
    const params: Record<string, unknown> = {
      parent: spaceName,
      orderBy: 'DESC',
      pageSize: 100,
      pageToken,
    }
    if (createdAfter) {
      params.filter = `createTime > "${createdAfter}"`
    }
    const res = await chat.spaces.messages.list(params)
    rows.push(...((res.data.messages ?? []) as Array<Record<string, any>>))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return rows
}

function detectLanguage(texts: string[]): string[] {
  const combined = texts.join(' ').toLowerCase()
  const langs = new Set<string>()
  if (DEVANAGARI_RE.test(combined)) langs.add('Hindi')
  if (HINDI_KEYWORDS.some((w) => combined.split(/\W+/).includes(w))) langs.add('Hinglish')
  langs.add('English')
  return Array.from(langs)
}

function buildChatStyleProfile(messages: GoogleChatMessage[], accountEmail: string) {
  const texts = messages.filter((m) => m.incoming).map((m) => m.text)
  const avgWords = texts.length
    ? Math.round(texts.map((t) => t.split(/\s+/).length).reduce((a, b) => a + b, 0) / texts.length)
    : 0
  return {
    generatedAt: new Date().toISOString(),
    basedOnMessages: texts.length,
    accountEmail,
    detectedLanguages: detectLanguage(texts),
    styleSignals: {
      averageWordCount: avgWords,
      usesExclamationMark: texts.some((t) => t.includes('!')),
      sentenceStructure: avgWords < 12 ? 'short-chatty' : avgWords < 30 ? 'medium' : 'detailed',
    },
    sampleSnippets: texts.slice(0, 3),
  }
}

function readPolledFile(): GoogleChatPolledRow[] {
  const file = getWorkspacePath('googlechat-import', 'polled-inbox.json')
  if (!fs.existsSync(file)) return []
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writePolledFile(rows: GoogleChatPolledRow[]) {
  writeWorkspaceJSON('googlechat-import/polled-inbox.json', rows)
}

function webhookInboxPath() {
  return getWorkspacePath('googlechat-import', 'webhook-inbox.json')
}

function readWebhookFile(): GoogleChatWebhookRow[] {
  const file = webhookInboxPath()
  if (!fs.existsSync(file)) return []
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeWebhookFile(rows: GoogleChatWebhookRow[]) {
  writeWorkspaceJSON('googlechat-import/webhook-inbox.json', rows)
}

export function appendGoogleChatWebhookMessage(row: GoogleChatWebhookRow) {
  const rows = readWebhookFile()
  rows.push(row)
  const cap = 4000
  writeWebhookFile(rows.length > cap ? rows.slice(-cap) : rows)
}

export function readGoogleChatWebhookMessages(limit = 50): GoogleChatMessage[] {
  const rows = readWebhookFile().filter((r) => r.text.trim() && r.incoming)
  return rows.slice(-limit).map((r) => ({
    id: r.id,
    spaceId: r.spaceId,
    spaceName: r.spaceName,
    sender: r.sender,
    senderId: r.senderId,
    text: r.text,
    date: r.date,
    incoming: r.incoming,
    threadName: r.threadName,
  }))
}

export function appendGoogleChatPolledMessages(newRows: GoogleChatPolledRow[]) {
  const rows = readPolledFile()
  const byId = new Map(rows.map((row) => [row.id, row]))
  for (const row of newRows) byId.set(row.id, row)
  const merged = Array.from(byId.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const cap = 4000
  writePolledFile(merged.length > cap ? merged.slice(-cap) : merged)
}

export async function fetchGoogleChatMessages(): Promise<GoogleChatPolledRow[]> {
  const config = loadGoogleChatConfig()
  if (!config?.email) {
    throw new Error('Google Chat is not connected yet')
  }

  const state = loadGoogleChatState()
  const filterSince = state.lastImportedAt ? new Date(state.lastImportedAt).toISOString() : ''
  const spaces = await listAllSpaces()
  const rows: GoogleChatPolledRow[] = []
  for (const space of spaces) {
    const spaceName = space.name ?? ''
    if (!spaceName) continue
    const messages = await listMessagesForSpace(spaceName, filterSince || undefined)
    for (const message of messages) {
      const text = String(message.text ?? message.argumentText ?? '').trim()
      if (!text) continue
      const createdAt = message.createTime ? new Date(message.createTime).toISOString() : new Date().toISOString()
      const sender = message.sender?.displayName || message.sender?.name || 'Google Chat user'
      const senderId = message.sender?.name || message.sender?.email || undefined
      const senderEmail = String(message.sender?.email ?? '').trim().toLowerCase()
      const incoming = senderEmail ? senderEmail !== config.email.toLowerCase() : senderId !== 'users/me'
      rows.push({
        id: message.name ?? `${spaceName}-${message.createTime ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        spaceId: spaceName,
        spaceName: space.displayName || spaceName,
        sender,
        senderId,
        text,
        date: createdAt,
        incoming,
        threadName: message.thread?.name,
      })
    }
  }

  return rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export async function importGoogleChatMessages(limit = 50): Promise<GoogleChatMessage[]> {
  const webhookRows = readWebhookFile().filter((r) => r.text.trim() && r.incoming)
  if (webhookRows.length > 0) {
    return webhookRows.slice(-limit).map((r) => ({
      id: r.id,
      spaceId: r.spaceId,
      spaceName: r.spaceName,
      sender: r.sender,
      senderId: r.senderId,
      text: r.text,
      date: r.date,
      incoming: r.incoming,
      threadName: r.threadName,
    }))
  }

  const rows = readPolledFile().filter((r) => r.text.trim())
  if (rows.length > 0) {
    const latest = rows[rows.length - 1]
    saveGoogleChatState({
      lastImportedAt: latest.date,
      lastImportedMessageId: latest.id,
    })
  }
  return rows.filter((r) => r.incoming).slice(-limit).map((r) => ({
    id: r.id,
    spaceId: r.spaceId,
    spaceName: r.spaceName,
    sender: r.sender,
    senderId: r.senderId,
    text: r.text,
    date: r.date,
    incoming: r.incoming,
    threadName: r.threadName,
  }))
}

export function readLatestGoogleChatImport(max = 10): GoogleChatMessage[] {
  const dir = getWorkspacePath('googlechat-import')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => /^messages-.*\.json$/.test(f))
  if (files.length === 0) return []
  const latest = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.f
  if (!latest) return []
  try {
    const payload = JSON.parse(fs.readFileSync(path.join(dir, latest), 'utf-8')) as { messages?: GoogleChatMessage[] }
    return (payload.messages ?? []).slice(-max)
  } catch {
    return []
  }
}

export function buildGoogleChatStyleProfile(messages: GoogleChatMessage[], accountEmail: string) {
  return buildChatStyleProfile(messages, accountEmail)
}

export async function sendGoogleChatMessage(spaceId: string, text: string, threadName?: string) {
  const chat = getGoogleChatClient()
  const requestBody: Record<string, unknown> = { text }
  if (threadName) {
    requestBody.thread = {
      name: threadName,
    }
  }
  await chat.spaces.messages.create({
    parent: spaceId,
    requestBody,
  })
}

export function getGoogleChatConnectedEmail(): string | null {
  return loadGoogleChatConfig()?.email ?? null
}
