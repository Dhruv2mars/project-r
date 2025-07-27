import { useState } from 'react'
import CodeEditor from './components/CodeEditor'
import { Play } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

function App() {
  const [code, setCode] = useState('# Write your Python code here\nprint("Hello, Project-R!")')
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const handleRunCode = async () => {
    if (!code.trim()) return
    
    setIsRunning(true)
    setOutput('Running...')
    
    try {
      const result = await invoke<string>('execute_python_code', { code })
      setOutput(result || '(no output)')
    } catch (error) {
      setOutput(`Error: ${error}`)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-800">Project-R</h1>
        <button
          onClick={handleRunCode}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Play size={16} />
          {isRunning ? 'Running...' : 'Run'}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex p-4 gap-4">
        {/* Code Editor */}
        <div className="flex-1">
          <div className="h-full border border-gray-200 rounded-lg overflow-hidden">
            <CodeEditor
              value={code}
              onChange={setCode}
              language="python"
            />
          </div>
        </div>

        {/* Output Console */}
        <div className="flex-1">
          <div className="h-full">
            <div className="h-8 bg-gray-800 text-white px-4 py-1 text-sm font-medium rounded-t-lg">
              Output
            </div>
            <div className="console-output rounded-t-none">
              <pre className="whitespace-pre-wrap">{output}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App