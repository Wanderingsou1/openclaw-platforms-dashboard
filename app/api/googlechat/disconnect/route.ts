import fs from 'fs'
import { NextResponse } from 'next/server'
import { getWorkspacePath } from '@/lib/workspace'

export async function POST() {
  try {
    const config = getWorkspacePath('googlechat-token.json')
    if (fs.existsSync(config)) fs.unlinkSync(config)
    const state = getWorkspacePath('googlechat-state.json')
    if (fs.existsSync(state)) fs.unlinkSync(state)
    const polled = getWorkspacePath('googlechat-import', 'polled-inbox.json')
    if (fs.existsSync(polled)) fs.unlinkSync(polled)
    return NextResponse.json({ disconnected: true })
  } catch (err: any) {
    return NextResponse.json({ disconnected: false, error: err.message }, { status: 500 })
  }
}
