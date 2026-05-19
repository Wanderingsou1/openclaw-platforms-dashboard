import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    message:
      'Microsoft Teams in this build uses app-only Graph credentials from the dashboard, so this callback route is not used.',
  })
}
