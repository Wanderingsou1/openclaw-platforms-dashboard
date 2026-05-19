import { NextRequest, NextResponse } from 'next/server'
import { appendLineWebhookMessage, loadLineConfig, verifyLineSignature } from '@/lib/line'

interface LineEventSource {
  type: string
  userId?: string
  groupId?: string
  roomId?: string
}

interface LineTextMessage {
  id: string
  type: string
  text?: string
}

interface LineEvent {
  type: string
  message?: LineTextMessage
  source?: LineEventSource
  timestamp?: number
  replyToken?: string
}

interface LineWebhookBody {
  destination?: string
  events?: LineEvent[]
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-line-signature') ?? ''

    const config = loadLineConfig()
    if (config?.channelSecret && signature) {
      if (!verifyLineSignature(config.channelSecret, rawBody, signature)) {
        return new NextResponse(null, { status: 401 })
      }
    }

    const body = JSON.parse(rawBody) as LineWebhookBody
    const events = body.events ?? []

    for (const event of events) {
      if (event.type !== 'message') continue
      if (event.message?.type !== 'text') continue
      const text = event.message.text?.trim()
      if (!text) continue

      const userId = event.source?.userId ?? ''
      const date = event.timestamp
        ? new Date(event.timestamp).toISOString()
        : new Date().toISOString()

      appendLineWebhookMessage({
        id: event.message.id || `line-${Date.now()}`,
        userId,
        sender: userId,
        text,
        date,
        incoming: true,
      })
    }

    return new NextResponse(null, { status: 200 })
  } catch {
    return new NextResponse(null, { status: 200 })
  }
}
