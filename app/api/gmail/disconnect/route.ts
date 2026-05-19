import { NextResponse } from 'next/server'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TOKEN_FILE = path.join(
  process.env.WORKSPACE_PATH ?? path.join(os.homedir(), '.openclaw', 'workspace'),
  'gmail-token.json'
)

export async function POST() {
  if (fs.existsSync(TOKEN_FILE)) {
    fs.unlinkSync(TOKEN_FILE)
  }
  return NextResponse.json({ disconnected: true })
}
