import { NextResponse } from 'next/server'
import { readWorkspaceDir, readWorkspaceFile, getWorkspacePath } from '@/lib/workspace'
import fs from 'fs'
import path from 'path'

export interface DraftMessage {
  filename: string
  to: string
  subject: string
  body: string
  createdAt: string
  source: 'email_drafts' | 'email-import'
}

function parseDraftFile(filename: string, content: string, createdAt: string): DraftMessage {
  const lines = content.split('\n')
  let to = ''
  let subject = ''
  let bodyStart = 0

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().startsWith('to:')) {
      to = lines[i].slice(3).trim()
    } else if (lines[i].toLowerCase().startsWith('subject:')) {
      subject = lines[i].slice(8).trim()
    } else if (lines[i].trim() === '' && to) {
      bodyStart = i + 1
      break
    }
  }

  const body = lines.slice(bodyStart).join('\n').trim()

  return { filename, to, subject, body, createdAt, source: 'email_drafts' }
}

export async function GET() {
  const drafts: DraftMessage[] = []

  // Read from email_drafts folder
  const draftFiles = readWorkspaceDir('email_drafts')
  for (const file of draftFiles) {
    if (!file.endsWith('.txt') && !file.endsWith('.md')) continue
    try {
      const content = readWorkspaceFile(`email_drafts/${file}`)
      const fullPath = getWorkspacePath(`email_drafts/${file}`)
      const stat = fs.statSync(fullPath)
      drafts.push(parseDraftFile(file, content, stat.mtime.toISOString()))
    } catch {
      // skip unreadable files
    }
  }

  // Also check email-import folder for style-aware draft hints
  const importDir = getWorkspacePath('email-import')
  if (fs.existsSync(importDir)) {
    const styleFile = path.join(importDir, 'style-profile.json')
    if (fs.existsSync(styleFile)) {
      try {
        const profile = JSON.parse(fs.readFileSync(styleFile, 'utf-8'))
        if (profile.sampleSnippets?.length) {
          drafts.push({
            filename: 'style-profile-preview',
            to: profile.account,
            subject: 'Style Profile Preview',
            body: `Your detected writing style:\n\nLanguages: ${profile.detectedLanguages?.join(', ')}\nTone: ${profile.styleSignals?.sentenceStructure}\nAvg length: ${profile.styleSignals?.averageWordCount} words\nGreetings: ${profile.styleSignals?.commonGreetings?.join(', ')}\nClosings: ${profile.styleSignals?.commonClosings?.join(', ')}\n\nSample:\n${profile.sampleSnippets?.[0] ?? ''}`,
            createdAt: profile.generatedAt,
            source: 'email-import',
          })
        }
      } catch {
        // skip
      }
    }
  }

  return NextResponse.json({ drafts, total: drafts.length })
}
