import fs from 'fs'
import path from 'path'
import { getWorkspacePath, writeWorkspaceJSON } from './workspace'

export interface TeamsConfig {
  clientId: string
  clientSecret: string
  tenantId: string
  accountName: string
  defaultChatId?: string
  webhookUrl: string
  subscriptionId?: string
  subscriptionExpiry?: string
  connectedAt: string
}

export interface TeamsMessage {
  id: string
  chatId: string
  chatName: string
  sender: string
  senderId?: string
  text: string
  date: string
  incoming: boolean
  threadName?: string
}

const DEVANAGARI_RE = /[\u0900-\u097F]/
const HINDI_KEYWORDS = ['yaar', 'bhai', 'kya', 'haan', 'nahi', 'kar', 'hai', 'theek', 'abhi']

const TOKEN_BUFFER_MS = 60_000

const TEAMS_CLIENT_STATE =
  process.env.TEAMS_CLIENT_STATE?.trim() || 'openclaw-teams-secret-change-me'
export const DEFAULT_TEAMS_WEBHOOK_URL =
  'https://openclaw-platforms-dashboard.vercel.app/api/teams/webhook'

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

export function getTeamsWebhookUrl(baseUrl = getPublicAppUrl()) {
  return new URL('/api/teams/webhook', baseUrl).toString()
}

export function getDefaultTeamsWebhookUrl() {
  return process.env.TEAMS_WEBHOOK_URL?.trim() || DEFAULT_TEAMS_WEBHOOK_URL
}

export function getTeamsWebhookUrlFromRequest(requestUrl: string) {
  return new URL('/api/teams/webhook', requestUrl).toString()
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

function configPath() {
  return getWorkspacePath('teams-import', 'bot-config.json')
}

function webhookInboxPath() {
  return getWorkspacePath('teams-import', 'webhook-inbox.json')
}

function polledInboxPath() {
  return getWorkspacePath('teams-import', 'polled-inbox.json')
}

function readJSONFile<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function writeRows(file: string, rows: TeamsMessage[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf-8')
}

function readRows(file: string): TeamsMessage[] {
  return readJSONFile<TeamsMessage[]>(file, [])
}

function upsertRows(file: string, row: TeamsMessage) {
  const rows = readRows(file)
  const byId = new Map(rows.map((item) => [item.id, item]))
  byId.set(row.id, row)
  const merged = Array.from(byId.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const cap = 4000
  writeRows(file, merged.length > cap ? merged.slice(-cap) : merged)
}

function mergeRows(file: string, rows: TeamsMessage[]) {
  const current = readRows(file)
  const byId = new Map(current.map((item) => [item.id, item]))
  for (const row of rows) byId.set(row.id, row)
  const merged = Array.from(byId.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const cap = 4000
  writeRows(file, merged.length > cap ? merged.slice(-cap) : merged)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(Number.parseInt(n, 16)))
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function detectLanguage(texts: string[]): string[] {
  const combined = texts.join(' ').toLowerCase()
  const langs = new Set<string>()
  if (DEVANAGARI_RE.test(combined)) langs.add('Hindi')
  if (HINDI_KEYWORDS.some((w) => combined.split(/\W+/).includes(w))) langs.add('Hinglish')
  langs.add('English')
  return Array.from(langs)
}

function extractGreetings(texts: string[]): string[] {
  const greetings = new Set<string>()
  const patterns = [/^(hi|hey|hello|dear|good\s+\w+)/i]
  for (const text of texts) {
    const first = text.trim().split('\n')[0]
    for (const pattern of patterns) {
      const match = first.match(pattern)
      if (match) greetings.add(match[0].trim())
    }
  }
  return Array.from(greetings).slice(0, 5)
}

function extractClosings(texts: string[]): string[] {
  const closings = new Set<string>()
  const patterns = [/\b(thanks|thank you|regards|best|cheers|sincerely|warm regards|yours truly|take care)\b/i]
  for (const text of texts) {
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) closings.add(match[0].toLowerCase())
    }
  }
  return Array.from(closings).slice(0, 5)
}

function extractWords(texts: string[]) {
  return texts.length
    ? Math.round(texts.map((text) => text.split(/\s+/).length).reduce((a, b) => a + b, 0) / texts.length)
    : 0
}

function parseChatAndMessageId(resource: string) {
  const chatMatch =
    resource.match(/chats\('([^']+)'\)/i) ??
    resource.match(/chats\(([^)]+)\)/i) ??
    resource.match(/chatId='([^']+)'/i)
  const messageMatch =
    resource.match(/messages\('([^']+)'\)/i) ??
    resource.match(/messages\(([^)]+)\)/i) ??
    resource.match(/messageId='([^']+)'/i)

  const chatId = chatMatch?.[1]?.replace(/^'|'$/g, '') ?? ''
  const messageId = messageMatch?.[1]?.replace(/^'|'$/g, '') ?? ''
  return { chatId, messageId }
}

