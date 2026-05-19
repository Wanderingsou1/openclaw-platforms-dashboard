import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getWorkspacePath, writeWorkspaceJSON } from './workspace'

const GOOGLE_CHAT_CONFIG_COOKIE = 'openclaw_googlechat_config'
const GOOGLE_CHAT_STATE_COOKIE = 'openclaw_googlechat_state'
const GOOGLE_CHAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

function cookieOptions(maxAge = GOOGLE_CHAT_COOKIE_MAX_AGE) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

function encodeCookieValue(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function decodeCookieValue<T>(value?: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf-8')) as T
  } catch {
    return null
  }
}

function readCookieValue<T>(name: string): T | null {
  return decodeCookieValue<T>(cookies().get(name)?.value)
}

function setCookieValue(response: NextResponse, name: string, value: unknown) {
  response.cookies.set(name, encodeCookieValue(value), cookieOptions())
}

function clearCookieValue(response: NextResponse, name: string) {
  response.cookies.set(name, '', cookieOptions(0))
}

export function getPublicAppUrl() {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL
  if (envUrl) return envUrl.replace(/\/$/, '')
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) {
    return vercelUrl.startsWith('http://') || vercelUrl.startsWith('https://')
      ? vercelUrl.replace(/\/$/, '')
      : `https://${vercelUrl.replace(/\/$/, '')}`
  }
  return 'http://localhost:3000'
}

export function getGoogleChatRedirectUri() {
  return process.env.GOOGLE_CHAT_REDIRECT_URI ?? `${getPublicAppUrl()}/api/googlechat/callback`
}

export function getGoogleChatRedirectUriFromRequest(requestUrl: string) {
  return new URL('/api/googlechat/callback', requestUrl).toString()
}

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

export async function loadGoogleChatConfig(): Promise<GoogleChatConfig | null> {
  return readCookieValue<GoogleChatConfig>(GOOGLE_CHAT_CONFIG_COOKIE)
}

export function setGoogleChatConfig(response: NextResponse, config: GoogleChatConfig) {
  setCookieValue(response, GOOGLE_CHAT_CONFIG_COOKIE, config)
}

async function loadGoogleChatState(): Promise<GoogleChatState> {
  return readCookieValue<GoogleChatState>(GOOGLE_CHAT_STATE_COOKIE) ?? {}
}

export function setGoogleChatState(response: NextResponse, state: GoogleChatState) {
  setCookieValue(response, GOOGLE_CHAT_STATE_COOKIE, state)
}

export function clearGoogleChatState(response: NextResponse) {
  clearCookieValue(response, GOOGLE_CHAT_STATE_COOKIE)
}

export function clearGoogleChatConfig(response: NextResponse) {
  clearCookieValue(response, GOOGLE_CHAT_CONFIG_COOKIE)
}

export function getGoogleChatOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getGoogleChatRedirectUri()
  )
}

async function loadTokens() {
  const config = await loadGoogleChatConfig()
  if (config) return config
  return {
    refresh_token: process.env.GOOGLE_CHAT_REFRESH_TOKEN,
    access_token: process.env.GOOGLE_CHAT_ACCESS_TOKEN,
  }
}

export async function getGoogleChatClient() {
  const auth = getGoogleChatOAuthClient()
  auth.setCredentials(await loadTokens())
  return google.chat({ version: 'v1', auth })
}

export async function verifyGoogleChatConnection() {
  const auth = getGoogleChatOAuthClient()
  auth.setCredentials(await loadTokens())
  const oauth2 = google.oauth2({ version: 'v2', auth })
  const profile = await oauth2.userinfo.get()
  return profile.data.email ?? ''
}

async function listAllSpaces() {
  const chat = await getGoogleChatClient()
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
  const chat = await getGoogleChatClient()
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
  const config = await loadGoogleChatConfig()
  if (!config?.email) {
    throw new Error('Google Chat is not connected yet')
  }

  const state = await loadGoogleChatState()
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

export async function importGoogleChatMessages(
  limit = 50
): Promise<{ messages: GoogleChatMessage[]; state?: GoogleChatState }> {
  const webhookRows = readWebhookFile().filter((r) => r.text.trim() && r.incoming)
  if (webhookRows.length > 0) {
    const messages = webhookRows.slice(-limit).map((r) => ({
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
    const latest = webhookRows[webhookRows.length - 1]
    return {
      messages,
      state: latest
        ? {
            lastImportedAt: latest.date,
            lastImportedMessageId: latest.id,
          }
        : undefined,
    }
  }

  const rows = readPolledFile().filter((r) => r.text.trim())
  const messages = rows.filter((r) => r.incoming).slice(-limit).map((r) => ({
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
  const latest = rows[rows.length - 1]
  return {
    messages,
    state: latest
      ? {
          lastImportedAt: latest.date,
          lastImportedMessageId: latest.id,
        }
      : undefined,
  }
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
  const chat = await getGoogleChatClient()
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

export async function getGoogleChatConnectedEmail(): Promise<string | null> {
  return (await loadGoogleChatConfig())?.email ?? null
}
