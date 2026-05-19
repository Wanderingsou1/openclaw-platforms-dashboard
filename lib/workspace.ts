import fs from 'fs'
import os from 'os'
import path from 'path'
import { ParsedEmail } from './gmail'

export function getWorkspaceRoot() {
  if (process.env.WORKSPACE_PATH) return process.env.WORKSPACE_PATH
  if (process.env.VERCEL || process.env.VERCEL_URL) return '/tmp/openclaw/workspace'
  return path.join(os.homedir(), '.openclaw', 'workspace')
}

const WORKSPACE = getWorkspaceRoot()

export function getWorkspacePath(...segments: string[]) {
  return path.join(WORKSPACE, ...segments)
}

export function writeWorkspaceJSON(relativePath: string, data: unknown) {
  const fullPath = getWorkspacePath(relativePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8')
}

export function readWorkspaceDir(relativePath: string): string[] {
  const fullPath = getWorkspacePath(relativePath)
  if (!fs.existsSync(fullPath)) return []
  return fs.readdirSync(fullPath)
}

export function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(getWorkspacePath(relativePath), 'utf-8')
}

const HINDI_KEYWORDS = ['yaar', 'bhai', 'kya', 'haan', 'nahi', 'kar', 'tha', 'hai', 'accha', 'theek', 'bilkul', 'zarur', 'kyun', 'mat', 'abhi', 'wahi', 'uska', 'mera', 'tera']
const DEVANAGARI_RE = /[\u0900-\u097F]/

function detectLanguage(texts: string[]): string[] {
  const langs = new Set<string>()
  const combined = texts.join(' ').toLowerCase()
  if (DEVANAGARI_RE.test(combined)) langs.add('Hindi')
  if (HINDI_KEYWORDS.some((w) => combined.split(/\W+/).includes(w))) langs.add('Hinglish')
  langs.add('English') // always present as baseline
  return Array.from(langs)
}

function extractGreetings(texts: string[]): string[] {
  const greetings = new Set<string>()
  const patterns = [/^(hi|hey|hello|dear|good\s+\w+)/i]
  for (const t of texts) {
    const first = t.trim().split('\n')[0]
    for (const p of patterns) {
      const m = first.match(p)
      if (m) greetings.add(m[0].trim())
    }
  }
  return Array.from(greetings).slice(0, 5)
}

function extractClosings(texts: string[]): string[] {
  const closings = new Set<string>()
  const patterns = [/\b(thanks|thank you|regards|best|cheers|sincerely|warm regards|yours truly|take care)\b/i]
  for (const t of texts) {
    for (const p of patterns) {
      const m = t.match(p)
      if (m) closings.add(m[0].toLowerCase())
    }
  }
  return Array.from(closings).slice(0, 5)
}

export function buildStyleProfile(emails: ParsedEmail[], account: string) {
  const sentEmails = emails.filter((e) => e.folder === 'sent')
  const bodies = sentEmails.map((e) => e.bodyText).filter(Boolean)
  const wordCounts = bodies.map((b) => b.split(/\s+/).length)
  const avgWords = wordCounts.length
    ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length)
    : 0

  return {
    generatedAt: new Date().toISOString(),
    basedOnSentEmails: sentEmails.length,
    account,
    detectedLanguages: detectLanguage(bodies),
    styleSignals: {
      averageWordCount: avgWords,
      usesGreeting: bodies.some((b) => /^(hi|hey|hello|dear)/i.test(b.trim())),
      commonGreetings: extractGreetings(bodies),
      commonClosings: extractClosings(bodies),
      usesExclamationMark: bodies.some((b) => b.includes('!')),
      toneKeywords: ['quick', 'just', 'hope', 'wanted', 'following up'].filter((w) =>
        bodies.some((b) => b.toLowerCase().includes(w))
      ),
      sentenceStructure: avgWords < 30 ? 'short-friendly' : avgWords < 80 ? 'medium' : 'detailed',
    },
    sampleSubjects: sentEmails.slice(0, 5).map((e) => e.subject).filter(Boolean),
    sampleSnippets: sentEmails.slice(0, 3).map((e) => e.snippet).filter(Boolean),
  }
}
