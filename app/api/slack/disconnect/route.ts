import { NextResponse } from 'next/server'
import fs from 'fs'
import os from 'os'
import path from 'path'

const WORKSPACE = process.env.WORKSPACE_PATH ?? path.join(os.homedir(), '.openclaw', 'workspace')
const SLACK_DIR = path.join(WORKSPACE, 'slack-import')

export async function POST() {
  if (fs.existsSync(SLACK_DIR)) {
    fs.rmSync(SLACK_DIR, { recursive: true, force: true })
  }
  return NextResponse.json({ disconnected: true })
}
