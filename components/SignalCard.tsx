'use client'

import { useEffect, useState } from 'react'

interface SignalCardProps {
  onImported: () => void
}

interface DetectedPeer {
  recipientNumber: string
  title: string
  lastMessageAt: string
}

export default function SignalCard({ onImported }: SignalCardProps) {
  const [apiUrl, setApiUrl] = useState('http://localhost:8080')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [recipientNumber, setRecipientNumber] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [isLinked, setIsLinked] = useState(false)
  const [busy, setBusy] = useState<'detect' | 'connect' | 'import' | 'disconnect' | null>(null)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [importCount, setImportCount] = useState(0)
  const [peers, setPeers] = useState<DetectedPeer[]>([])

  useEffect(() => {
    fetch('/api/signal/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setIsLinked(true)
          setPhoneNumber(data.phoneNumber ?? '')
          setRecipientNumber(data.recipientNumber ?? '')
          setRecipientName(data.recipientName ?? '')
          setImportCount(data.importedCount ?? 0)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isLinked) return
    let cancelled = false

    const syncNow = async () => {
      if (cancelled || busy) return
      try {
        const res = await fetch('/api/signal/import', { method: 'POST' })
        const data = await res.json()
        if (!res.ok || !data.success) return
        if (typeof data.count === 'number') setImportCount(data.count)
        if (data.hint) setHint(data.hint)
        if ((data.count ?? 0) > 0) onImported()
      } catch {
        // Best-effort background sync.
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
  }, [busy, isLinked, onImported])

  async function handleDetect() {
    setBusy('detect')
    setError('')
    setHint('')
    setPeers([])
    try {
      const res = await fetch('/api/signal/detect-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiUrl: apiUrl.trim(), phoneNumber: phoneNumber.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Detect failed')
      setPeers(data.peers ?? [])
      if (data.hint) setHint(data.hint)
      const list = (data.peers ?? []) as DetectedPeer[]
      if (list.length === 1) setRecipientNumber(list[0].recipientNumber)
      if (list.length === 0) setRecipientNumber('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleConnect() {
    setBusy('connect')
    setError('')
    try {
      const res = await fetch('/api/signal/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiUrl: apiUrl.trim(),
            phoneNumber: phoneNumber.trim(),
            recipientNumber: recipientNumber.trim(),
            recipientName: recipientName.trim(),
          }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Connect failed')
      setIsLinked(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleImport() {
    setBusy('import')
    setError('')
    try {
      const res = await fetch('/api/signal/import', { method: 'POST' })
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
      const res = await fetch('/api/signal/disconnect', { method: 'POST' })
      const data = await res.json()
      if (!data.disconnected) throw new Error(data.error ?? 'Disconnect failed')
      setIsLinked(false)
      setPhoneNumber('')
      setRecipientNumber('')
      setRecipientName('')
      setImportCount(0)
      setPeers([])
      setHint('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const canDetect = !!apiUrl.trim() && !!phoneNumber.trim() && busy !== 'detect'
  const canConnect = !!apiUrl.trim() && !!phoneNumber.trim() && busy !== 'connect'

  return (
    <div
      className={`bg-zinc-900 border rounded-xl p-6 w-72 flex flex-col gap-4 transition-colors ${
        isLinked
          ? 'border-l-4 border-sky-500/60 border-zinc-800'
          : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-sky-600/20 flex items-center justify-center text-xs font-bold text-sky-300">
          Sg
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Signal</p>
          <p className="text-zinc-500 text-xs">signal-cli-rest-api</p>
        </div>
      </div>

      {!isLinked && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Requires a local <span className="text-sky-400">signal-cli-rest-api</span> instance. Run it
            via Docker, register your number, then connect here.
          </p>
          <input
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="API URL (http://localhost:8080)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <input
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="Your phone number (+1…)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleDetect}
            disabled={!canDetect}
            className="w-full text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'detect' ? 'Polling…' : 'Poll for recent contacts'}
          </button>

          {peers.length > 1 && (
            <div className="space-y-1 max-h-32 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-800/50 p-2">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide px-1">Pick a contact</p>
              {peers.map((p) => (
                <button
                  key={p.recipientNumber}
                  type="button"
                  onClick={() => setRecipientNumber(p.recipientNumber)}
                  className={`w-full text-left text-xs rounded px-2 py-1.5 transition-colors ${
                    recipientNumber === p.recipientNumber
                      ? 'bg-sky-900/40 text-sky-200'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="text-zinc-500 ml-1">· {p.recipientNumber}</span>
                </button>
              ))}
            </div>
          )}

          <input
            value={recipientNumber}
            onChange={(e) => setRecipientNumber(e.target.value)}
            placeholder="Recipient number (+1…, optional)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
          />
          <p className="text-[10px] text-zinc-500 leading-relaxed px-1">
            Optional. Leave this blank if you want to import all new messages on the linked Signal number.
          </p>
          <input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Recipient name (optional)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
          />
        </div>
      )}

      {hint && !isLinked && (
        <p className="text-amber-200/90 text-[11px] bg-amber-900/20 border border-amber-800/40 rounded-md px-3 py-2 leading-relaxed">
          {hint}
        </p>
      )}

      {isLinked && (
        <div className="text-xs text-zinc-400 bg-zinc-800 rounded-md px-3 py-2 space-y-1">
          <p>
            From: <span className="text-sky-300">{phoneNumber}</span>
          </p>
          <p>
            To: <span className="text-sky-300">{recipientName || recipientNumber}</span>
          </p>
          {importCount > 0 && (
            <p>
              <span className="text-white">{importCount}</span> messages in latest import
            </p>
          )}
          <p className="text-zinc-500">
            Saved in <span className="text-sky-400">signal-import/</span>
          </p>
        </div>
      )}

      {error && <p className="text-red-400 text-xs bg-red-900/20 rounded-md px-3 py-2">{error}</p>}

      <div className="flex flex-col gap-2 mt-auto">
        {!isLinked && (
          <button
            type="button"
            onClick={handleConnect}
            disabled={!canConnect}
            className="w-full text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'connect' ? 'Connecting…' : 'Connect account'}
          </button>
        )}
        {isLinked && (
          <>
            <button
              type="button"
              onClick={handleImport}
              disabled={busy === 'import' || busy === 'disconnect'}
              className="w-full text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
            >
              {busy === 'import'
                ? 'Importing…'
                : importCount > 0
                  ? 'Re-import messages'
                  : 'Import messages'}
            </button>
            <p className="text-[10px] text-zinc-500 leading-relaxed px-1">
              Auto-sync runs while this dashboard is open, so new inbound Signal messages save
              themselves every 30 seconds.
            </p>
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
