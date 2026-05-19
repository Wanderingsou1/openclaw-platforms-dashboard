import { NextResponse } from 'next/server'
import { writeWorkspaceJSON } from '@/lib/workspace'
import {
  appendGoogleChatPolledMessages,
  buildGoogleChatStyleProfile,
  fetchGoogleChatMessages,
  importGoogleChatMessages,
  loadGoogleChatConfig,
} from '@/lib/googlechat'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  try {
    const config = await loadGoogleChatConfig()
    if (!config?.email) {
      return NextResponse.json({ success: false, error: 'Google Chat is not connected yet' }, { status: 400 })
    }

    const newRows = await fetchGoogleChatMessages()
    if (newRows.length > 0) {
      appendGoogleChatPolledMessages(newRows)
    }

    const messages = await importGoogleChatMessages(50)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const messagesFile = `googlechat-import/messages-${timestamp}.json`
    const styleFile = 'googlechat-import/style-profile.json'

    if (messages.length > 0) {
      const latestSpace = messages[messages.length - 1]?.spaceId ?? config.defaultSpaceId ?? ''
      writeWorkspaceJSON(messagesFile, {
        importedAt: new Date().toISOString(),
        accountEmail: config.email,
        defaultSpaceId: latestSpace,
        totalCount: messages.length,
        messages,
      })
      writeWorkspaceJSON(styleFile, buildGoogleChatStyleProfile(messages, config.email))
    }

    return NextResponse.json({
      success: true,
      count: messages.length,
      files: messages.length > 0 ? [messagesFile, styleFile] : [],
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Google Chat import failed' }, { status: 500 })
  }
}
