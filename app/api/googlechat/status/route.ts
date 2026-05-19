import { NextResponse } from 'next/server'
import { getGoogleChatConnectedEmail, loadGoogleChatConfig, readLatestGoogleChatImport } from '@/lib/googlechat'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const config = await loadGoogleChatConfig()
  const latestImport = readLatestGoogleChatImport()
  const importedCount = latestImport.length
  return NextResponse.json({
    connected: !!config,
    accountEmail: (await getGoogleChatConnectedEmail()) ?? '',
    defaultSpaceId: config?.defaultSpaceId ?? latestImport[latestImport.length - 1]?.spaceId ?? '',
    importedCount,
  })
}
