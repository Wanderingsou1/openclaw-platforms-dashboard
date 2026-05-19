import { NextResponse } from 'next/server'
import fs from 'fs'
import os from 'os'
import path from 'path'

const WORKSPACE = process.env.WORKSPACE_PATH ?? path.join(os.homedir(), '.openclaw', 'workspace')
const TELEGRAM_DIR = path.join(WORKSPACE, 'telegram-import')

export async function POST() {
  if (fs.existsSync(TELEGRAM_DIR)) {
    fs.rmSync(TELEGRAM_DIR, { recursive: true, force: true })
  }
  return NextResponse.json({ disconnected: true })
}
