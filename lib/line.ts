import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { loadLineDemoFile, lineDemoIsEnabled } from './demo-simulations'
import { getWorkspacePath, writeWorkspaceJSON } from './workspace'

const LINE_API = 'https://api.line.me/v2/bot'

export interface LineConfig {
  channelAccessToken: string
  channelSecret: string
  userId: string
  connectedAt: string
  displayName?: string
  botName?: string
}

export interface LineMessage {
  id: string
  userId: string
  sender: string
  text: string
  date: string
  incoming: boolean
}

export interface LineWebhookRow {
  id: string
  userId: string
  sender: string
  text: string
  date: string
  incoming: boolean
}

const DEVANAGARI_RE = /[\u0900-\u097F]/
const HINDI_KEYWORDS = ['yaar', 'bhai', 'kya', 'haan', 'nahi', 'kar', 'hai', 'theek', 'abhi']

function configPath() {
  return getWorkspacePath('line-import', 'bot-config.json')
}

function hasRealLineConfigFile() {
  return fs.existsSync(configPath())
}

/** True when using `simulation/line.json` (no real bot-config.json). */
export function isLineDemoActive(): boolean {
  if (hasRealLineConfigFile()) return false
  return lineDemoIsEnabled(loadLineDemoFile())
}

export function loadLineConfig(): LineConfig | null {
  const file = configPath()
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
  const demo = loadLineDemoFile()
  if (!lineDemoIsEnabled(demo)) return null
  const c = demo!.credentials
  return {
    channelAccessToken: c.channelAccessToken,
    channelSecret: c.channelSecret,
    userId: c.userId,
    connectedAt: new Date().toISOString(),
    displayName: c.displayName,
  }
}

/** Preset draft text from demo JSON for inbox rows (`line:messageId`). */
export function getLinePresetDraft(inboxMessageId: string): string | undefined {
  if (!isLineDemoActive()) return undefined
  const raw = inboxMessageId.startsWith('line:') ? inboxMessageId.slice(5) : inboxMessageId
  return loadLineDemoFile()?.messages.find((m) => m.id === raw)?.draftReply
}

export function saveLineConfig(config: LineConfig) {
  writeWorkspaceJSON('line-import/bot-config.json', config)
}

function webhookInboxPath() {
  return getWorkspacePath('line-import', 'webhook-inbox.json')
}

