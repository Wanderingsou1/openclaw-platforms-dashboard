import { NextResponse } from 'next/server'
import { GOOGLE_CHAT_SCOPES, getGoogleChatOAuthClient } from '@/lib/googlechat'

export async function GET() {
  const oauth2 = getGoogleChatOAuthClient()
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account consent',
    scope: GOOGLE_CHAT_SCOPES,
  })
  return NextResponse.redirect(url)
}
