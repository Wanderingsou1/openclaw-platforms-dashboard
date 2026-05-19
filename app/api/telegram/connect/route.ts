import { NextRequest, NextResponse } from 'next/server'
import { saveTelegramConfig, verifyTelegramBot } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  try {
    const { botToken, chatId } = await req.json()
    if (!botToken || !chatId) {
      return NextResponse.json({ success: false, error: 'botToken and chatId are required' }, { status: 400 })
    }

    const verified = await verifyTelegramBot(String(botToken).trim(), String(chatId).trim())
    saveTelegramConfig({
      botToken: String(botToken).trim(),
      chatId: String(chatId).trim(),
      connectedAt: new Date().toISOString(),
      ...verified,
    })

    return NextResponse.json({
      success: true,
      connected: true,
      botName: verified.botName,
      botUsername: verified.botUsername,
      chatTitle: verified.chatTitle,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Telegram connect failed' }, { status: 500 })
  }
}
