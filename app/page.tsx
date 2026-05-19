'use client'

import { useState, useEffect } from 'react'
import EmailCard from '@/components/EmailCard'
import WhatsAppCard from '@/components/WhatsAppCard'
import TelegramCard from '@/components/TelegramCard'
import SlackCard from '@/components/SlackCard'
import TeamsCard from '@/components/TeamsCard'
import ViberCard from '@/components/ViberCard'
import WeChatCard from '@/components/WeChatCard'
import SignalCard from '@/components/SignalCard'
import GoogleChatCard from '@/components/GoogleChatCard'
import LineCard from '@/components/LineCard'
import DraftView from '@/components/DraftView'

type Tab = 'channel' | 'draft'

export default function Home() {
  const [tab, setTab] = useState<Tab>('channel')
  const [emailImported, setEmailImported] = useState(false)
  const [telegramImported, setTelegramImported] = useState(false)
  const [slackImported, setSlackImported] = useState(false)
  const [teamsImported, setTeamsImported] = useState(false)
  const [viberImported, setViberImported] = useState(false)
  const [wechatImported, setWechatImported] = useState(false)
  const [signalImported, setSignalImported] = useState(false)
  const [googleChatImported, setGoogleChatImported] = useState(false)
  const [lineImported, setLineImported] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState('')

  // After Google OAuth redirect back, read email from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gmail') === 'connected') {
      const email = params.get('email') ?? ''
      setConnectedEmail(email)
      window.history.replaceState({}, '', '/')
    }
  }, [])

  useEffect(() => {
    fetch('/api/viber/status')
      .then((r) => r.json())
      .then((d) => {
        if (d.localPreview && (d.importedCount ?? 0) > 0) setViberImported(true)
      })
      .catch(() => {})
    fetch('/api/wechat/status')
      .then((r) => r.json())
      .then((d) => {
        if (d.localPreview && (d.importedCount ?? 0) > 0) setWechatImported(true)
      })
      .catch(() => {})
    fetch('/api/signal/status')
      .then((r) => r.json())
      .then((d) => {
        if (d.localPreview && (d.importedCount ?? 0) > 0) setSignalImported(true)
      })
      .catch(() => {})
    fetch('/api/teams/status')
      .then((r) => r.json())
      .then((d) => {
        if (d.connected && (d.importedCount ?? 0) > 0) setTeamsImported(true)
      })
      .catch(() => {})
    fetch('/api/googlechat/status')
      .then((r) => r.json())
      .then((d) => {
        if (d.connected && (d.importedCount ?? 0) > 0) setGoogleChatImported(true)
      })
      .catch(() => {})
    fetch('/api/line/status')
      .then((r) => r.json())
      .then((d) => {
        if (d.localPreview && (d.importedCount ?? 0) > 0) setLineImported(true)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-zinc-800 bg-zinc-900 px-6 flex items-center gap-1 h-12">
        <span className="text-zinc-500 text-sm font-medium mr-4">openclaw</span>

        <button
          onClick={() => setTab('channel')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'channel'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Channel
        </button>

        <button
          onClick={() => setTab('draft')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'draft'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Draft
        </button>
      </nav>

      {/* Content */}
      <main className="flex-1 p-8">
        {tab === 'channel' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-white font-semibold text-sm mb-1"># channel</h2>
              <p className="text-zinc-500 text-xs">Connect your channels to start pulling messages.</p>
            </div>
            <div className="flex gap-5 flex-wrap">
              <EmailCard onImported={() => setEmailImported(true)} initialEmail={connectedEmail} />
              <WhatsAppCard />
              <TelegramCard onImported={() => setTelegramImported(true)} />
              <SlackCard onImported={() => setSlackImported(true)} />
              <TeamsCard onImported={() => setTeamsImported(true)} />
              <ViberCard onImported={() => setViberImported(true)} />
              <WeChatCard onImported={() => setWechatImported(true)} />
              <SignalCard onImported={() => setSignalImported(true)} />
              <GoogleChatCard onImported={() => setGoogleChatImported(true)} />
              <LineCard onImported={() => setLineImported(true)} />
            </div>
          </div>
        )}

        {tab === 'draft' && (
          <DraftView
            emailImported={
              emailImported || telegramImported || slackImported || teamsImported || viberImported || wechatImported || signalImported || googleChatImported || lineImported
            }
          />
        )}
      </main>
    </div>
  )
}
