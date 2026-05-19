'use client'

import { useState, useEffect } from 'react'

interface EmailCardProps {
  onImported: () => void
  initialEmail?: string   // passed from page if URL has ?gmail=connected
}

type State = 'idle' | 'importing' | 'done' | 'error'

export default function EmailCard({ onImported, initialEmail }: EmailCardProps) {
  const [state, setState] = useState<State>('idle')
  const [email, setEmail] = useState(initialEmail ?? '')
  const [error, setError] = useState('')
  const [importCount, setImportCount] = useState(0)

  // If returned from OAuth with ?gmail=connected&email=...
  useEffect(() => {
    if (initialEmail) setEmail(initialEmail)
  }, [initialEmail])

  function handleConnect() {
    // Redirect to OAuth — Google will show account picker
    window.location.href = '/api/gmail/connect'
  }

  async function handleDisconnect() {
    await fetch('/api/gmail/disconnect', { method: 'POST' })
    setEmail('')
    setState('idle')
    setImportCount(0)
    setError('')
    // Remove query params from URL cleanly
    window.history.replaceState({}, '', '/')
  }

  async function handleImport() {
    setState('importing')
    setError('')
    try {
      const res = await fetch('/api/gmail/import', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setImportCount(data.count)
        setState('done')
        onImported()
      } else {
        setError(data.error ?? 'Import failed')
        setState('error')
      }
    } catch (err: any) {
      setError(err.message)
      setState('error')
    }
  }

  const isConnected = !!email

  return (
    <div className={`bg-zinc-900 border rounded-xl p-6 w-72 flex flex-col gap-4 transition-colors ${
      isConnected
        ? 'border-l-4 border-blue-500/60 border-t-zinc-800 border-r-zinc-800 border-b-zinc-800'
        : 'border-zinc-800 hover:border-zinc-700'
    }`}>
      {/* Icon + Title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center text-xl select-none">
          ✉
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Email</p>
          <p className="text-zinc-500 text-xs">Gmail</p>
        </div>
      </div>

      {/* Connected status */}
      {isConnected && (
        <div className="flex items-center justify-between bg-zinc-800 rounded-md px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <span className="text-xs text-zinc-300 truncate">{email}</span>
          </div>
          <button
            onClick={handleDisconnect}
            className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors ml-2 shrink-0"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Import result */}
      {state === 'done' && (
        <div className="text-xs text-zinc-400 bg-zinc-800 rounded-md px-3 py-2 space-y-1">
          <p><span className="text-white">{importCount}</span> emails imported</p>
          <p>Style saved to <span className="text-blue-400">email-import/</span></p>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <p className="text-red-400 text-xs bg-red-900/20 rounded-md px-3 py-2">{error}</p>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-auto">
        {!isConnected && (
          <button onClick={handleConnect}
            className="w-full text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 transition-colors">
            Connect Gmail
          </button>
        )}

        {isConnected && state !== 'importing' && (
          <button onClick={handleImport}
            className="w-full text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 transition-colors">
            {state === 'done' ? 'Re-import' : 'Import Emails'}
          </button>
        )}

        {state === 'importing' && (
          <button disabled
            className="w-full text-sm bg-zinc-700 text-zinc-400 rounded-md px-4 py-2 cursor-not-allowed flex items-center justify-center gap-2">
            <Spinner /> Importing...
          </button>
        )}

        {state === 'error' && (
          <button onClick={handleConnect}
            className="w-full text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-md px-4 py-2 transition-colors">
            Try different account
          </button>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
