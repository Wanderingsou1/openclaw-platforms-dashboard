import { NextRequest, NextResponse } from 'next/server'
import { detectSlackChannels } from '@/lib/slack'

export async function POST(req: NextRequest) {
  try {
    const { botToken } = await req.json()
    if (!String(botToken ?? '').trim()) {
      return NextResponse.json({ success: false, error: 'botToken is required' }, { status: 400 })
    }
    const channels = await detectSlackChannels(String(botToken).trim())
    return NextResponse.json({
      success: true,
      channels,
      hint: channels.length
        ? null
        : 'No channels detected. Invite the bot to a channel first using /invite @your-bot-name, then detect again.',
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Slack detect failed' }, { status: 500 })
  }
}
