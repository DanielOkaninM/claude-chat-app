import { create } from 'zustand'

export const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', description: 'Fast & capable' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', description: 'Most intelligent' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', description: 'Fastest' }
]

export const DEFAULT_MODEL = 'claude-opus-4-6'

interface TerminalSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  workingDirectory: string
  model: string
  sessionId: string
}

interface TerminalState {
  terminals: TerminalSession[]
  activeTerminalId: string | null
  connectedTerminals: Set<string>
  unreadTerminals: Set<string>
  typingTerminals: Set<string>
  recentlyReconnected: Set<string>
  selectedModel: string
  searchQuery: string
  sidebarWidth: number
  filesPanelWidth: number
  showCommandPalette: boolean
  showPlanView: boolean

  loadTerminals: () => Promise<void>
  setActiveTerminal: (id: string) => void
  createTerminal: () => Promise<void>
  createTerminalInDir: (dir: string) => Promise<void>
  deleteTerminal: (id: string) => Promise<void>
  renameTerminal: (id: string, title: string) => Promise<void>
  markConnected: (id: string) => void
  markDisconnected: (id: string) => void
  markUnread: (id: string) => void
  clearUnread: (id: string) => void
  markTyping: (id: string) => void
  clearTyping: (id: string) => void
  updateTitle: (id: string, title: string) => void
  updateSessionId: (id: string, sessionId: string) => void
  setSelectedModel: (model: string) => void
  updateModel: (id: string, model: string) => void
  setSearchQuery: (query: string) => void
  setSidebarWidth: (width: number) => void
  setFilesPanelWidth: (width: number) => void
  setShowCommandPalette: (show: boolean) => void
  setShowPlanView: (show: boolean) => void
  switchToIndex: (index: number) => void
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: [],
  activeTerminalId: null,
  connectedTerminals: new Set(),
  unreadTerminals: new Set(),
  typingTerminals: new Set(),
  recentlyReconnected: new Set(),
  selectedModel: DEFAULT_MODEL,
  searchQuery: '',
  sidebarWidth: 256,
  filesPanelWidth: 288,
  showCommandPalette: false,
  showPlanView: false,

  loadTerminals: async () => {
    const terminals = await window.api.listTerminals()
    terminals.sort((a: TerminalSession, b: TerminalSession) => b.updatedAt - a.updatedAt)
    set({ terminals })
  },

  setActiveTerminal: (id: string) => {
    const state = get()
    const unread = new Set(state.unreadTerminals)
    unread.delete(id)
    const typing = new Set(state.typingTerminals)
    typing.delete(id)
    set({ activeTerminalId: id, unreadTerminals: unread, typingTerminals: typing })
    // Update window title
    const terminal = state.terminals.find((t) => t.id === id)
    if (terminal) {
      window.api.setWindowTitle(terminal.title)
    }
    // Auto-reconnect if not connected
    if (!state.connectedTerminals.has(id)) {
      // Suppress notifications during startup output
      const rc = new Set(get().recentlyReconnected)
      rc.add(id)
      set({ recentlyReconnected: rc })
      setTimeout(() => {
        const rc2 = new Set(get().recentlyReconnected)
        rc2.delete(id)
        set({ recentlyReconnected: rc2 })
      }, 5000)

      window.api.reconnectTerminal(id).then((ok: boolean) => {
        if (ok) {
          const connected = new Set(get().connectedTerminals)
          connected.add(id)
          set({ connectedTerminals: connected })
        }
      })
    }
  },

  createTerminal: async () => {
    const dir = await window.api.selectDirectory()
    if (!dir) return
    const { selectedModel } = get()
    const terminal = await window.api.createTerminal(dir, selectedModel)
    set((state) => ({
      terminals: [terminal, ...state.terminals],
      activeTerminalId: terminal.id,
      connectedTerminals: new Set([...state.connectedTerminals, terminal.id])
    }))
    window.api.setWindowTitle(terminal.title)
  },

