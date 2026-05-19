'use client'

import { useEffect, useState } from 'react'

interface GoogleChatCardProps {
  onImported: () => void
}

export default function GoogleChatCard({ onImported }: GoogleChatCardProps) {
  const [email, setEmail] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [busy, setBusy] = useState<'connect' | 'import' | 'disconnect' | null>(null)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [importCount, setImportCount] = useState(0)

  useEffect(() => {
    fetch('/api/googlechat/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setIsConnected(true)
          setEmail(data.accountEmail ?? '')
          setImportCount(data.importedCount ?? 0)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isConnected) return
    let cancelled = false

    const syncNow = async () => {
      if (cancelled || busy) return
      try {
        const res = await fetch('/api/googlechat/import', { method: 'POST' })
        const data = await res.json()
        if (!res.ok || !data.success) return
        if (typeof data.count === 'number') setImportCount(data.count)
        if ((data.count ?? 0) > 0) onImported()
      } catch {
        // best-effort sync
      }
    }

    void syncNow()
    const timer = window.setInterval(() => {
      void syncNow()
    }, 30000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [busy, isConnected, onImported])

  async function handleConnect() {
    window.location.href = '/api/googlechat/connect'
  }

  async function handleImport() {
    setBusy('import')
    setError('')
    try {
      const res = await fetch('/api/googlechat/import', { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Import failed')
      setImportCount(data.count ?? 0)
      if (data.hint) setHint(data.hint)
      if ((data.count ?? 0) > 0) onImported()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleDisconnect() {
    setBusy('disconnect')
    setError('')
    try {
      const res = await fetch('/api/googlechat/disconnect', { method: 'POST' })
      const data = await res.json()
      if (!data.disconnected) throw new Error(data.error ?? 'Disconnect failed')
      setIsConnected(false)
      setEmail('')
      setImportCount(0)
      setHint('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={`bg-zinc-900 border rounded-xl p-6 w-72 flex flex-col gap-4 transition-colors ${
      isConnected
        ? 'border-l-4 border-amber-500/60 border-zinc-800'
        : 'border-zinc-800 hover:border-zinc-700'
    }`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center text-xl select-none">
          G
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Google Chat</p>
          <p className="text-zinc-500 text-xs">Google Workspace Chat API</p>
        </div>
      </div>

      {!isConnected && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Connect your Google Workspace account to import Chat spaces and DM messages, then OpenClaw
            will draft replies automatically from the imported thread history.
          </p>
        </div>
      )}

      {isConnected && (
        <div className="text-xs text-zinc-400 bg-zinc-800 rounded-md px-3 py-2 space-y-1">
          <p>
            Connected: <span className="text-amber-300">{email}</span>
          </p>
          {importCount > 0 && (
            <p>
              <span className="text-white">{importCount}</span> messages in latest import
            </p>
          )}
          <p className="text-zinc-500">
            Saved in <span className="text-amber-400">googlechat-import/</span>
          </p>
        </div>
      )}

      {hint && <p className="text-amber-200/90 text-[11px] bg-amber-900/20 border border-amber-800/40 rounded-md px-3 py-2 leading-relaxed">{hint}</p>}
      {error && <p className="text-red-400 text-xs bg-red-900/20 rounded-md px-3 py-2">{error}</p>}

      <div className="flex flex-col gap-2 mt-auto">
        {!isConnected && (
          <button
            type="button"
            onClick={handleConnect}
            className="w-full text-sm bg-amber-600 hover:bg-amber-700 text-black rounded-md px-4 py-2 transition-colors"
          >
            Connect Google Chat
          </button>
        )}
        {isConnected && (
          <>
            <button
              type="button"
              onClick={handleImport}
              disabled={busy === 'import' || busy === 'disconnect'}
              className="w-full text-sm bg-amber-600 hover:bg-amber-700 text-black rounded-md px-4 py-2 transition-colors disabled:opacity-40"
            >
              {busy === 'import' ? 'Importing…' : 'Import messages'}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={busy === 'disconnect' || busy === 'import'}
              className="w-full text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md px-4 py-2 transition-colors disabled:opacity-40"
            >
              {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
