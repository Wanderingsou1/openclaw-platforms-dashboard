import { NextResponse } from 'next/server'
import { writeWorkspaceJSON } from '@/lib/workspace'
import {
  buildWeChatStyleProfile,
  importWeChatMessagesFromWebhook,
  loadWeChatConfig,
} from '@/lib/wechat'

export async function POST() {
  try {
    const config = loadWeChatConfig()
    if (!config?.openId) {
      return NextResponse.json(
        { success: false, error: 'WeChat is not fully connected (missing Open ID)' },
        { status: 400 }
      )
    }

    const messages = importWeChatMessagesFromWebhook(config.openId, 40)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const messagesFile = `wechat-import/messages-${timestamp}.json`
    const styleFile = 'wechat-import/style-profile.json'

    writeWorkspaceJSON(messagesFile, {
      importedAt: new Date().toISOString(),
      openId: config.openId,
      totalCount: messages.length,
      messages,
    })
    writeWorkspaceJSON(styleFile, buildWeChatStyleProfile(messages, config.openId))

    return NextResponse.json({
      success: true,
      count: messages.length,
      files: [messagesFile, styleFile],
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'WeChat import failed' }, { status: 500 })
  }
}
