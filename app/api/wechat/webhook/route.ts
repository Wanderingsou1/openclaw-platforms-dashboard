import { NextRequest, NextResponse } from 'next/server'
import {
  appendWeChatWebhookMessage,
  loadWeChatConfig,
  parseWeChatTextXml,
  verifyWeChatSignature,
} from '@/lib/wechat'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const signature = searchParams.get('signature') ?? ''
  const timestamp = searchParams.get('timestamp') ?? ''
  const nonce = searchParams.get('nonce') ?? ''
  const echostr = searchParams.get('echostr') ?? ''

  const config = loadWeChatConfig()
  if (!config?.verifyToken) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  if (!verifyWeChatSignature(config.verifyToken, timestamp, nonce, signature)) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  return new NextResponse(echostr, { status: 200 })
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const signature = searchParams.get('signature') ?? ''
  const timestamp = searchParams.get('timestamp') ?? ''
  const nonce = searchParams.get('nonce') ?? ''

  const config = loadWeChatConfig()
  if (!config?.verifyToken) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  if (!verifyWeChatSignature(config.verifyToken, timestamp, nonce, signature)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  try {
    const raw = await req.text()
    const parsed = parseWeChatTextXml(raw)
    if (parsed) {
      const ms = parsed.msgId ? Number(parsed.msgId) : Date.now()
      const date =
        parsed.createTime && /^\d+$/.test(parsed.createTime)
          ? new Date(Number(parsed.createTime) * 1000).toISOString()
          : new Date().toISOString()
      appendWeChatWebhookMessage({
        id: String(ms),
        openId: parsed.fromUser,
        sender: `WeChat ${parsed.fromUser.slice(0, 8)}…`,
        text: parsed.content,
        date,
        incoming: true,
      })
    }
  } catch {
    // still acknowledge
  }

  return new NextResponse('', { status: 200 })
}
