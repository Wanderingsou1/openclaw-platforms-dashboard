import { NextRequest, NextResponse } from 'next/server'
import { writeWorkspaceJSON } from '@/lib/workspace'
import {
  buildTeamsStyleProfile,
  importTeamsMessages,
  loadTeamsConfig,
  pollTeamsMessages,
  readLatestTeamsImport,
} from '@/lib/teams'

export async function GET() {
  try {
    const config = loadTeamsConfig()
    if (!config) {
      return NextResponse.json({ success: false, error: 'Teams is not connected yet' }, { status: 400 })
    }
    const messages = readLatestTeamsImport(50)
    return NextResponse.json({
      success: true,
      count: messages.length,
      accountName: config.accountName,
      messages,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Teams import failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const config = loadTeamsConfig()
    if (!config) {
      return NextResponse.json({ success: false, error: 'Teams is not connected yet' }, { status: 400 })
    }

    const body = (await req.json().catch(() => ({}))) as { mode?: string }
    const shouldPoll = body.mode === 'poll'

    if (shouldPoll) {
      await pollTeamsMessages(50)
    }

    const messages = await importTeamsMessages(50)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const messagesFile = `teams-import/messages-${timestamp}.json`
    const styleFile = 'teams-import/style-profile.json'

    writeWorkspaceJSON(messagesFile, {
      importedAt: new Date().toISOString(),
      accountName: config.accountName,
      defaultChatId: config.defaultChatId,
      totalCount: messages.length,
      messages,
    })
    writeWorkspaceJSON(styleFile, buildTeamsStyleProfile(messages, config.defaultChatId ?? 'all-chats'))

    return NextResponse.json({
      success: true,
      count: messages.length,
      files: [messagesFile, styleFile],
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Teams import failed' }, { status: 500 })
  }
}
