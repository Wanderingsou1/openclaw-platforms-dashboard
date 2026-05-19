import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { GOOGLE_CHAT_REDIRECT_URI } from '@/lib/googlechat'

const TOKEN_FILE = path.join(
  process.env.WORKSPACE_PATH ?? path.join(os.homedir(), '.openclaw', 'workspace'),
  'googlechat-token.json'
)

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect('http://localhost:3000/?googlechat=denied')
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_CHAT_REDIRECT_URI
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

    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true })
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...tokens, email, connectedAt: new Date().toISOString() }, null, 2))

    return NextResponse.redirect(`http://localhost:3000/?googlechat=connected&email=${encodeURIComponent(email)}`)
  } catch (err) {
    console.error('Google Chat callback failed', err)
    return NextResponse.redirect('http://localhost:3000/?googlechat=error')
  }
}
