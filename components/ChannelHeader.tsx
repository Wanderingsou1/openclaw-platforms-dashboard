'use client'

export default function ChannelHeader() {
  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800 bg-zinc-900">
      <span className="text-zinc-500 text-lg font-medium">#</span>
      <h1 className="text-white font-semibold text-base tracking-tight">openclaw</h1>
      <div className="ml-auto flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500"></span>
        <span className="text-zinc-400 text-sm">active</span>
      </div>
    </div>
  )
}
