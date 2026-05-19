import { NextRequest, NextResponse } from 'next/server'
import { isWeChatDemoActive, listWeChatPeersFromWebhook, verifyWeChatCredentials } from '@/lib/wechat'

export async function POST(req: NextRequest) {
  try {
    if (isWeChatDemoActive()) {
      const peers = listWeChatPeersFromWebhook()
      return NextResponse.json({ success: true, peers, hint: null, localPreview: true })
    }

    const { appId, appSecret } = await req.json()
    if (!String(appId ?? '').trim() || !String(appSecret ?? '').trim()) {
      return NextResponse.json({ success: false, error: 'appId and appSecret are required' }, { status: 400 })
    }
    await verifyWeChatCredentials(String(appId).trim(), String(appSecret).trim())

    const peers = listWeChatPeersFromWebhook()
    let hint: string | null = null
    if (peers.length === 0) {
      hint =
        'No messages in the local webhook log yet. Finish URL verification in the WeChat MP admin, send a text to your official account, then try again—or paste an Open ID you already know.'
    }

    return NextResponse.json({ success: true, peers, hint })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? 'WeChat detect failed' },
      { status: 500 }
    )
  }
}
