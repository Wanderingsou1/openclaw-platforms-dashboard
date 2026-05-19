import fs from 'fs'
import path from 'path'
import { getWorkspacePath, writeWorkspaceJSON } from './workspace'

export interface TelegramConfig {
  botToken: string
  chatId: string
  connectedAt: string
  botUsername?: string
  botName?: string
  chatTitle?: string
}

export interface TelegramMessage {
  id: string
  chatId: string
  sender: string
  text: string
  date: string
  incoming: boolean
}

const DEVANAGARI_RE = /[\u0900-\u097F]/
const HINDI_KEYWORDS = ['yaar', 'bhai', 'kya', 'haan', 'nahi', 'kar', 'hai', 'theek', 'abhi']

const PENDING_UPDATES_REL = 'telegram-import/pending-updates.json'
const PENDING_MAX_AGE_MS = 10 * 60 * 1000

function telegramConfigPath() {
  return getWorkspacePath('telegram-import', 'bot-config.json')
}

export function loadTelegramConfig(): TelegramConfig | null {
  const file = telegramConfigPath()
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

export function saveTelegramConfig(config: TelegramConfig) {
  writeWorkspaceJSON('telegram-import/bot-config.json', config)
}

async function callTelegramApi(botToken: string, method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await res.json()) as { ok?: boolean; description?: string; result?: unknown }
  if (!res.ok || !data.ok) {
    throw new Error(data.description ?? `Telegram API ${method} failed`)
  }
  return data.result
}

const TELEGRAM_ALLOWED_UPDATES = [
  'message',
  'channel_post',
  'edited_message',
  'edited_channel_post',
] as const

export async function fetchRawUpdates(botToken: string): Promise<Record<string, unknown>[]> {
  return (await callTelegramApi(botToken, 'getUpdates', {
    allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
    limit: 100,
    timeout: 0,
  })) as Record<string, unknown>[]
}

export function mergeUpdatesById(
  a: Record<string, unknown>[],
  b: Record<string, unknown>[]
): Record<string, unknown>[] {
  const map = new Map<number, Record<string, unknown>>()
  for (const u of a) {
    const id = u.update_id as number
    if (typeof id === 'number') map.set(id, u)
  }
  for (const u of b) {
    const id = u.update_id as number
    if (typeof id === 'number') map.set(id, u)
  }
  return Array.from(map.values()).sort(
    (x, y) => (x.update_id as number) - (y.update_id as number)
  )
}

export function savePendingUpdatesFromDetect(updates: Record<string, unknown>[]) {
  writeWorkspaceJSON(PENDING_UPDATES_REL, {
    savedAt: new Date().toISOString(),
    updates,
  })
}

function readPendingUpdatesIfFresh(): Record<string, unknown>[] | null {
  const full = getWorkspacePath(PENDING_UPDATES_REL)
  if (!fs.existsSync(full)) return null
  try {
    const data = JSON.parse(fs.readFileSync(full, 'utf-8')) as {
      savedAt?: string
      updates?: Record<string, unknown>[]
    }
    if (!data.savedAt || !data.updates?.length) return null
    const age = Date.now() - new Date(data.savedAt).getTime()
    if (age > PENDING_MAX_AGE_MS) return null
    return data.updates
  } catch {
    return null
  }
}

/** After a successful import, drop the stash from "Detect chats" so the next import uses only new getUpdates. */
export function clearPendingUpdates() {
  const full = getWorkspacePath(PENDING_UPDATES_REL)
  if (fs.existsSync(full)) fs.unlinkSync(full)
}

/** Merge stashed updates (from detect) with a fresh getUpdates so import still works after detect consumed the queue. */
export async function prepareUpdatesForImport(botToken: string): Promise<Record<string, unknown>[]> {
  const pending = readPendingUpdatesIfFresh()
  const fresh = await fetchRawUpdates(botToken)
  return mergeUpdatesById(pending ?? [], fresh)
}

export interface DetectedChat {
  chatId: string
  title: string
  type: string
  lastMessageAt: string
}

function chatLabel(chat: {
  id: number
  type?: string
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}): string {
  if (chat.title) return chat.title
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim()
  if (name) return name
  if (chat.username) return `@${chat.username}`
  return String(chat.id)
}

