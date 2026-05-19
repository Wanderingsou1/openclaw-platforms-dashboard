import { NextResponse } from 'next/server'
import { writeWorkspaceJSON } from '@/lib/workspace'
import { buildLineStyleProfile, importLineMessagesFromWebhook, loadLineConfig } from '@/lib/line'

export async function POST() {
  try {
    const config = loadLineConfig()
    if (!config?.userId) {
      return NextResponse.json({ success: false, error: 'LINE is not connected yet' }, { status: 400 })
    }

    const messages = importLineMessagesFromWebhook(config.userId, 40)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const messagesFile = `line-import/messages-${timestamp}.json`
    const styleFile = 'line-import/style-profile.json'

    writeWorkspaceJSON(messagesFile, {
      importedAt: new Date().toISOString(),
      userId: config.userId,
      totalCount: messages.length,
      messages,
    })
    writeWorkspaceJSON(styleFile, buildLineStyleProfile(messages, config.userId))

    return NextResponse.json({ success: true, count: messages.length, files: [messagesFile, styleFile] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'LINE import failed' }, { status: 500 })
  }
}
