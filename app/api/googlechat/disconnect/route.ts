import fs from 'fs'
import { NextResponse } from 'next/server'
import { clearGoogleChatConfig, clearGoogleChatState } from '@/lib/googlechat'
import { getWorkspacePath } from '@/lib/workspace'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  try {
    const response = NextResponse.json({ disconnected: true })
    clearGoogleChatConfig(response)
    clearGoogleChatState(response)
    const dir = getWorkspacePath('googlechat-import')
    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir)) {
        if (entry.endsWith('.json')) {
          fs.unlinkSync(getWorkspacePath('googlechat-import', entry))
        }
      }
    }
    return response
  } catch (err: any) {
    return NextResponse.json({ disconnected: false, error: err.message }, { status: 500 })
  }
}
