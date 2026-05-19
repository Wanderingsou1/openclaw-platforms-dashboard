import { NextResponse } from 'next/server'
import { fetchEmails } from '@/lib/gmail'
import { writeWorkspaceJSON, buildStyleProfile } from '@/lib/workspace'

export async function POST() {
  try {
    const emails = await fetchEmails()
    const account = process.env.GOG_ACCOUNT ?? 'unknown'
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    const emailsFile = `email-import/emails-${timestamp}.json`
    const styleFile = `email-import/style-profile.json`

    writeWorkspaceJSON(emailsFile, {
      importedAt: new Date().toISOString(),
      account,
      totalCount: emails.length,
      emails,
    })

    const styleProfile = buildStyleProfile(emails, account)
    writeWorkspaceJSON(styleFile, styleProfile)

    return NextResponse.json({
      success: true,
      count: emails.length,
      files: [emailsFile, styleFile],
      styleProfile,
    })
  } catch (err: any) {
    console.error('Gmail import error:', err.message)
    return NextResponse.json(
      { success: false, error: err.message ?? 'Import failed' },
      { status: 500 }
    )
  }
}
