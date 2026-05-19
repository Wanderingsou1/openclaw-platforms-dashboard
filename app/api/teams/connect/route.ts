import { NextRequest, NextResponse } from 'next/server'
import {
  createTeamsSubscription,
  saveTeamsConfig,
  verifyTeamsConnection,
} from '@/lib/teams'

const DEFAULT_WEBHOOK_URL =
  process.env.TEAMS_WEBHOOK_URL?.trim() ||
  'https://companion-oxford-seldom.ngrok-free.app/api/teams/webhook'

export async function POST(req: NextRequest) {
  try {
    const { clientId, clientSecret, tenantId, webhookUrl, defaultChatId } = await req.json()
    const id = String(clientId ?? '').trim()
    const secret = String(clientSecret ?? '').trim()
    const tenant = String(tenantId ?? '').trim()
    const webhook = String(webhookUrl ?? DEFAULT_WEBHOOK_URL).trim() || DEFAULT_WEBHOOK_URL
    const chatId = String(defaultChatId ?? '').trim()

    if (!id || !secret || !tenant || !webhook) {
      return NextResponse.json(
        {
          success: false,
          error: 'clientId, clientSecret, tenantId, and webhookUrl are required',
        },
        { status: 400 }
      )
    }

    const { accountName } = await verifyTeamsConnection(id, secret, tenant)
    const previewConfig = {
      clientId: id,
      clientSecret: secret,
      tenantId: tenant,
      accountName,
      defaultChatId: chatId || undefined,
      webhookUrl: webhook,
      connectedAt: new Date().toISOString(),
    }
    const { subscriptionId, subscriptionExpiry } = await createTeamsSubscription(previewConfig)

    saveTeamsConfig({
      ...previewConfig,
      subscriptionId,
      subscriptionExpiry,
    })

    return NextResponse.json({
      success: true,
      connected: true,
      accountName,
      subscriptionId,
      subscriptionExpiry,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Teams connect failed' }, { status: 500 })
  }
}
