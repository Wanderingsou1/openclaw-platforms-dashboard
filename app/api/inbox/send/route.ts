import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient } from '@/lib/gmail'
import { loadTelegramConfig, sendTelegramMessage } from '@/lib/telegram'
import { loadSlackConfig, sendSlackMessage } from '@/lib/slack'
import { loadTeamsConfig, sendTeamsMessage } from '@/lib/teams'
import { loadSignalConfig, sendSignalMessage } from '@/lib/signal'
import { loadViberConfig, sendViberMessage } from '@/lib/viber'
import { loadWeChatConfig, sendWeChatTextMessage } from '@/lib/wechat'
import { loadGoogleChatConfig, sendGoogleChatMessage } from '@/lib/googlechat'
import fs from 'fs'
import os from 'os'
import path from 'path'

const WORKSPACE = process.env.WORKSPACE_PATH ?? path.join(os.homedir(), '.openclaw', 'workspace')
const SENT_DB = path.join(WORKSPACE, 'inbox-sent.json')

function readSentDb(): Record<string, { sentAt: string; platform: string; to: string; body: string }> {
  try {
    if (!fs.existsSync(SENT_DB)) return {}
    return JSON.parse(fs.readFileSync(SENT_DB, 'utf-8')) ?? {}
  } catch {
    return {}
  }
}

function writeSentDb(next: Record<string, { sentAt: string; platform: string; to: string; body: string }>) {
  fs.mkdirSync(path.dirname(SENT_DB), { recursive: true })
  fs.writeFileSync(SENT_DB, JSON.stringify(next, null, 2), 'utf-8')
}

function markSent(messageId: string, platform: string, to: string, body: string) {
  const db = readSentDb()
  db[messageId] = { sentAt: new Date().toISOString(), platform, to, body }
  writeSentDb(db)
}

function makeRawEmail(to: string, subject: string, body: string, fromEmail: string): string {
  const raw = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    '',
    body,
  ].join('\r\n')

  return Buffer.from(raw).toString('base64url')
}

export async function POST(req: NextRequest) {
  const { messageId, to, subject, body, platform, threadName } = await req.json()

  if (platform === 'email') {
    try {
      const gmail = getGmailClient()

      // Get connected account email
      const profile = await gmail.users.getProfile({ userId: 'me' })
      const fromEmail = profile.data.emailAddress ?? ''

      // Create draft first, then send it
      const draft = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            threadId: messageId, // reply in same thread
            raw: makeRawEmail(to, `Re: ${subject}`, body, fromEmail),
          },
        },
      })

      await gmail.users.drafts.send({
        userId: 'me',
        requestBody: { id: draft.data.id! },
      })

      // Mark original as read
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { removeLabelIds: ['UNREAD'] },
      }).catch(() => {}) // non-critical

      return NextResponse.json({ sent: true })
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  if (platform === 'telegram') {
    try {
      const config = loadTelegramConfig()
      if (!config) {
        return NextResponse.json({ sent: false, error: 'Telegram bot is not connected' }, { status: 400 })
      }
      const chatId = to || config.chatId
      await sendTelegramMessage(config.botToken, chatId, body)
      return NextResponse.json({ sent: true })
    } catch (err: any) {
      return NextResponse.json({ sent: false, error: err.message ?? 'Telegram send failed' }, { status: 500 })
    }
  }

  if (platform === 'slack') {
    try {
      const config = loadSlackConfig()
      if (!config) {
        return NextResponse.json({ sent: false, error: 'Slack bot is not connected' }, { status: 400 })
      }
      const channelId = to || config.channelId
      await sendSlackMessage(config.botToken, channelId, body)
      return NextResponse.json({ sent: true })
    } catch (err: any) {
      return NextResponse.json({ sent: false, error: err.message ?? 'Slack send failed' }, { status: 500 })
    }
  }

  if (platform === 'teams') {
    try {
      const config = loadTeamsConfig()
      if (!config) {
        return NextResponse.json({ sent: false, error: 'Teams is not connected' }, { status: 400 })
      }
      const chatId = to || config.defaultChatId
      if (!chatId) {
        return NextResponse.json({ sent: false, error: 'Teams chat ID is missing' }, { status: 400 })
      }
      await sendTeamsMessage(config, chatId, body)
      markSent(messageId, platform, chatId, body)
      return NextResponse.json({ sent: true })
    } catch (err: any) {
      return NextResponse.json({ sent: false, error: err.message ?? 'Teams send failed' }, { status: 500 })
    }
  }

  if (platform === 'viber') {
    try {
      const config = loadViberConfig()
      if (!config) {
        return NextResponse.json({ sent: false, error: 'Viber is not connected' }, { status: 400 })
      }
      const peer = to || config.peerUserId
      await sendViberMessage(config.authToken, peer, body)
      return NextResponse.json({ sent: true })
    } catch (err: any) {
      return NextResponse.json({ sent: false, error: err.message ?? 'Viber send failed' }, { status: 500 })
    }
  }

  if (platform === 'wechat') {
    try {
      const config = loadWeChatConfig()
      if (!config?.openId) {
        return NextResponse.json({ sent: false, error: 'WeChat is not connected' }, { status: 400 })
      }
      const openId = to || config.openId
      await sendWeChatTextMessage(config.appId, config.appSecret, openId, body)
      return NextResponse.json({ sent: true })
    } catch (err: any) {
      return NextResponse.json({ sent: false, error: err.message ?? 'WeChat send failed' }, { status: 500 })
    }
  }

  if (platform === 'signal') {
    try {
      const config = loadSignalConfig()
      if (!config?.phoneNumber || !config?.apiUrl) {
        return NextResponse.json({ sent: false, error: 'Signal is not connected' }, { status: 400 })
      }
      const recipient = to || config.recipientNumber || ''
      if (!recipient) {
        return NextResponse.json({ sent: false, error: 'Signal recipient number is missing' }, { status: 400 })
      }
      await sendSignalMessage(config.apiUrl, config.phoneNumber, recipient, body)
      markSent(messageId, platform, recipient, body)
      return NextResponse.json({ sent: true })
    } catch (err: any) {
      return NextResponse.json({ sent: false, error: err.message ?? 'Signal send failed' }, { status: 500 })
    }
  }

  if (platform === 'googlechat') {
    try {
      const config = loadGoogleChatConfig()
      if (!config?.email) {
        return NextResponse.json({ sent: false, error: 'Google Chat is not connected' }, { status: 400 })
      }
      const spaceId = to || config.defaultSpaceId || ''
      if (!spaceId) {
        return NextResponse.json({ sent: false, error: 'Google Chat space is missing' }, { status: 400 })
      }
      await sendGoogleChatMessage(spaceId, body, threadName)
      markSent(messageId, platform, spaceId, body)
      return NextResponse.json({ sent: true })
    } catch (err: any) {
      return NextResponse.json({ sent: false, error: err.message ?? 'Google Chat send failed' }, { status: 500 })
    }
  }

  // WhatsApp — placeholder (wacli not available via HTTP)
  return NextResponse.json({
    sent: false,
    error: 'WhatsApp send requires wacli CLI. Run: wacli send text --to "[jid]" --message "[reply]"',
  }, { status: 400 })
}
