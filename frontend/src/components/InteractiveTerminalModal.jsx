import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { X, Minimize2, Maximize2 } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'

function InteractiveTerminalModal({ host, onClose }) {
  const terminalRef = useRef(null)
  const wsRef = useRef(null)
  const termInstance = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [connecting, setConnecting] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Esc key to close fullscreen
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  useEffect(() => {
    if (!terminalRef.current) return

    // Initialize Terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#3b82f6',
        selectionBackground: '#3b82f640'
      }
    })
    
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()

    termInstance.current = term

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal/${host.id}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnecting(false)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.error) {
          setError(msg.error)
          term.writeln(`\r\n\x1b[31mError: ${msg.error}\x1b[0m`)
        } else if (msg.type === 'output') {
          term.write(msg.data)
        } else if (msg.type === 'connected') {
          term.writeln(`\x1b[32mSuccessfully connected to ${host.name} interactive shell.\x1b[0m\r\n`)
        }
      } catch (e) {
        console.error('Failed to parse websocket message', e)
      }
    }

    ws.onclose = () => {
      term.writeln('\r\n\x1b[90mConnection closed.\x1b[0m')
      setConnecting(false)
    }

    ws.onerror = (e) => {
      setError('Connection failed')
      setConnecting(false)
    }

    // Handle terminal input
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(terminalRef.current)

    return () => {
      resizeObserver.disconnect()
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
      term.dispose()
    }
  }, [host.id, host.name])

  // Refit when fullscreen toggles
  useEffect(() => {
    if (termInstance.current && termInstance.current._core) {
      setTimeout(() => {
        const addons = termInstance.current._addons || []
        addons.forEach(addon => {
          if (addon.instance && typeof addon.instance.fit === 'function') {
            addon.instance.fit()
          }
        })
      }, 50)
    }
  }, [isFullscreen])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div 
        className={`bg-neutron-primary border border-gray-700 rounded-lg shadow-2xl flex flex-col transition-all duration-200 ${
          isFullscreen ? 'w-full h-full' : 'w-full max-w-5xl h-[80vh]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50 rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${connecting ? 'bg-yellow-500 animate-pulse' : error ? 'bg-red-500' : 'bg-green-500'}`}></div>
            <div>
              <h3 className="text-white font-semibold flex items-center gap-2">
                {host.name} <span className="text-xs text-gray-500 font-mono">({host.user}@{host.ip_address})</span>
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Terminal Container */}
        <div className="flex-1 p-2 bg-[#0f172a] rounded-b-lg overflow-hidden flex flex-col">
          {error && !connecting && (
            <div className="mb-2 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm flex justify-between items-center">
              <span>{error}</span>
              <button 
                onClick={onClose}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-white"
              >
                Close Window
              </button>
            </div>
          )}
          <div ref={terminalRef} className="flex-1 w-full h-full"></div>
        </div>
      </div>
    </div>
  )
}

export default InteractiveTerminalModal
