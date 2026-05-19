import { NextRequest, NextResponse } from 'next/server'
import { isLineDemoActive, verifyLineCredentials } from '@/lib/line'

export async function POST(req: NextRequest) {
  try {
    const { channelAccessToken, webhookUrl } = await req.json()
    const url = String(webhookUrl ?? '').trim()

    if (isLineDemoActive()) {
      return NextResponse.json({ success: true, webhookUrl: url, localPreview: true })
    }

    if (!String(channelAccessToken ?? '').trim() || !url) {
      return NextResponse.json(
        { success: false, error: 'channelAccessToken and webhookUrl are required' },
        { status: 400 }
      )
    }

    await verifyLineCredentials(String(channelAccessToken).trim())

    // LINE does not support programmatic webhook URL registration via the API.
    // The user must set the webhook URL manually in the LINE Developers Console.
    return NextResponse.json({
      success: true,
      webhookUrl: url,
      instruction:
        'Set this URL as the webhook in your LINE Developers Console → Messaging API → Webhook URL. Enable "Use webhook" and verify.',
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? 'LINE set-webhook failed' },
      { status: 500 }
    )
  }
}
