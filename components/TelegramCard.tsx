'use client'

import { useEffect, useState } from 'react'

interface TelegramCardProps {
  onImported: () => void
}

interface DetectedChat {
  chatId: string
  title: string
  type: string
  lastMessageAt: string
}

export default function TelegramCard({ onImported }: TelegramCardProps) {
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [isLinked, setIsLinked] = useState(false)
  const [busy, setBusy] = useState<'detect' | 'connect' | 'import' | 'disconnect' | null>(null)
  const [error, setError] = useState('')
  const [detectHint, setDetectHint] = useState('')
  const [chatTitle, setChatTitle] = useState('')
  const [importCount, setImportCount] = useState(0)
  const [detectedChats, setDetectedChats] = useState<DetectedChat[]>([])

  useEffect(() => {
    fetch('/api/telegram/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setIsLinked(true)
          setChatId(data.chatId ?? '')
          setChatTitle(data.chatTitle ?? '')
          setImportCount(data.importedCount ?? 0)
        }
      })
      .catch(() => {})
  }, [])

  async function handleDetectChats() {
    setBusy('detect')
    setError('')
    setDetectHint('')
    setDetectedChats([])
    try {
      const res = await fetch('/api/telegram/detect-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Detect failed')
      setDetectedChats(data.chats ?? [])
      if (data.hint) setDetectHint(data.hint)
      const list = (data.chats ?? []) as DetectedChat[]
      if (list.length === 1) {
        setChatId(list[0].chatId)
      }
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
      const res = await fetch('/api/telegram/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim(), chatId: chatId.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Connect failed')
      setChatTitle(data.chatTitle ?? '')
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
      const res = await fetch('/api/telegram/import', { method: 'POST' })
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
      const res = await fetch('/api/telegram/disconnect', { method: 'POST' })
      const data = await res.json()
      if (!data.disconnected) throw new Error(data.error ?? 'Disconnect failed')
      setIsLinked(false)
      setBotToken('')
      setChatId('')
      setChatTitle('')
      setImportCount(0)
      setDetectedChats([])
      setDetectHint('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const canDetect = !!botToken.trim() && busy !== 'detect'
  const canConnect = !!botToken.trim() && !!chatId.trim() && busy !== 'connect'

  return (
    <div
      className={`bg-zinc-900 border rounded-xl p-6 w-72 flex flex-col gap-4 transition-colors ${
        isLinked
          ? 'border-l-4 border-cyan-500/60 border-zinc-800'
          : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-cyan-600/20 flex items-center justify-center text-xs font-bold text-cyan-300">
          TG
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Telegram</p>
          <p className="text-zinc-500 text-xs">Bot API</p>
        </div>
      </div>

      {!isLinked && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Send any message to your bot in Telegram (or post in a linked channel), then use{' '}
            <span className="text-zinc-400">Detect chats</span> to fill the chat ID.
          </p>
          <input
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="Bot token (12345:ABC...)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleDetectChats}
            disabled={!canDetect}
            className="w-full text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'detect' ? 'Detecting…' : 'Detect chats from Telegram'}
          </button>

          {detectedChats.length > 1 && (
            <div className="space-y-1 max-h-32 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-800/50 p-2">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide px-1">Pick a chat</p>
              {detectedChats.map((c) => (
                <button
                  key={c.chatId}
                  type="button"
                  onClick={() => setChatId(c.chatId)}
                  className={`w-full text-left text-xs rounded px-2 py-1.5 transition-colors ${
                    chatId === c.chatId
                      ? 'bg-cyan-900/40 text-cyan-200'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span className="font-medium">{c.title}</span>
                  <span className="text-zinc-500 ml-1">
                    ({c.type}) · {c.chatId}
                  </span>
                </button>
              ))}
            </div>
          )}

          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="Chat ID (filled after detect, or paste)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
          />
        </div>
      )}

      {detectHint && !isLinked && (
        <p className="text-amber-200/90 text-[11px] bg-amber-900/20 border border-amber-800/40 rounded-md px-3 py-2 leading-relaxed">
          {detectHint}
        </p>
      )}

      {isLinked && (
        <div className="text-xs text-zinc-400 bg-zinc-800 rounded-md px-3 py-2 space-y-1">
          <p>
            Connected chat: <span className="text-cyan-300">{chatTitle || chatId}</span>
          </p>
          {importCount > 0 && (
            <p>
              <span className="text-white">{importCount}</span> messages in latest import
            </p>
          )}
          <p className="text-zinc-500">
            Saved in <span className="text-cyan-400">telegram-import/</span>
          </p>
        </div>
      )}

      {error && (
        <p className="text-red-400 text-xs bg-red-900/20 rounded-md px-3 py-2">{error}</p>
      )}

      <div className="flex flex-col gap-2 mt-auto">
        {!isLinked && (
          <button
            type="button"
            onClick={handleConnect}
            disabled={!canConnect}
            className="w-full text-sm bg-cyan-600 hover:bg-cyan-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'connect' ? 'Connecting…' : 'Connect bot'}
          </button>
        )}
        {isLinked && (
          <>
            <button
              type="button"
              onClick={handleImport}
              disabled={busy === 'import' || busy === 'disconnect'}
              className="w-full text-sm bg-cyan-600 hover:bg-cyan-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
            >
              {busy === 'import' ? 'Importing…' : importCount > 0 ? 'Re-import chats' : 'Import chats'}
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
