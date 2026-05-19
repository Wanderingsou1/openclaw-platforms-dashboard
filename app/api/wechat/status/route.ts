import { NextResponse } from 'next/server'
import { isWeChatDemoActive, loadWeChatConfig, readLatestWeChatImport } from '@/lib/wechat'

export async function GET() {
  const config = loadWeChatConfig()
  const importedCount = readLatestWeChatImport().length
  return NextResponse.json({
    serverPrepared: !!config,
    connected: !!(config?.openId),
    localPreview: isWeChatDemoActive(),
    appId: config?.appId ?? '',
    openId: config?.openId ?? '',
    nickname: config?.nickname ?? '',
    importedCount,
  })
}
