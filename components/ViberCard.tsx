'use client'

import { useEffect, useState } from 'react'

interface ViberCardProps {
  onImported: () => void
}

interface DetectedPeer {
  peerUserId: string
  title: string
  lastMessageAt: string
}

export default function ViberCard({ onImported }: ViberCardProps) {
  const [authToken, setAuthToken] = useState('')
  const [peerUserId, setPeerUserId] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [isLinked, setIsLinked] = useState(false)
  const [busy, setBusy] = useState<'detect' | 'webhook' | 'connect' | 'import' | 'disconnect' | null>(null)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [peerName, setPeerName] = useState('')
  const [botName, setBotName] = useState('')
  const [importCount, setImportCount] = useState(0)
  const [peers, setPeers] = useState<DetectedPeer[]>([])

  useEffect(() => {
    fetch('/api/viber/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setIsLinked(true)
          setPeerUserId(data.peerUserId ?? '')
          setPeerName(data.peerName ?? '')
          setBotName(data.botName ?? '')
          setImportCount(data.importedCount ?? 0)
        }
      })
      .catch(() => {})
  }, [])

  async function handleDetect() {
    setBusy('detect')
    setError('')
    setHint('')
    setPeers([])
    try {
      const res = await fetch('/api/viber/detect-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken: authToken.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Detect failed')
      setPeers(data.peers ?? [])
      if (data.hint) setHint(data.hint)
      const list = (data.peers ?? []) as DetectedPeer[]
      if (list.length === 1) setPeerUserId(list[0].peerUserId)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleSetWebhook() {
    setBusy('webhook')
    setError('')
    try {
      const res = await fetch('/api/viber/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken: authToken.trim(), webhookUrl: webhookUrl.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Webhook registration failed')
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
      const res = await fetch('/api/viber/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken: authToken.trim(), peerUserId: peerUserId.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Connect failed')
      setPeerName(data.peerName ?? '')
      setBotName(data.botName ?? '')
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
      const res = await fetch('/api/viber/import', { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Import failed')
      setImportCount(data.count ?? 0)
      onImported()
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
      const res = await fetch('/api/viber/disconnect', { method: 'POST' })
      const data = await res.json()
      if (!data.disconnected) throw new Error(data.error ?? 'Disconnect failed')
      setIsLinked(false)
      setAuthToken('')
      setPeerUserId('')
      setPeerName('')
      setBotName('')
      setImportCount(0)
      setPeers([])
      setHint('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const canDetect = !!authToken.trim() && busy !== 'detect'
  const canConnect = !!authToken.trim() && !!peerUserId.trim() && busy !== 'connect'
  const canWebhook = !!authToken.trim() && !!webhookUrl.trim() && busy !== 'webhook'

  return (
    <div
      className={`bg-zinc-900 border rounded-xl p-6 w-72 flex flex-col gap-4 transition-colors ${
        isLinked
          ? 'border-l-4 border-purple-500/60 border-zinc-800'
          : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center text-xs font-bold text-purple-300">
          V
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Viber</p>
          <p className="text-zinc-500 text-xs">Public Account API</p>
        </div>
      </div>

      {!isLinked && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Viber delivers inbound messages over HTTPS webhooks. Use a public URL (for example ngrok),
            register it below, message your PA, then detect peers or paste a user ID.
          </p>
          <input
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="Auth token (from Viber Partners)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="Webhook URL (https://…/api/viber/webhook)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleSetWebhook}
            disabled={!canWebhook}
            className="w-full text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'webhook' ? 'Registering…' : 'Register webhook'}
          </button>
          <button
            type="button"
            onClick={handleDetect}
            disabled={!canDetect}
            className="w-full text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'detect' ? 'Detecting…' : 'Detect peers from webhook log'}
          </button>

          {peers.length > 1 && (
            <div className="space-y-1 max-h-32 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-800/50 p-2">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide px-1">Pick a user</p>
              {peers.map((p) => (
                <button
                  key={p.peerUserId}
                  type="button"
                  onClick={() => setPeerUserId(p.peerUserId)}
                  className={`w-full text-left text-xs rounded px-2 py-1.5 transition-colors ${
                    peerUserId === p.peerUserId
                      ? 'bg-purple-900/40 text-purple-200'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="text-zinc-500 ml-1">· {p.peerUserId}</span>
                </button>
              ))}
            </div>
          )}

          <input
            value={peerUserId}
            onChange={(e) => setPeerUserId(e.target.value)}
            placeholder="Viber user ID (from detect or dashboard)"
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
            Bot: <span className="text-purple-300">{botName || 'Connected'}</span>
          </p>
          <p>
            Peer: <span className="text-purple-300">{peerName || peerUserId}</span>
          </p>
          {importCount > 0 && (
            <p>
              <span className="text-white">{importCount}</span> messages in latest import
            </p>
          )}
          <p className="text-zinc-500">
            Saved in <span className="text-purple-400">viber-import/</span>
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
            className="w-full text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
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
              className="w-full text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
            >
              {busy === 'import' ? 'Importing…' : importCount > 0 ? 'Re-import from webhook log' : 'Import from webhook log'}
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
