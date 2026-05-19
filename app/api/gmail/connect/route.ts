import { NextResponse } from 'next/server'
import { google } from 'googleapis'

// GET — redirect user to Google OAuth consent screen
export async function GET() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3001/api/gmail/callback'
  )

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account consent', // forces account picker every time
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  })

  return NextResponse.redirect(url)
}
