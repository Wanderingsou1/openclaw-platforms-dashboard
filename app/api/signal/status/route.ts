import { NextResponse } from 'next/server'
import { isSignalDemoActive, loadSignalConfig, readLatestSignalImport } from '@/lib/signal'

export async function GET() {
  const config = loadSignalConfig()
  const importedCount = readLatestSignalImport().length
  return NextResponse.json({
    connected: !!config,
    localPreview: isSignalDemoActive(),
    phoneNumber: config?.phoneNumber ?? '',
    recipientNumber: config?.recipientNumber ?? '',
    recipientName: config?.recipientName ?? '',
    importedCount,
  })
}
