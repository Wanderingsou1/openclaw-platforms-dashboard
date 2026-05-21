import { NextResponse } from 'next/server'
import {
  getDefaultTeamsWebhookUrl,
  loadTeamsConfig,
  readLatestTeamsImport,
} from '@/lib/teams'

export async function GET() {
  const config = loadTeamsConfig()
  return NextResponse.json({
    connected: !!config,
    accountName: config?.accountName ?? '',
    tenantId: config?.tenantId ?? '',
    defaultChatId: config?.defaultChatId ?? '',
    webhookUrl: config?.webhookUrl ?? '',
    suggestedWebhookUrl: getDefaultTeamsWebhookUrl(),
    subscriptionId: config?.subscriptionId ?? '',
    subscriptionExpiry: config?.subscriptionExpiry ?? '',
    importedCount: readLatestTeamsImport().length,
  })
}
