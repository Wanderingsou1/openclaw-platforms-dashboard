import { NextRequest, NextResponse } from 'next/server'
import { appendGoogleChatWebhookMessage } from '@/lib/googlechat'

type GoogleChatUser = {
  name?: string
  displayName?: string
  email?: string
}

type GoogleChatSpace = {
  name?: string
  displayName?: string
}

type GoogleChatMessage = {
  name?: string
  text?: string
  argumentText?: string
  createTime?: string
  thread?: {
    name?: string
  }
  sender?: GoogleChatUser
}

type GoogleChatEvent = {
  type?: string
  message?: GoogleChatMessage
  user?: GoogleChatUser
  space?: GoogleChatSpace
  thread?: {
    name?: string
  }
}

function toIso(value?: string) {
  if (!value) return new Date().toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as GoogleChatEvent | null
    if (!body) {
      return new NextResponse(null, { status: 200 })
    }

    const eventType = String(body.type ?? '').trim().toUpperCase()
    const spaceId = body.space?.name ?? 'spaces/unknown'
    const spaceName = body.space?.displayName ?? spaceId
    const threadName = body.message?.thread?.name ?? body.thread?.name
    const createdAt = toIso(body.message?.createTime)
    const sender = body.message?.sender?.displayName ?? body.message?.sender?.name ?? body.user?.displayName ?? body.user?.name ?? 'Google Chat user'
    const senderId = body.message?.sender?.name ?? body.message?.sender?.email ?? body.user?.name ?? body.user?.email

    if (eventType === 'MESSAGE' || body.message?.text || body.message?.argumentText) {
      const text = String(body.message?.text ?? body.message?.argumentText ?? '').trim()
      if (text) {
        appendGoogleChatWebhookMessage({
          id: body.message?.name ?? `${spaceId}-${Date.now()}`,
          spaceId,
          spaceName,
          sender,
          senderId,
          text,
          date: createdAt,
          incoming: true,
          threadName,
        })
      }
    } else if (eventType === 'ADDED_TO_SPACE') {
      appendGoogleChatWebhookMessage({
        id: `${spaceId}-added-${Date.now()}`,
        spaceId,
        spaceName,
        sender,
        senderId,
        text: '[added to space]',
        date: createdAt,
        incoming: true,
        threadName,
      })
    } else if (eventType === 'REMOVED_FROM_SPACE') {
      appendGoogleChatWebhookMessage({
        id: `${spaceId}-removed-${Date.now()}`,
        spaceId,
        spaceName,
        sender,
        senderId,
        text: '[removed from space]',
        date: createdAt,
        incoming: true,
        threadName,
      })
    }

    return new NextResponse(null, { status: 200 })
  } catch {
    return new NextResponse(null, { status: 200 })
  }
}
