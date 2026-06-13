import { Info, Github, Globe } from 'lucide-react'

function About() {
  return (
    <div className="p-8 pb-20">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Info className="w-8 h-8 text-blue-500" />
          About Neutron
        </h1>
        <p className="text-gray-400 mt-2 text-lg">Detailed information about the Neutron project and its architecture.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-neutron-primary p-6 rounded-xl border border-gray-700 shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">Version Information</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Neutron Core Version</span>
              <span className="text-white font-mono bg-gray-800 px-2 py-1 rounded">v10.0.0</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Web Interface</span>
              <span className="text-white font-mono bg-gray-800 px-2 py-1 rounded">v1.2.0</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">License</span>
              <span className="text-white font-mono bg-gray-800 px-2 py-1 rounded">Apache 2.0</span>
            </div>
          </div>
        </div>

        <div className="bg-neutron-primary p-6 rounded-xl border border-gray-700 shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">Links & Resources</h2>
          <div className="space-y-4">
            <a href="#" className="flex items-center gap-3 text-gray-300 hover:text-white transition-colors p-2 hover:bg-gray-700 rounded-lg">
              <Github className="w-5 h-5 text-gray-400" />
              <div>
                <div className="font-semibold px-1">GitHub Repository</div>
                <div className="text-sm text-gray-500 px-1">Source code and issue tracker</div>
              </div>
            </a>
            <a href="#" className="flex items-center gap-3 text-gray-300 hover:text-white transition-colors p-2 hover:bg-gray-700 rounded-lg">
              <Globe className="w-5 h-5 text-gray-400" />
              <div>
                <div className="font-semibold px-1">Documentation</div>
                <div className="text-sm text-gray-500 px-1">Detailed guides and API reference</div>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default About
