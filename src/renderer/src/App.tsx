import { useEffect, useState, useRef, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { TerminalView, setupTerminalDataHandler } from './components/Terminal'
import { PlanView } from './components/PlanView'
import { ChangedFilesPanel } from './components/ChangedFiles'
import { CommandPalette } from './components/CommandPalette'
import { VoiceInput } from './components/VoiceInput'
import { DiffWindow } from './components/DiffWindow'
import { useTerminalStore, AVAILABLE_MODELS } from './stores/chatStore'

// If loaded with #/diff hash, render the diff window instead
if (window.location.hash === '#/diff') {
  // Will be handled by the isDiffWindow check below
}


function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const handleEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setShow(true), 400)
  }, [])

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setShow(false)
  }, [])

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {show && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-700 text-slate-200 text-[11px] rounded shadow-lg whitespace-nowrap z-50 pointer-events-none">
          {label}
        </div>
      )}
    </div>
  )
}

function getModelColor(modelId: string): string {
  if (modelId.includes('opus')) return 'text-purple-400 bg-purple-400/15 border-purple-400/30'
  if (modelId.includes('haiku')) return 'text-green-400 bg-green-400/15 border-green-400/30'
  return 'text-blue-400 bg-blue-400/15 border-blue-400/30'
}

function getModelShortName(modelId: string): string {
  if (modelId.includes('opus')) return 'Opus'
  if (modelId.includes('haiku')) return 'Haiku'
  return 'Sonnet'
}

function getContextLimit(modelId: string): number {
  if (modelId.includes('haiku')) return 200000
  return 1000000
}

function formatTokens(n: number): string {
  return n >= 1000000 ? `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M` : `${Math.round(n / 1000)}K`
}

