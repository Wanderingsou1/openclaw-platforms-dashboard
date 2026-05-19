import { NextRequest, NextResponse } from 'next/server'
import { appendViberWebhookMessage } from '@/lib/viber'

function extractText(body: Record<string, unknown>): string {
  const msg = body.message as Record<string, unknown> | undefined
  if (!msg || String(msg.type) !== 'text') return ''
  return typeof msg.text === 'string' ? msg.text : ''
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const event = String(body.event ?? '')

    if (event === 'message') {
      const text = extractText(body)
      const sender = body.sender as Record<string, unknown> | undefined
      const peerId = sender?.id != null ? String(sender.id) : ''
      const name = typeof sender?.name === 'string' ? sender.name : 'Viber user'
      const token = body.message_token
      const id = typeof token === 'number' || typeof token === 'string' ? String(token) : `${Date.now()}`
      const date =
        typeof body.timestamp === 'number'
          ? new Date(body.timestamp).toISOString()
          : new Date().toISOString()
      if (peerId && text.trim()) {
        appendViberWebhookMessage({
          id,
          peerId,
          sender: name,
          text,
          date,
          incoming: true,
        })
      }
    }

    if (event === 'conversation_started') {
      const user = body.user as Record<string, unknown> | undefined
      const peerId = user?.id != null ? String(user.id) : ''
      const name = typeof user?.name === 'string' ? user.name : 'Viber user'
      if (peerId) {
        appendViberWebhookMessage({
          id: `sub-${body.timestamp ?? Date.now()}`,
          peerId,
          sender: name,
          text: '[conversation started]',
          date:
            typeof body.timestamp === 'number'
              ? new Date(body.timestamp).toISOString()
              : new Date().toISOString(),
          incoming: true,
        })
      }
    }

    return new NextResponse(null, { status: 200 })
  } catch {
    return new NextResponse(null, { status: 200 })
  }
}
