import { NextResponse } from 'next/server'
import { loadTeamsConfig, renewTeamsSubscription, saveTeamsConfig } from '@/lib/teams'

export async function GET() {
  try {
    const config = loadTeamsConfig()
    if (!config?.subscriptionId) {
      return NextResponse.json({ renewed: false, error: 'Teams subscription is not connected yet' })
    }

    const subscriptionExpiry = await renewTeamsSubscription(config)
    saveTeamsConfig({
      ...config,
      subscriptionExpiry,
    })

    return NextResponse.json({ renewed: true, subscriptionExpiry })
  } catch (err: any) {
    return NextResponse.json({ renewed: false, error: err.message ?? 'Teams renewal failed' }, { status: 500 })
  }
}
