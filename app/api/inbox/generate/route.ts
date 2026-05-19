import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import fs from 'fs'
import os from 'os'
import path from 'path'

const WORKSPACE = process.env.WORKSPACE_PATH ?? path.join(os.homedir(), '.openclaw', 'workspace')

function loadStyleProfile() {
  const emailStyle = path.join(WORKSPACE, 'email-import', 'style-profile.json')
  const telegramStyle = path.join(WORKSPACE, 'telegram-import', 'style-profile.json')
  const slackStyle = path.join(WORKSPACE, 'slack-import', 'style-profile.json')
  const teamsStyle = path.join(WORKSPACE, 'teams-import', 'style-profile.json')
  const viberStyle = path.join(WORKSPACE, 'viber-import', 'style-profile.json')
  const wechatStyle = path.join(WORKSPACE, 'wechat-import', 'style-profile.json')
  const signalStyle = path.join(WORKSPACE, 'signal-import', 'style-profile.json')
  const googleChatStyle = path.join(WORKSPACE, 'googlechat-import', 'style-profile.json')
  if (fs.existsSync(wechatStyle)) return JSON.parse(fs.readFileSync(wechatStyle, 'utf-8'))
  if (fs.existsSync(viberStyle)) return JSON.parse(fs.readFileSync(viberStyle, 'utf-8'))
  if (fs.existsSync(slackStyle)) return JSON.parse(fs.readFileSync(slackStyle, 'utf-8'))
  if (fs.existsSync(teamsStyle)) return JSON.parse(fs.readFileSync(teamsStyle, 'utf-8'))
  if (fs.existsSync(telegramStyle)) return JSON.parse(fs.readFileSync(telegramStyle, 'utf-8'))
  if (fs.existsSync(signalStyle)) return JSON.parse(fs.readFileSync(signalStyle, 'utf-8'))
  if (fs.existsSync(googleChatStyle)) return JSON.parse(fs.readFileSync(googleChatStyle, 'utf-8'))
  if (fs.existsSync(emailStyle)) return JSON.parse(fs.readFileSync(emailStyle, 'utf-8'))
  return null
}

function loadStyleForPlatform(platform: string) {
  if (platform === 'telegram') {
    const file = path.join(WORKSPACE, 'telegram-import', 'style-profile.json')
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
    return loadStyleProfile()
  }
  if (platform === 'email') {
    const file = path.join(WORKSPACE, 'email-import', 'style-profile.json')
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
    return loadStyleProfile()
  }
  if (platform === 'slack') {
    const file = path.join(WORKSPACE, 'slack-import', 'style-profile.json')
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
    return loadStyleProfile()
  }
  if (platform === 'teams') {
    const file = path.join(WORKSPACE, 'teams-import', 'style-profile.json')
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
    return loadStyleProfile()
  }
  if (platform === 'viber') {
    const file = path.join(WORKSPACE, 'viber-import', 'style-profile.json')
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
    return loadStyleProfile()
  }
  if (platform === 'wechat') {
    const file = path.join(WORKSPACE, 'wechat-import', 'style-profile.json')
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
    return loadStyleProfile()
  }
  if (platform === 'signal') {
    const file = path.join(WORKSPACE, 'signal-import', 'style-profile.json')
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
    return loadStyleProfile()
  }
  if (platform === 'googlechat') {
    const file = path.join(WORKSPACE, 'googlechat-import', 'style-profile.json')
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
    return loadStyleProfile()
  }
  const file = path.join(WORKSPACE, 'whatsapp-import', 'style-profile.json')
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
  return loadStyleProfile()
}

export async function POST(req: NextRequest) {
  const { message } = await req.json()
  // message: { id, platform, sender, senderEmail, subject, body, receivedAt }

  const style = loadStyleForPlatform(message.platform)
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || !apiKey.trim()) {
    return NextResponse.json(
      {
        error:
          'Missing OPENAI_API_KEY for draft generation. Set it in app/.env.local (or your environment) and restart `npm run dev`.',
      },
      { status: 500 }
    )
  }

  const openai = new OpenAI({ apiKey })

  const styleContext = style
    ? `
Writing style to match:
- Languages used: ${style.detectedLanguages?.join(', ')}
- Tone: ${style.styleSignals?.sentenceStructure}
- Average length: ${style.styleSignals?.averageWordCount} words
- Common greetings: ${style.styleSignals?.commonGreetings?.join(', ')}
- Common closings: ${style.styleSignals?.commonClosings?.join(', ')}
- Uses exclamation marks: ${style.styleSignals?.usesExclamationMark}
- Tone keywords: ${style.styleSignals?.toneKeywords?.join(', ')}
Sample writing:
${style.sampleSnippets?.slice(0, 2).join('\n---\n')}
`.trim()
    : 'Write in a professional, friendly tone.'

  const platform =
    message.platform === 'email'
      ? 'email'
      : message.platform === 'telegram'
        ? 'Telegram'
      : message.platform === 'slack'
          ? 'Slack'
          : message.platform === 'teams'
            ? 'Microsoft Teams'
          : message.platform === 'viber'
            ? 'Viber'
            : message.platform === 'wechat'
              ? 'WeChat'
              : message.platform === 'signal'
                ? 'Signal'
                : message.platform === 'googlechat'
                  ? 'Google Chat'
              : 'WhatsApp'

  const systemPrompt = `You are a personal AI assistant that drafts replies on behalf of the user.
Draft a reply to the incoming ${platform} message below.
Match the user's exact writing style described here:

${styleContext}

Rules:
- Sound natural, like a real person — not an AI
- Do NOT add "As an AI..." or any robotic phrases
- Match the language of the incoming message (Hindi/Hinglish/English)
- For email: include greeting and sign-off matching the user's style
- Keep it concise and relevant — no filler
- Return ONLY the draft reply text, nothing else`

  const userPrompt = `Incoming ${platform} from: ${message.sender} <${message.senderEmail || message.sender}>
${message.platform === 'email' ? `Subject: ${message.subject}\n` : ''}
Message:
${message.body}`

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENCLAW_DRAFT_MODEL?.trim() || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    const draft = completion.choices[0].message.content?.trim() ?? ''
    return NextResponse.json({ draft })
  } catch (err: any) {
    const message = String(err?.message ?? 'Draft generation failed')
    // OpenAI frequently returns 429 for billing/quota or per-project limits.
    if (message.includes('429') || message.toLowerCase().includes('quota')) {
      return NextResponse.json(
        {
          error:
            'OpenAI rejected the draft request with a 429 (quota/billing/rate limit). This dashboard uses OPENAI_API_KEY from app/.env.local, which may be a different project/key than your OpenClaw gateway. Update OPENAI_API_KEY to a key with active billing/quota, restart the app, and retry.',
        },
        { status: 429 }
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
