import { NextRequest, NextResponse } from 'next/server'
import { saveSlackConfig, verifySlackBot } from '@/lib/slack'

export async function POST(req: NextRequest) {
  try {
    const { botToken, channelId } = await req.json()
    if (!botToken || !channelId) {
      return NextResponse.json({ success: false, error: 'botToken and channelId are required' }, { status: 400 })
    }
    const token = String(botToken).trim()
    const channel = String(channelId).trim()
    const verified = await verifySlackBot(token, channel)
    saveSlackConfig({
      botToken: token,
      channelId: channel,
      connectedAt: new Date().toISOString(),
      teamId: verified.teamId,
      teamName: verified.teamName,
      botUserId: verified.botUserId,
      channelName: verified.channelName,
    })
    return NextResponse.json({ success: true, connected: true, ...verified })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Slack connect failed' }, { status: 500 })
  }
}