function parseChatsFromUpdates(updates: Record<string, unknown>[]): DetectedChat[] {
  const byId = new Map<string, DetectedChat>()
  for (const u of updates) {
    const msg =
      (u.message as Record<string, unknown> | undefined) ??
      (u.channel_post as Record<string, unknown> | undefined) ??
      (u.edited_message as Record<string, unknown> | undefined) ??
      (u.edited_channel_post as Record<string, unknown> | undefined)
    if (!msg?.chat) continue
    const c = msg.chat as {
      id: number
      type?: string
      title?: string
      username?: string
      first_name?: string
      last_name?: string
    }
    const id = String(c.id)
    const title = chatLabel(c)
    const dateRaw = msg.date
    const date =
      typeof dateRaw === 'number'
        ? new Date(dateRaw * 1000).toISOString()
        : new Date().toISOString()
    const existing = byId.get(id)
    if (!existing || date > existing.lastMessageAt) {
      byId.set(id, {
        chatId: id,
        title,
        type: c.type ?? 'unknown',
        lastMessageAt: date,
      })
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    b.lastMessageAt.localeCompare(a.lastMessageAt)
  )
}

/** Pull recent updates and list unique chats (DM, group, supergroup, channel). */
export async function detectChatsFromUpdates(botToken: string): Promise<{
  chats: DetectedChat[]
  webhookUrl: string | null
  updates: Record<string, unknown>[]
}> {
  const webhookInfo = (await callTelegramApi(botToken, 'getWebhookInfo', {})) as { url?: string }
  const webhookUrl = webhookInfo.url?.trim() ? webhookInfo.url : null
  const updates = await fetchRawUpdates(botToken)
  const chats = parseChatsFromUpdates(updates)
  return { chats, webhookUrl, updates }
}

function updatePayloadMessage(update: Record<string, unknown>): Record<string, unknown> | undefined {
  return (
    (update.message as Record<string, unknown> | undefined) ??
    (update.channel_post as Record<string, unknown> | undefined) ??
    (update.edited_message as Record<string, unknown> | undefined) ??
    (update.edited_channel_post as Record<string, unknown> | undefined)
  )
}

export async function verifyTelegramBot(botToken: string, chatId: string) {
  const me = (await callTelegramApi(botToken, 'getMe', {})) as Record<string, unknown>
  const chat = (await callTelegramApi(botToken, 'getChat', { chat_id: chatId })) as Record<string, unknown>
  return {
    botUsername: me.username as string | undefined,
    botName: me.first_name as string | undefined,
    chatTitle: (chat.title as string | undefined) ?? (chat.username as string | undefined) ?? String(chat.id),
  }
}

export function extractTelegramMessagesFromUpdates(
  updates: Record<string, unknown>[],
  chatId: string,
  limit = 40
): TelegramMessage[] {
  const chatIdString = String(chatId)
  const rows: { msg: Record<string, unknown>; text: string }[] = []
  for (const u of updates) {
    const m = updatePayloadMessage(u)
    if (!m || String((m.chat as { id: number })?.id) !== chatIdString) continue
    const text =
      typeof m.text === 'string'
        ? m.text
        : typeof m.caption === 'string'
          ? m.caption
          : ''
    if (!text) continue
    rows.push({ msg: m, text })
  }
  rows.sort((a, b) => Number(a.msg.date) - Number(b.msg.date))
  const sliced = rows.slice(-limit)

  return sliced.map(({ msg, text }) => {
    const chat = msg.chat as {
      id: number
      title?: string
      username?: string
    }
    const from = msg.from as { first_name?: string; username?: string; is_bot?: boolean } | undefined
    return {
      id: String(msg.message_id),
      chatId: String(chat.id),
      sender: from?.first_name ?? from?.username ?? chat.title ?? chat.username ?? 'Channel',
      text,
      date: new Date(Number(msg.date) * 1000).toISOString(),
      incoming: !from?.is_bot,
    }
  })
}

export async function importTelegramMessages(botToken: string, chatId: string, limit = 40): Promise<TelegramMessage[]> {
  const updates = await prepareUpdatesForImport(botToken)
  return extractTelegramMessagesFromUpdates(updates, chatId, limit)
}

export async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  return callTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
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

export function buildTelegramStyleProfile(messages: TelegramMessage[], chatId: string) {
  const texts = messages
    .filter((m) => m.incoming)
    .map((m) => m.text)
    .filter(Boolean)
  const avgWords = texts.length
    ? Math.round(texts.map((t) => t.split(/\s+/).length).reduce((a, b) => a + b, 0) / texts.length)
    : 0

  return {
    generatedAt: new Date().toISOString(),
    basedOnMessages: texts.length,
    chatId,
    detectedLanguages: detectLanguage(texts),
    styleSignals: {
      averageWordCount: avgWords,
      usesExclamationMark: texts.some((t) => t.includes('!')),
      sentenceStructure: avgWords < 12 ? 'short-chatty' : avgWords < 30 ? 'medium' : 'detailed',
    },
    sampleSnippets: texts.slice(0, 3),
  }
}

export function readLatestTelegramImport(): TelegramMessage[] {
  const dir = getWorkspacePath('telegram-import')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => /^messages-.*\.json$/.test(f))
  if (files.length === 0) return []
  const latest = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.f
  if (!latest) return []
  const payload = JSON.parse(fs.readFileSync(path.join(dir, latest), 'utf-8'))
  return (payload.messages ?? []) as TelegramMessage[]
}
