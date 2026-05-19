import { NextResponse } from 'next/server'
import { writeWorkspaceJSON } from '@/lib/workspace'
import { buildSlackStyleProfile, importSlackMessages, loadSlackConfig } from '@/lib/slack'

export async function POST() {
  try {
    const config = loadSlackConfig()
    if (!config) {
      return NextResponse.json({ success: false, error: 'Slack bot is not connected yet' }, { status: 400 })
    }
    const messages = await importSlackMessages(config.botToken, config.channelId, config.botUserId, 40)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const messagesFile = `slack-import/messages-${timestamp}.json`
    const styleFile = 'slack-import/style-profile.json'

    writeWorkspaceJSON(messagesFile, {
      importedAt: new Date().toISOString(),
      teamId: config.teamId,
      channelId: config.channelId,
      totalCount: messages.length,
      messages,
    })
    writeWorkspaceJSON(styleFile, buildSlackStyleProfile(messages, config.channelId))

    return NextResponse.json({ success: true, count: messages.length, files: [messagesFile, styleFile] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Slack import failed' }, { status: 500 })
  }
}
