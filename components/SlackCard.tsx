'use client'

import { useEffect, useState } from 'react'

interface SlackCardProps {
  onImported: () => void
}

interface SlackChannel {
  id: string
  name: string
  isPrivate: boolean
}

export default function SlackCard({ onImported }: SlackCardProps) {
  const [botToken, setBotToken] = useState('')
  const [channelId, setChannelId] = useState('')
  const [channelName, setChannelName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [channels, setChannels] = useState<SlackChannel[]>([])
  const [importCount, setImportCount] = useState(0)
  const [busy, setBusy] = useState<'detect' | 'connect' | 'import' | 'disconnect' | null>(null)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    fetch('/api/slack/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setConnected(true)
          setTeamName(data.teamName ?? '')
          setChannelId(data.channelId ?? '')
          setChannelName(data.channelName ?? '')
          setImportCount(data.importedCount ?? 0)
        }
      })
      .catch(() => {})
  }, [])

  async function detectChannels() {
    setBusy('detect')
    setError('')
    setHint('')
    try {
      const res = await fetch('/api/slack/detect-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Detect failed')
      const list = (data.channels ?? []) as SlackChannel[]
      setChannels(list)
      setHint(data.hint ?? '')
      if (list.length === 1) {
        setChannelId(list[0].id)
        setChannelName(list[0].name)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function connectSlack() {
    setBusy('connect')
    setError('')
    try {
      const res = await fetch('/api/slack/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim(), channelId: channelId.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Connect failed')
      setConnected(true)
      setTeamName(data.teamName ?? '')
      setChannelName(data.channelName ?? channelId)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function importSlack() {
    setBusy('import')
    setError('')
    try {
      const res = await fetch('/api/slack/import', { method: 'POST' })
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

  async function disconnectSlack() {
    setBusy('disconnect')
    setError('')
    try {
      const res = await fetch('/api/slack/disconnect', { method: 'POST' })
      const data = await res.json()
      if (!data.disconnected) throw new Error(data.error ?? 'Disconnect failed')
      setConnected(false)
      setBotToken('')
      setChannelId('')
      setChannelName('')
      setTeamName('')
      setChannels([])
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
      connected ? 'border-l-4 border-violet-500/60 border-zinc-800' : 'border-zinc-800 hover:border-zinc-700'
    }`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-600/20 flex items-center justify-center text-xs font-bold text-violet-300">
          SL
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Slack</p>
          <p className="text-zinc-500 text-xs">Bot token</p>
        </div>
      </div>

      {!connected && (
        <div className="space-y-2">
          <input
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="Bot token (xoxb-...)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={detectChannels}
            disabled={!botToken.trim() || busy === 'detect'}
            className="w-full text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'detect' ? 'Detecting...' : 'Detect channels'}
          </button>

          {channels.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-800/50 p-2">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide px-1">Pick a channel</p>
              {channels.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setChannelId(c.id)
                    setChannelName(c.name)
                  }}
                  className={`w-full text-left text-xs rounded px-2 py-1.5 transition-colors ${
                    channelId === c.id ? 'bg-violet-900/40 text-violet-200' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span className="font-medium">#{c.name}</span>
                  <span className="text-zinc-500 ml-1">({c.id})</span>
                </button>
              ))}
            </div>
          )}

          <input
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="Channel ID (C... / G... / D...)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
          />
        </div>
      )}

      {connected && (
        <div className="text-xs text-zinc-400 bg-zinc-800 rounded-md px-3 py-2 space-y-1">
          <p>Workspace: <span className="text-violet-300">{teamName || 'Connected'}</span></p>
          <p>Channel: <span className="text-violet-300">#{channelName || channelId}</span></p>
          {importCount > 0 && <p><span className="text-white">{importCount}</span> messages in latest import</p>}
          <p className="text-zinc-500">Saved in <span className="text-violet-400">slack-import/</span></p>
        </div>
      )}

      {hint && !connected && (
        <p className="text-amber-200/90 text-[11px] bg-amber-900/20 border border-amber-800/40 rounded-md px-3 py-2">
          {hint}
        </p>
      )}

      {error && (
        <p className="text-red-400 text-xs bg-red-900/20 rounded-md px-3 py-2">{error}</p>
      )}

      <div className="flex flex-col gap-2 mt-auto">
        {!connected && (
          <button
            type="button"
            onClick={connectSlack}
            disabled={!botToken.trim() || !channelId.trim() || busy === 'connect'}
            className="w-full text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'connect' ? 'Connecting...' : 'Connect bot'}
          </button>
        )}
        {connected && (
          <>
            <button
              type="button"
              onClick={importSlack}
              disabled={busy === 'import' || busy === 'disconnect'}
              className="w-full text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
            >
              {busy === 'import' ? 'Importing...' : importCount > 0 ? 'Re-import channels' : 'Import channel'}
            </button>
            <button
              type="button"
              onClick={disconnectSlack}
              disabled={busy === 'disconnect' || busy === 'import'}
              className="w-full text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md px-4 py-2 transition-colors disabled:opacity-40"
            >
              {busy === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
