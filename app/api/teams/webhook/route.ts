import { NextRequest, NextResponse } from 'next/server'
import { appendTeamsWebhookMessage, getTeamsClientState } from '@/lib/teams'

export const dynamic = 'force-dynamic'

function extractValidationToken(req: NextRequest, body: Record<string, any> | null) {
  const queryToken = req.nextUrl.searchParams.get('validationToken')
  if (queryToken) return queryToken
  const bodyToken = body?.validationToken ?? body?.validationtoken ?? body?.token
  return typeof bodyToken === 'string' ? bodyToken : ''
}

export async function GET(req: NextRequest) {
  const token = extractValidationToken(req, null)
  if (!token) {
    return new NextResponse('', { status: 200 })
  }
  return new NextResponse(token, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, any> | null
  const validationToken = extractValidationToken(req, body)
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  }

  if (!body) {
    return new NextResponse(null, { status: 200 })
  }

  const expected = getTeamsClientState()
  const notifications = Array.isArray(body.value) ? body.value : []
  if (notifications.length && notifications.some((note) => String(note.clientState ?? '') !== expected)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  try {
    await appendTeamsWebhookMessage(body)
  } catch {
    // Keep the webhook healthy even if a notification is malformed.
  }

  return new NextResponse(null, { status: 200 })
}
