import fs from 'fs'
import path from 'path'
import { loadViberDemoFile, viberDemoIsEnabled } from '../../simulation/demo-simulations'
import { getWorkspacePath, writeWorkspaceJSON } from './workspace'

const VIBER_API = 'https://chatapi.viber.com/pa'

export interface ViberConfig {
  authToken: string
  peerUserId: string
  connectedAt: string
  botName?: string
  botId?: string
  peerName?: string
}

export interface ViberMessage {
  id: string
  peerId: string
  sender: string
  text: string
  date: string
  incoming: boolean
}

export interface ViberWebhookRow {
  id: string
  peerId: string
  sender: string
  text: string
  date: string
  incoming: boolean
}

const DEVANAGARI_RE = /[\u0900-\u097F]/
const HINDI_KEYWORDS = ['yaar', 'bhai', 'kya', 'haan', 'nahi', 'kar', 'hai', 'theek', 'abhi']

function configPath() {
  return getWorkspacePath('viber-import', 'bot-config.json')
}

function hasRealViberConfigFile() {
  return fs.existsSync(configPath())
}

/** True when using `simulation/viber.json` (no real bot-config.json). */
export function isViberDemoActive(): boolean {
  if (hasRealViberConfigFile()) return false
  return viberDemoIsEnabled(loadViberDemoFile())
}

export function loadViberConfig(): ViberConfig | null {
  const file = configPath()
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
  const demo = loadViberDemoFile()
  if (!viberDemoIsEnabled(demo)) return null
  const c = demo!.credentials
  return {
    authToken: c.authToken,
    peerUserId: c.peerUserId,
    connectedAt: new Date().toISOString(),
    botName: c.botName,
    botId: c.botId,
    peerName: c.peerName,
  }
}

/** Preset draft text from demo JSON for inbox rows (`viber:messageId`). */
export function getViberPresetDraft(inboxMessageId: string): string | undefined {
  if (!isViberDemoActive()) return undefined
  const raw = inboxMessageId.startsWith('viber:') ? inboxMessageId.slice(6) : inboxMessageId
  return loadViberDemoFile()?.messages.find((m) => m.id === raw)?.draftReply
}

export function saveViberConfig(config: ViberConfig) {
  writeWorkspaceJSON('viber-import/bot-config.json', config)
}

function webhookInboxPath() {
  return getWorkspacePath('viber-import', 'webhook-inbox.json')
}

