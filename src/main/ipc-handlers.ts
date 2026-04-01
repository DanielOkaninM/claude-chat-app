import { ipcMain, dialog, BrowserWindow } from 'electron'
import { execSync, spawn, ChildProcess } from 'child_process'
import { readFileSync, readdirSync, statSync, openSync, readSync, fstatSync, closeSync } from 'fs'
import { join, resolve, basename } from 'path'
import { homedir } from 'os'
import { is } from '@electron-toolkit/utils'
import { ChatStore } from './services/chat-store'
import { TerminalService } from './services/terminal-service'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const chatStore = new ChatStore()
  const terminalService = new TerminalService()

  // Auto-title: when terminal detects first user message, update DB + notify renderer
  terminalService.setTitleUpdateHandler((id, title) => {
    chatStore.updateTitle(id, title)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:title-updated', id, title)
    }
  })

  ipcMain.handle('terminal:create', (_event, workingDirectory: string, model?: string) => {
    const session = chatStore.createChat(workingDirectory, model)

    terminalService.createTerminal(
      session.id,
      workingDirectory,
      session.model,
      false,
      session.sessionId,
      (data) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:data', session.id, data)
        }
      },
      () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:exit', session.id)
        }
      }
    )

    return session
  })

  ipcMain.handle('terminal:list', () => {
    return chatStore.listChats()
  })

  ipcMain.handle('terminal:delete', (_event, id: string) => {
    terminalService.destroy(id)
    chatStore.deleteChat(id)
  })

  ipcMain.handle('terminal:rename', (_event, id: string, title: string) => {
    chatStore.updateTitle(id, title)
  })

  // Use ipcMain.on (not handle) for fire-and-forget writes — low latency
  ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    terminalService.write(id, data)
  })

  ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    terminalService.resize(id, cols, rows)
  })

  ipcMain.handle('terminal:reconnect', (_event, id: string) => {
    const session = chatStore.getChat(id)
    if (!session) return false

    terminalService.createTerminal(
      id,
      session.workingDirectory,
      session.model,
      true,
      session.sessionId,
      (data) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:data', id, data)
        }
      },
      () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:exit', id)
        }
      }
    )
    return true
  })

  ipcMain.handle('git:branch', (_event, cwd: string) => {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', {
        cwd,
        encoding: 'utf-8',
        timeout: 3000
      }).trim()
    } catch {
      return null
    }
  })

  ipcMain.handle('git:status', (_event, cwd: string) => {
    try {
      const output = execSync('git status --porcelain -uall', {
        cwd,
        encoding: 'utf-8',
        timeout: 5000
      }).trim()

      if (!output) return []

      return output.split('\n').filter(line => line.length > 3).map((line) => {
        const status = line.substring(0, 2)
        let filePath = line.substring(3)

        let type: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
        if (status === '??') type = 'untracked'
        else if (status.includes('D')) type = 'deleted'
        else if (status.includes('A')) type = 'added'
        else if (status.includes('R')) {
          type = 'renamed'
          const parts = filePath.split(' -> ')
          if (parts.length === 2) filePath = parts[1]
        }
        else type = 'modified'

        // Strip surrounding quotes (git quotes paths with special chars)
        if (filePath.startsWith('"') && filePath.endsWith('"')) {
          filePath = filePath.slice(1, -1)
        }

        return { status: status.trim(), filePath, type }
      })
    } catch {
      return []
    }
  })

  ipcMain.handle('git:diff', (_event, cwd: string, filePath: string) => {
    try {
      // Try staged diff first, then unstaged, then diff for untracked (show file content)
      let diff = ''
      try {
        diff = execSync(`git diff -- "${filePath}"`, { cwd, encoding: 'utf-8', timeout: 5000 })
      } catch { /* ignore */ }
      if (!diff) {
        try {
          diff = execSync(`git diff --cached -- "${filePath}"`, { cwd, encoding: 'utf-8', timeout: 5000 })
        } catch { /* ignore */ }
      }
      if (!diff) {
        try {
          diff = execSync(`git diff HEAD -- "${filePath}"`, { cwd, encoding: 'utf-8', timeout: 5000 })
        } catch { /* ignore */ }
      }
      return diff || null
    } catch {
      return null
    }
  })

  // Store pending diff data per window (keyed by webContents.id) to avoid race conditions
  const pendingDiffDataMap = new Map<number, { filePath: string; oldContent: string; newContent: string; cwd: string; allFiles: string[] }>()

  function getDiffContents(repoRoot: string, filePath: string): { oldContent: string; newContent: string } {
    let headContent = ''
    let indexContent = ''
    let diskContent = ''

    try {
      headContent = execSync(`git show HEAD:"${filePath}"`, { cwd: repoRoot, encoding: 'utf-8', timeout: 5000 })
    } catch (e) { console.error(`git show HEAD:"${filePath}" failed:`, e) }

    try {
      indexContent = execSync(`git show :"${filePath}"`, { cwd: repoRoot, encoding: 'utf-8', timeout: 5000 })
    } catch (e) { console.error(`git show :"${filePath}" failed:`, e) }

    try {
      diskContent = readFileSync(join(repoRoot, filePath), 'utf-8')
    } catch (e) { console.error(`readFileSync ${filePath} failed:`, e) }

    if (diskContent !== headContent) {
      return { oldContent: headContent, newContent: diskContent }
    } else if (indexContent !== headContent) {
      return { oldContent: headContent, newContent: indexContent }
    } else {
      return { oldContent: headContent, newContent: diskContent }
    }
  }

  ipcMain.handle('diff:open', async (_event, cwd: string, filePath: string) => {
    // Find the git repo root — git status paths are relative to this
    let repoRoot = cwd
    try {
      repoRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8', timeout: 5000 }).trim()
    } catch { /* fallback to cwd */ }

    // Get all changed files for file navigation
    let allFiles: string[] = []
    try {
      const output = execSync('git status --porcelain -uall', { cwd: repoRoot, encoding: 'utf-8', timeout: 5000 }).trim()
      if (output) {
        allFiles = output.split('\n').filter(line => line.length > 3).map(line => {
          let fp = line.substring(3)
          if (line.substring(0, 2).includes('R')) {
            const parts = fp.split(' -> ')
            if (parts.length === 2) fp = parts[1]
          }
          if (fp.startsWith('"') && fp.endsWith('"')) fp = fp.slice(1, -1)
          return fp
        })
      }
    } catch { /* ignore */ }

    const { oldContent, newContent } = getDiffContents(repoRoot, filePath)

    const diffWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: `Diff: ${filePath}`,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 16 },
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    const wcId = diffWindow.webContents.id
    pendingDiffDataMap.set(wcId, { filePath, oldContent, newContent, cwd, allFiles })

    diffWindow.on('closed', () => {
      pendingDiffDataMap.delete(wcId)
    })

    const url = is.dev && process.env['ELECTRON_RENDERER_URL']
      ? `${process.env['ELECTRON_RENDERER_URL']}#/diff`
      : `file://${join(__dirname, '../renderer/index.html')}#/diff`

    await diffWindow.loadURL(url)
  })

  ipcMain.handle('diff:switch-file', (event, filePath: string) => {
    const wcId = event.sender.id
    const existing = pendingDiffDataMap.get(wcId)
    if (!existing) return null

    let repoRoot = existing.cwd
    try {
      repoRoot = execSync('git rev-parse --show-toplevel', { cwd: existing.cwd, encoding: 'utf-8', timeout: 5000 }).trim()
    } catch { /* fallback */ }

    const { oldContent, newContent } = getDiffContents(repoRoot, filePath)
    const updated = { ...existing, filePath, oldContent, newContent }
    pendingDiffDataMap.set(wcId, updated)
    return updated
  })

  // Diff window calls this to get the data — keyed by sender's webContents.id
  ipcMain.handle('diff:get-data', (event) => {
    return pendingDiffDataMap.get(event.sender.id) ?? null
  })

  ipcMain.on('window:set-title', (_event, title: string) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.setTitle(title)
    }
  })

  ipcMain.handle('session:context-usage', (_event, sessionId: string, workingDirectory: string) => {
    try {
      const projectKey = workingDirectory.replace(/\//g, '-')
      const sessionFile = join(homedir(), '.claude', 'projects', projectKey, `${sessionId}.jsonl`)

      // Read only the last ~32KB of the file to find usage data efficiently
      let tail: string
      const fd = openSync(sessionFile, 'r')
      try {
        const stat = fstatSync(fd)
        const readSize = Math.min(stat.size, 32768)
        const buffer = Buffer.alloc(readSize)
        readSync(fd, buffer, 0, readSize, stat.size - readSize)
        tail = buffer.toString('utf-8')
      } finally {
        closeSync(fd)
      }

      const lines = tail.trim().split('\n')

      // Find the last message with usage data (read backwards)
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const data = JSON.parse(lines[i])
          const usage = data.message?.usage
          if (usage) {
            const contextUsed = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0)
            return { contextUsed, outputTokens: usage.output_tokens || 0, model: data.message?.model || null }
          }
        } catch { continue }
      }
      return null
    } catch {
      return null
    }
  })

  // Cache plan refs per session to avoid re-reading large JSONL files
  const planRefsCache = new Map<string, { size: number; refs: Set<string> }>()

  ipcMain.handle('plans:get-session-plan', (_event, sessionId: string, workingDirectory: string) => {
    try {
      const projectKey = workingDirectory.replace(/\//g, '-')
      const sessionFile = join(homedir(), '.claude', 'projects', projectKey, `${sessionId}.jsonl`)
      const plansDir = join(homedir(), '.claude', 'plans')

      const fileStat = statSync(sessionFile)
      const cached = planRefsCache.get(sessionFile)

      let planRefs: Set<string>
      if (cached && cached.size === fileStat.size) {
        planRefs = cached.refs
      } else {
        const content = readFileSync(sessionFile, 'utf-8')
        planRefs = new Set<string>()
        for (const line of content.split('\n')) {
          const matches = line.matchAll(/\.claude\/plans\/([a-z0-9-]+\.md)/g)
          for (const m of matches) {
            planRefs.add(m[1])
          }
        }
        planRefsCache.set(sessionFile, { size: fileStat.size, refs: planRefs })
      }

      if (planRefs.size === 0) return null

      let bestPlan: { name: string; content: string; modifiedAt: number } | null = null
      for (const name of planRefs) {
        try {
          const filePath = join(plansDir, name)
          const stat = statSync(filePath)
          const planContent = readFileSync(filePath, 'utf-8')
          if (!bestPlan || stat.mtimeMs > bestPlan.modifiedAt) {
            bestPlan = { name, content: planContent, modifiedAt: stat.mtimeMs }
          }
        } catch { /* plan file may have been deleted */ }
      }

      return bestPlan
    } catch {
      return null
    }
  })

  ipcMain.handle('plans:list', () => {
    try {
      const plansDir = join(homedir(), '.claude', 'plans')
      const files = readdirSync(plansDir).filter(f => f.endsWith('.md'))

      return files.map(name => {
        const filePath = join(plansDir, name)
        const stat = statSync(filePath)
        // Read only the first 512 bytes to extract the title
        const fd = openSync(filePath, 'r')
        const buf = Buffer.alloc(512)
        const bytesRead = readSync(fd, buf, 0, 512, 0)
        closeSync(fd)
        const head = buf.toString('utf-8', 0, bytesRead)
        const titleMatch = head.match(/^#\s+(.+)/m)
        return {
          name,
          title: titleMatch ? titleMatch[1] : name.replace('.md', ''),
          modifiedAt: stat.mtimeMs
        }
      }).sort((a, b) => b.modifiedAt - a.modifiedAt)
    } catch {
      return []
    }
  })

  ipcMain.handle('plans:read', (_event, name: string) => {
    try {
      const plansDir = join(homedir(), '.claude', 'plans')
      const safeName = basename(name)
      const filePath = resolve(plansDir, safeName)
      if (!filePath.startsWith(plansDir)) return null
      return readFileSync(filePath, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Voice transcription
  let transcribeProcess: ChildProcess | null = null
  const transcribeBinary = join(__dirname, '../../resources/transcribe')

  ipcMain.handle('voice:start', () => {
    if (transcribeProcess) return false

    transcribeProcess = spawn(transcribeBinary, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    transcribeProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        if (line.startsWith('PARTIAL:')) {
          mainWindow.webContents.send('voice:partial', line.slice(8))
        } else if (line.startsWith('FINAL:')) {
          mainWindow.webContents.send('voice:final', line.slice(6))
          transcribeProcess = null
        }
      }
    })

    transcribeProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim()
      if (msg.startsWith('ERROR:')) {
        mainWindow.webContents.send('voice:error', msg.slice(7))
      }
    })

    transcribeProcess.on('exit', () => {
      transcribeProcess = null
    })

    return true
  })

  ipcMain.handle('voice:stop', () => {
    if (transcribeProcess?.stdin) {
      transcribeProcess.stdin.write('STOP\n')
    }
  })

  ipcMain.handle('voice:cancel', () => {
    if (transcribeProcess) {
      transcribeProcess.kill()
      transcribeProcess = null
    }
  })

  // Cleanup on app quit
  mainWindow.on('closed', () => {
    if (transcribeProcess) {
      transcribeProcess.kill()
      transcribeProcess = null
    }
    terminalService.destroyAll()
  })
}
