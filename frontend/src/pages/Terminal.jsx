import { useState, useEffect, useRef } from 'react'
import { Play, Trash2 } from 'lucide-react'
import { hosts, commands } from '../services/api'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

function TerminalPage() {
  const [hostList, setHostList] = useState([])
  const [selectedHosts, setSelectedHosts] = useState([])
  const [command, setCommand] = useState('')
  const [executing, setExecuting] = useState(false)
  const [commandHistory, setCommandHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const terminalRef = useRef(null)
  const terminalInstance = useRef(null)

  useEffect(() => {
    fetchHosts()
    const term = initTerminal()
    
    return () => {
      if (term) {
        window.removeEventListener('resize', term.fitHandler)
        term.dispose()
      }
    }
  }, [])

  const fetchHosts = async () => {
    try {
      const res = await hosts.getAll()
      setHostList(res.data)
    } catch (error) {
      console.error('Failed to fetch hosts:', error)
    }
  }

  const initTerminal = () => {
    if (terminalRef.current && !terminalInstance.current) {
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'JetBrains Mono, Fira Code, monospace',
        theme: {
          background: '#0f172a',
          foreground: '#e2e8f0',
          cursor: '#3b82f6',
          selectionBackground: '#3b82f640',
          black: '#0f172a',
          red: '#ef4444',
          green: '#10b981',
          yellow: '#f59e0b',
          blue: '#3b82f6',
          magenta: '#8b5cf6',
          cyan: '#06b6d4',
          white: '#e2e8f0',
          brightBlack: '#475569',
          brightRed: '#f87171',
          brightGreen: '#34d399',
          brightYellow: '#fbbf24',
          brightBlue: '#60a5fa',
          brightMagenta: '#a78bfa',
          brightCyan: '#22d3ee',
          brightWhite: '#f1f5f9'
        }
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(terminalRef.current)
      fitAddon.fit()

      term.writeln('\x1b[36m╔══════════════════════════════════════════════════════════╗\x1b[0m')
      term.writeln('\x1b[36m║\x1b[0m  \x1b[32mNeutron v10 Terminal\x1b[0m                              \x1b[36m║\x1b[0m')
      term.writeln('\x1b[36m║\x1b[0m  Select hosts and execute commands in parallel     \x1b[36m║\x1b[0m')
      term.writeln('\x1b[36m╚══════════════════════════════════════════════════════════╝\x1b[0m')
      term.writeln('')

      const fitHandler = () => fitAddon.fit()
      window.addEventListener('resize', fitHandler)
      term.fitHandler = fitHandler

      terminalInstance.current = term

      return term
    }
  }

  const toggleHost = (hostId) => {
    setSelectedHosts(prev =>
      prev.includes(hostId)
        ? prev.filter(id => id !== hostId)
        : [...prev, hostId]
    )
  }

  const selectAll = () => {
    if (selectedHosts.length === hostList.length) {
      setSelectedHosts([])
    } else {
      setSelectedHosts(hostList.map(h => h.id))
    }
  }

  const executeCommand = async () => {
    if (!command.trim() || selectedHosts.length === 0) return

    setExecuting(true)
    const term = terminalInstance.current

    term.writeln('')
    term.writeln(`\x1b[33m$ \x1b[36m${command}\x1b[0m`)
    term.writeln(`\x1b[90mTargets: ${selectedHosts.length} host(s)\x1b[0m`)
    term.writeln('')

    try {
      const res = await commands.execute({
        host_ids: selectedHosts,
        command: command.trim()
      })

      for (const [hostId, result] of Object.entries(res.data)) {
        const host = hostList.find(h => h.id === parseInt(hostId))
        term.writeln(`\x1b[34m┌─ Host: ${host?.name || hostId}\x1b[0m`)
        
        if (result.output) {
          result.output.split('\n').forEach(line => {
            if (line) term.writeln(line)
          })
        }
        
        if (result.error) {
          result.error.split('\n').forEach(line => {
            if (line) term.writeln(`\x1b[31m${line}\x1b[0m`)
          })
        }
        
        const exitCodeColor = result.exit_code === 0 ? '32' : '31'
        term.writeln(`\x1b[90mExit code: \x1b[${exitCodeColor}m${result.exit_code}\x1b[0m`)
        term.writeln(`\x1b[34m└─────────────────────────────────────────────\x1b[0m`)
        term.writeln('')
      }

      setCommandHistory(prev => [command, ...prev.slice(0, 99)])
      setCommand('')
      setHistoryIndex(-1)
    } catch (error) {
      term.writeln(`\x1b[31mError: ${error.message}\x1b[0m`)
    } finally {
      setExecuting(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      executeCommand()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setCommand(commandHistory[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setCommand(commandHistory[newIndex])
      } else {
        setHistoryIndex(-1)
        setCommand('')
      }
    }
  }

  const clearTerminal = () => {
    if (terminalInstance.current) {
      terminalInstance.current.clear()
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-gray-700 bg-neutron-primary">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Terminal</h1>
            <p className="text-sm text-gray-400">Execute commands across multiple hosts in parallel</p>
          </div>
          <button
            onClick={clearTerminal}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        </div>

        {/* Host Selection */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">Target Hosts</label>
            <button
              onClick={selectAll}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {selectedHosts.length === hostList.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {hostList.map(host => (
              <button
                key={host.id}
                onClick={() => toggleHost(host.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                  selectedHosts.includes(host.id)
                    ? 'bg-blue-600 text-white'
                    : host.is_connected
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                }`}
                disabled={!host.is_connected}
              >
                <div className={`w-2 h-2 rounded-full ${
                  host.is_connected ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
                {host.name}
              </button>
            ))}
          </div>
        </div>

        {/* Command Input */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-400 font-mono">$</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter command (e.g., whoami, uptime, ls -la)"
              className="w-full pl-8 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white font-mono focus:border-blue-500 focus:outline-none"
              disabled={executing || selectedHosts.length === 0}
            />
          </div>
          <button
            onClick={executeCommand}
            disabled={executing || selectedHosts.length === 0 || !command.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {executing ? (
              <>
                <div className="spinner"></div>
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Execute
              </>
            )}
          </button>
        </div>

        {/* Quick Commands */}
        <div className="mt-4 flex flex-wrap gap-2">
          {['whoami', 'uptime', 'df -h', 'free -m', 'top -bn1 | head -20', 'uname -a'].map(cmd => (
            <button
              key={cmd}
              onClick={() => setCommand(cmd)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors font-mono"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal Output */}
      <div className="flex-1 bg-black p-4 overflow-hidden">
        <div ref={terminalRef} className="w-full h-full" style={{ minHeight: '400px' }}></div>
      </div>
    </div>
  )
}

export default TerminalPage
