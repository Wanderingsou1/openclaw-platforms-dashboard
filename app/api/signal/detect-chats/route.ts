import { NextRequest, NextResponse } from 'next/server'
import {
  isSignalDemoActive,
  listSignalPeersFromPolled,
} from '@/lib/signal'

export async function POST(req: NextRequest) {
  try {
    if (isSignalDemoActive()) {
      const peers = listSignalPeersFromPolled()
      return NextResponse.json({ success: true, peers, hint: null, localPreview: true })
    }

    const { apiUrl, phoneNumber } = await req.json()
    if (!String(apiUrl ?? '').trim() || !String(phoneNumber ?? '').trim()) {
      return NextResponse.json(
        { success: false, error: 'apiUrl and phoneNumber are required' },
        { status: 400 }
      )
    }

    const peers = listSignalPeersFromPolled()
    let hint: string | null = null
    if (peers.length === 0) {
      hint =
        'No messages received yet. Ask your contact to send you a message via Signal, then detect again — or enter their number manually.'
    }

    return NextResponse.json({ success: true, peers, hint })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? 'Signal detect failed' },
      { status: 500 }
    )
  }
}