  createTerminalInDir: async (dir: string) => {
    const { selectedModel } = get()
    const terminal = await window.api.createTerminal(dir, selectedModel)
    set((state) => ({
      terminals: [terminal, ...state.terminals],
      activeTerminalId: terminal.id,
      connectedTerminals: new Set([...state.connectedTerminals, terminal.id])
    }))
    window.api.setWindowTitle(terminal.title)
  },

  deleteTerminal: async (id: string) => {
    await window.api.deleteTerminal(id)
    set((state) => {
      const terminals = state.terminals.filter((t) => t.id !== id)
      const connected = new Set(state.connectedTerminals)
      connected.delete(id)
      const unread = new Set(state.unreadTerminals)
      unread.delete(id)
      const typing = new Set(state.typingTerminals)
      typing.delete(id)
      const newActiveId =
        state.activeTerminalId === id
          ? terminals.length > 0
            ? terminals[0].id
            : null
          : state.activeTerminalId
      return { terminals, activeTerminalId: newActiveId, connectedTerminals: connected, unreadTerminals: unread, typingTerminals: typing }
    })
  },

  renameTerminal: async (id: string, title: string) => {
    await window.api.renameTerminal(id, title)
    set((state) => ({
      terminals: state.terminals.map((t) => (t.id === id ? { ...t, title } : t))
    }))
  },

  markConnected: (id: string) => {
    set((state) => {
      const connected = new Set(state.connectedTerminals)
      connected.add(id)
      return { connectedTerminals: connected }
    })
  },

  markDisconnected: (id: string) => {
    set((state) => {
      const connected = new Set(state.connectedTerminals)
      connected.delete(id)
      const typing = new Set(state.typingTerminals)
      typing.delete(id)
      return { connectedTerminals: connected, typingTerminals: typing }
    })
  },

  markUnread: (id: string) => {
    const state = get()
    if (state.activeTerminalId === id) return
    set((s) => {
      const unread = new Set(s.unreadTerminals)
      unread.add(id)
      return { unreadTerminals: unread }
    })
  },

  clearUnread: (id: string) => {
    set((state) => {
      const unread = new Set(state.unreadTerminals)
      unread.delete(id)
      return { unreadTerminals: unread }
    })
  },

  markTyping: (id: string) => {
    set((state) => {
      if (state.typingTerminals.has(id)) return state
      const typing = new Set(state.typingTerminals)
      typing.add(id)
      return { typingTerminals: typing }
    })
  },

  clearTyping: (id: string) => {
    set((state) => {
      if (!state.typingTerminals.has(id)) return state
      const typing = new Set(state.typingTerminals)
      typing.delete(id)
      return { typingTerminals: typing }
    })
  },

  updateTitle: (id: string, title: string) => {
    set((state) => {
      const updated = state.terminals.map((t) => (t.id === id ? { ...t, title } : t))
      if (state.activeTerminalId === id) {
        window.api.setWindowTitle(title)
      }
      return { terminals: updated }
    })
  },

  updateSessionId: (id: string, sessionId: string) => {
    set((state) => ({
      terminals: state.terminals.map((t) => (t.id === id ? { ...t, sessionId } : t))
    }))
  },

  setSelectedModel: (model: string) => {
    set({ selectedModel: model })
  },

  updateModel: (id: string, model: string) => {
    set((state) => ({
      terminals: state.terminals.map((t) => (t.id === id ? { ...t, model } : t))
    }))
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query })
  },

  setSidebarWidth: (width: number) => {
    set({ sidebarWidth: Math.max(200, Math.min(400, width)) })
  },

  setFilesPanelWidth: (width: number) => {
    set({ filesPanelWidth: Math.max(200, Math.min(500, width)) })
  },

  setShowCommandPalette: (show: boolean) => {
    set({ showCommandPalette: show })
  },

  setShowPlanView: (show: boolean) => {
    set({ showPlanView: show })
  },

  switchToIndex: (index: number) => {
    const { terminals } = get()
    if (index >= 0 && index < terminals.length) {
      const id = terminals[index].id
      get().setActiveTerminal(id)
    }
  }
}))
