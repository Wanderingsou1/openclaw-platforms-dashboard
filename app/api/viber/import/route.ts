import { NextResponse } from 'next/server'
import { writeWorkspaceJSON } from '@/lib/workspace'
import { buildViberStyleProfile, importViberMessagesFromWebhook, loadViberConfig } from '@/lib/viber'

export async function POST() {
  try {
    const config = loadViberConfig()
    if (!config?.peerUserId) {
      return NextResponse.json({ success: false, error: 'Viber is not connected yet' }, { status: 400 })
    }

    const messages = importViberMessagesFromWebhook(config.peerUserId, 40)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const messagesFile = `viber-import/messages-${timestamp}.json`
    const styleFile = 'viber-import/style-profile.json'

    writeWorkspaceJSON(messagesFile, {
      importedAt: new Date().toISOString(),
      peerUserId: config.peerUserId,
      totalCount: messages.length,
      messages,
    })
    writeWorkspaceJSON(styleFile, buildViberStyleProfile(messages, config.peerUserId))

    return NextResponse.json({
      success: true,
      count: messages.length,
      files: [messagesFile, styleFile],
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Viber import failed' }, { status: 500 })
  }
}
