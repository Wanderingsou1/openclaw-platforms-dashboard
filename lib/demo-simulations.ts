import fs from 'fs'
import path from 'path'

export interface ViberDemoMessage {
  id: string
  sender: string
  text: string
  receivedAt: string
  draftReply?: string
}

export interface ViberDemoFile {
  simulation?: boolean
  enabled?: boolean
  note?: string
  credentials: {
    authToken: string
    peerUserId: string
    botName?: string
    peerName?: string
    botId?: string
  }
  messages: ViberDemoMessage[]
}

export interface WeChatDemoMessage {
  id: string
  sender: string
  text: string
  receivedAt: string
  draftReply?: string
}

export interface WeChatDemoFile {
  simulation?: boolean
  enabled?: boolean
  note?: string
  credentials: {
    appId: string
    appSecret: string
    verifyToken: string
    openId: string
    nickname?: string
  }
  messages: WeChatDemoMessage[]
}

export interface SignalDemoMessage {
  id: string
  sender: string
  text: string
  receivedAt: string
  draftReply?: string
}

export interface SignalDemoFile {
  simulation?: boolean
  enabled?: boolean
  note?: string
  credentials: {
    apiUrl: string
    phoneNumber: string
    recipientNumber: string
    recipientName?: string
  }
  messages: SignalDemoMessage[]
}

export interface LineDemoMessage {
  id: string
  sender: string
  text: string
  receivedAt: string
  draftReply?: string
}

export interface LineDemoFile {
  simulation?: boolean
  enabled?: boolean
  note?: string
  credentials: {
    channelAccessToken: string
    channelSecret: string
    userId: string
    displayName?: string
  }
  messages: LineDemoMessage[]
}

function fixturePath(filename: string) {
  return path.join(process.cwd(), 'simulation', filename)
}

function readJson<T>(filename: string): T | null {
  const p = fixturePath(filename)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T
  } catch {
    return null
  }
}

export function loadViberDemoFile(): ViberDemoFile | null {
  return readJson<ViberDemoFile>('viber.json')
}

export function loadWeChatDemoFile(): WeChatDemoFile | null {
  return readJson<WeChatDemoFile>('wechat.json')
}

export function loadSignalDemoFile(): SignalDemoFile | null {
  return readJson<SignalDemoFile>('signal.json')
}

export function loadLineDemoFile(): LineDemoFile | null {
  return readJson<LineDemoFile>('line.json')
}

export function viberDemoIsEnabled(demo: ViberDemoFile | null): boolean {
  if (!demo?.credentials?.peerUserId || !Array.isArray(demo.messages)) return false
  if (demo.enabled === false) return false
  if (demo.simulation === false) return false
  return true
}

export function weChatDemoIsEnabled(demo: WeChatDemoFile | null): boolean {
  if (!demo?.credentials?.openId || !Array.isArray(demo.messages)) return false
  if (demo.enabled === false) return false
  if (demo.simulation === false) return false
  return true
}

export function signalDemoIsEnabled(demo: SignalDemoFile | null): boolean {
  if (!demo?.credentials?.recipientNumber || !Array.isArray(demo.messages)) return false
  if (demo.enabled === false) return false
  if (demo.simulation === false) return false
  return true
}

export function lineDemoIsEnabled(demo: LineDemoFile | null): boolean {
  if (!demo?.credentials?.userId || !Array.isArray(demo.messages)) return false
  if (demo.enabled === false) return false
  if (demo.simulation === false) return false
  return true
}
