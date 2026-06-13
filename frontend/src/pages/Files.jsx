import { useState, useEffect } from 'react'
import { Upload, Download, FolderOpen, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { hosts, files } from '../services/api'

function Files() {
  const [hostList, setHostList] = useState([])
  const [selectedHosts, setSelectedHosts] = useState([])
  const [mode, setMode] = useState('push') // push or pull
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    local_file: null,
    remote_path: '',
    local_dir: './downloads'
  })
  const [result, setResult] = useState(null)

  useEffect(() => {
    fetchHosts()
  }, [])

  const fetchHosts = async () => {
    try {
      const res = await hosts.getAll()
      setHostList(res.data)
    } catch (error) {
      console.error('Failed to fetch hosts:', error)
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

  const handleFileChange = (e) => {
    setFormData({ ...formData, local_file: e.target.files[0] })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (selectedHosts.length === 0) {
      alert('Please select at least one host')
      return
    }

    if (mode === 'push' && !formData.local_file) {
      alert('Please select a file to upload')
      return
    }

    if (!formData.remote_path) {
      alert('Please enter remote path')
      return
    }

    setLoading(true)
    setResult(null)

    try {
      if (mode === 'push') {
        const res = await files.push(selectedHosts, formData.remote_path, formData.local_file)
        setResult(res.data)
      } else {
        const res = await files.pull(selectedHosts, formData.remote_path)
        
        // Handle zip download
        const blob = new Blob([res.data], { type: 'application/zip' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        a.download = `neutron_pull_${timestamp}.zip`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)

        // Parse result header
        let parsedResults = {}
        const headerResults = res.headers['x-pull-results']
        if (headerResults) {
          try {
            const successMap = JSON.parse(headerResults)
            for (const [key, success] of Object.entries(successMap)) {
              parsedResults[key] = {
                success,
                message: success ? 'File downloaded and included in ZIP' : 'Failed or skipped'
              }
            }
          } catch (e) {
            console.error(e)
          }
        } else {
          // Fallback UI
          parsedResults = Object.fromEntries(selectedHosts.map(id => [id, { success: true, message: 'Included in ZIP' }]))
        }
        setResult(parsedResults)
      }
    } catch (error) {
      console.error('File transfer failed:', error)
      alert('File transfer failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">File Manager</h1>
        <p className="text-gray-400">Upload and download files across multiple hosts</p>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setMode('push')}
          className={`flex-1 p-4 rounded-lg border-2 transition-all flex items-center justify-center gap-3 ${
            mode === 'push'
              ? 'border-blue-500 bg-blue-500/10 text-white'
              : 'border-gray-700 bg-neutron-primary text-gray-400 hover:border-gray-600'
          }`}
        >
          <Upload className="w-6 h-6" />
          <div className="text-left">
            <div className="font-semibold">Push</div>
            <div className="text-xs">Local → Remote</div>
          </div>
        </button>
        <button
          onClick={() => setMode('pull')}
          className={`flex-1 p-4 rounded-lg border-2 transition-all flex items-center justify-center gap-3 ${
            mode === 'pull'
              ? 'border-blue-500 bg-blue-500/10 text-white'
              : 'border-gray-700 bg-neutron-primary text-gray-400 hover:border-gray-600'
          }`}
        >
          <Download className="w-6 h-6" />
          <div className="text-left">
            <div className="font-semibold">Pull</div>
            <div className="text-xs">Remote → Local</div>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-neutron-primary rounded-lg p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">
            {mode === 'push' ? 'Upload Files' : 'Download Files'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'push' ? (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Local File *</label>
                <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-gray-500 transition-colors cursor-pointer">
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">
                      {formData.local_file ? formData.local_file.name : 'Click to select file'}
                    </p>
                  </label>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Local Directory</label>
                <input
                  type="text"
                  value={formData.local_dir}
                  onChange={(e) => setFormData({ ...formData, local_dir: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1">Remote Path *</label>
              <input
                type="text"
                value={formData.remote_path}
                onChange={(e) => setFormData({ ...formData, remote_path: e.target.value })}
                placeholder={mode === 'push' ? '/tmp/uploaded_file.txt' : '/var/log/syslog'}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-400">Target Hosts</label>
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {selectedHosts.length === hostList.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {hostList.map(host => (
                  <button
                    key={host.id}
                    type="button"
                    onClick={() => toggleHost(host.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedHosts.includes(host.id)
                        ? 'bg-blue-600 text-white'
                        : host.is_connected
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    }`}
                    disabled={!host.is_connected}
                  >
                    {host.name}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || selectedHosts.length === 0}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="spinner"></div>
                  Transferring...
                </>
              ) : (
                <>
                  {mode === 'push' ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
                  {mode === 'push' ? 'Upload to Hosts' : 'Download from Hosts'}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results */}
        <div className="bg-neutron-primary rounded-lg p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Transfer Results</h2>
          
          {!result ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <FolderOpen className="w-16 h-16 mb-4" />
              <p>No transfers yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(result).map(([hostId, res]) => (
                <div key={hostId} className="p-4 bg-gray-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">Host {hostId}</span>
                    {res.success ? (
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                        Success
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">
                        Failed
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">
                    {res.message || res.error}
                  </p>
                  {res.local_path && (
                    <p className="text-xs text-blue-400 mt-2">
                      Saved to: {res.local_path}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Files
