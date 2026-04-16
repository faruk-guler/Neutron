import { useState, useEffect } from 'react'
import { Plus, Power, PowerOff, Trash2, Edit2, Server, Globe, Key, Tag, Terminal as TerminalIcon } from 'lucide-react'
import { hosts } from '../services/api'
import { useToast } from '../components/Toast'
import InteractiveTerminalModal from '../components/InteractiveTerminalModal'

function Hosts() {
  const toast = useToast()
  const [hostList, setHostList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingHost, setEditingHost] = useState(null)
  const [activeTerminalHost, setActiveTerminalHost] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    port: 22,
    user: 'root',
    private_key_path: '',
    strict_host_checking: false,
    tags: []
  })

  useEffect(() => {
    fetchHosts()
  }, [])

  const fetchHosts = async () => {
    try {
      const res = await hosts.getAll()
      setHostList(res.data)
      setError(null)
    } catch (error) {
      console.error('Failed to fetch hosts:', error)
      setError('Failed to load hosts')
      toast.addToast('Failed to load hosts', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingHost) {
        await hosts.update(editingHost.id, formData)
        toast.addToast('Host updated successfully', 'success')
      } else {
        await hosts.create(formData)
        toast.addToast('Host created successfully', 'success')
      }
      resetForm()
      fetchHosts()
    } catch (error) {
      console.error('Failed to save host:', error)
      toast.addToast('Failed to save host', 'error')
    }
  }

  const handleEdit = (host) => {
    setEditingHost(host)
    setFormData({
      name: host.name,
      ip_address: host.ip_address,
      port: host.port,
      user: host.user,
      private_key_path: host.private_key_path || '',
      strict_host_checking: host.strict_host_checking || false,
      tags: host.tags || []
    })
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this host?')) return
    try {
      await hosts.delete(id)
      toast.addToast('Host deleted', 'success')
      fetchHosts()
    } catch (error) {
      console.error('Failed to delete host:', error)
      toast.addToast('Failed to delete host', 'error')
    }
  }

  const handleConnect = async (id) => {
    try {
      const res = await hosts.connect(id)
      if (!res.data.connected) {
        toast.addToast(`Connection failed: ${res.data.message}`, 'error')
      } else {
        toast.addToast(`Connected to ${res.data.name || id}`, 'success')
      }
      fetchHosts()
    } catch (error) {
      console.error('Failed to connect:', error)
      toast.addToast('Connection failed', 'error')
    }
  }

  const handleDisconnect = async (id) => {
    try {
      await hosts.disconnect(id)
      fetchHosts()
    } catch (error) {
      console.error('Failed to disconnect:', error)
    }
  }

  const handleConnectAll = async () => {
    try {
      await hosts.connectAll()
      fetchHosts()
    } catch (error) {
      console.error('Failed to connect all:', error)
    }
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingHost(null)
    setFormData({
      name: '',
      ip_address: '',
      port: 22,
      user: 'root',
      private_key_path: '',
      strict_host_checking: false,
      tags: []
    })
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Hosts</h1>
          <p className="text-gray-400">Manage your server connections</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleConnectAll}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Power className="w-4 h-4" />
            Connect All
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Host
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-neutron-primary rounded-lg p-6 border border-gray-700 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            {editingHost ? 'Edit Host' : 'Add New Host'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">IP Address *</label>
                <input
                  type="text"
                  value={formData.ip_address}
                  onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Port</label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">SSH User *</label>
                <input
                  type="text"
                  value={formData.user}
                  onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">Private Key Path</label>
                <input
                  type="text"
                  value={formData.private_key_path}
                  onChange={(e) => setFormData({ ...formData, private_key_path: e.target.value })}
                  placeholder="~/.ssh/neutron.key"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.strict_host_checking}
                    onChange={(e) => setFormData({ ...formData, strict_host_checking: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-gray-300">Strict Host Key Checking (recommended for production)</span>
                </label>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                {editingHost ? 'Update' : 'Create'} Host
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400 mb-6">
          <p>{error}</p>
          <button onClick={fetchHosts} className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="spinner"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {hostList.map((host) => (
            <div
              key={host.id}
              className="bg-neutron-primary rounded-lg border border-gray-700 hover:border-gray-600 transition-all overflow-hidden"
            >
              <div className={`h-2 ${host.is_connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      host.is_connected ? 'bg-green-500/20' : 'bg-red-500/20'
                    }`}>
                      <Server className={`w-5 h-5 ${host.is_connected ? 'text-green-500' : 'text-red-500'}`} />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">{host.name}</h3>
                      <p className="text-sm text-gray-400">{host.ip_address}:{host.port}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(host)}
                      className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(host.id)}
                      className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-300">
                    <Globe className="w-4 h-4 text-gray-500" />
                    <span>User: {host.user}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Key className="w-4 h-4 text-gray-500" />
                    <span className="truncate">{host.private_key_path || 'Default key'}</span>
                  </div>
                  {host.tags && host.tags.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-gray-500" />
                      <div className="flex gap-1 flex-wrap">
                        {host.tags.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-700">
                  {host.is_connected ? (
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => setActiveTerminalHost(host)}
                        className="flex-1 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <TerminalIcon className="w-4 h-4" />
                        Terminal
                      </button>
                      <button
                        onClick={() => handleDisconnect(host.id)}
                        className="flex-1 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <PowerOff className="w-4 h-4" />
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleConnect(host.id)}
                      className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Power className="w-4 h-4" />
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hostList.length === 0 && !loading && (
        <div className="text-center py-12">
          <Server className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">No hosts configured</p>
          <p className="text-gray-500 text-sm mt-2">Click "Add Host" to get started</p>
        </div>
      )}

      {activeTerminalHost && (
        <InteractiveTerminalModal
          host={activeTerminalHost}
          onClose={() => setActiveTerminalHost(null)}
        />
      )}
    </div>
  )
}

export default Hosts
