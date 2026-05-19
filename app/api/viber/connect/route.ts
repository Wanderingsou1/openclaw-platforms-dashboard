import { NextRequest, NextResponse } from 'next/server'
import { isViberDemoActive, loadViberConfig, saveViberConfig, verifyViberAccount } from '@/lib/viber'

export async function POST(req: NextRequest) {
  try {
    if (isViberDemoActive()) {
      const c = loadViberConfig()!
      return NextResponse.json({
        success: true,
        connected: true,
        localPreview: true,
        botName: c.botName,
        botId: c.botId,
        peerName: c.peerName,
      })
    }

    const { authToken, peerUserId } = await req.json()
    if (!String(authToken ?? '').trim() || !String(peerUserId ?? '').trim()) {
      return NextResponse.json(
        { success: false, error: 'authToken and peerUserId are required' },
        { status: 400 }
      )
    }
    const token = String(authToken).trim()
    const peer = String(peerUserId).trim()
    const verified = await verifyViberAccount(token, peer)
    saveViberConfig({
      authToken: token,
      peerUserId: peer,
      connectedAt: new Date().toISOString(),
      botName: verified.botName,
      botId: verified.botId,
      peerName: verified.peerName,
    })
    return NextResponse.json({ success: true, connected: true, ...verified })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Viber connect failed' }, { status: 500 })
  }
}
