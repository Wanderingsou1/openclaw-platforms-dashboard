import { NextResponse } from 'next/server'
import { loadSlackConfig, readLatestSlackImport } from '@/lib/slack'

export async function GET() {
  const config = loadSlackConfig()
  const importedCount = readLatestSlackImport().length
  return NextResponse.json({
    connected: !!config,
    teamName: config?.teamName ?? '',
    channelId: config?.channelId ?? '',
    channelName: config?.channelName ?? '',
    importedCount,
  })
}
