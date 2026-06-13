import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Server, TerminalSquare, BookOpen, FolderOpen, History, Info, LogOut } from 'lucide-react'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/hosts', icon: Server, label: 'Hosts' },
  { path: '/terminal', icon: TerminalSquare, label: 'Terminal' },
  { path: '/playbooks', icon: BookOpen, label: 'Playbooks' },
  { path: '/files', icon: FolderOpen, label: 'Files' },
  { path: '/history', icon: History, label: 'History' },
  { path: '/about', icon: Info, label: 'About' }
]

function Sidebar() {
  const handleLogout = () => {
    if (confirm('Güvenli çıkış yapmak istiyor musunuz?')) {
      localStorage.removeItem('neutron_token')
      window.dispatchEvent(new Event('auth_change'))
    }
  }

  return (
    <aside className="w-64 bg-neutron-primary border-r border-gray-700 flex flex-col">
      <div className="p-5 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <img 
            src="/logo.png" 
            alt="Neutron Logo" 
            className="w-10 h-10 object-contain rounded-md flex-shrink-0"
          />
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight leading-tight">Neutron</h1>
            <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">v10 Web</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map(({ path, icon: Icon, label }) => (
            <li key={path}>
              <NavLink
                to={path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-700 space-y-2">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-2.5 bg-red-650/10 hover:bg-red-600/20 text-red-400 rounded-lg transition-colors font-medium text-sm"
        >
          <LogOut className="w-4.5 h-4.5" />
          Çıkış Yap
        </button>
        <div className="text-xs text-gray-500 text-center">
          Apache 2.0 License
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
