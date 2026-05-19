import { NextRequest, NextResponse } from 'next/server'
import {
  isLineDemoActive,
  loadLineConfig,
  saveLineConfig,
  verifyLineCredentials,
} from '@/lib/line'

export async function POST(req: NextRequest) {
  try {
    if (isLineDemoActive()) {
      const c = loadLineConfig()!
      return NextResponse.json({
        success: true,
        connected: !!c.userId,
        prepared: !c.userId,
        localPreview: true,
        message: 'Using bundled preview configuration (simulation/line.json).',
        botName: c.botName,
        displayName: c.displayName,
      })
    }

    const { channelAccessToken, channelSecret, userId, displayName } = await req.json()
    if (!String(channelAccessToken ?? '').trim() || !String(channelSecret ?? '').trim()) {
      return NextResponse.json(
        { success: false, error: 'channelAccessToken and channelSecret are required' },
        { status: 400 }
      )
    }

    const token = String(channelAccessToken).trim()
    const secret = String(channelSecret).trim()
    const uid = String(userId ?? '').trim() || undefined
    const name = String(displayName ?? '').trim() || undefined

    const { botName } = await verifyLineCredentials(token)

    saveLineConfig({
      channelAccessToken: token,
      channelSecret: secret,
      userId: uid ?? '',
      connectedAt: new Date().toISOString(),
      displayName: name,
      botName,
    })

    return NextResponse.json({
      success: true,
      connected: !!uid,
      prepared: !uid,
      botName,
      displayName: name,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'LINE connect failed' }, { status: 500 })
  }
}
