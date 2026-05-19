import { NextResponse } from 'next/server'
import { writeWorkspaceJSON } from '@/lib/workspace'
import {
  buildTelegramStyleProfile,
  clearPendingUpdates,
  importTelegramMessages,
  loadTelegramConfig,
} from '@/lib/telegram'

export async function POST() {
  try {
    const config = loadTelegramConfig()
    if (!config) {
      return NextResponse.json({ success: false, error: 'Telegram bot is not connected yet' }, { status: 400 })
    }

    const messages = await importTelegramMessages(config.botToken, config.chatId, 40)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const messagesFile = `telegram-import/messages-${timestamp}.json`
    const styleFile = 'telegram-import/style-profile.json'

    writeWorkspaceJSON(messagesFile, {
      importedAt: new Date().toISOString(),
      chatId: config.chatId,
      totalCount: messages.length,
      messages,
    })
    writeWorkspaceJSON(styleFile, buildTelegramStyleProfile(messages, config.chatId))

    if (messages.length > 0) {
      clearPendingUpdates()
    }

    return NextResponse.json({
      success: true,
      count: messages.length,
      files: [messagesFile, styleFile],
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Telegram import failed' }, { status: 500 })
  }
}
