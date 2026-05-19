import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { GOOGLE_CHAT_SCOPES, getGoogleChatRedirectUriFromRequest } from '@/lib/googlechat'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getGoogleChatRedirectUriFromRequest(req.url)
  )
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account consent',
    scope: GOOGLE_CHAT_SCOPES,
  })
  return NextResponse.redirect(url)
}
