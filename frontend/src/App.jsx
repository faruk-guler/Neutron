import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Hosts from './pages/Hosts'
import Terminal from './pages/Terminal'
import Playbooks from './pages/Playbooks'
import Files from './pages/Files'
import History from './pages/History'
import About from './pages/About'

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-white">
      <h1 className="text-6xl font-bold mb-4">404</h1>
      <p className="text-gray-400 text-xl mb-8">Page not found</p>
      <button
        onClick={() => window.location.href = '/'}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
      >
        Go to Dashboard
      </button>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="flex h-screen bg-neutron-dark">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/hosts" element={<Hosts />} />
              <Route path="/terminal" element={<Terminal />} />
              <Route path="/playbooks" element={<Playbooks />} />
              <Route path="/files" element={<Files />} />
              <Route path="/history" element={<History />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App
