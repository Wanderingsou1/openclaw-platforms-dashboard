import { NextResponse } from 'next/server'
import { loadTelegramConfig, readLatestTelegramImport } from '@/lib/telegram'

export async function GET() {
  const config = loadTelegramConfig()
  const importedCount = readLatestTelegramImport().length
  return NextResponse.json({
    connected: !!config,
    chatId: config?.chatId ?? '',
    botName: config?.botName ?? '',
    botUsername: config?.botUsername ?? '',
    chatTitle: config?.chatTitle ?? '',
    importedCount,
  })
}
