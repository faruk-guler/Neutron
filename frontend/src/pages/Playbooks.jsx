import { useState, useEffect } from 'react'
import { Plus, Play, Trash2, BookOpen, FileCode, CheckCircle, AlertTriangle, HelpCircle, Eye } from 'lucide-react'
import { playbooks, hosts } from '../services/api'

const YAML_TEMPLATE = `- name: Sunucu Web Yapılandırma
  tasks:
    - name: Nginx Paketini Kur (apt)
      apt:
        name: nginx
        state: present

    - name: Nginx Servisini Başlat (service)
      service:
        name: nginx
        state: started

    - name: Geçici Test Dosyası Oluştur (file)
      file:
        path: /tmp/neutron_test.txt
        state: file
        mode: "0644"

    - name: Servis Durumunu Sorgula (shell)
      shell: systemctl status nginx | head -n 3
`

function Playbooks() {
  const [playbookList, setPlaybookList] = useState([])
  const [hostList, setHostList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [executing, setExecuting] = useState(null)
  const [format, setFormat] = useState('commands') // commands or yaml
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    commands: [''],
    yaml_content: YAML_TEMPLATE,
    host_ids: []
  })
  
  // Execution results modal state
  const [showResults, setShowResults] = useState(false)
  const [resultsData, setResultsData] = useState(null)
  const [resultsTitle, setResultsTitle] = useState('')

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
    if (formData.host_ids.length === 0) {
      alert('Lütfen en az bir hedef sunucu seçin.')
      return
    }

    try {
      const data = {
        name: formData.name,
        description: formData.description,
        host_ids: formData.host_ids,
        commands: format === 'commands' ? formData.commands.filter(cmd => cmd.trim()) : null,
        yaml_content: format === 'yaml' ? formData.yaml_content : null
      }
      await playbooks.create(data)
      resetForm()
      fetchPlaybooks()
    } catch (error) {
      console.error('Failed to create playbook:', error)
      alert('Playbook oluşturulamadı.')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Bu playbook\'u silmek istediğinize emin misiniz?')) return
    try {
      await playbooks.delete(id)
      fetchPlaybooks()
    } catch (error) {
      console.error('Failed to delete playbook:', error)
    }
  }

  const handleExecute = async (playbook) => {
    if (!playbook.host_ids || playbook.host_ids.length === 0) {
      alert('Bu playbook için tanımlı hedef sunucu bulunmamaktadır.')
      return
    }
    
    const count = playbook.host_ids.length
    if (!confirm(`"${playbook.name}" adlı playbook'u ${count} sunucuda çalıştırmak istiyor musunuz?`)) return
    
    setExecuting(playbook.id)
    try {
      const res = await playbooks.execute(playbook.id)
      setResultsData(res.data)
      setResultsTitle(playbook.name)
      setShowResults(true)
    } catch (error) {
      console.error('Failed to execute playbook:', error)
      alert('Playbook çalıştırılırken bir hata oluştu.')
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
      yaml_content: YAML_TEMPLATE,
      host_ids: []
    })
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Playbooks</h1>
          <p className="text-gray-400">Çok adımlı otomasyon ve durum denetimli kurulum senaryoları</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Yeni Playbook
        </button>
      </div>

      {showForm && (
        <div className="bg-neutron-primary rounded-lg p-6 border border-gray-700 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Playbook Oluştur</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Playbook İsmi *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Açıklama</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Target Hosts */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Hedef Sunucular * (En az bir adet seçilmeli)</label>
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

            {/* Format Selector */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Çalıştırma Modu / Format</label>
              <div className="flex gap-2 p-1 bg-gray-800 rounded-lg max-w-md">
                <button
                  type="button"
                  onClick={() => setFormat('commands')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    format === 'commands' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Ham Komut Listesi
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('yaml')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    format === 'yaml' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  YAML (Ansible Motoru - Idempotent)
                </button>
              </div>
            </div>

            {/* Dynamic input area based on format */}
            {format === 'commands' ? (
              <div>
                <label className="block text-sm text-gray-400 mb-2">Sıralı Komutlar *</label>
                <div className="space-y-2">
                  {formData.commands.map((cmd, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="px-3 py-2 bg-gray-700 text-gray-400 rounded-lg text-sm font-mono flex items-center">
                        {index + 1}
                      </span>
                      <input
                        type="text"
                        value={cmd}
                        onChange={(e) => updateCommand(index, e.target.value)}
                        placeholder="Örn: apt update, systemctl restart nginx"
                        className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white font-mono focus:border-blue-500 focus:outline-none"
                        required={index === 0}
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
                  + Komut Ekle
                </button>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm text-gray-400">YAML Playbook İçeriği (Ansible Tarzı) *</label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, yaml_content: YAML_TEMPLATE })}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Şablonu Geri Yükle
                  </button>
                </div>
                <textarea
                  value={formData.yaml_content}
                  onChange={(e) => setFormData({ ...formData, yaml_content: e.target.value })}
                  rows="12"
                  className="w-full px-4 py-3 bg-gray-950 border border-gray-600 rounded-lg text-green-400 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25 leading-relaxed"
                  required
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold"
              >
                Kaydet
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors font-semibold"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="spinner animate-spin"></div>
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
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      playbook.yaml_content ? 'bg-amber-500/20' : 'bg-purple-500/20'
                    }`}>
                      {playbook.yaml_content ? (
                        <FileCode className="w-6 h-6 text-amber-500" />
                      ) : (
                        <BookOpen className="w-6 h-6 text-purple-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-white font-semibold text-lg">{playbook.name}</h3>
                        {playbook.yaml_content ? (
                          <span className="px-2 py-0.5 bg-amber-500/15 border border-amber-500/20 text-amber-400 rounded text-xs font-semibold">
                            YAML (Ansible Engine)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-purple-500/15 border border-purple-500/20 text-purple-400 rounded text-xs font-semibold">
                            Komut Serisi
                          </span>
                        )}
                      </div>
                      {playbook.description && (
                        <p className="text-sm text-gray-400">{playbook.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleExecute(playbook)}
                      disabled={executing === playbook.id}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2 font-semibold text-sm"
                    >
                      {executing === playbook.id ? (
                        <>
                          <div className="spinner w-4 h-4 border-2 border-white/20 border-t-white animate-spin"></div>
                          Çalışıyor...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Çalıştır
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

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <h4 className="text-sm text-gray-400 mb-2 font-semibold">
                      {playbook.yaml_content ? 'Playbook Tanımı (YAML)' : `Komutlar (${playbook.commands?.length || 0})`}
                    </h4>
                    {playbook.yaml_content ? (
                      <pre className="p-3 bg-gray-950 rounded text-xs text-green-400 font-mono overflow-auto max-h-48 leading-relaxed border border-gray-800">
                        {playbook.yaml_content}
                      </pre>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {playbook.commands?.map((cmd, index) => (
                          <div key={index} className="px-3 py-1.5 bg-gray-800 rounded text-sm font-mono text-gray-300">
                            <span className="text-blue-400">{index + 1}.</span> {cmd}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm text-gray-400 mb-2 font-semibold">Hedef Sunucular ({playbook.host_ids.length})</h4>
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                      {playbook.host_ids.map(hostId => {
                        const host = hostList.find(h => h.id === hostId)
                        return (
                          <span key={hostId} className="px-3 py-1 bg-gray-850 border border-gray-700 rounded text-sm text-gray-300">
                            {host?.name || `Sunucu ${hostId}`}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-500">
                  Oluşturulma: {playbook.created_at ? new Date(playbook.created_at).toLocaleString() : 'Belirsiz'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {playbookList.length === 0 && !loading && (
        <div className="text-center py-12">
          <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">Hiç playbook oluşturulmamış</p>
          <p className="text-gray-500 text-sm mt-2">İlk otomasyon senaryonuzu yazın.</p>
        </div>
      )}

      {/* Ansible-style Results Modal */}
      {showResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutron-primary border border-gray-700 rounded-lg shadow-2xl flex flex-col w-full max-w-4xl max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50 rounded-t-lg">
              <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                <span>Playbook Yürütme Raporu:</span>
                <span className="text-blue-400 font-bold">"{resultsTitle}"</span>
              </h3>
              <button
                onClick={() => setShowResults(false)}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors text-sm"
              >
                Kapat
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* If it's classic commands execution, it returns dict of host outputs.
                  If it's AnsibleEngine execution, it returns dict of objects containing success, changed_count, tasks list.
                  We detect format dynamically. */}
              {resultsData && Object.entries(resultsData).map(([hostId, data]) => {
                const host = hostList.find(h => h.id === parseInt(hostId))
                const isAnsibleResult = data.tasks && Array.isArray(data.tasks)

                return (
                  <div key={hostId} className="border border-gray-800 bg-gray-950/40 rounded-lg overflow-hidden">
                    {/* Host Header */}
                    <div className="bg-gray-900/60 p-4 border-b border-gray-800 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-white text-md">
                          {host?.name || `Sunucu ${hostId}`}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">
                          {host?.ip_address}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {isAnsibleResult ? (
                          <>
                            <span className="px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded text-xs font-semibold">
                              Değişiklik: {data.changed_count}
                            </span>
                            {data.success ? (
                              <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded text-xs font-semibold flex items-center gap-1">
                                Başarılı
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-xs font-semibold flex items-center gap-1">
                                Başarısız
                              </span>
                            )}
                          </>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            Object.values(resultsData).every(r => r.exit_code === 0) 
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            Komut Yürütme Sonu
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Task Execution Details */}
                    <div className="p-4 space-y-3">
                      {isAnsibleResult ? (
                        data.tasks.map((task, idx) => (
                          <div key={idx} className="flex flex-col gap-1 p-3 bg-gray-900/30 rounded border border-gray-900">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-200">
                                {task.name}
                              </span>
                              <span className={`px-2 py-0.5 text-xs font-mono uppercase rounded font-bold ${
                                task.status === 'changed'
                                  ? 'bg-yellow-500/15 border border-yellow-500/20 text-yellow-500'
                                  : task.status === 'ok'
                                  ? 'bg-green-500/15 border border-green-500/20 text-green-500'
                                  : task.status === 'skipped'
                                  ? 'bg-gray-800 text-gray-500'
                                  : 'bg-red-500/15 border border-red-500/20 text-red-500'
                              }`}>
                                {task.status}
                              </span>
                            </div>
                            {task.error && (
                              <pre className="mt-2 text-xs font-mono p-2 bg-black/60 rounded text-red-400/90 whitespace-pre-wrap max-h-36 overflow-auto">
                                {task.error}
                              </pre>
                            )}
                          </div>
                        ))
                      ) : (
                        // Standard commands execution fallback
                        <div className="space-y-2">
                          <div className="text-sm text-gray-300">
                            {data.output && (
                              <pre className="p-3 bg-black/60 rounded text-xs font-mono text-gray-300 whitespace-pre-wrap max-h-48 overflow-auto border border-gray-900">
                                {data.output}
                              </pre>
                            )}
                            {data.error && (
                              <pre className="p-3 bg-red-950/10 border border-red-500/20 rounded text-xs font-mono text-red-400 mt-2 whitespace-pre-wrap max-h-48 overflow-auto">
                                {data.error}
                              </pre>
                            )}
                            <div className="mt-2 text-xs text-gray-500 font-mono">
                              Exit code: {data.exit_code} | Status: {data.status}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Playbooks
