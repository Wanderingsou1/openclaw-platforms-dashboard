export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-300">
      <div className="text-center space-y-2">
        <p className="text-sm font-semibold text-white">Page not found</p>
        <p className="text-xs text-zinc-500">The route you requested does not exist.</p>
      </div>
    </div>
  )
}
