import { NextResponse } from 'next/server'
import { writeWorkspaceJSON } from '@/lib/workspace'
import {
  buildSignalStyleProfile,
  importSignalMessages,
  loadSignalConfig,
  pullSignalMessagesNow,
} from '@/lib/signal'

export async function POST() {
  try {
    const config = loadSignalConfig()
    if (!config?.phoneNumber) {
      return NextResponse.json({ success: false, error: 'Signal is not connected yet' }, { status: 400 })
    }

    // Always do one pull first so new inbound messages are captured even if the listener isn't running.
    await pullSignalMessagesNow(config.apiUrl, config.phoneNumber)
    const messages = importSignalMessages(40)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const messagesFile = `signal-import/messages-${timestamp}.json`
    const styleFile = 'signal-import/style-profile.json'

    if (messages.length > 0) {
      writeWorkspaceJSON(messagesFile, {
        importedAt: new Date().toISOString(),
        recipientNumber: config.recipientNumber ?? '',
        totalCount: messages.length,
        messages,
      })
      writeWorkspaceJSON(styleFile, buildSignalStyleProfile(messages, config.recipientNumber ?? ''))
    }

    return NextResponse.json({
      success: true,
      count: messages.length,
      files: messages.length > 0 ? [messagesFile, styleFile] : [],
      hint:
        messages.length === 0
          ? 'No inbound Signal messages are saved yet. Keep this dashboard open for listener sync, send a new message from another Signal account, then import again.'
          : null,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Signal import failed' }, { status: 500 })
  }
}