async function getAccessToken(tenantId: string, clientId: string, clientSecret: string) {
  const cacheKey = `${tenantId}:${clientId}`
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + TOKEN_BUFFER_MS) {
    return cached.token
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  })

  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Teams token request failed')
  }
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  })
  return data.access_token
}

async function graphApi<T>(
  config: Pick<TeamsConfig, 'clientId' | 'clientSecret' | 'tenantId'>,
  method: string,
  urlPath: string,
  body?: unknown,
  version: 'v1.0' | 'beta' = 'v1.0'
): Promise<T> {
  const token = await getAccessToken(config.tenantId, config.clientId, config.clientSecret)
  const res = await fetch(`https://graph.microsoft.com/${version}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const data = text ? (() => {
    try {
      return JSON.parse(text)
    } catch {
      return { raw: text }
    }
  })() : {}

  if (!res.ok) {
    const err = data as Record<string, any>
    throw new Error(
      err.error?.message ||
        err.error_description ||
        err.raw ||
        `Teams ${method} ${urlPath} failed with ${res.status}`
    )
  }

  return data as T
}

export function loadTeamsConfig(): TeamsConfig | null {
  return readJSONFile<TeamsConfig | null>(configPath(), null)
}

export function saveTeamsConfig(config: TeamsConfig) {
  writeWorkspaceJSON('teams-import/bot-config.json', config)
}

export function teamsConfigPath() {
  return configPath()
}

export function getTeamsClientState() {
  return TEAMS_CLIENT_STATE
}

export async function verifyTeamsConnection(clientId: string, clientSecret: string, tenantId: string) {
  await getAccessToken(tenantId, clientId, clientSecret)
  return {
    accountName: 'Microsoft Teams',
  }
}

export async function createTeamsSubscription(config: TeamsConfig) {
  const resource = config.defaultChatId?.trim()
    ? `/chats/${encodeURIComponent(config.defaultChatId.trim())}/messages`
    : '/chats/getAllMessages'
  const expirationDateTime = new Date(Date.now() + 55 * 60 * 1000).toISOString()
  const payload = {
    changeType: 'created,updated',
    notificationUrl: config.webhookUrl,
    resource,
    includeResourceData: false,
    expirationDateTime,
    clientState: TEAMS_CLIENT_STATE,
  }
  const created = await graphApi<{ id: string; expirationDateTime: string }>(
    config,
    'POST',
    '/subscriptions',
    payload
  )
  return {
    subscriptionId: created.id,
    subscriptionExpiry: created.expirationDateTime || expirationDateTime,
  }
}

export async function renewTeamsSubscription(config: TeamsConfig) {
  if (!config.subscriptionId) {
    throw new Error('Teams subscription is missing')
  }
  const expirationDateTime = new Date(Date.now() + 55 * 60 * 1000).toISOString()
  const updated = await graphApi<{ id: string; expirationDateTime: string }>(
    config,
    'PATCH',
    `/subscriptions/${encodeURIComponent(config.subscriptionId)}`,
    { expirationDateTime }
  )
  return updated.expirationDateTime || expirationDateTime
}

export async function deleteTeamsSubscription(config: TeamsConfig) {
  if (!config.subscriptionId) return
  await graphApi<void>(config, 'DELETE', `/subscriptions/${encodeURIComponent(config.subscriptionId)}`)
}

async function fetchTeamsMessage(config: TeamsConfig, chatId: string, messageId: string) {
  const message = await graphApi<Record<string, any>>(
    config,
    'GET',
    `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`
  )
  const body = message.body?.content ?? ''
  const created = message.createdDateTime ?? message.lastModifiedDateTime ?? new Date().toISOString()
  return {
    id: String(message.id ?? messageId),
    chatId: String(message.chatId ?? chatId),
    chatName:
      message.chatInfo?.topic ??
      message.chatInfo?.displayName ??
      message.team?.displayName ??
      config.accountName ??
      'Teams chat',
    sender:
      message.from?.user?.displayName ??
      message.from?.user?.id ??
      message.from?.application?.displayName ??
      'Teams user',
    senderId:
      message.from?.user?.id ??
      message.from?.application?.id ??
      message.from?.user?.displayName ??
      undefined,
    text: typeof body === 'string' ? stripHtml(body) : '',
    date: new Date(created).toISOString(),
    incoming: true,
    threadName: message.replyToId ?? undefined,
  } satisfies TeamsMessage
}

export async function appendTeamsWebhookMessage(raw: Record<string, any>) {
  const config = loadTeamsConfig()
  if (!config) return

  const entries = Array.isArray(raw.value) ? raw.value : [raw]
  for (const entry of entries) {
    if ((entry.clientState ?? '') !== TEAMS_CLIENT_STATE) continue
    const resource = String(entry.resource ?? entry.resourceData?.['@odata.id'] ?? '')
    const { chatId, messageId } = parseChatAndMessageId(resource)
    if (!chatId || !messageId) continue

    try {
      const row = await fetchTeamsMessage(config, chatId, messageId)
      if (!row.text.trim()) continue
      upsertRows(webhookInboxPath(), row)
    } catch {
      // Best-effort ingestion. Graph can retry, and we still want the webhook to stay healthy.
    }
  }
}

export function readLatestTeamsImport(limit = 50): TeamsMessage[] {
  const rows = [...readRows(webhookInboxPath()), ...readRows(polledInboxPath())]
  const byId = new Map(rows.map((row) => [row.id, row]))
  return Array.from(byId.values())
    .filter((row) => row.text.trim())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-limit)
}

export async function fetchTeamsMessages(config: TeamsConfig, limit = 50): Promise<TeamsMessage[]> {
  if (!config.defaultChatId) {
    return readLatestTeamsImport(limit)
  }
  const res = await graphApi<{ value?: Array<Record<string, any>> }>(
    config,
    'GET',
    `/chats/${encodeURIComponent(config.defaultChatId)}/messages?$top=${Math.max(limit, 10)}`
  )
  const rows = (res.value ?? [])
    .map((message) => ({
      id: String(message.id ?? `${Date.now()}`),
      chatId: String(message.chatId ?? config.defaultChatId),
      chatName:
        message.chatInfo?.topic ??
        message.chatInfo?.displayName ??
        message.team?.displayName ??
        config.accountName ??
        'Teams chat',
      sender:
        message.from?.user?.displayName ??
        message.from?.user?.id ??
        message.from?.application?.displayName ??
        'Teams user',
      senderId:
        message.from?.user?.id ??
        message.from?.application?.id ??
        message.from?.user?.displayName ??
        undefined,
      text: stripHtml(String(message.body?.content ?? '')),
      date: new Date(message.createdDateTime ?? message.lastModifiedDateTime ?? new Date().toISOString()).toISOString(),
      incoming: true,
      threadName: message.replyToId ?? undefined,
    } satisfies TeamsMessage))
    .filter((row) => row.text.trim())
    .reverse()

  mergeRows(polledInboxPath(), rows)
  return readLatestTeamsImport(limit)
}

export async function importTeamsMessages(limit = 50): Promise<TeamsMessage[]> {
  return readLatestTeamsImport(limit)
}

export async function pollTeamsMessages(limit = 50): Promise<{ count: number; messages: TeamsMessage[] }> {
  const config = loadTeamsConfig()
  if (!config) {
    throw new Error('Teams is not connected yet')
  }
  const messages = await fetchTeamsMessages(config, limit)
  return { count: messages.length, messages }
}

export function buildTeamsStyleProfile(messages: TeamsMessage[], chatId: string) {
  const texts = messages.filter((m) => m.incoming).map((m) => m.text)
  return {
    generatedAt: new Date().toISOString(),
    basedOnMessages: texts.length,
    chatId,
    detectedLanguages: detectLanguage(texts),
    styleSignals: {
      averageWordCount: extractWords(texts),
      usesExclamationMark: texts.some((t) => t.includes('!')),
      commonGreetings: extractGreetings(texts),
      commonClosings: extractClosings(texts),
      sentenceStructure:
        extractWords(texts) < 12 ? 'short-chatty' : extractWords(texts) < 30 ? 'medium' : 'detailed',
    },
    sampleSnippets: texts.slice(0, 3),
  }
}

export function teamsImportedCount() {
  return readLatestTeamsImport().length
}

export function extractTeamsMessageText(content: string) {
  return stripHtml(content)
}

export async function sendTeamsMessage(config: TeamsConfig, chatId: string, text: string) {
  if (!chatId) {
    throw new Error('Teams chat ID is missing')
  }
  await graphApi(
    config,
    'POST',
    `/chats/${encodeURIComponent(chatId)}/messages`,
    {
      body: {
        contentType: 'html',
        content: escapeHtml(text).replace(/\n/g, '<br/>'),
      },
    }
  )
}