function readWebhookFile(): ViberWebhookRow[] {
  const file = webhookInboxPath()
  if (!fs.existsSync(file)) return []
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeWebhookFile(rows: ViberWebhookRow[]) {
  writeWorkspaceJSON('viber-import/webhook-inbox.json', rows)
}

export function appendViberWebhookMessage(row: ViberWebhookRow) {
  const rows = readWebhookFile()
  rows.push(row)
  const cap = 2000
  writeWebhookFile(rows.length > cap ? rows.slice(-cap) : rows)
}

export async function callViberApi(authToken: string, method: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${VIBER_API}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Viber-Auth-Token': authToken,
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { status?: number; status_message?: string; id?: string; name?: string }
  if (!res.ok || (data.status != null && data.status !== 0)) {
    throw new Error(data.status_message ?? `Viber ${method} failed`)
  }
  return data
}

export async function verifyViberAccount(authToken: string, peerUserId: string) {
  const info = (await callViberApi(authToken, 'get_account_info', {})) as {
    id?: string
    name?: string
  }
  let peerName: string | undefined
  try {
    const user = (await callViberApi(authToken, 'get_user_details', { id: peerUserId })) as {
      user?: { name?: string; id?: string }
    }
    peerName = user.user?.name
  } catch {
    peerName = undefined
  }
  return {
    botId: info.id,
    botName: info.name,
    peerName,
  }
}

export interface DetectedViberPeer {
  peerUserId: string
  title: string
  lastMessageAt: string
}

export function listViberPeersFromWebhook(): DetectedViberPeer[] {
  const demo = loadViberDemoFile()
  if (viberDemoIsEnabled(demo) && !hasRealViberConfigFile()) {
    const d = demo!
    const last = d.messages[d.messages.length - 1]
    return [
      {
        peerUserId: d.credentials.peerUserId,
        title: d.credentials.peerName || last?.sender || 'Subscriber',
        lastMessageAt: last?.receivedAt ?? new Date().toISOString(),
      },
    ]
  }
  const rows = readWebhookFile()
  const byPeer = new Map<string, DetectedViberPeer>()
  for (const r of rows) {
    const key = r.peerId
    const prev = byPeer.get(key)
    const title = r.sender || key
    if (!prev || r.date > prev.lastMessageAt) {
      byPeer.set(key, {
        peerUserId: key,
        title,
        lastMessageAt: r.date,
      })
    }
  }
  return Array.from(byPeer.values()).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
}

export function importViberMessagesFromWebhook(peerUserId: string, limit = 40): ViberMessage[] {
  const demo = loadViberDemoFile()
  if (viberDemoIsEnabled(demo) && !hasRealViberConfigFile()) {
    const d = demo!
    if (peerUserId !== d.credentials.peerUserId) return []
    return d.messages.slice(-limit).map((m) => ({
      id: m.id,
      peerId: d.credentials.peerUserId,
      sender: m.sender,
      text: m.text,
      date: m.receivedAt,
      incoming: true,
    }))
  }
  const rows = readWebhookFile().filter((r) => r.peerId === peerUserId && r.text.trim())
  const sliced = rows.slice(-limit)
  return sliced.map((r) => ({
    id: r.id,
    peerId: r.peerId,
    sender: r.sender,
    text: r.text,
    date: r.date,
    incoming: r.incoming,
  }))
}

export async function sendViberMessage(authToken: string, peerUserId: string, text: string) {
  if (isViberDemoActive()) return
  await callViberApi(authToken, 'send_message', {
    receiver: peerUserId,
    type: 'text',
    text,
  })
}

function detectLanguage(texts: string[]): string[] {
  const combined = texts.join(' ').toLowerCase()
  const langs = new Set<string>()
  if (DEVANAGARI_RE.test(combined)) langs.add('Hindi')
  if (HINDI_KEYWORDS.some((w) => combined.split(/\W+/).includes(w))) langs.add('Hinglish')
  langs.add('English')
  return Array.from(langs)
}

export function buildViberStyleProfile(messages: ViberMessage[], peerId: string) {
  const texts = messages.filter((m) => m.incoming).map((m) => m.text)
  const avgWords = texts.length
    ? Math.round(texts.map((t) => t.split(/\s+/).length).reduce((a, b) => a + b, 0) / texts.length)
    : 0
  return {
    generatedAt: new Date().toISOString(),
    basedOnMessages: texts.length,
    peerId,
    detectedLanguages: detectLanguage(texts),
    styleSignals: {
      averageWordCount: avgWords,
      usesExclamationMark: texts.some((t) => t.includes('!')),
      sentenceStructure: avgWords < 12 ? 'short-chatty' : avgWords < 30 ? 'medium' : 'detailed',
    },
    sampleSnippets: texts.slice(0, 3),
  }
}

export function readLatestViberImport(): ViberMessage[] {
  const demo = loadViberDemoFile()
  if (viberDemoIsEnabled(demo) && !hasRealViberConfigFile()) {
    const d = demo!
    return d.messages.map((m) => ({
      id: m.id,
      peerId: d.credentials.peerUserId,
      sender: m.sender,
      text: m.text,
      date: m.receivedAt,
      incoming: true,
    }))
  }
  const dir = getWorkspacePath('viber-import')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => /^messages-.*\.json$/.test(f))
  if (files.length === 0) return []
  const latest = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.f
  if (!latest) return []
  const payload = JSON.parse(fs.readFileSync(path.join(dir, latest), 'utf-8'))
  return (payload.messages ?? []) as ViberMessage[]
}

export function readViberInboxPreview(peerUserId: string, max = 10): ViberMessage[] {
  const demo = loadViberDemoFile()
  if (viberDemoIsEnabled(demo) && !hasRealViberConfigFile()) {
    const d = demo!
    if (peerUserId !== d.credentials.peerUserId) return []
    return d.messages
      .filter((m) => m.text.trim())
      .slice(-max)
      .map((m) => ({
        id: m.id,
        peerId: d.credentials.peerUserId,
        sender: m.sender,
        text: m.text,
        date: m.receivedAt,
        incoming: true,
      }))
  }
  return readWebhookFile()
    .filter((r) => r.peerId === peerUserId && r.incoming && r.text.trim())
    .slice(-max)
    .map((r) => ({
      id: r.id,
      peerId: r.peerId,
      sender: r.sender,
      text: r.text,
      date: r.date,
      incoming: r.incoming,
    }))
}
