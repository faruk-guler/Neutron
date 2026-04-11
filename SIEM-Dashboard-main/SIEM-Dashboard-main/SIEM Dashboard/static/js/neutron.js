/**
 * Neutron v10 - Core Frontend Logic
 * Follows Clean Code and Modular design patterns.
 */

class NeutronTerminal {
    constructor(terminalId, inputId, executeBtnId, clearBtnId) {
        this.terminal = document.getElementById(terminalId);
        this.input = document.getElementById(inputId);
        this.executeBtn = document.getElementById(executeBtnId);
        this.clearBtn = document.getElementById(clearBtnId);
        this.eventSource = null;
        
        this.init();
    }

    init() {
        this.executeBtn.addEventListener('click', () => this.runCommand());
        this.input.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.runCommand(); });
        this.clearBtn.addEventListener('click', () => this.clear());
    }

    appendLine(text, type = 'stdout') {
        const line = document.createElement('div');
        line.className = `terminal-line ${this.getLineClass(text, type)}`;
        line.textContent = text;
        this.terminal.appendChild(line);
        this.terminal.scrollTop = this.terminal.scrollHeight;
    }

    getLineClass(text, type) {
        if (text.startsWith('host:')) return 'host-header';
        if (text.startsWith('----') || text.startsWith('####')) return 'divider';
        return type;
    }

    clear() {
        this.terminal.innerHTML = '<div class="terminal-line welcome">Console cleared.</div>';
    }

    runCommand() {
        const cmd = this.input.value.trim();
        if (!cmd) return;

        this.appendLine(`> ${cmd}`, 'welcome');
        this.input.value = '';
        this.setLoading(true);

        this.eventSource = new EventSource(`/api/execute?cmd=${encodeURIComponent(cmd)}`);

        this.eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'stdout' && data.data.trim()) {
                data.data.split('\n').forEach(l => this.appendLine(l, 'stdout'));
            } else if (data.type === 'stderr') {
                this.appendLine(data.data, 'stderr');
            } else if (data.type === 'exit') {
                this.eventSource.close();
                this.setLoading(false);
                this.appendLine(`>>> Task completed (Code: ${data.code})`, 'divider');
            }
        };

        this.eventSource.onerror = (err) => {
            console.error('SSE Connection lost:', err);
            this.eventSource.close();
            this.setLoading(false);
            this.appendLine('ERROR: Connection to server lost.', 'stderr');
        };
    }

    setLoading(isLoading) {
        this.executeBtn.disabled = isLoading;
        this.input.disabled = isLoading;
    }
}

class NeutronMonitor {
    constructor(pollInterval = 30000) {
        this.pollInterval = pollInterval;
        this.start();
    }

    start() {
        this.updateStatus();
        setInterval(() => this.updateStatus(), this.pollInterval);
    }

    async updateStatus() {
        try {
            const res = await fetch('/api/hosts/status');
            const data = await res.json();
            
            document.querySelectorAll('.host-card').forEach(card => {
                const hostName = card.querySelector('span:first-child').textContent.trim();
                const badge = card.querySelector('.host-status');
                
                if (data[hostName]) {
                    const status = data[hostName];
                    badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
                    badge.style.background = status === 'online' ? '#238636' : (status === 'offline' ? '#da3633' : '#8b949e');
                }
            });
        } catch (err) {
            console.error('Monitoring fail:', err);
        }
    }
}

class NeutronPlaybooks {
    constructor(selectId, runBtnId, terminalInstance) {
        this.select = document.getElementById(selectId);
        this.runBtn = document.getElementById(runBtnId);
        this.terminal = terminalInstance;
        this.init();
    }

    async init() {
        try {
            const res = await fetch('/api/playbooks');
            const commands = await res.json();
            commands.forEach(cmd => {
                const opt = document.createElement('option');
                opt.value = cmd;
                opt.textContent = cmd;
                this.select.appendChild(opt);
            });
        } catch (err) {
            console.error('Playbook load error:', err);
        }

        this.runBtn.addEventListener('click', () => {
            const selected = this.select.value;
            if (selected) {
                this.terminal.input.value = selected;
                this.terminal.runCommand();
            }
        });
    }
}

// Global Export for initialization
window.Neutron = {
    initDashboard: () => {
        const term = new NeutronTerminal('terminal', 'cmd-inline', 'run-inline', 'clear-term');
        new NeutronMonitor();
        new NeutronPlaybooks('playbook-select', 'run-playbook', term);
    }
};
