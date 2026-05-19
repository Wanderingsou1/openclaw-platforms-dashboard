'use client'

import { useEffect, useRef, useState } from 'react'

interface IncomingMessage {
  id: string
  platform: 'email' | 'whatsapp' | 'telegram' | 'slack' | 'teams' | 'viber' | 'wechat' | 'signal' | 'line' | 'googlechat'
  sender: string
  senderEmail: string
  subject: string
  body: string
  receivedAt: string
  snippet: string
  threadName?: string
  presetDraft?: string
  sent?: boolean
}

interface DraftItem extends IncomingMessage {
  draft: string
  generating: boolean
  sending: boolean
  sent: boolean
  error: string
}

interface DraftViewProps {
  emailImported: boolean
}

export default function DraftView({ emailImported }: DraftViewProps) {
  const [items, setItems] = useState<DraftItem[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const pollingRef = useRef(false)

  async function fetchMessages(silent = false) {
    if (!silent) {
      setLoading(true)
      setFetchError('')
      setSelected(null)
    } else if (pollingRef.current) {
      return
    }
    if (silent) pollingRef.current = true

    try {
      // Keep Slack imported messages fresh for near real-time inbox refresh.
      await fetch('/api/slack/import', { method: 'POST' }).catch(() => {})
      await fetch('/api/teams/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'poll' }) }).catch(() => {})

      const res = await fetch('/api/inbox')
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      const incoming: IncomingMessage[] = data.messages ?? []
      let nextItems: DraftItem[] = []
      setItems((prev) => {
        const prevById = new Map(prev.map((p) => [p.id, p]))
        nextItems = incoming.map((m) => {
          const old = prevById.get(m.id)
          const preset = m.presetDraft
          return {
            ...m,
            draft: old?.draft ?? (preset || ''),
            generating: old?.generating ?? false,
            sending: old?.sending ?? false,
            sent: old?.sent ?? m.sent ?? false,
            error: old?.error ?? '',
          }
        })
        return nextItems
      })

      setFetched(true)
      if (!silent && nextItems.length > 0) {
        setSelected(0)
        if (!nextItems[0].draft?.trim()) {
          generateDraft(0, nextItems)
        }
      } else if (silent) {
        setSelected((prevSelected) => (
          prevSelected !== null && prevSelected < nextItems.length
            ? prevSelected
            : (nextItems.length ? 0 : null)
        ))
      }
    } catch (err: any) {
      if (!silent) setFetchError(err.message)
    } finally {
      if (!silent) setLoading(false)
      if (silent) pollingRef.current = false
    }
  }

  useEffect(() => {
    if (!fetched) return
    const id = window.setInterval(() => {
      fetchMessages(true)
    }, 3000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetched])

  async function generateDraft(index: number, source?: DraftItem[]) {
    const list = source ?? items
    const item = list[index]
    setItems((prev) => prev.map((d, i) => i === index ? { ...d, generating: true, error: '', draft: '' } : d))
    try {
      const res = await fetch('/api/inbox/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: item }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItems((prev) => prev.map((d, i) => i === index ? { ...d, draft: data.draft, generating: false } : d))
    } catch (err: any) {
      setItems((prev) => prev.map((d, i) => i === index ? { ...d, generating: false, error: err.message } : d))
    }
  }

  async function sendReply(index: number) {
    const item = items[index]
    setItems((prev) => prev.map((d, i) => i === index ? { ...d, sending: true, error: '' } : d))
    try {
      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: item.id, to: item.senderEmail || item.sender,
          subject: item.subject, body: item.draft, platform: item.platform, threadName: item.threadName,
        }),
      })
      const data = await res.json()
      if (!data.sent) throw new Error(data.error ?? 'Send failed')
      setItems((prev) => prev.map((d, i) => i === index ? { ...d, sending: false, sent: true } : d))
      // Move selection to next unsent
      const next = items.findIndex((d, i) => i !== index && !d.sent)
      setSelected(next >= 0 ? next : null)
    } catch (err: any) {
      setItems((prev) => prev.map((d, i) => i === index ? { ...d, sending: false, error: err.message } : d))
    }
  }

  function skipMessage(index: number) {
    const next = items.findIndex((_, i) => i !== index)
    setItems((prev) => prev.filter((_, i) => i !== index))
    setSelected(next >= 0 ? next : null)
  }

  function updateDraft(index: number, value: string) {
    setItems((prev) => prev.map((d, i) => i === index ? { ...d, draft: value } : d))
  }

  function selectMessage(index: number) {
    setSelected(index)
    // Generate draft if not yet done
    if (!items[index].draft && !items[index].generating) {
      generateDraft(index)
    }
  }

  const activeItem = selected !== null ? items[selected] : null

  return (
    <div className="flex h-[calc(100vh-48px)] overflow-hidden -m-8">

      {/* ── LEFT PANEL — message list ── */}
      <div className="w-72 shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-900">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-white text-sm font-semibold">Inbox</span>
          <button
            onClick={() => fetchMessages()}
            disabled={loading}
            className="text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded px-2 py-1 transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            {loading && <Spinner />}
            {loading ? 'Loading...' : fetched ? 'Refresh' : 'Check'}
          </button>
        </div>

        {/* Error */}
        {fetchError && (
          <div className="mx-3 mt-3 text-xs text-red-400 bg-red-900/20 rounded px-3 py-2">
            {fetchError}
            {!emailImported && <span className="block text-red-500 mt-1">Connect and import at least one channel first.</span>}
          </div>
        )}

        {/* Empty */}
        {!loading && fetched && items.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-600 text-xs text-center px-4">No unread messages.</p>
          </div>
        )}

        {!fetched && !loading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-600 text-xs text-center px-4">
              Click Check to pull your inbox.
            </p>
          </div>
        )}

        {/* Message list */}
        <div className="flex-1 overflow-y-auto">
          {items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => selectMessage(i)}
              className={`w-full text-left px-4 py-3 border-b border-zinc-800 transition-colors ${
                selected === i ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
              } ${item.sent ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  item.platform === 'email'
                    ? 'bg-blue-900/60 text-blue-300'
                    : item.platform === 'telegram'
                      ? 'bg-cyan-900/60 text-cyan-300'
                      : item.platform === 'slack'
                        ? 'bg-violet-900/60 text-violet-300'
                        : item.platform === 'teams'
                          ? 'bg-sky-900/60 text-sky-300'
                          : item.platform === 'viber'
                            ? 'bg-purple-900/60 text-purple-300'
                            : item.platform === 'wechat'
                              ? 'bg-emerald-900/60 text-emerald-300'
                              : item.platform === 'signal'
                                ? 'bg-sky-900/60 text-sky-300'
                                : item.platform === 'line'
                                  ? 'bg-green-900/60 text-green-300'
                                  : item.platform === 'googlechat'
                                    ? 'bg-amber-900/60 text-amber-300'
                                    : 'bg-green-900/60 text-green-300'
                }`}>
                  {item.platform === 'email'
                    ? 'Email'
                    : item.platform === 'telegram'
                      ? 'TG'
                      : item.platform === 'slack'
                        ? 'SL'
                        : item.platform === 'teams'
                          ? 'TM'
                          : item.platform === 'viber'
                            ? 'VB'
                            : item.platform === 'wechat'
                              ? 'WC'
                              : item.platform === 'signal'
                                ? 'SG'
                                : item.platform === 'line'
                                  ? 'LN'
                                  : item.platform === 'googlechat'
                                    ? 'GC'
                                    : 'WA'}
                </span>
                {item.sent && <span className="text-[10px] text-green-400 ml-auto">Sent</span>}
                {item.generating && !item.sent && (
                  <span className="ml-auto"><Spinner /></span>
                )}
              </div>
              <p className="text-zinc-200 text-xs font-medium truncate">{item.sender}</p>
              <p className="text-zinc-500 text-[11px] truncate mt-0.5">{item.subject || item.snippet}</p>
              <p className="text-zinc-600 text-[10px] mt-1">
                {item.receivedAt ? new Date(item.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL — detail + draft ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
        {!activeItem && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-600 text-sm">
              {fetched ? 'Select a message from the left.' : 'Check your inbox to get started.'}
            </p>
          </div>
        )}

        {activeItem && (
          <>
            {/* Message detail */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6">

              {/* Sender + meta */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                      activeItem.platform === 'email'
                        ? 'bg-blue-900/60 text-blue-300'
                        : activeItem.platform === 'telegram'
                          ? 'bg-cyan-900/60 text-cyan-300'
                          : activeItem.platform === 'slack'
                            ? 'bg-violet-900/60 text-violet-300'
                            : activeItem.platform === 'teams'
                              ? 'bg-sky-900/60 text-sky-300'
                              : activeItem.platform === 'viber'
                                ? 'bg-purple-900/60 text-purple-300'
                                : activeItem.platform === 'wechat'
                                  ? 'bg-emerald-900/60 text-emerald-300'
                                  : activeItem.platform === 'signal'
                                    ? 'bg-sky-900/60 text-sky-300'
                                    : activeItem.platform === 'line'
                                      ? 'bg-green-900/60 text-green-300'
                                      : activeItem.platform === 'googlechat'
                                        ? 'bg-amber-900/60 text-amber-300'
                                        : 'bg-green-900/60 text-green-300'
                      }`}>
                        {activeItem.platform === 'email'
                          ? 'Email'
                          : activeItem.platform === 'telegram'
                            ? 'Telegram'
                            : activeItem.platform === 'slack'
                              ? 'Slack'
                              : activeItem.platform === 'teams'
                                ? 'Teams'
                                : activeItem.platform === 'viber'
                                  ? 'Viber'
                                  : activeItem.platform === 'wechat'
                                    ? 'WeChat'
                                    : activeItem.platform === 'signal'
                                      ? 'Signal'
                                      : activeItem.platform === 'line'
                                        ? 'LINE'
                                        : activeItem.platform === 'googlechat'
                                          ? 'Google Chat'
                                          : 'WhatsApp'}
                      </span>
                    </div>
                    <h2 className="text-white text-xl font-semibold">{activeItem.sender}</h2>
                    {activeItem.senderEmail && activeItem.senderEmail !== activeItem.sender && (
                      <p className="text-zinc-500 text-sm">{activeItem.senderEmail}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-zinc-400 text-sm">
                      {activeItem.receivedAt
                        ? new Date(activeItem.receivedAt).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : ''}
                    </p>
                  </div>
                </div>

                {activeItem.platform === 'email' && activeItem.subject && (
                  <div className="border-b border-zinc-800 pb-3">
                    <p className="text-zinc-300 text-sm font-medium">{activeItem.subject}</p>
                  </div>
                )}
              </div>

              {/* Original message */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-zinc-500 text-[11px] font-medium uppercase tracking-wide mb-3">Original Message</p>
                <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {activeItem.body || activeItem.snippet}
                </p>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-zinc-800" />
                <span className="text-zinc-600 text-xs">AI Draft Reply</span>
                <div className="flex-1 border-t border-zinc-800" />
              </div>

              {/* Draft area */}
              <div className="space-y-3">
                {activeItem.generating && (
                  <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
                    <Spinner /> Generating draft reply...
                  </div>
                )}

                {!activeItem.generating && activeItem.draft && (
                  <textarea
                    value={activeItem.draft}
                    onChange={(e) => selected !== null && updateDraft(selected, e.target.value)}
                    rows={8}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-5 py-4 text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Edit the draft here..."
                  />
                )}

                {!activeItem.generating && !activeItem.draft && !activeItem.error && (
                  <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl px-5 py-8 text-center text-zinc-600 text-sm">
                    Draft will appear here...
                  </div>
                )}

                {activeItem.error && (
                  <div className="bg-red-900/20 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {activeItem.error}
                  </div>
                )}
              </div>
            </div>

            {/* ── Action bar ── */}
            <div className="border-t border-zinc-800 px-8 py-4 flex items-center gap-3 bg-zinc-900/50">
              <button
                onClick={() => selected !== null && sendReply(selected)}
                disabled={!activeItem.draft || activeItem.generating || activeItem.sending || activeItem.sent}
                className="bg-white hover:bg-zinc-100 text-zinc-900 text-sm font-semibold rounded-lg px-6 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {activeItem.sending && <Spinner dark />}
                {activeItem.sent ? 'Sent' : activeItem.sending ? 'Sending...' : 'Approve & Send'}
              </button>

              <button
                onClick={() => selected !== null && generateDraft(selected)}
                disabled={activeItem.generating || activeItem.sending}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg px-5 py-2.5 transition-colors disabled:opacity-40 flex items-center gap-2"
              >
                {activeItem.generating && <Spinner />}
                Regenerate
              </button>

              <button
                onClick={() => selected !== null && skipMessage(selected)}
                className="text-zinc-600 hover:text-zinc-400 text-sm px-4 py-2.5 transition-colors ml-auto"
              >
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Spinner({ dark }: { dark?: boolean }) {
  return (
    <svg className={`animate-spin w-3.5 h-3.5 shrink-0 ${dark ? 'text-zinc-600' : 'text-zinc-400'}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
