import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { loadWeChatDemoFile, weChatDemoIsEnabled } from '../../simulation/demo-simulations'
import { getWorkspacePath, writeWorkspaceJSON } from './workspace'

export interface WeChatConfig {
  appId: string
  appSecret: string
  verifyToken: string
  openId: string
  connectedAt: string
  nickname?: string
}

export interface WeChatMessage {
  id: string
  openId: string
  sender: string
  text: string
  date: string
  incoming: boolean
}

export interface WeChatWebhookRow {
  id: string
  openId: string
  sender: string
  text: string
  date: string
  incoming: boolean
}

const DEVANAGARI_RE = /[\u0900-\u097F]/
const HINDI_KEYWORDS = ['yaar', 'bhai', 'kya', 'haan', 'nahi', 'kar', 'hai', 'theek', 'abhi']

function configPath() {
  return getWorkspacePath('wechat-import', 'bot-config.json')
}

function hasRealWeChatConfigFile() {
  return fs.existsSync(configPath())
}

/** True when using `simulation/wechat.json` (no real bot-config.json). */
export function isWeChatDemoActive(): boolean {
  if (hasRealWeChatConfigFile()) return false
  return weChatDemoIsEnabled(loadWeChatDemoFile())
}

export function loadWeChatConfig(): WeChatConfig | null {
  const file = configPath()
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
  const demo = loadWeChatDemoFile()
  if (!weChatDemoIsEnabled(demo)) return null
  const c = demo!.credentials
  return {
    appId: c.appId,
    appSecret: c.appSecret,
    verifyToken: c.verifyToken,
    openId: c.openId,
    connectedAt: new Date().toISOString(),
    nickname: c.nickname,
  }
}

/** Preset draft from demo JSON (`wechat:messageId`). */
export function getWeChatPresetDraft(inboxMessageId: string): string | undefined {
  if (!isWeChatDemoActive()) return undefined
  const raw = inboxMessageId.startsWith('wechat:') ? inboxMessageId.slice(7) : inboxMessageId
  return loadWeChatDemoFile()?.messages.find((m) => m.id === raw)?.draftReply
}

export function saveWeChatConfig(config: WeChatConfig) {
  writeWorkspaceJSON('wechat-import/bot-config.json', config)
}

function webhookInboxPath() {
  return getWorkspacePath('wechat-import', 'webhook-inbox.json')
}

function readWebhookFile(): WeChatWebhookRow[] {
  const file = webhookInboxPath()
  if (!fs.existsSync(file)) return []
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeWebhookFile(rows: WeChatWebhookRow[]) {
  writeWorkspaceJSON('wechat-import/webhook-inbox.json', rows)
}

export function appendWeChatWebhookMessage(row: WeChatWebhookRow) {
  const rows = readWebhookFile()
  rows.push(row)
  const cap = 2000
  writeWebhookFile(rows.length > cap ? rows.slice(-cap) : rows)
}

export function verifyWeChatSignature(token: string, timestamp: string, nonce: string, signature: string) {
  const tmp = [token, timestamp, nonce].sort().join('')
  const hash = crypto.createHash('sha1').update(tmp).digest('hex')
  return hash === signature
}

/** Extract text + fields from WeChat server-push XML (text messages). */
export function parseWeChatTextXml(xml: string): {
  toUser: string
  fromUser: string
  createTime: string
  msgType: string
  content: string
  msgId: string
} | null {
  const cdata = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([^\\]]*)\\]\\]></${tag}>`, 'i'))
    return m?.[1]?.trim() ?? ''
  }
  const plain = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'))
    return m?.[1]?.trim() ?? ''
  }
  const msgType = cdata('MsgType') || plain('MsgType')
  if (!msgType || msgType.toLowerCase() !== 'text') return null
  const content = cdata('Content')
  if (!content) return null
  return {
    toUser: cdata('ToUserName') || plain('ToUserName'),
    fromUser: cdata('FromUserName') || plain('FromUserName'),
    createTime: plain('CreateTime'),
    msgType,
    content,
    msgId: plain('MsgId'),
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null

export async function getWeChatAccessToken(appId: string, appSecret: string): Promise<string> {
  if (isWeChatDemoActive()) return 'fe9c2a1b8d7e4f305162738495a6b7c8d'
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000 && cachedToken.token) {
    return cachedToken.token
  }
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`
  const res = await fetch(url)
  const data = (await res.json()) as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string }
  if (!data.access_token) {
    throw new Error(data.errmsg ?? 'WeChat token request failed')
  }
  cachedToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 7200) * 1000,
  }
  return data.access_token
}

export async function verifyWeChatCredentials(appId: string, appSecret: string) {
  if (isWeChatDemoActive()) return { ok: true as const }
  await getWeChatAccessToken(appId, appSecret)
  return { ok: true as const }
}

export interface DetectedWeChatPeer {
  openId: string
  title: string
  lastMessageAt: string
}

