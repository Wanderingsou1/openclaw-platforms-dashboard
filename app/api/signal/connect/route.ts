import { NextRequest, NextResponse } from 'next/server'
import {
  startSignalListener,
  saveSignalConfig,
  verifySignalAccount,
  isSignalDemoActive,
} from '@/lib/signal'

export async function POST(req: NextRequest) {
  try {
    const { apiUrl, phoneNumber, recipientNumber, recipientName } = await req.json()
    if (!String(apiUrl ?? '').trim() || !String(phoneNumber ?? '').trim()) {
      return NextResponse.json(
        { success: false, error: 'apiUrl and phoneNumber are required' },
        { status: 400 }
      )
    }

    const url = String(apiUrl).trim()
    const phone = String(phoneNumber).trim()
    const recipient = String(recipientNumber ?? '').trim()
    const name = String(recipientName ?? '').trim() || undefined
    const connectedAt = new Date().toISOString()

    await verifySignalAccount(url, phone)

    saveSignalConfig({
      apiUrl: url,
      phoneNumber: phone,
      recipientNumber: recipient,
      connectedAt,
      recipientName: name,
    })
    startSignalListener({
      apiUrl: url,
      phoneNumber: phone,
      recipientNumber: recipient,
      connectedAt,
      recipientName: name,
    })

    return NextResponse.json({
      success: true,
      connected: true,
      localPreview: isSignalDemoActive(),
      phoneNumber: phone,
      recipientNumber: recipient,
      recipientName: name,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Signal connect failed' }, { status: 500 })
  }
}
