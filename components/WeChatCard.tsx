'use client'

import { useEffect, useState } from 'react'

interface WeChatCardProps {
  onImported: () => void
}

interface DetectedPeer {
  openId: string
  title: string
  lastMessageAt: string
}

export default function WeChatCard({ onImported }: WeChatCardProps) {
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [verifyToken, setVerifyToken] = useState('')
  const [openId, setOpenId] = useState('')
  const [isLinked, setIsLinked] = useState(false)
  const [busy, setBusy] = useState<'save' | 'detect' | 'connect' | 'import' | 'disconnect' | null>(null)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [importCount, setImportCount] = useState(0)
  const [peers, setPeers] = useState<DetectedPeer[]>([])

  useEffect(() => {
    fetch('/api/wechat/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.appId) setAppId(data.appId)
        if (data.connected) {
          setIsLinked(true)
          setOpenId(data.openId ?? '')
          setImportCount(data.importedCount ?? 0)
        }
      })
      .catch(() => {})
  }, [])

  async function handleSaveServer() {
    setBusy('save')
    setError('')
    try {
      const res = await fetch('/api/wechat/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: appId.trim(),
          appSecret: appSecret.trim(),
          verifyToken: verifyToken.trim(),
          openId: openId.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Save failed')
      if (data.connected) setIsLinked(true)
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
      const res = await fetch('/api/wechat/detect-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: appId.trim(), appSecret: appSecret.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Detect failed')
      setPeers(data.peers ?? [])
      if (data.hint) setHint(data.hint)
      const list = (data.peers ?? []) as DetectedPeer[]
      if (list.length === 1) setOpenId(list[0].openId)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleConnectUser() {
    setBusy('connect')
    setError('')
    try {
      const res = await fetch('/api/wechat/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: appId.trim(),
          appSecret: appSecret.trim(),
          verifyToken: verifyToken.trim(),
          openId: openId.trim(),
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
      const res = await fetch('/api/wechat/import', { method: 'POST' })
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
      const res = await fetch('/api/wechat/disconnect', { method: 'POST' })
      const data = await res.json()
      if (!data.disconnected) throw new Error(data.error ?? 'Disconnect failed')
      setIsLinked(false)
      setAppId('')
      setAppSecret('')
      setVerifyToken('')
      setOpenId('')
      setImportCount(0)
      setPeers([])
      setHint('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const credsOk = !!appId.trim() && !!appSecret.trim() && !!verifyToken.trim()
  const canSave = credsOk && busy !== 'save'
  const canDetect = credsOk && busy !== 'detect'
  const canConnectUser = credsOk && !!openId.trim() && busy !== 'connect'

  return (
    <div
      className={`bg-zinc-900 border rounded-xl p-6 w-72 flex flex-col gap-4 transition-colors ${
        isLinked
          ? 'border-l-4 border-emerald-500/60 border-zinc-800'
          : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center text-xs font-bold text-emerald-300">
          WC
        </div>
        <div>
          <p className="text-white font-semibold text-sm">WeChat</p>
          <p className="text-zinc-500 text-xs">Official account (server URL)</p>
        </div>
      </div>

      {!isLinked && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            In WeChat MP admin, set the server URL to{' '}
            <span className="text-zinc-400">/api/wechat/webhook</span> on your public host and use the same
            verification token you enter here. Save credentials first, verify the URL, then message the account.
          </p>
          <input
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="App ID"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <input
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder="App Secret"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <input
            value={verifyToken}
            onChange={(e) => setVerifyToken(e.target.value)}
            placeholder="Verification token (MP admin)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleSaveServer}
            disabled={!canSave}
            className="w-full text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'save' ? 'Saving…' : 'Save server credentials'}
          </button>
          <button
            type="button"
            onClick={handleDetect}
            disabled={!canDetect}
            className="w-full text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'detect' ? 'Detecting…' : 'Detect Open IDs from webhook log'}
          </button>

          {peers.length > 1 && (
            <div className="space-y-1 max-h-32 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-800/50 p-2">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide px-1">Pick a user</p>
              {peers.map((p) => (
                <button
                  key={p.openId}
                  type="button"
                  onClick={() => setOpenId(p.openId)}
                  className={`w-full text-left text-xs rounded px-2 py-1.5 transition-colors ${
                    openId === p.openId
                      ? 'bg-emerald-900/40 text-emerald-200'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="text-zinc-500 ml-1">· {p.openId}</span>
                </button>
              ))}
            </div>
          )}

          <input
            value={openId}
            onChange={(e) => setOpenId(e.target.value)}
            placeholder="User Open ID (from detect or paste)"
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
            App ID: <span className="text-emerald-300">{appId}</span>
          </p>
          <p>
            Open ID: <span className="text-emerald-300">{openId}</span>
          </p>
          {importCount > 0 && (
            <p>
              <span className="text-white">{importCount}</span> messages in latest import
            </p>
          )}
          <p className="text-zinc-500">
            Saved in <span className="text-emerald-400">wechat-import/</span>
          </p>
        </div>
      )}

      {error && <p className="text-red-400 text-xs bg-red-900/20 rounded-md px-3 py-2">{error}</p>}

      <div className="flex flex-col gap-2 mt-auto">
        {!isLinked && (
          <button
            type="button"
            onClick={handleConnectUser}
            disabled={!canConnectUser}
            className="w-full text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'connect' ? 'Connecting…' : 'Connect user'}
          </button>
        )}
        {isLinked && (
          <>
            <button
              type="button"
              onClick={handleImport}
              disabled={busy === 'import' || busy === 'disconnect'}
              className="w-full text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
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
