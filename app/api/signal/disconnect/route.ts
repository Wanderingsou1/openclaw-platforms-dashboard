import fs from 'fs'
import { NextResponse } from 'next/server'
import { stopSignalListener } from '@/lib/signal'
import { getWorkspacePath } from '@/lib/workspace'

export async function POST() {
  try {
    stopSignalListener()
    const dir = getWorkspacePath('signal-import')
    const config = `${dir}/bot-config.json`
    if (fs.existsSync(config)) fs.unlinkSync(config)
    return NextResponse.json({ disconnected: true })
  } catch (err: any) {
    return NextResponse.json({ disconnected: false, error: err.message }, { status: 500 })
  }
}