function ContextUsage() {
  const { activeTerminalId, terminals } = useTerminalStore()
  const [usage, setUsage] = useState<{ contextUsed: number; model?: string } | null>(null)

  const activeTerminal = terminals.find((t) => t.id === activeTerminalId)

  useEffect(() => {
    if (!activeTerminal) return
    let stale = false
    setUsage(null)

    const fetchUsage = () => {
      window.api.getContextUsage(activeTerminal.sessionId, activeTerminal.workingDirectory).then((data) => {
        if (!stale && data) setUsage({ contextUsed: data.contextUsed, model: data.model ?? undefined })
      }).catch(() => {})
    }

    fetchUsage()
    const interval = setInterval(fetchUsage, 5000)
    return () => { stale = true; clearInterval(interval) }
  }, [activeTerminal?.id])

  if (!activeTerminal || !usage) return null

  const model = usage.model || activeTerminal.model
  const limit = getContextLimit(model)
  const percent = Math.min(100, Math.round((usage.contextUsed / limit) * 100))

  let color = 'bg-blue-500'
  if (percent > 80) color = 'bg-red-500'
  else if (percent > 50) color = 'bg-yellow-500'

  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-500" title={`Context: ${formatTokens(usage.contextUsed)} / ${formatTokens(limit)} tokens (${percent}%)`}>
      <span>{formatTokens(usage.contextUsed)} / {formatTokens(limit)}</span>
      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function ActiveModelSwitcher() {
  const { activeTerminalId, terminals } = useTerminalStore()
  const [open, setOpen] = useState(false)

  const activeTerminal = terminals.find((t) => t.id === activeTerminalId)
  if (!activeTerminal) return null

  const switchModel = (modelId: string) => {
    window.api.writeTerminal(activeTerminal.id, `/model ${modelId}\r`)
    useTerminalStore.getState().updateModel(activeTerminal.id, modelId)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${getModelColor(activeTerminal.model)}`}
      >
        {getModelShortName(activeTerminal.model)}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700/50 rounded-lg overflow-hidden z-50 shadow-xl w-48">
            <div className="px-3 py-1.5 text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-700/30">
              Switch model
            </div>
            {AVAILABLE_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => switchModel(model.id)}
                className={`w-full px-3 py-2 text-left hover:bg-slate-700 transition-colors flex items-center justify-between ${
                  activeTerminal.model === model.id ? 'bg-slate-700/50' : ''
                }`}
              >
                <div>
                  <div className="text-xs text-white font-medium">{model.label}</div>
                  <div className="text-[10px] text-slate-500">{model.description}</div>
                </div>
                {activeTerminal.model === model.id && (
                  <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

function TerminalArea({ showFiles, onToggleFiles }: { showFiles: boolean; onToggleFiles: () => void }) {
  const { terminals, activeTerminalId, createTerminal, showPlanView, setShowPlanView } = useTerminalStore()

  if (terminals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0f172a]">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-400 mb-2">Start a new chat</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Each chat runs Claude in your project directory with full capabilities.
          </p>
          <button
            onClick={createTerminal}
            className="mt-5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            New Chat
          </button>
          <div className="mt-4 flex items-center justify-center gap-4">
            <div className="flex items-center gap-1">
              <kbd className="text-[10px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">⌘N</kbd>
              <span className="text-[10px] text-slate-600">New Chat</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="text-[10px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">⌘K</kbd>
              <span className="text-[10px] text-slate-600">Commands</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0f172a]">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-[#0d1526] shrink-0 pt-7" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex-1 min-w-0 px-3 py-2">
          <h1 className="text-sm font-medium text-slate-300">
            {terminals.find((t) => t.id === activeTerminalId)?.title || ''}
          </h1>
        </div>
        <div className="flex items-center gap-3 px-3 py-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <ContextUsage />
          <ActiveModelSwitcher />
          <Tooltip label="Plans">
            <button
              onClick={() => setShowPlanView(!showPlanView)}
              className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
                showPlanView ? 'bg-purple-500/20 text-purple-400' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip label="Changed Files">
            <button
              onClick={onToggleFiles}
              className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
                showFiles ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Terminal views */}
      <div className="flex-1 relative">
        {terminals.map((t) => (
          <div
            key={t.id}
            className="absolute inset-0"
            style={{ display: activeTerminalId === t.id ? 'block' : 'none' }}
          >
            <TerminalView
              terminalId={t.id}
              isActive={activeTerminalId === t.id}
            />
          </div>
        ))}
        {showPlanView && (
          <div className="absolute inset-0 z-10">
            <PlanView />
          </div>
        )}
      </div>
    </div>
  )
}

function ResizableFilesPanel({ showFiles, onToggleFiles }: { showFiles: boolean; onToggleFiles: () => void }) {
  const { filesPanelWidth, setFilesPanelWidth } = useTerminalStore()
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return
      const delta = resizeRef.current.startX - e.clientX
      setFilesPanelWidth(resizeRef.current.startWidth + delta)
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
  }, [setFilesPanelWidth])

  if (!showFiles) {
    return <ChangedFilesPanel isOpen={false} onToggle={onToggleFiles} />
  }

  return (
    <div className="relative shrink-0 flex" style={{ width: filesPanelWidth }}>
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-10"
        onMouseDown={(e) => {
          resizeRef.current = { startX: e.clientX, startWidth: filesPanelWidth }
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
        }}
      />
      <div className="flex-1">
        <ChangedFilesPanel isOpen={true} onToggle={onToggleFiles} />
      </div>
    </div>
  )
}

function App() {
  const {
    loadTerminals, createTerminal, markDisconnected,
    updateTitle, updateSessionId, activeTerminalId, terminals, setShowCommandPalette, switchToIndex
  } = useTerminalStore()
  const [showFiles, setShowFiles] = useState(false)

  useEffect(() => {
    loadTerminals()

    const unsubData = setupTerminalDataHandler()

    const unsubExit = window.api.onTerminalExit((id) => {
      markDisconnected(id)
    })

    const unsubTitle = window.api.onTerminalTitleUpdated((id, title) => {
      updateTitle(id, title)
    })

    const unsubSessionId = window.api.onSessionIdUpdated((id, sessionId) => {
      updateSessionId(id, sessionId)
    })

    const unsubShortcut = window.api.onNewTerminalShortcut(createTerminal)

    // Cmd+K — command palette
    const unsubPalette = window.api.onCommandPaletteShortcut(() => {
      const { showCommandPalette } = useTerminalStore.getState()
      setShowCommandPalette(!showCommandPalette)
    })

    // Cmd+1-9 — switch chats
    const unsubSwitch = window.api.onSwitchChatShortcut((index) => {
      switchToIndex(index)
    })

    return () => {
      unsubData()
      unsubExit()
      unsubTitle()
      unsubSessionId()
      unsubShortcut()
      unsubPalette()
      unsubSwitch()
    }
  }, [])

  // Update window title when active terminal changes
  useEffect(() => {
    if (activeTerminalId) {
      const terminal = terminals.find((t) => t.id === activeTerminalId)
      if (terminal) {
        window.api.setWindowTitle(terminal.title)
      }
    } else {
      window.api.setWindowTitle('Claude')
    }
  }, [activeTerminalId, terminals])

  return (
    <div className="flex h-screen bg-slate-900 text-white">
      <Sidebar />
      <TerminalArea showFiles={showFiles} onToggleFiles={() => setShowFiles(!showFiles)} />
      <ResizableFilesPanel showFiles={showFiles} onToggleFiles={() => setShowFiles(!showFiles)} />
      <CommandPalette />
      <VoiceInput />
    </div>
  )
}

function Root() {
  if (window.location.hash === '#/diff') {
    return <DiffWindow />
  }
  return <App />
}

export default Root
