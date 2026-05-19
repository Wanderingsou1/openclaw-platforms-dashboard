'use client'

import { useEffect, useMemo, useState } from 'react'

interface TeamsCardProps {
  onImported: () => void
}

export default function TeamsCard({ onImported }: TeamsCardProps) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [defaultChatId, setDefaultChatId] = useState('')
  const [accountName, setAccountName] = useState('')
  const [subscriptionExpiry, setSubscriptionExpiry] = useState('')
  const [importCount, setImportCount] = useState(0)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState<'connect' | 'import' | 'disconnect' | 'renew' | null>(null)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  const defaultWebhookUrl = useMemo(
    () => 'https://companion-oxford-seldom.ngrok-free.app/api/teams/webhook',
    []
  )

  useEffect(() => {
    if (defaultWebhookUrl && !webhookUrl) {
      setWebhookUrl(defaultWebhookUrl)
    }
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultWebhookUrl])

  useEffect(() => {
    fetch('/api/teams/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setConnected(true)
          setAccountName(data.accountName ?? '')
          setTenantId(data.tenantId ?? '')
          setDefaultChatId(data.defaultChatId ?? '')
          setWebhookUrl(data.webhookUrl ?? defaultWebhookUrl)
          setSubscriptionExpiry(data.subscriptionExpiry ?? '')
          setImportCount(data.importedCount ?? 0)
        }
      })
      .catch(() => {})
  }, [defaultWebhookUrl])

  useEffect(() => {
    if (!connected) return
    let cancelled = false

    const syncNow = async () => {
      if (cancelled || busy) return
      try {
        const res = await fetch('/api/teams/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'poll' }),
        })
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
  }, [busy, connected, onImported])

  useEffect(() => {
    if (!connected || !subscriptionExpiry) return

    const renewSoon = async () => {
      if (busy) return
      try {
        setBusy('renew')
        const res = await fetch('/api/teams/renew')
        const data = await res.json()
        if (data.renewed) {
          setSubscriptionExpiry(data.subscriptionExpiry ?? '')
        }
      } catch {
        // best-effort renewal
      } finally {
        setBusy((current) => (current === 'renew' ? null : current))
      }
    }

    const timer = window.setInterval(() => {
      void renewSoon()
    }, 50 * 60 * 1000)

    return () => window.clearInterval(timer)
  }, [busy, connected, subscriptionExpiry])

  async function handleConnect() {
    setBusy('connect')
    setError('')
    setWarning('')
    try {
      const res = await fetch('/api/teams/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          tenantId: tenantId.trim(),
          webhookUrl: webhookUrl.trim(),
          defaultChatId: defaultChatId.trim(),
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Connect failed')
      setConnected(true)
      setAccountName(data.accountName ?? '')
      setSubscriptionExpiry(data.subscriptionExpiry ?? '')
      if (data.warning) setWarning(data.warning)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleImport() {
    setBusy('import')
    setError('')
    setWarning('')
    try {
      const res = await fetch('/api/teams/import', { method: 'POST' })
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
    setWarning('')
    try {
      const res = await fetch('/api/teams/disconnect', { method: 'POST' })
      const data = await res.json()
      if (!data.disconnected) throw new Error(data.error ?? 'Disconnect failed')
      setConnected(false)
      setClientId('')
      setClientSecret('')
      setTenantId('')
      setWebhookUrl(defaultWebhookUrl)
      setDefaultChatId('')
      setAccountName('')
      setSubscriptionExpiry('')
      setImportCount(0)
      if (data.warning) setWarning(data.warning)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className={`bg-zinc-900 border rounded-xl p-6 w-72 flex flex-col gap-4 transition-colors ${
        connected ? 'border-l-4 border-sky-500/60 border-zinc-800' : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-sky-600/20 flex items-center justify-center text-xs font-bold text-sky-300">
          TM
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Microsoft Teams</p>
          <p className="text-zinc-500 text-xs">Graph API subscription</p>
        </div>
      </div>

      {!connected && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Connect a selected Teams chat using your Azure app registration. OpenClaw listens for new
            messages, drafts replies, and sends them back only after approval.
          </p>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Client ID"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <input
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Client Secret"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="Tenant ID"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <input
            value={defaultChatId}
            onChange={(e) => setDefaultChatId(e.target.value)}
            placeholder="Optional chat ID to scope one chat"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="Webhook URL"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            autoComplete="off"
          />
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            Using ngrok webhook: <span className="text-zinc-300 break-all">{defaultWebhookUrl}</span>
          </p>
        </div>
      )}

      {connected && (
        <div className="text-xs text-zinc-400 bg-zinc-800 rounded-md px-3 py-2 space-y-1">
          <p>
            Account: <span className="text-sky-300">{accountName || 'Microsoft Teams'}</span>
          </p>
          <p>
            Scope: <span className="text-sky-300 break-all">{defaultChatId || 'All chats in tenant'}</span>
          </p>
          {subscriptionExpiry && (
            <p>
              Renewal: <span className="text-sky-300">{new Date(subscriptionExpiry).toLocaleString()}</span>
            </p>
          )}
          {importCount > 0 && (
            <p>
              <span className="text-white">{importCount}</span> messages in latest import
            </p>
          )}
          <p className="text-zinc-500">
            Saved in <span className="text-sky-400">teams-import/</span>
          </p>
        </div>
      )}

      {warning && (
        <p className="text-amber-200/90 text-[11px] bg-amber-900/20 border border-amber-800/40 rounded-md px-3 py-2">
          {warning}
        </p>
      )}

      {error && (
        <p className="text-red-400 text-xs bg-red-900/20 rounded-md px-3 py-2">{error}</p>
      )}

      <div className="flex flex-col gap-2 mt-auto">
        {!connected && (
          <button
            type="button"
            onClick={handleConnect}
            disabled={!clientId.trim() || !clientSecret.trim() || !tenantId.trim() || busy === 'connect'}
            className="w-full text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
          >
            {busy === 'connect' ? 'Connecting...' : 'Connect chat'}
          </button>
        )}
        {connected && (
          <>
            <button
              type="button"
              onClick={handleImport}
              disabled={busy === 'import' || busy === 'disconnect'}
              className="w-full text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-40"
            >
              {busy === 'import' ? 'Importing...' : 'Import messages'}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
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
