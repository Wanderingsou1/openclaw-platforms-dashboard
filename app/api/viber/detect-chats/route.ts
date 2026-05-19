import { NextRequest, NextResponse } from 'next/server'
import { callViberApi, isViberDemoActive, listViberPeersFromWebhook } from '@/lib/viber'

export async function POST(req: NextRequest) {
  try {
    if (isViberDemoActive()) {
      const peers = listViberPeersFromWebhook()
      return NextResponse.json({ success: true, peers, hint: null, localPreview: true })
    }

    const { authToken } = await req.json()
    if (!String(authToken ?? '').trim()) {
      return NextResponse.json({ success: false, error: 'authToken is required' }, { status: 400 })
    }
    const token = String(authToken).trim()
    await callViberApi(token, 'get_account_info', {})

    const peers = listViberPeersFromWebhook()
    let hint: string | null = null
    if (peers.length === 0) {
      hint =
        'No subscribers yet. Set the Viber webhook to this app (see “Register webhook”), message your Public Account from Viber, then detect again—or paste a known Viber user ID.'
    }

    return NextResponse.json({
      success: true,
      peers,
      hint,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? 'Viber detect failed' },
      { status: 500 }
    )
  }
}
