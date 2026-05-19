import { NextRequest, NextResponse } from 'next/server'
import {
  isWeChatDemoActive,
  loadWeChatConfig,
  saveWeChatConfig,
  verifyWeChatCredentials,
} from '@/lib/wechat'

export async function POST(req: NextRequest) {
  try {
    if (isWeChatDemoActive()) {
      const c = loadWeChatConfig()!
      return NextResponse.json({
        success: true,
        connected: !!c.openId,
        prepared: !c.openId,
        localPreview: true,
        message: 'Using bundled preview configuration (simulation/wechat.json).',
      })
    }

    const { appId, appSecret, verifyToken, openId, nickname } = await req.json()
    if (!String(appId ?? '').trim() || !String(appSecret ?? '').trim() || !String(verifyToken ?? '').trim()) {
      return NextResponse.json(
        { success: false, error: 'appId, appSecret, and verifyToken are required' },
        { status: 400 }
      )
    }

    const id = String(appId).trim()
    const secret = String(appSecret).trim()
    const token = String(verifyToken).trim()
    await verifyWeChatCredentials(id, secret)

    const existing = loadWeChatConfig()
    const oidInput = String(openId ?? '').trim()
    const nextOpenId = oidInput || existing?.openId?.trim() || ''

    if (!nextOpenId) {
      saveWeChatConfig({
        appId: id,
        appSecret: secret,
        verifyToken: token,
        openId: '',
        connectedAt: new Date().toISOString(),
      })
      return NextResponse.json({
        success: true,
        prepared: true,
        message: 'Server credentials saved. Configure the official-account URL, then message the account and pick an Open ID.',
      })
    }

    saveWeChatConfig({
      appId: id,
      appSecret: secret,
      verifyToken: token,
      openId: nextOpenId,
      connectedAt: new Date().toISOString(),
      nickname: typeof nickname === 'string' ? nickname : undefined,
    })
    return NextResponse.json({ success: true, connected: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'WeChat connect failed' }, { status: 500 })
  }
}
