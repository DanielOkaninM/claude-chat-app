import { useState, useEffect, useRef, useMemo } from 'react'
import { useTerminalStore, AVAILABLE_MODELS } from '../stores/chatStore'
import { exportTerminalContent } from './Terminal'

interface Command {
  id: string
  label: string
  description?: string
  icon: 'chat' | 'model' | 'export' | 'search' | 'close' | 'files'
  action: () => void
}

export function CommandPalette() {
  const { showCommandPalette, setShowCommandPalette, terminals, activeTerminalId, createTerminal, deleteTerminal, setActiveTerminal } = useTerminalStore()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      {
        id: 'new-chat',
        label: 'New Chat',
        description: 'Open a new Claude chat (Cmd+N)',
        icon: 'chat',
        action: () => { setShowCommandPalette(false); createTerminal() }
      }
    ]

    // Switch to chat commands
    terminals.forEach((t, i) => {
      cmds.push({
        id: `switch-${t.id}`,
        label: `Switch to: ${t.title}`,
        description: `${t.workingDirectory} (Cmd+${i + 1})`,
        icon: 'chat',
        action: () => { setShowCommandPalette(false); setActiveTerminal(t.id) }
      })
    })

    // Model switch commands
    if (activeTerminalId) {
      AVAILABLE_MODELS.forEach((model) => {
        cmds.push({
          id: `model-${model.id}`,
          label: `Switch model: ${model.label}`,
          description: model.description,
          icon: 'model',
          action: () => {
            setShowCommandPalette(false)
            window.api.writeTerminal(activeTerminalId, `/model ${model.id}\r`)
            useTerminalStore.getState().updateModel(activeTerminalId, model.id)
          }
        })
      })
    }

    // Export current chat
    if (activeTerminalId) {
      cmds.push({
        id: 'export',
        label: 'Export current chat',
        description: 'Copy terminal content to clipboard',
        icon: 'export',
        action: () => {
          setShowCommandPalette(false)
          const content = exportTerminalContent(activeTerminalId)
          if (content) {
            navigator.clipboard.writeText(content)
          }
        }
      })
    }

    // Close current chat
    if (activeTerminalId) {
      cmds.push({
        id: 'close-chat',
        label: 'Close current chat',
        description: 'Close the active chat',
        icon: 'close',
        action: () => { setShowCommandPalette(false); deleteTerminal(activeTerminalId) }
      })
    }

    return cmds
  }, [terminals, activeTerminalId, createTerminal, deleteTerminal, setActiveTerminal, setShowCommandPalette])

  const filtered = useMemo(() => {
    if (!query) return commands
    const q = query.toLowerCase()
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)
    )
  }, [commands, query])

  useEffect(() => {
    if (showCommandPalette) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [showCommandPalette])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  if (!showCommandPalette) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowCommandPalette(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].action()
    }
  }

  const getIcon = (type: Command['icon']) => {
    switch (type) {
      case 'chat':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        )
      case 'model':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )
      case 'export':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        )
      case 'close':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      default:
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        )
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[100]" onClick={() => setShowCommandPalette(false)} />
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-[520px] bg-slate-800 border border-slate-700/50 rounded-xl shadow-2xl z-[101] overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50">
          <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder-slate-500"
          />
          <kbd className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">ESC</kbd>
        </div>
        <div className="max-h-[300px] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-500">No matching commands</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={cmd.action}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${
                i === selectedIndex ? 'bg-blue-600/20 text-white' : 'text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              <span className={`shrink-0 ${i === selectedIndex ? 'text-blue-400' : 'text-slate-500'}`}>
                {getIcon(cmd.icon)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{cmd.label}</div>
                {cmd.description && (
                  <div className="text-[11px] text-slate-500 truncate">{cmd.description}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
