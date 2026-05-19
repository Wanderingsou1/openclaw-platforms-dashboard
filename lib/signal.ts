import fs from 'fs'
import path from 'path'
import { loadSignalDemoFile, signalDemoIsEnabled } from './demo-simulations'
import { getWorkspacePath, writeWorkspaceJSON } from './workspace'

export interface SignalConfig {
  apiUrl: string
  phoneNumber: string
  recipientNumber?: string
  connectedAt: string
  recipientName?: string
}

export interface SignalMessage {
  id: string
  recipientNumber: string
  senderNumber?: string
  sender: string
  text: string
  date: string
  incoming: boolean
}

export interface SignalPolledRow {
  id: string
  sender: string
  senderNumber?: string
  text: string
  date: string
  incoming: boolean
}

const SIGNAL_LISTENER_RETRY_MS = 1500
let signalListenerKey: string | null = null
let signalListenerTimer: NodeJS.Timeout | null = null
let signalListenerInFlight = false
let signalListenerLockOwned = false

const DEVANAGARI_RE = /[\u0900-\u097F]/
const HINDI_KEYWORDS = ['yaar', 'bhai', 'kya', 'haan', 'nahi', 'kar', 'hai', 'theek', 'abhi']

function configPath() {
  return getWorkspacePath('signal-import', 'bot-config.json')
}

function hasRealSignalConfigFile() {
  return fs.existsSync(configPath())
}

/** True when using `simulation/signal.json` (no real bot-config.json). */
export function isSignalDemoActive(): boolean {
  if (hasRealSignalConfigFile()) return false
  return signalDemoIsEnabled(loadSignalDemoFile())
}

export function loadSignalConfig(): SignalConfig | null {
  const file = configPath()
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
  const demo = loadSignalDemoFile()
  if (!signalDemoIsEnabled(demo)) return null
  const c = demo!.credentials
  return {
    apiUrl: c.apiUrl,
    phoneNumber: c.phoneNumber,
    recipientNumber: c.recipientNumber,
    connectedAt: new Date().toISOString(),
    recipientName: c.recipientName,
  }
}

/** Preset draft text from demo JSON for inbox rows (`signal:messageId`). */
export function getSignalPresetDraft(inboxMessageId: string): string | undefined {
  if (!isSignalDemoActive()) return undefined
  const raw = inboxMessageId.startsWith('signal:') ? inboxMessageId.slice(7) : inboxMessageId
  return loadSignalDemoFile()?.messages.find((m) => m.id === raw)?.draftReply
}

export function saveSignalConfig(config: SignalConfig) {
  writeWorkspaceJSON('signal-import/bot-config.json', config)
}

function polledInboxPath() {
  return getWorkspacePath('signal-import', 'polled-inbox.json')
}

