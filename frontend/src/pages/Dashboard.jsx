import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Server, CheckCircle, XCircle, Play, Activity, BookOpen, Terminal } from 'lucide-react'
import { dashboard } from '../services/api'
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchStats = async () => {
    try {
      const res = await dashboard.getStats()
      setStats(res.data)
      setError(null)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400">
          <p className="font-semibold">Error</p>
          <p className="text-sm">{error}</p>
          <button onClick={fetchStats} className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
            Retry
          </button>
        </div>
      </div>
    )
  }

  const connectionData = [
    { name: 'Connected', value: stats.connected_hosts, color: '#10b981' },
    { name: 'Disconnected', value: stats.total_hosts - stats.connected_hosts, color: '#ef4444' }
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-gray-400">Monitor your infrastructure and automation tasks</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={Server}
          label="Total Hosts"
          value={stats.total_hosts}
          color="blue"
        />
        <StatCard
          icon={CheckCircle}
          label="Connected"
          value={stats.connected_hosts}
          color="green"
        />
        <StatCard
          icon={Activity}
          label="Commands Executed"
          value={stats.total_commands}
          color="purple"
        />
        <StatCard
          icon={BookOpen}
          label="Playbooks"
          value={stats.total_playbooks}
          color="orange"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-neutron-primary rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Connection Status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={connectionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {connectionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm text-gray-300">Connected ({stats.connected_hosts})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-sm text-gray-300">Disconnected ({stats.total_hosts - stats.connected_hosts})</span>
            </div>
          </div>
        </div>

        <div className="bg-neutron-primary rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {stats.recent_commands?.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No commands executed yet</p>
            ) : (
              stats.recent_commands.map((cmd) => (
                <div key={cmd.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                  {cmd.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <div className="flex-1 min-w-0">
                    <code className="text-sm text-gray-300 truncate block">{cmd.command}</code>
                    <span className="text-xs text-gray-500">
                      {new Date(cmd.executed_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-neutron-primary rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/hosts')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Server className="w-4 h-4" />
            Manage Hosts
          </button>
          <button
            onClick={() => navigate('/terminal')}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Terminal className="w-4 h-4" />
            Open Terminal
          </button>
          <button
            onClick={() => navigate('/playbooks')}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Run Playbook
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600'
  }

  return (
    <div className="bg-neutron-primary rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm mb-1">{label}</p>
          <p className="text-3xl font-bold text-white">{value}</p>
        </div>
        <div className={`w-12 h-12 bg-gradient-to-br ${colorMap[color]} rounded-lg flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  )
}

export default Dashboard
