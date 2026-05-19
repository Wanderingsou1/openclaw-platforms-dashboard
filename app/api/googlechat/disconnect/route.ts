import fs from 'fs'
import { NextResponse } from 'next/server'
import { getWorkspacePath } from '@/lib/workspace'
import { deleteGoogleChatJson } from '@/lib/googlechat-storage'

export async function POST() {
  try {
    await deleteGoogleChatJson('token.json')
    await deleteGoogleChatJson('state.json')
    const polled = getWorkspacePath('googlechat-import', 'polled-inbox.json')
    if (fs.existsSync(polled)) fs.unlinkSync(polled)
    return NextResponse.json({ disconnected: true })
  } catch (err: any) {
    return NextResponse.json({ disconnected: false, error: err.message }, { status: 500 })
  }
}
