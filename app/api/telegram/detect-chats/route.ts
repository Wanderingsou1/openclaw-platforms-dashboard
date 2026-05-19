import { NextRequest, NextResponse } from 'next/server'
import { detectChatsFromUpdates, savePendingUpdatesFromDetect } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  try {
    const { botToken } = await req.json()
    if (!String(botToken ?? '').trim()) {
      return NextResponse.json({ success: false, error: 'botToken is required' }, { status: 400 })
    }

    const token = String(botToken).trim()
    const { chats, webhookUrl, updates } = await detectChatsFromUpdates(token)
    savePendingUpdatesFromDetect(updates)

    let hint: string | null = null
    if (chats.length === 0) {
      if (webhookUrl) {
        hint =
          'This bot has a webhook configured, so long-polling getUpdates is usually empty. Remove the webhook with the Bot API deleteWebhook method (or use a separate bot for this dashboard), then try again.'
      } else {
        hint =
          'No activity yet. In Telegram, open your bot and send it any message (or post in the channel where the bot is admin), then click Detect chats again.'
      }
    }

    return NextResponse.json({
      success: true,
      chats,
      webhookActive: !!webhookUrl,
      webhookUrl: webhookUrl ?? null,
      hint,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? 'Detect chats failed' },
      { status: 500 }
    )
  }
}
