import { NextRequest, NextResponse } from 'next/server'
import { callViberApi, isViberDemoActive } from '@/lib/viber'

export async function POST(req: NextRequest) {
  try {
    const { authToken, webhookUrl } = await req.json()
    if (isViberDemoActive()) {
      const url = String(webhookUrl ?? '').trim()
      return NextResponse.json({ success: true, webhookUrl: url, localPreview: true })
    }
    if (!String(authToken ?? '').trim() || !String(webhookUrl ?? '').trim()) {
      return NextResponse.json(
        { success: false, error: 'authToken and webhookUrl are required' },
        { status: 400 }
      )
    }
    const token = String(authToken).trim()
    const url = String(webhookUrl).trim()
    await callViberApi(token, 'set_webhook', { url })
    return NextResponse.json({ success: true, webhookUrl: url })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Viber set_webhook failed' }, { status: 500 })
  }
}
