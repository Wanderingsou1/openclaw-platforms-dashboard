import { NextResponse } from 'next/server'
import { isLineDemoActive, loadLineConfig, readLatestLineImport } from '@/lib/line'

export async function GET() {
  const config = loadLineConfig()
  const importedCount = readLatestLineImport().length
  return NextResponse.json({
    serverPrepared: !!config,
    connected: !!config?.userId,
    localPreview: isLineDemoActive(),
    channelAccessToken: config?.channelAccessToken ? '••••' : '',
    userId: config?.userId ?? '',
    displayName: config?.displayName ?? '',
    botName: config?.botName ?? '',
    importedCount,
  })
}
