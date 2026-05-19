import fs from 'fs'
import path from 'path'
import { getWorkspacePath, writeWorkspaceJSON } from './workspace'

export interface SlackConfig {
  botToken: string
  teamId: string
  teamName: string
  botUserId: string
  channelId: string
  channelName: string
  connectedAt: string
}

export interface SlackChannel {
  id: string
  name: string
  isPrivate: boolean
}

export interface SlackMessage {
  id: string
  channelId: string
  sender: string
  text: string
  date: string
  incoming: boolean
}

const DEVANAGARI_RE = /[\u0900-\u097F]/
const HINDI_KEYWORDS = ['yaar', 'bhai', 'kya', 'haan', 'nahi', 'kar', 'hai', 'theek', 'abhi']

function slackConfigPath() {
  return getWorkspacePath('slack-import', 'bot-config.json')
}

export function saveSlackConfig(config: SlackConfig) {
  writeWorkspaceJSON('slack-import/bot-config.json', config)
}

export function loadSlackConfig(): SlackConfig | null {
  const file = slackConfigPath()
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

async function slackApi<T>(botToken: string, method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue
    form.set(key, typeof value === 'string' ? value : String(value))
  }

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      Authorization: `Bearer ${botToken}`,
    },
    body: form.toString(),
  })
  const data = (await res.json()) as Record<string, any>
  if (!res.ok || data.ok !== true) {
    throw new Error(data.error ? `Slack ${method} failed: ${data.error}` : `Slack ${method} failed`)
  }
  return data as T
}

export async function verifySlackBot(botToken: string, channelId: string) {
  const auth = await slackApi<{ team_id: string; team: string; user_id: string }>(botToken, 'auth.test')
  const channelInfo = await slackApi<{ channel?: { id: string; name?: string } }>(botToken, 'conversations.info', {
    channel: channelId,
  })
  return {
    teamId: auth.team_id,
    teamName: auth.team,
    botUserId: auth.user_id,
    channelName: channelInfo.channel?.name ?? channelId,
  }
}

export async function detectSlackChannels(botToken: string): Promise<SlackChannel[]> {
  const resp = await slackApi<{ channels?: Array<{ id: string; name: string; is_private?: boolean; is_member?: boolean }> }>(
    botToken,
    'conversations.list',
    {
      types: 'public_channel,private_channel,im,mpim',
      exclude_archived: true,
      limit: 200,
    }
  )
  return (resp.channels ?? [])
    .filter((c) => c.is_member !== false)
    .map((c) => ({ id: c.id, name: c.name || c.id, isPrivate: !!c.is_private }))
}

export async function importSlackMessages(
  botToken: string,
  channelId: string,
  botUserId: string,
  limit = 40
): Promise<SlackMessage[]> {
  const resp = await slackApi<{ messages?: Array<Record<string, any>> }>(botToken, 'conversations.history', {
    channel: channelId,
    limit: Math.max(limit, 50),
  })
  const rows = (resp.messages ?? [])
    .filter((m) => typeof m.text === 'string' && m.text.trim().length > 0)
    .filter((m) => !m.subtype || m.subtype === 'thread_broadcast')
    .slice(0, limit)
    .reverse()

  return rows.map((m) => {
    const ts = String(m.ts ?? '')
    const epochMs = Number(ts.split('.')[0] ?? 0) * 1000
    const sender = m.user ? `U:${m.user}` : m.username ?? 'Slack user'
    const incoming = m.user ? m.user !== botUserId : true
    return {
      id: ts || `${Date.now()}`,
      channelId,
      sender,
      text: String(m.text),
      date: epochMs ? new Date(epochMs).toISOString() : new Date().toISOString(),
      incoming,
    }
  })
}

export async function sendSlackMessage(botToken: string, channelId: string, text: string) {
  await slackApi(botToken, 'chat.postMessage', {
    channel: channelId,
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

export function buildSlackStyleProfile(messages: SlackMessage[], channelId: string) {
  const texts = messages.filter((m) => m.incoming).map((m) => m.text)
  const avgWords = texts.length
    ? Math.round(texts.map((t) => t.split(/\s+/).length).reduce((a, b) => a + b, 0) / texts.length)
    : 0
  return {
    generatedAt: new Date().toISOString(),
    basedOnMessages: texts.length,
    channelId,
    detectedLanguages: detectLanguage(texts),
    styleSignals: {
      averageWordCount: avgWords,
      usesExclamationMark: texts.some((t) => t.includes('!')),
      sentenceStructure: avgWords < 12 ? 'short-chatty' : avgWords < 30 ? 'medium' : 'detailed',
    },
    sampleSnippets: texts.slice(0, 3),
  }
}

export function readLatestSlackImport(): SlackMessage[] {
  const dir = getWorkspacePath('slack-import')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => /^messages-.*\.json$/.test(f))
  if (files.length === 0) return []
  const latest = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.f
  if (!latest) return []
  const payload = JSON.parse(fs.readFileSync(path.join(dir, latest), 'utf-8'))
  return (payload.messages ?? []) as SlackMessage[]
}
