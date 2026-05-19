'use client'

import { useEffect, useState } from 'react'

interface LineCardProps {
  onImported: () => void
}

interface DetectedPeer {
  userId: string
  title: string
  lastMessageAt: string
}

export default function LineCard({ onImported }: LineCardProps) {
  const [channelAccessToken, setChannelAccessToken] = useState('')
  const [channelSecret, setChannelSecret] = useState('')
  const [userId, setUserId] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [isLinked, setIsLinked] = useState(false)
  const [busy, setBusy] = useState<'detect' | 'webhook' | 'connect' | 'import' | 'disconnect' | null>(null)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [webhookNote, setWebhookNote] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [botName, setBotName] = useState('')
  const [importCount, setImportCount] = useState(0)
  const [peers, setPeers] = useState<DetectedPeer[]>([])

  useEffect(() => {
    fetch('/api/line/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setIsLinked(true)
          setUserId(data.userId ?? '')
          setDisplayName(data.displayName ?? '')
          setBotName(data.botName ?? '')
          setImportCount(data.importedCount ?? 0)
        }
      })
      .catch(() => {})
  }, [])

  async function handleSetWebhook() {
    setBusy('webhook')
    setError('')
    setWebhookNote('')
    try {
      const res = await fetch('/api/line/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelAccessToken: channelAccessToken.trim(),
          webhookUrl: webhookUrl.trim(),
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Webhook setup failed')
      if (data.instruction) setWebhookNote(data.instruction)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleDetect() {
    setBusy('detect')
    setError('')
    setHint('')
    setPeers([])
    try {
      const res = await fetch('/api/line/detect-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelAccessToken: channelAccessToken.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Detect failed')
      setPeers(data.peers ?? [])
      if (data.hint) setHint(data.hint)
      const list = (data.peers ?? []) as DetectedPeer[]
      if (list.length === 1) setUserId(list[0].userId)
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
      const res = await fetch('/api/line/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelAccessToken: channelAccessToken.trim(),
          channelSecret: channelSecret.trim(),
          userId: userId.trim(),
          displayName: displayName.trim(),
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Connect failed')
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
      const res = await fetch('/api/line/import', { method: 'POST' })
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
      const res = await fetch('/api/line/disconnect', { method: 'POST' })
      const data = await res.json()
      if (!data.disconnected) throw new Error(data.error ?? 'Disconnect failed')
      setIsLinked(false)
      setChannelAccessToken('')
      setChannelSecret('')
      setUserId('')
      setDisplayName('')
      setBotName('')
      setImportCount(0)
      setPeers([])
      setHint('')
      setWebhookNote('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const canDetect = !!channelAccessToken.trim() && busy !== 'detect'
  const canConnect = !!channelAccessToken.trim() && !!channelSecret.trim() && !!userId.trim() && busy !== 'connect'
  const canWebhook = !!channelAccessToken.trim() && !!webhookUrl.trim() && busy !== 'webhook'

  return (
    <div
      className={`bg-zinc-900 border rounded-xl p-6 w-72 flex flex-col gap-4 transition-colors ${
        isLinked
          ? 'border-l-4 border-green-500/60 border-zinc-800'
          : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center text-xs font-bold text-green-300">
          L
        </div>
        <div>
          <p className="text-white font-semibold text-sm">LINE</p>
          <p className="text-zinc-500 text-xs">Messaging API</p>
        </div>
      </div>

      {!isLinked && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            LINE delivers messages via webhooks. Provide your Channel Access Token and Secret from the
            LINE Developers Console, register the webhook URL, then detect followers.
          </p>
          <input
            value={channelAccessToken}
            onChange={(e) => setChannelAccessToken(e.target.value)}
            placeholder="Channel Access Token"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <input
            value={channelSecret}
            onChange={(e) => setChannelSecret(e.target.value)}
            placeholder="Channel Secret"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="Webhook URL (https://…/api/line/webhook)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleSetWebhook}
            disabled={!canWebhook}
            className="w-full text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'webhook' ? 'Checking…' : 'Get webhook instructions'}
          </button>
          <button
            type="button"
            onClick={handleDetect}
            disabled={!canDetect}
            className="w-full text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'detect' ? 'Detecting…' : 'Detect followers from webhook log'}
          </button>

          {peers.length > 1 && (
            <div className="space-y-1 max-h-32 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-800/50 p-2">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide px-1">Pick a user</p>
              {peers.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => setUserId(p.userId)}
                  className={`w-full text-left text-xs rounded px-2 py-1.5 transition-colors ${
                    userId === p.userId
                      ? 'bg-green-900/40 text-green-200'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="text-zinc-500 ml-1">· {p.userId.slice(0, 12)}…</span>
                </button>
              ))}
            </div>
          )}

          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="User ID (U…) from detect or console"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
          />
        </div>
      )}

      {webhookNote && !isLinked && (
        <p className="text-amber-200/90 text-[11px] bg-amber-900/20 border border-amber-800/40 rounded-md px-3 py-2 leading-relaxed">
          {webhookNote}
        </p>
      )}

      {hint && !isLinked && (
        <p className="text-amber-200/90 text-[11px] bg-amber-900/20 border border-amber-800/40 rounded-md px-3 py-2 leading-relaxed">
          {hint}
        </p>
      )}

      {isLinked && (
        <div className="text-xs text-zinc-400 bg-zinc-800 rounded-md px-3 py-2 space-y-1">
          <p>
            Bot: <span className="text-green-300">{botName || 'Connected'}</span>
          </p>
          <p>
            User: <span className="text-green-300">{displayName || userId}</span>
          </p>
          {importCount > 0 && (
            <p>
              <span className="text-white">{importCount}</span> messages in latest import
            </p>
          )}
          <p className="text-zinc-500">
            Saved in <span className="text-green-400">line-import/</span>
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
            className="w-full text-sm bg-green-600 hover:bg-green-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
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
              className="w-full text-sm bg-green-600 hover:bg-green-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
            >
              {busy === 'import'
                ? 'Importing…'
                : importCount > 0
                  ? 'Re-import from webhook log'
                  : 'Import from webhook log'}
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
