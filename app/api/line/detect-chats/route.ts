import { NextRequest, NextResponse } from 'next/server'
import { isLineDemoActive, listLinePeersFromWebhook, verifyLineCredentials } from '@/lib/line'

export async function POST(req: NextRequest) {
  try {
    if (isLineDemoActive()) {
      const peers = listLinePeersFromWebhook()
      return NextResponse.json({ success: true, peers, hint: null, localPreview: true })
    }

    const { channelAccessToken } = await req.json()
    if (!String(channelAccessToken ?? '').trim()) {
      return NextResponse.json(
        { success: false, error: 'channelAccessToken is required' },
        { status: 400 }
      )
    }

    await verifyLineCredentials(String(channelAccessToken).trim())

    const peers = listLinePeersFromWebhook()
    let hint: string | null = null
    if (peers.length === 0) {
      hint =
        'No followers yet. Set the LINE webhook URL in the LINE Developers Console, message your bot from LINE, then detect again — or paste a known user ID.'
    }

    return NextResponse.json({ success: true, peers, hint })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? 'LINE detect failed' },
      { status: 500 }
    )
  }
}
