import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  createTerminal: (workingDirectory: string, model?: string) =>
    ipcRenderer.invoke('terminal:create', workingDirectory, model),
  listTerminals: () => ipcRenderer.invoke('terminal:list'),
  deleteTerminal: (id: string) => ipcRenderer.invoke('terminal:delete', id),
  renameTerminal: (id: string, title: string) =>
    ipcRenderer.invoke('terminal:rename', id, title),
  reconnectTerminal: (id: string) => ipcRenderer.invoke('terminal:reconnect', id),
  writeTerminal: (id: string, data: string) =>
    ipcRenderer.send('terminal:write', id, data),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('terminal:resize', id, cols, rows),
  setWindowTitle: (title: string) =>
    ipcRenderer.send('window:set-title', title),
  gitBranch: (cwd: string) => ipcRenderer.invoke('git:branch', cwd),
  gitStatus: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
  gitDiff: (cwd: string, filePath: string) => ipcRenderer.invoke('git:diff', cwd, filePath),
  openDiffWindow: (cwd: string, filePath: string) => ipcRenderer.invoke('diff:open', cwd, filePath),
  onDiffData: (callback: (data: { filePath: string; oldContent: string; newContent: string; cwd: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('diff:data', handler)
    return () => ipcRenderer.removeListener('diff:data', handler)
  },
  signalDiffReady: () => ipcRenderer.send('diff:ready'),
  getDiffData: () => ipcRenderer.invoke('diff:get-data'),
  switchDiffFile: (filePath: string) => ipcRenderer.invoke('diff:switch-file', filePath),
  getContextUsage: (sessionId: string, workingDirectory: string) =>
    ipcRenderer.invoke('session:context-usage', sessionId, workingDirectory),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  onTerminalData: (callback: (id: string, data: string) => void) => {
    const handler = (_event: any, id: string, data: string) => callback(id, data)
    ipcRenderer.on('terminal:data', handler)
    return () => ipcRenderer.removeListener('terminal:data', handler)
  },
  onTerminalExit: (callback: (id: string) => void) => {
    const handler = (_event: any, id: string) => callback(id)
    ipcRenderer.on('terminal:exit', handler)
    return () => ipcRenderer.removeListener('terminal:exit', handler)
  },
  onTerminalTitleUpdated: (callback: (id: string, title: string) => void) => {
    const handler = (_event: any, id: string, title: string) => callback(id, title)
    ipcRenderer.on('terminal:title-updated', handler)
    return () => ipcRenderer.removeListener('terminal:title-updated', handler)
  },
  onSessionIdUpdated: (callback: (id: string, sessionId: string) => void) => {
    const handler = (_event: any, id: string, sessionId: string) => callback(id, sessionId)
    ipcRenderer.on('terminal:session-id-updated', handler)
    return () => ipcRenderer.removeListener('terminal:session-id-updated', handler)
  },
  onNewTerminalShortcut: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:new-chat', handler)
    return () => ipcRenderer.removeListener('shortcut:new-chat', handler)
  },
  onCloseTerminalShortcut: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:close-chat', handler)
    return () => ipcRenderer.removeListener('shortcut:close-chat', handler)
  },
  onCommandPaletteShortcut: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:command-palette', handler)
    return () => ipcRenderer.removeListener('shortcut:command-palette', handler)
  },
  onSwitchChatShortcut: (callback: (index: number) => void) => {
    const handler = (_event: any, index: number) => callback(index)
    ipcRenderer.on('shortcut:switch-chat', handler)
    return () => ipcRenderer.removeListener('shortcut:switch-chat', handler)
  },
  getSessionPlan: (sessionId: string, workingDirectory: string) =>
    ipcRenderer.invoke('plans:get-session-plan', sessionId, workingDirectory),
  listPlans: () => ipcRenderer.invoke('plans:list'),
  readPlan: (name: string) => ipcRenderer.invoke('plans:read', name),
  voiceStart: () => ipcRenderer.invoke('voice:start'),
  voiceStop: () => ipcRenderer.invoke('voice:stop'),
  voiceCancel: () => ipcRenderer.invoke('voice:cancel'),
  onVoicePartial: (callback: (text: string) => void) => {
    const handler = (_event: any, text: string) => callback(text)
    ipcRenderer.on('voice:partial', handler)
    return () => ipcRenderer.removeListener('voice:partial', handler)
  },
  onVoiceFinal: (callback: (text: string) => void) => {
    const handler = (_event: any, text: string) => callback(text)
    ipcRenderer.on('voice:final', handler)
    return () => ipcRenderer.removeListener('voice:final', handler)
  },
  onVoiceError: (callback: (error: string) => void) => {
    const handler = (_event: any, error: string) => callback(error)
    ipcRenderer.on('voice:error', handler)
    return () => ipcRenderer.removeListener('voice:error', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('webUtils', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
})