function readWebhookFile(): LineWebhookRow[] {
  const file = webhookInboxPath()
  if (!fs.existsSync(file)) return []
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeWebhookFile(rows: LineWebhookRow[]) {
  writeWorkspaceJSON('line-import/webhook-inbox.json', rows)
}

export function appendLineWebhookMessage(row: LineWebhookRow) {
  const rows = readWebhookFile()
  rows.push(row)
  const cap = 2000
  writeWebhookFile(rows.length > cap ? rows.slice(-cap) : rows)
}

export function verifyLineSignature(channelSecret: string, body: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64')
  return hash === signature
}

export async function verifyLineCredentials(channelAccessToken: string): Promise<{ botName: string }> {
  if (isLineDemoActive()) return { botName: 'Line Bot (preview)' }
  const res = await fetch(`${LINE_API}/info`, {
    headers: { Authorization: `Bearer ${channelAccessToken}` },
  })
  const data = (await res.json()) as { displayName?: string; basicId?: string; message?: string }
  if (!res.ok) throw new Error(data.message ?? `LINE API error (${res.status})`)
  return { botName: data.displayName ?? 'Line Bot' }
}

export interface DetectedLinePeer {
  userId: string
  title: string
  lastMessageAt: string
}

export function listLinePeersFromWebhook(): DetectedLinePeer[] {
  const demo = loadLineDemoFile()
  if (lineDemoIsEnabled(demo) && !hasRealLineConfigFile()) {
    const d = demo!
    const last = d.messages[d.messages.length - 1]
    return [
      {
        userId: d.credentials.userId,
        title: d.credentials.displayName || last?.sender || 'Follower',
        lastMessageAt: last?.receivedAt ?? new Date().toISOString(),
      },
    ]
  }
  const rows = readWebhookFile()
  const byUser = new Map<string, DetectedLinePeer>()
  for (const r of rows) {
    const key = r.userId
    const prev = byUser.get(key)
    const title = r.sender || key
    if (!prev || r.date > prev.lastMessageAt) {
      byUser.set(key, { userId: key, title, lastMessageAt: r.date })
    }
  }
  return Array.from(byUser.values()).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
}

export function importLineMessagesFromWebhook(userId: string, limit = 40): LineMessage[] {
  const demo = loadLineDemoFile()
  if (lineDemoIsEnabled(demo) && !hasRealLineConfigFile()) {
    const d = demo!
    if (userId !== d.credentials.userId) return []
    return d.messages.slice(-limit).map((m) => ({
      id: m.id,
      userId: d.credentials.userId,
      sender: m.sender,
      text: m.text,
      date: m.receivedAt,
      incoming: true,
    }))
  }
  const rows = readWebhookFile().filter((r) => r.userId === userId && r.text.trim())
  return rows.slice(-limit).map((r) => ({
    id: r.id,
    userId: r.userId,
    sender: r.sender,
    text: r.text,
    date: r.date,
    incoming: r.incoming,
  }))
}

export async function sendLineMessage(channelAccessToken: string, userId: string, text: string) {
  if (isLineDemoActive()) return
  const res = await fetch(`${LINE_API}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text }],
    }),
  })
  const data = (await res.json()) as { message?: string }
  if (!res.ok) throw new Error(data.message ?? `LINE send failed (${res.status})`)
}

function detectLanguage(texts: string[]): string[] {
  const combined = texts.join(' ').toLowerCase()
  const langs = new Set<string>()
  if (DEVANAGARI_RE.test(combined)) langs.add('Hindi')
  if (HINDI_KEYWORDS.some((w) => combined.split(/\W+/).includes(w))) langs.add('Hinglish')
  langs.add('English')
  return Array.from(langs)
}

export function buildLineStyleProfile(messages: LineMessage[], userId: string) {
  const texts = messages.filter((m) => m.incoming).map((m) => m.text)
  const avgWords = texts.length
    ? Math.round(texts.map((t) => t.split(/\s+/).length).reduce((a, b) => a + b, 0) / texts.length)
    : 0
  return {
    generatedAt: new Date().toISOString(),
    basedOnMessages: texts.length,
    userId,
    detectedLanguages: detectLanguage(texts),
    styleSignals: {
      averageWordCount: avgWords,
      usesExclamationMark: texts.some((t) => t.includes('!')),
      sentenceStructure: avgWords < 12 ? 'short-chatty' : avgWords < 30 ? 'medium' : 'detailed',
    },
    sampleSnippets: texts.slice(0, 3),
  }
}

export function readLatestLineImport(): LineMessage[] {
  const demo = loadLineDemoFile()
  if (lineDemoIsEnabled(demo) && !hasRealLineConfigFile()) {
    const d = demo!
    return d.messages.map((m) => ({
      id: m.id,
      userId: d.credentials.userId,
      sender: m.sender,
      text: m.text,
      date: m.receivedAt,
      incoming: true,
    }))
  }
  const dir = getWorkspacePath('line-import')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => /^messages-.*\.json$/.test(f))
  if (files.length === 0) return []
  const latest = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.f
  if (!latest) return []
  const payload = JSON.parse(fs.readFileSync(path.join(dir, latest), 'utf-8'))
  return (payload.messages ?? []) as LineMessage[]
}

export function readLineInboxPreview(userId: string, max = 10): LineMessage[] {
  const demo = loadLineDemoFile()
  if (lineDemoIsEnabled(demo) && !hasRealLineConfigFile()) {
    const d = demo!
    if (userId !== d.credentials.userId) return []
    return d.messages
      .filter((m) => m.text.trim())
      .slice(-max)
      .map((m) => ({
        id: m.id,
        userId: d.credentials.userId,
        sender: m.sender,
        text: m.text,
        date: m.receivedAt,
        incoming: true,
      }))
  }
  return readWebhookFile()
    .filter((r) => r.userId === userId && r.incoming && r.text.trim())
    .slice(-max)
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      sender: r.sender,
      text: r.text,
      date: r.date,
      incoming: r.incoming,
    }))
}