function readPolledFile(): SignalPolledRow[] {
  const file = polledInboxPath()
  if (!fs.existsSync(file)) return []
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writePolledFile(rows: SignalPolledRow[]) {
  writeWorkspaceJSON('signal-import/polled-inbox.json', rows)
}

export function appendSignalPolledMessages(newRows: SignalPolledRow[]) {
  const rows = readPolledFile()
  const known = new Set(
    rows.map((r) => `${r.senderNumber ?? ''}|${r.sender}|${r.date}|${r.text.trim().toLowerCase()}`)
  )
  for (const row of newRows) {
    const key = `${row.senderNumber ?? ''}|${row.sender}|${row.date}|${row.text.trim().toLowerCase()}`
    if (known.has(key)) continue
    rows.push(row)
    known.add(key)
  }
  const cap = 2000
  writePolledFile(rows.length > cap ? rows.slice(-cap) : rows)
}

function listenerKey(config: SignalConfig) {
  return `${config.apiUrl.replace(/\/$/, '')}|${config.phoneNumber.trim()}`
}

function listenerLockPath() {
  return getWorkspacePath('signal-import', 'listener.lock.json')
}

function isProcessRunning(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function tryAcquireSignalListenerLock(key: string): boolean {
  const lockFile = listenerLockPath()
  fs.mkdirSync(path.dirname(lockFile), { recursive: true })
  const lockPayload = {
    pid: process.pid,
    key,
    acquiredAt: new Date().toISOString(),
  }
  try {
    const fd = fs.openSync(lockFile, 'wx')
    fs.writeFileSync(fd, JSON.stringify(lockPayload, null, 2), 'utf-8')
    fs.closeSync(fd)
    signalListenerLockOwned = true
    return true
  } catch {
    // Existing lock file: take over only if stale/dead.
    try {
      const existing = JSON.parse(fs.readFileSync(lockFile, 'utf-8')) as {
        pid?: number
        key?: string
      }
      if (existing.pid === process.pid && existing.key === key) {
        signalListenerLockOwned = true
        return true
      }
      if (!isProcessRunning(Number(existing.pid ?? 0))) {
        fs.unlinkSync(lockFile)
        const fd = fs.openSync(lockFile, 'wx')
        fs.writeFileSync(fd, JSON.stringify(lockPayload, null, 2), 'utf-8')
        fs.closeSync(fd)
        signalListenerLockOwned = true
        return true
      }
      signalListenerLockOwned = false
      return false
    } catch {
      // Corrupt lock file -> recreate.
      try {
        fs.unlinkSync(lockFile)
      } catch {
        // ignore
      }
      try {
        const fd = fs.openSync(lockFile, 'wx')
        fs.writeFileSync(fd, JSON.stringify(lockPayload, null, 2), 'utf-8')
        fs.closeSync(fd)
        signalListenerLockOwned = true
        return true
      } catch {
        signalListenerLockOwned = false
        return false
      }
    }
  }
}

function releaseSignalListenerLock() {
  if (!signalListenerLockOwned) return
  const lockFile = listenerLockPath()
  try {
    if (!fs.existsSync(lockFile)) {
      signalListenerLockOwned = false
      return
    }
    const existing = JSON.parse(fs.readFileSync(lockFile, 'utf-8')) as { pid?: number }
    if (Number(existing.pid) === process.pid) fs.unlinkSync(lockFile)
  } catch {
    // ignore
  } finally {
    signalListenerLockOwned = false
  }
}

function clearSignalListenerTimer() {
  if (!signalListenerTimer) return
  clearTimeout(signalListenerTimer)
  signalListenerTimer = null
}

async function runSignalListenerTick(expectedKey: string) {
  if (signalListenerInFlight || signalListenerKey !== expectedKey) return
  signalListenerInFlight = true
  try {
    const config = loadSignalConfig()
    if (!config || isSignalDemoActive()) {
      stopSignalListener()
      return
    }
    const key = listenerKey(config)
    if (key !== expectedKey || signalListenerKey !== expectedKey) {
      stopSignalListener()
      return
    }
    const rows = await pollSignalMessages(config.apiUrl, config.phoneNumber)
    if (rows.length > 0) appendSignalPolledMessages(rows)
  } catch {
    // Keep listener alive; next tick retries.
  } finally {
    signalListenerInFlight = false
    if (signalListenerKey === expectedKey) {
      signalListenerTimer = setTimeout(() => {
        void runSignalListenerTick(expectedKey)
      }, SIGNAL_LISTENER_RETRY_MS)
    }
  }
}

export function startSignalListener(config: SignalConfig) {
  if (isSignalDemoActive()) return
  const key = listenerKey(config)
  if (!tryAcquireSignalListenerLock(key)) return
  if (signalListenerKey === key) return
  clearSignalListenerTimer()
  signalListenerKey = key
  signalListenerInFlight = false
  void runSignalListenerTick(key)
}

export function ensureSignalListener() {
  const config = loadSignalConfig()
  if (!config || isSignalDemoActive()) {
    stopSignalListener()
    return
  }
  startSignalListener(config)
}

export function stopSignalListener() {
  signalListenerKey = null
  signalListenerInFlight = false
  clearSignalListenerTimer()
  releaseSignalListenerLock()
}

export async function pullSignalMessagesNow(apiUrl: string, phoneNumber: string): Promise<number> {
  // Avoid overlapping receive calls against the same signal-cli account.
  if (signalListenerInFlight) return 0
  signalListenerInFlight = true
  try {
    const rows = await pollSignalMessages(apiUrl, phoneNumber)
    if (rows.length > 0) appendSignalPolledMessages(rows)
    return rows.length
  } catch {
    return 0
  } finally {
    signalListenerInFlight = false
  }
}

export async function verifySignalAccount(apiUrl: string, _phoneNumber: string) {
  const base = apiUrl.replace(/\/$/, '')
  const paths = ['/v2/about', '/v1/about']
  let lastStatus = 0
  for (const pathName of paths) {
    const res = await fetch(`${base}${pathName}`)
    lastStatus = res.status
    if (!res.ok) continue
    const contentType = res.headers.get('content-type') ?? ''
    const text = await res.text().catch(() => '')
    try {
      const data = JSON.parse(text) as { versions?: string[]; build?: unknown }
      return { ok: true as const, versions: data.versions ?? [] }
    } catch {
      const snippet = text.trim().slice(0, 200)
      throw new Error(
        [
          `Signal API did not return JSON from ${base}${pathName}.`,
          `Status: ${res.status}. Content-Type: ${contentType || '(missing)'}.`,
          `Body (first 200 chars): ${snippet || '(empty)'}`,
          `Hint: API URL must be your signal-cli-rest-api base (usually http://localhost:8080), not the OpenClaw dashboard (http://localhost:3000).`,
        ].join(' ')
      )
    }
  }
  throw new Error(`signal-cli-rest-api not reachable at ${apiUrl} (last status ${lastStatus})`)
}

async function readSignalApiError(res: Response, fallback: string) {
  const text = await res.text().catch(() => '')
  if (!text.trim()) return fallback
  try {
    const data = JSON.parse(text) as { error?: string }
    return data.error?.trim() || fallback
  } catch {
    return text.trim() || fallback
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Signal receive timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

type SignalReceiveEntry = {
  envelope?: {
    source?: string
    sourceNumber?: string
    sourceName?: string
    timestamp?: number
    dataMessage?: {
      message?: string
      body?: string
      timestamp?: number
    }
    syncMessage?: {
      sentMessage?: {
        message?: string
        body?: string
        text?: string
        timestamp?: number
      }
    }
    content?: {
      dataMessage?: {
        message?: string
        body?: string
        text?: string
        timestamp?: number
      }
      syncMessage?: {
        sentMessage?: {
          message?: string
          body?: string
          text?: string
          timestamp?: number
        }
      }
    }
  }
}

type UnknownRecord = Record<string, unknown>

function buildSignalReceiveHttpUrl(apiUrl: string, phoneNumber: string, timeoutSeconds = 10) {
  const base = apiUrl.replace(/\/$/, '')
  return `${base}/v1/receive/${encodeURIComponent(phoneNumber)}?timeout=${Math.max(
    1,
    Math.floor(timeoutSeconds)
  )}`
}

function normalizeSignalReceivePayload(payload: unknown): SignalReceiveEntry[] {
  if (Array.isArray(payload)) return payload as SignalReceiveEntry[]
  if (!payload || typeof payload !== 'object') return []
  const obj = payload as Record<string, unknown>
  if (Array.isArray(obj.messages)) return obj.messages as SignalReceiveEntry[]
  if (Array.isArray(obj.result)) return obj.result as SignalReceiveEntry[]
  const result = obj.result as Record<string, unknown> | undefined
  if (Array.isArray(result?.messages)) return result.messages as SignalReceiveEntry[]
  if (result?.envelope) return [{ envelope: result.envelope as SignalReceiveEntry['envelope'] }]
  const params = obj.params as Record<string, unknown> | undefined
  if (params) {
    const result = params.result as Record<string, unknown> | undefined
    if (Array.isArray(params.result)) return params.result as SignalReceiveEntry[]
    if (result?.envelope) return [{ envelope: result.envelope as SignalReceiveEntry['envelope'] }]
    if (Array.isArray(result?.messages)) return result.messages as SignalReceiveEntry[]
    if (params.envelope) return [{ envelope: params.envelope as SignalReceiveEntry['envelope'] }]
  }
  if (obj.envelope) return [{ envelope: obj.envelope as SignalReceiveEntry['envelope'] }]
  // Some signal-cli builds return a single envelope object directly.
  if (
    'source' in obj ||
    'sourceNumber' in obj ||
    'sourceName' in obj ||
    'dataMessage' in obj ||
    'syncMessage' in obj ||
    'content' in obj
  ) {
    return [{ envelope: obj as SignalReceiveEntry['envelope'] }]
  }
  return []
}

function getNestedValue(obj: unknown, keys: string[], depth = 0): unknown {
  if (!obj || typeof obj !== 'object' || depth > 6) return undefined
  const rec = obj as UnknownRecord
  for (const key of keys) {
    const value = rec[key]
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return value
  }
  for (const value of Object.values(rec)) {
    const nested = getNestedValue(value, keys, depth + 1)
    if (nested !== undefined) return nested
  }
  return undefined
}

async function receiveSignalViaHttp(
  apiUrl: string,
  phoneNumber: string,
  timeoutMs = 16000,
  receiveTimeoutSeconds = 10
): Promise<SignalReceiveEntry[]> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      buildSignalReceiveHttpUrl(apiUrl, phoneNumber, receiveTimeoutSeconds),
      timeoutMs
    )
  } catch (error: any) {
    // signal-cli receive is effectively long-polling. A local timeout only means "no new messages yet".
    if (String(error?.message ?? '').includes('Signal receive timed out')) return []
    throw error
  }
  if (!res.ok) {
    const error = await readSignalApiError(res, `Signal receive failed (${res.status})`)
    throw new Error(error)
  }
  const payload = await res.json().catch(() => null)
  return normalizeSignalReceivePayload(payload)
}

export async function pollSignalMessages(apiUrl: string, phoneNumber: string): Promise<SignalPolledRow[]> {
  // Prefer HTTP long-poll because it is the most reliable path across signal-cli-rest-api versions.
  const data = await receiveSignalViaHttp(apiUrl, phoneNumber, 45000, 20)
  const rows: SignalPolledRow[] = []
  for (const item of data) {
    const env = item.envelope
    if (!env) continue
    const msg =
      env.dataMessage ??
      env.syncMessage?.sentMessage ??
      env.content?.dataMessage ??
      env.content?.syncMessage?.sentMessage
    const text =
      String(
        msg?.message ??
          msg?.body ??
          getNestedValue(env, ['message', 'body', 'text', 'messageText']) ??
          ''
      ).trim()
    if (!text) continue
    const sender =
      String(
        env.sourceName ??
          env.sourceNumber ??
          env.source ??
          getNestedValue(env, ['sourceName', 'sourceNumber', 'source', 'sender']) ??
          'Signal user'
      ) || 'Signal user'
    const tsRaw = msg?.timestamp ?? env.timestamp ?? getNestedValue(env, ['timestamp'])
    const ts = typeof tsRaw === 'number' ? tsRaw : Number(tsRaw)
    const date = ts ? new Date(ts).toISOString() : new Date().toISOString()
    rows.push({
      id: `${ts ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender,
      senderNumber:
        (env.sourceNumber ||
          env.source ||
          (getNestedValue(env, ['sourceNumber', 'source', 'senderNumber']) as string | undefined)) ??
        undefined,
      text,
      date,
      incoming: true,
    })
  }
  return rows
}

export async function sendSignalMessage(
  apiUrl: string,
  phoneNumber: string,
  recipientNumber: string,
  text: string
) {
  if (isSignalDemoActive()) return
  const url = `${apiUrl.replace(/\/$/, '')}/v2/send`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, number: phoneNumber, recipients: [recipientNumber] }),
  })
  if (!res.ok) {
    const error = await readSignalApiError(res, `Signal send failed (${res.status})`)
    throw new Error(error)
  }
}

export interface DetectedSignalPeer {
  recipientNumber: string
  senderNumber?: string
  title: string
  lastMessageAt: string
}

export function listSignalPeersFromPolled(): DetectedSignalPeer[] {
  const demo = loadSignalDemoFile()
  if (signalDemoIsEnabled(demo) && !hasRealSignalConfigFile()) {
    const d = demo!
    const last = d.messages[d.messages.length - 1]
    return [
      {
        recipientNumber: d.credentials.recipientNumber,
        senderNumber: d.credentials.recipientNumber,
        title: d.credentials.recipientName || last?.sender || 'Contact',
        lastMessageAt: last?.receivedAt ?? new Date().toISOString(),
      },
    ]
  }
  const rows = readPolledFile()
  if (rows.length === 0) return []
  const config = loadSignalConfig()
  const last = rows[rows.length - 1]
  return [
    {
      recipientNumber: config?.recipientNumber ?? last.senderNumber ?? '',
      title: last.sender,
      lastMessageAt: last.date,
    },
  ]
}

export function importSignalMessages(limit = 40): SignalMessage[] {
  const demo = loadSignalDemoFile()
  if (signalDemoIsEnabled(demo) && !hasRealSignalConfigFile()) {
    const d = demo!
    return d.messages.slice(-limit).map((m) => ({
      id: m.id,
      recipientNumber: d.credentials.recipientNumber,
      senderNumber: d.credentials.recipientNumber,
      sender: m.sender,
      text: m.text,
      date: m.receivedAt,
      incoming: true,
    }))
  }
  const rows = readPolledFile().filter((r) => r.text.trim())
  const config = loadSignalConfig()
  return rows.slice(-limit).map((r) => ({
    id: r.id,
    recipientNumber: config?.recipientNumber ?? '',
    senderNumber: r.senderNumber,
    sender: r.sender,
    text: r.text,
    date: r.date,
    incoming: r.incoming,
  }))
}

export function readSignalInboxPreview(max = 10): SignalMessage[] {
  const demo = loadSignalDemoFile()
  if (signalDemoIsEnabled(demo) && !hasRealSignalConfigFile()) {
    const d = demo!
    return d.messages
      .filter((m) => m.text.trim())
      .slice(-max)
      .map((m) => ({
        id: m.id,
        recipientNumber: d.credentials.recipientNumber,
        senderNumber: d.credentials.recipientNumber,
        sender: m.sender,
        text: m.text,
        date: m.receivedAt,
        incoming: true,
      }))
  }
  const config = loadSignalConfig()
  return readPolledFile()
    .filter((r) => r.incoming && r.text.trim())
    .slice(-max)
    .map((r) => ({
      id: r.id,
      recipientNumber: config?.recipientNumber ?? '',
      senderNumber: r.senderNumber,
      sender: r.sender,
      text: r.text,
      date: r.date,
      incoming: r.incoming,
    }))
}

function detectLanguage(texts: string[]): string[] {
  const combined = texts.join(' ').toLowerCase()
  const langs = new Set<string>()
  if (DEVANAGARI_RE.test(combined)) langs.add('Hindi')
  if (HINDI_KEYWORDS.some((w) => combined.split(/\W+/).includes(w))) langs.add('Hinglish')
  langs.add('English')
  return Array.from(langs)
}

export function buildSignalStyleProfile(messages: SignalMessage[], recipientNumber: string) {
  const texts = messages.filter((m) => m.incoming).map((m) => m.text)
  const avgWords = texts.length
    ? Math.round(texts.map((t) => t.split(/\s+/).length).reduce((a, b) => a + b, 0) / texts.length)
    : 0
  return {
    generatedAt: new Date().toISOString(),
    basedOnMessages: texts.length,
    recipientNumber,
    detectedLanguages: detectLanguage(texts),
    styleSignals: {
      averageWordCount: avgWords,
      usesExclamationMark: texts.some((t) => t.includes('!')),
      sentenceStructure: avgWords < 12 ? 'short-chatty' : avgWords < 30 ? 'medium' : 'detailed',
    },
    sampleSnippets: texts.slice(0, 3),
  }
}

export function readLatestSignalImport(): SignalMessage[] {
  const demo = loadSignalDemoFile()
  if (signalDemoIsEnabled(demo) && !hasRealSignalConfigFile()) {
    const d = demo!
    return d.messages.map((m) => ({
      id: m.id,
      recipientNumber: d.credentials.recipientNumber,
      senderNumber: d.credentials.recipientNumber,
      sender: m.sender,
      text: m.text,
      date: m.receivedAt,
      incoming: true,
    }))
  }
  const dir = getWorkspacePath('signal-import')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => /^messages-.*\.json$/.test(f))
  if (files.length === 0) return []
  const latest = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.f
  if (!latest) return []
  const payload = JSON.parse(fs.readFileSync(path.join(dir, latest), 'utf-8'))
  return (payload.messages ?? []) as SignalMessage[]
}
