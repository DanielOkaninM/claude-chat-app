import { useState, useEffect, useRef, useMemo } from 'react'
import { useTerminalStore, AVAILABLE_MODELS } from '../stores/chatStore'
import { formatRelativeTime } from '../utils/time'

function getModelShortName(modelId: string): string {
  if (modelId.includes('opus')) return 'Opus'
  if (modelId.includes('haiku')) return 'Haiku'
  return 'Sonnet'
}

function getModelColor(modelId: string): string {
  if (modelId.includes('opus')) return 'text-purple-400 bg-purple-400/10'
  if (modelId.includes('haiku')) return 'text-green-400 bg-green-400/10'
  return 'text-blue-400 bg-blue-400/10'
}

function getDirShortName(dir: string): string {
  return dir.split('/').pop() || dir
}

function ModelSelector() {
  const { selectedModel, setSelectedModel } = useTerminalStore()
  const [open, setOpen] = useState(false)

  const current = AVAILABLE_MODELS.find((m) => m.id === selectedModel) || AVAILABLE_MODELS[0]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-left flex items-center justify-between hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-white font-medium">{current.label}</span>
          <span className="text-[11px] text-slate-500">{current.description}</span>
        </div>
        <svg className={`w-3 h-3 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 bg-slate-800 border border-slate-700/50 rounded-lg overflow-hidden z-50 shadow-xl">
            {AVAILABLE_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => { setSelectedModel(model.id); setOpen(false) }}
                className={`w-full px-3 py-2 text-left hover:bg-slate-700/50 transition-colors flex items-center justify-between ${
                  selectedModel === model.id ? 'bg-slate-700/30' : ''
                }`}
              >
                <div>
                  <div className="text-xs text-white font-medium">{model.label}</div>
                  <div className="text-[11px] text-slate-500">{model.description}</div>
                </div>
                {selectedModel === model.id && (
                  <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ConfirmDeleteDialog({ title, onConfirm, onCancel }: { title: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[90]" onClick={onCancel} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] p-6 bg-slate-800 border border-slate-700/50 rounded-xl shadow-2xl z-[91]">
        <h3 className="text-[15px] font-semibold text-white mb-3">Delete chat?</h3>
        <p className="text-[13px] text-slate-400 mb-6 leading-relaxed">
          Are you sure you want to delete <span className="text-white font-medium">"{title}"</span>? This cannot be undone.
        </p>
        <div className="flex gap-2.5 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-[13px] text-slate-300 bg-transparent cursor-pointer hover:bg-slate-700 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-[13px] text-white bg-red-600 cursor-pointer hover:bg-red-500 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </>
  )
}

export function Sidebar() {
  const {
    terminals, activeTerminalId, connectedTerminals, unreadTerminals, typingTerminals,
    setActiveTerminal, createTerminal, createTerminalInDir, deleteTerminal, renameTerminal,
    searchQuery, setSearchQuery, sidebarWidth, setSidebarWidth
  } = useTerminalStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [branches, setBranches] = useState<Record<string, string | null>>({})
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    const fetchBranches = async () => {
      const result: Record<string, string | null> = {}
      for (const t of terminals) {
        if (t.workingDirectory) {
          result[t.id] = await window.api.gitBranch(t.workingDirectory)
        }
      }
      setBranches(result)
    }
    fetchBranches()
    const interval = setInterval(fetchBranches, 5000)
    return () => clearInterval(interval)
  }, [terminals.map((t) => t.id).join(',')])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return
      const delta = e.clientX - resizeRef.current.startX
      setSidebarWidth(resizeRef.current.startWidth + delta)
    }
    const handleMouseUp = () => {
      resizeRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [setSidebarWidth])

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id)
    setEditTitle(currentTitle)
  }

  const finishRename = (id: string) => {
    if (editTitle.trim()) renameTerminal(id, editTitle.trim())
    setEditingId(null)
  }

  const filtered = useMemo(() => {
    if (!searchQuery) return terminals
    const q = searchQuery.toLowerCase()
    return terminals.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.workingDirectory.toLowerCase().includes(q) ||
        (branches[t.id] || '').toLowerCase().includes(q)
    )
  }, [terminals, searchQuery, branches])

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filtered>()
    for (const t of filtered) {
      const dir = t.workingDirectory
      if (!groups.has(dir)) groups.set(dir, [])
      groups.get(dir)!.push(t)
    }
    return groups
  }, [filtered])

  const deleteTarget = confirmDeleteId ? terminals.find((t) => t.id === confirmDeleteId) : null

  return (
    <>
      {confirmDeleteId && deleteTarget && (
        <ConfirmDeleteDialog
          title={deleteTarget.title}
          onConfirm={() => { deleteTerminal(confirmDeleteId); setConfirmDeleteId(null) }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      <div className="bg-slate-900 border-r border-slate-700/50 flex flex-col h-full shrink-0 relative" style={{ width: sidebarWidth }}>
        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors z-10"
          onMouseDown={(e) => {
            resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth }
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
          }}
        />

        {/* Traffic light spacer */}
        <div className="h-12 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

        {/* Header */}
        <div className="px-3 pb-5 border-b border-slate-700/30">
          {/* App title */}
          <div className="flex items-center gap-2 mb-5 pl-0.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3" />
              </svg>
            </div>
            <h1 className="text-base font-semibold text-white tracking-tight">Claude</h1>
          </div>

          {/* Search */}
          <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-lg bg-slate-800/50 border border-slate-700/30">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" className="shrink-0">
              <circle cx="6" cy="6" r="4.5" />
              <line x1="9.5" y1="9.5" x2="12.5" y2="12.5" />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="flex-1 bg-transparent text-xs text-white outline-none min-w-0 border-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-500 hover:text-slate-300 shrink-0"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Model selector row */}
          <div className="mb-5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5 pl-0.5">Default model</div>
            <ModelSelector />
          </div>

          {/* New Chat button */}
          <button
            onClick={createTerminal}
            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
            title="New Chat (⌘N)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto px-3 py-1.5">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center">
              {searchQuery ? (
                <p className="text-[11px] text-slate-500">No matching chats</p>
              ) : (
                <>
                  <svg className="w-8 h-8 mx-auto text-slate-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  <p className="text-[11px] text-slate-500">No chats yet</p>
                </>
              )}
            </div>
          )}

          {Array.from(grouped.entries()).map(([dir, chats]) => {
            const isCollapsed = collapsedGroups.has(dir)
            const showGroupHeader = grouped.size > 1

            return (
              <div key={dir}>
                {showGroupHeader && (
                  <button
                    onClick={() => {
                      setCollapsedGroups((prev) => {
                        const next = new Set(prev)
                        if (next.has(dir)) next.delete(dir)
                        else next.add(dir)
                        return next
                      })
                    }}
                    className="w-full py-2 flex items-center gap-2 text-left hover:bg-slate-800/30 transition-colors"
                  >
                    <svg
                      className={`w-2.5 h-2.5 text-slate-500 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                    <span className="text-sm text-slate-200 font-semibold truncate">{getDirShortName(dir)}</span>
                    <span className="text-xs text-slate-500 ml-auto shrink-0 bg-slate-800 px-1.5 py-0.5 rounded-full font-medium">{chats.length}</span>
                  </button>
                )}

                {!isCollapsed && chats.map((t) => {
                  const isActive = activeTerminalId === t.id
                  const isConnected = connectedTerminals.has(t.id)
                  const isUnread = unreadTerminals.has(t.id)
                  const isTyping = typingTerminals.has(t.id)
                  return (
                    <div
                      key={t.id}
                      onClick={() => setActiveTerminal(t.id)}
                      className={`group mb-0.5 px-2.5 py-2 cursor-pointer flex gap-2.5 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-slate-700/60 shadow-sm'
                          : 'hover:bg-slate-800/50'
                      }`}
                    >
                      {/* Status dot */}
                      <div className="relative shrink-0 mt-1">
                        <div className={`w-2 h-2 rounded-full ${isTyping ? 'bg-blue-400 animate-pulse' : isConnected ? 'bg-green-400' : 'bg-slate-600'}`} />
                        {isUnread && !isTyping && (
                          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        {editingId === t.id ? (
                          <input
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={() => finishRename(t.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') finishRename(t.id)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            className="w-full bg-slate-800 text-[11px] text-white px-1.5 py-0.5 rounded outline-none border border-blue-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            {/* Title */}
                            <div
                              className={`text-sm leading-tight truncate ${isUnread ? 'text-white font-semibold' : 'text-slate-200'}`}
                              onDoubleClick={(e) => { e.stopPropagation(); startRename(t.id, t.title) }}
                            >
                              {t.title}
                            </div>

                            {/* Typing indicator */}
                            {isTyping && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <div className="flex items-center gap-0.5">
                                  <div className="w-1 h-1 rounded-full bg-blue-400 typing-dot" style={{ animationDelay: '0ms' }} />
                                  <div className="w-1 h-1 rounded-full bg-blue-400 typing-dot" style={{ animationDelay: '150ms' }} />
                                  <div className="w-1 h-1 rounded-full bg-blue-400 typing-dot" style={{ animationDelay: '300ms' }} />
                                </div>
                                <span className="text-[10px] text-blue-400">Responding</span>
                              </div>
                            )}

                            {/* Unread indicator */}
                            {isUnread && !isTyping && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                                <span className="text-[10px] text-blue-400 font-medium">New activity</span>
                              </div>
                            )}

                            {/* Model + time */}
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md ${getModelColor(t.model)}`}>
                                {getModelShortName(t.model)}
                              </span>
                              <span className="text-[11px] text-slate-600">{formatRelativeTime(t.updatedAt)}</span>
                            </div>

                            {/* Directory + branch row */}
                            <div className="flex items-center gap-2 mt-1">
                              {grouped.size <= 1 && (
                                <div className="flex items-center gap-1 min-w-0">
                                  <svg className="w-2.5 h-2.5 text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                                  </svg>
                                  <span className="text-[11px] text-slate-600 truncate">{getDirShortName(t.workingDirectory)}</span>
                                </div>
                              )}
                              {branches[t.id] && (
                                <div className="flex items-center gap-1 min-w-0">
                                  <svg className="w-2.5 h-2.5 text-orange-400/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.564a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.25 8.81" />
                                  </svg>
                                  <span className="text-[11px] text-orange-400/70 truncate">{branches[t.id]}</span>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5">
                        {/* New chat in same dir */}
                        <button
                          onClick={(e) => { e.stopPropagation(); createTerminalInDir(t.workingDirectory) }}
                          className="w-5 h-5 rounded-md text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 flex items-center justify-center transition-colors"
                          title="New chat in same directory"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                        </button>
                        {/* Delete button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(t.id) }}
                          className="w-5 h-5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-400/10 flex items-center justify-center transition-colors"
                          title="Delete chat"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-slate-700/30 flex items-center gap-3">
          <div className="flex items-center gap-1">
            <kbd className="text-[9px] text-slate-500 bg-slate-800/80 px-1 py-0.5 rounded font-mono">⌘K</kbd>
            <span className="text-[9px] text-slate-600">Commands</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="text-[9px] text-slate-500 bg-slate-800/80 px-1 py-0.5 rounded font-mono">⌘N</kbd>
            <span className="text-[9px] text-slate-600">New</span>
          </div>
        </div>
      </div>
    </>
  )
}
