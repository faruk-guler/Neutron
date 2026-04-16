import { useState, useEffect } from 'react'
import { Plus, Play, Trash2, BookOpen } from 'lucide-react'
import { playbooks, hosts } from '../services/api'

function Playbooks() {
  const [playbookList, setPlaybookList] = useState([])
  const [hostList, setHostList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [executing, setExecuting] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    commands: [''],
    host_ids: []
  })

  useEffect(() => {
    fetchPlaybooks()
    fetchHosts()
  }, [])

  const fetchPlaybooks = async () => {
    try {
      const res = await playbooks.getAll()
      setPlaybookList(res.data)
    } catch (error) {
      console.error('Failed to fetch playbooks:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchHosts = async () => {
    try {
      const res = await hosts.getAll()
      setHostList(res.data)
    } catch (error) {
      console.error('Failed to fetch hosts:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const data = {
        ...formData,
        commands: formData.commands.filter(cmd => cmd.trim())
      }
      await playbooks.create(data)
      resetForm()
      fetchPlaybooks()
    } catch (error) {
      console.error('Failed to create playbook:', error)
      alert('Failed to create playbook')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this playbook?')) return
    try {
      await playbooks.delete(id)
      fetchPlaybooks()
    } catch (error) {
      console.error('Failed to delete playbook:', error)
    }
  }

  const handleExecute = async (playbook) => {
    if (!playbook.host_ids || playbook.host_ids.length === 0) {
      alert('This playbook has no target hosts configured')
      return
    }
    
    if (!confirm(`Execute playbook "${playbook.name}" on ${playbook.host_ids.length} host(s)?`)) return
    
    setExecuting(playbook.id)
    try {
      const res = await playbooks.execute(playbook.id)
      alert('Playbook executed successfully!')
      console.log('Results:', res.data)
    } catch (error) {
      console.error('Failed to execute playbook:', error)
      alert('Execution failed')
    } finally {
      setExecuting(null)
    }
  }

  const addCommand = () => {
    setFormData({
      ...formData,
      commands: [...formData.commands, '']
    })
  }

  const removeCommand = (index) => {
    setFormData({
      ...formData,
      commands: formData.commands.filter((_, i) => i !== index)
    })
  }

  const updateCommand = (index, value) => {
    const newCommands = [...formData.commands]
    newCommands[index] = value
    setFormData({ ...formData, commands: newCommands })
  }

  const toggleHost = (hostId) => {
    const newHostIds = formData.host_ids.includes(hostId)
      ? formData.host_ids.filter(id => id !== hostId)
      : [...formData.host_ids, hostId]
    setFormData({ ...formData, host_ids: newHostIds })
  }

  const resetForm = () => {
    setShowForm(false)
    setFormData({
      name: '',
      description: '',
      commands: [''],
      host_ids: []
    })
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Playbooks</h1>
          <p className="text-gray-400">Automate multi-step deployments and tasks</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Playbook
        </button>
      </div>

      {showForm && (
        <div className="bg-neutron-primary rounded-lg p-6 border border-gray-700 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Create Playbook</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                rows="2"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Target Hosts *</label>
              <div className="flex flex-wrap gap-2">
                {hostList.map(host => (
                  <button
                    key={host.id}
                    type="button"
                    onClick={() => toggleHost(host.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      formData.host_ids.includes(host.id)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {host.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Commands *</label>
              <div className="space-y-2">
                {formData.commands.map((cmd, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="px-3 py-2 bg-gray-700 text-gray-400 rounded-lg text-sm font-mono">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={cmd}
                      onChange={(e) => updateCommand(index, e.target.value)}
                      placeholder="e.g., whoami, apt update, systemctl restart nginx"
                      className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white font-mono focus:border-blue-500 focus:outline-none"
                    />
                    {formData.commands.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCommand(index)}
                        className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addCommand}
                className="mt-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
              >
                + Add Command
              </button>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Create Playbook
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

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="spinner"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {playbookList.map((playbook) => (
            <div
              key={playbook.id}
              className="bg-neutron-primary rounded-lg border border-gray-700 hover:border-gray-600 transition-all overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-purple-500" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-lg">{playbook.name}</h3>
                      {playbook.description && (
                        <p className="text-sm text-gray-400">{playbook.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleExecute(playbook)}
                      disabled={executing === playbook.id}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                      {executing === playbook.id ? (
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
                    <button
                      onClick={() => handleDelete(playbook.id)}
                      className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm text-gray-400 mb-2">Commands ({playbook.commands.length})</h4>
                    <div className="space-y-1">
                      {playbook.commands.map((cmd, index) => (
                        <div key={index} className="px-3 py-1.5 bg-gray-800 rounded text-sm font-mono text-gray-300">
                          <span className="text-blue-400">{index + 1}.</span> {cmd}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm text-gray-400 mb-2">Target Hosts ({playbook.host_ids.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {playbook.host_ids.map(hostId => {
                        const host = hostList.find(h => h.id === hostId)
                        return (
                          <span key={hostId} className="px-3 py-1 bg-gray-700 rounded text-sm text-gray-300">
                            {host?.name || `Host ${hostId}`}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-500">
                  Created: {playbook.created_at ? new Date(playbook.created_at).toLocaleString() : 'Unknown'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {playbookList.length === 0 && !loading && (
        <div className="text-center py-12">
          <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">No playbooks created</p>
          <p className="text-gray-500 text-sm mt-2">Create your first automation playbook</p>
        </div>
      )}
    </div>
  )
}

export default Playbooks
