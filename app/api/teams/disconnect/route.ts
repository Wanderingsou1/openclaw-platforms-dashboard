import { NextResponse } from 'next/server'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { deleteTeamsSubscription, loadTeamsConfig } from '@/lib/teams'

const WORKSPACE = process.env.WORKSPACE_PATH ?? path.join(os.homedir(), '.openclaw', 'workspace')
const TEAMS_DIR = path.join(WORKSPACE, 'teams-import')

export async function POST() {
  const config = loadTeamsConfig()
  let warning = ''

  try {
    if (config?.subscriptionId) {
      await deleteTeamsSubscription(config)
    }
  } catch (err: any) {
    warning = err.message ?? 'Remote Teams subscription deletion failed'
  }

  if (fs.existsSync(TEAMS_DIR)) {
    fs.rmSync(TEAMS_DIR, { recursive: true, force: true })
  }

  return NextResponse.json({
    success: true,
    disconnected: true,
    warning: warning || undefined,
  })
}
