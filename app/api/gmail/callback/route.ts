import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TOKEN_FILE = path.join(
  process.env.WORKSPACE_PATH ?? path.join(os.homedir(), '.openclaw', 'workspace'),
  'gmail-token.json'
)

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect('http://localhost:3001/?gmail=denied')
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3001/api/gmail/callback'
  )

  const { tokens } = await oauth2.getToken(code)
  oauth2.setCredentials(tokens)

  // Get the connected email address
  const oauth2api = google.oauth2({ version: 'v2', auth: oauth2 })
  const { data } = await oauth2api.userinfo.get()
  const email = data.email ?? ''

  // Save tokens to workspace so they persist across restarts
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true })
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...tokens, email }, null, 2))

  return NextResponse.redirect(`http://localhost:3001/?gmail=connected&email=${encodeURIComponent(email)}`)
}