export function listWeChatPeersFromWebhook(): DetectedWeChatPeer[] {
  const demo = loadWeChatDemoFile()
  if (weChatDemoIsEnabled(demo) && !hasRealWeChatConfigFile()) {
    const d = demo!
    const last = d.messages[d.messages.length - 1]
    return [
      {
        openId: d.credentials.openId,
        title: d.credentials.nickname || last?.sender || 'Subscriber',
        lastMessageAt: last?.receivedAt ?? new Date().toISOString(),
      },
    ]
  }
  const rows = readWebhookFile()
  const byOpen = new Map<string, DetectedWeChatPeer>()
  for (const r of rows) {
    const key = r.openId
    const prev = byOpen.get(key)
    const title = r.sender || key
    if (!prev || r.date > prev.lastMessageAt) {
      byOpen.set(key, {
        openId: key,
        title,
        lastMessageAt: r.date,
      })
    }
  }
  return Array.from(byOpen.values()).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
}

export function importWeChatMessagesFromWebhook(openId: string, limit = 40): WeChatMessage[] {
  const demo = loadWeChatDemoFile()
  if (weChatDemoIsEnabled(demo) && !hasRealWeChatConfigFile()) {
    const d = demo!
    if (openId !== d.credentials.openId) return []
    return d.messages.slice(-limit).map((m) => ({
      id: m.id,
      openId: d.credentials.openId,
      sender: m.sender,
      text: m.text,
      date: m.receivedAt,
      incoming: true,
    }))
  }
  const rows = readWebhookFile().filter((r) => r.openId === openId && r.text.trim())
  const sliced = rows.slice(-limit)
  return sliced.map((r) => ({
    id: r.id,
    openId: r.openId,
    sender: r.sender,
    text: r.text,
    date: r.date,
    incoming: r.incoming,
  }))
}

export async function sendWeChatTextMessage(appId: string, appSecret: string, openId: string, text: string) {
  if (isWeChatDemoActive()) return
  const token = await getWeChatAccessToken(appId, appSecret)
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${encodeURIComponent(token)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: openId,
      msgtype: 'text',
      text: { content: text },
    }),
  })
  const data = (await res.json()) as { errcode?: number; errmsg?: string }
  if (data.errcode && data.errcode !== 0) {
    throw new Error(data.errmsg ?? `WeChat send failed (${data.errcode})`)
  }
}

function detectLanguage(texts: string[]): string[] {
  const combined = texts.join(' ').toLowerCase()
  const langs = new Set<string>()
  if (DEVANAGARI_RE.test(combined)) langs.add('Hindi')
  if (HINDI_KEYWORDS.some((w) => combined.split(/\W+/).includes(w))) langs.add('Hinglish')
  langs.add('English')
  return Array.from(langs)
}

export function buildWeChatStyleProfile(messages: WeChatMessage[], openId: string) {
  const texts = messages.filter((m) => m.incoming).map((m) => m.text)
  const avgWords = texts.length
    ? Math.round(texts.map((t) => t.split(/\s+/).length).reduce((a, b) => a + b, 0) / texts.length)
    : 0
  return {
    generatedAt: new Date().toISOString(),
    basedOnMessages: texts.length,
    openId,
    detectedLanguages: detectLanguage(texts),
    styleSignals: {
      averageWordCount: avgWords,
      usesExclamationMark: texts.some((t) => t.includes('!')),
      sentenceStructure: avgWords < 12 ? 'short-chatty' : avgWords < 30 ? 'medium' : 'detailed',
    },
    sampleSnippets: texts.slice(0, 3),
  }
}

export function readLatestWeChatImport(): WeChatMessage[] {
  const demo = loadWeChatDemoFile()
  if (weChatDemoIsEnabled(demo) && !hasRealWeChatConfigFile()) {
    const d = demo!
    return d.messages.map((m) => ({
      id: m.id,
      openId: d.credentials.openId,
      sender: m.sender,
      text: m.text,
      date: m.receivedAt,
      incoming: true,
    }))
  }
  const dir = getWorkspacePath('wechat-import')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => /^messages-.*\.json$/.test(f))
  if (files.length === 0) return []
  const latest = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.f
  if (!latest) return []
  const payload = JSON.parse(fs.readFileSync(path.join(dir, latest), 'utf-8'))
  return (payload.messages ?? []) as WeChatMessage[]
}

export function readWeChatInboxPreview(openId: string, max = 10): WeChatMessage[] {
  const demo = loadWeChatDemoFile()
  if (weChatDemoIsEnabled(demo) && !hasRealWeChatConfigFile()) {
    const d = demo!
    if (openId !== d.credentials.openId) return []
    return d.messages
      .filter((m) => m.text.trim())
      .slice(-max)
      .map((m) => ({
        id: m.id,
        openId: d.credentials.openId,
        sender: m.sender,
        text: m.text,
        date: m.receivedAt,
        incoming: true,
      }))
  }
  return readWebhookFile()
    .filter((r) => r.openId === openId && r.incoming && r.text.trim())
    .slice(-max)
    .map((r) => ({
      id: r.id,
      openId: r.openId,
      sender: r.sender,
      text: r.text,
      date: r.date,
      incoming: r.incoming,
    }))
}
