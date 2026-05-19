import { NextResponse } from 'next/server'
import { isViberDemoActive, loadViberConfig, readLatestViberImport } from '@/lib/viber'

export async function GET() {
  const config = loadViberConfig()
  const importedCount = readLatestViberImport().length
  return NextResponse.json({
    connected: !!config,
    localPreview: isViberDemoActive(),
    peerUserId: config?.peerUserId ?? '',
    botName: config?.botName ?? '',
    peerName: config?.peerName ?? '',
    importedCount,
  })
}
