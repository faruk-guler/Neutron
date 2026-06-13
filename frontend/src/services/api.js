import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Attach token to request headers
api.interceptors.request.use(config => {
  const token = localStorage.getItem('neutron_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}, error => {
  return Promise.reject(error)
})

// Handle 401 Unauthorized globally
api.interceptors.response.use(response => {
  return response
}, error => {
  if (error.response && error.response.status === 401) {
    localStorage.removeItem('neutron_token')
    window.dispatchEvent(new Event('auth_change'))
  }
  return Promise.reject(error)
})

export const auth = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  getMe: () => api.get('/auth/me')
}

export const hosts = {
  getAll: () => api.get('/hosts'),
  create: (data) => api.post('/hosts', data),
  update: (id, data) => api.put(`/hosts/${id}`, data),
  delete: (id) => api.delete(`/hosts/${id}`),
  connect: (id) => api.post(`/hosts/${id}/connect`),
  disconnect: (id) => api.post(`/hosts/${id}/disconnect`),
  connectAll: () => api.post('/hosts/connect-all')
}

export const commands = {
  execute: (data) => api.post('/commands/execute', data)
}

export const files = {
  push: (hostIds, remotePath, file) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('remote_path', remotePath)
    hostIds.forEach(id => formData.append('host_ids', id))
    return api.post('/files/push', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  pull: (hostIds, remotePath) => api.post('/files/pull', null, {
    params: { 
      host_ids: hostIds.join(','), 
      remote_path: remotePath 
    },
    responseType: 'blob'
  })
}

export const playbooks = {
  getAll: () => api.get('/playbooks'),
  create: (data) => api.post('/playbooks', data),
  delete: (id) => api.delete(`/playbooks/${id}`),
  execute: (playbookId) => api.post('/playbooks/execute', { playbook_id: playbookId }),
  executeYaml: (hostIds, yamlContent) => api.post('/playbooks/execute-yaml', { host_ids: hostIds, yaml_content: yamlContent })
}

export const history = {
  getAll: (limit = 50) => api.get('/history', { params: { limit } })
}

export const dashboard = {
  getStats: () => api.get('/dashboard')
}

export default api
