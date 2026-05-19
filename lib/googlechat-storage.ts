import fs from 'fs'
import path from 'path'
import { del, get, put } from '@vercel/blob'
import { getWorkspacePath } from './workspace'

const BLOB_PREFIX = 'googlechat/'

function shouldUseBlobStorage() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_URL)
}

function localPath(relativePath: string) {
  return getWorkspacePath(relativePath)
}

async function readBlobJson<T>(pathname: string): Promise<T | null> {
  const result = await get(`${BLOB_PREFIX}${pathname}`, { access: 'private' })
  if (!result || result.statusCode !== 200 || !result.stream) return null
  try {
    const text = await new Response(result.stream).text()
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function writeBlobJson(pathname: string, data: unknown) {
  await put(`${BLOB_PREFIX}${pathname}`, JSON.stringify(data, null, 2), {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
  })
}

async function deleteBlobJson(pathname: string) {
  await del(`${BLOB_PREFIX}${pathname}`)
}

function readLocalJson<T>(relativePath: string): T | null {
  const file = localPath(relativePath)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
  } catch {
    return null
  }
}

function writeLocalJson(relativePath: string, data: unknown) {
  const file = localPath(relativePath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

function deleteLocalFile(relativePath: string) {
  const file = localPath(relativePath)
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

export async function readGoogleChatJson<T>(relativePath: string): Promise<T | null> {
  if (shouldUseBlobStorage()) {
    return readBlobJson<T>(relativePath)
  }
  return readLocalJson<T>(relativePath)
}

export async function writeGoogleChatJson(relativePath: string, data: unknown) {
  if (shouldUseBlobStorage()) {
    await writeBlobJson(relativePath, data)
    return
  }
  writeLocalJson(relativePath, data)
}

export async function deleteGoogleChatJson(relativePath: string) {
  if (shouldUseBlobStorage()) {
    await deleteBlobJson(relativePath)
    return
  }
  deleteLocalFile(relativePath)
}
