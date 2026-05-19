'use client'

export default function WhatsAppCard() {
  return (
    <div className="bg-zinc-900 border border-green-500/40 border-l-4 rounded-xl p-6 w-72 flex flex-col gap-4">
      {/* Icon + Title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center text-xl">
          💬
        </div>
        <div>
          <p className="text-white font-semibold text-sm">WhatsApp</p>
          <p className="text-zinc-500 text-xs">wacli gateway</p>
        </div>
        <span className="ml-auto w-2 h-2 rounded-full bg-green-500"></span>
      </div>

      {/* Status */}
      <div className="text-xs text-zinc-400 bg-zinc-800 rounded-md px-3 py-2 space-y-1">
        <p>Connected via <span className="text-green-400">openclaw gateway</span></p>
        <p>Port <span className="text-white">18789</span></p>
        <p className="text-zinc-500 pt-1">Run <code className="text-zinc-300">wacli chats list</code> to fetch messages</p>
      </div>

      {/* Info */}
      <div className="mt-auto text-xs text-zinc-500 leading-relaxed">
        WhatsApp drafts and approvals are managed through the openclaw CLI agent. Language mirroring (Hinglish / Hindi / English) is active.
      </div>
    </div>
  )
}
