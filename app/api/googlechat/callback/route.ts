import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getGoogleChatRedirectUriFromRequest, saveGoogleChatConfig } from '@/lib/googlechat'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  const homeUrl = new URL('/', req.url).toString()

  if (error || !code) {
    return NextResponse.redirect(`${homeUrl}?googlechat=denied`)
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getGoogleChatRedirectUriFromRequest(req.url)
  )

  try {
    const { tokens } = await oauth2.getToken(code)
    oauth2.setCredentials(tokens)

    let email = ''
    try {
      const oauth2api = google.oauth2({ version: 'v2', auth: oauth2 })
      const { data } = await oauth2api.userinfo.get()
      email = data.email ?? ''
    } catch (lookupErr) {
      console.warn('Google Chat callback: unable to read user email', lookupErr)
    }

    await saveGoogleChatConfig({
      access_token: tokens.access_token ?? undefined,
      refresh_token: tokens.refresh_token ?? undefined,
      scope: tokens.scope ?? undefined,
      token_type: tokens.token_type ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
      email,
      connectedAt: new Date().toISOString(),
    })

    return NextResponse.redirect(`${homeUrl}?googlechat=connected&email=${encodeURIComponent(email)}`)
  } catch (err) {
    console.error('Google Chat callback failed', err)
    return NextResponse.redirect(`${homeUrl}?googlechat=error`)
  }
}
