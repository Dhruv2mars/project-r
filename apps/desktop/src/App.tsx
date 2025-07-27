import { useState } from 'react'
import { Play } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

function App() {
  const [code, setCode] = useState('print("Hello, Project-R!")')
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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8f9fa' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '16px', 
        backgroundColor: 'white', 
        borderBottom: '1px solid #e5e7eb' 
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>Project-R</h1>
        <button
          onClick={handleRunCode}
          disabled={isRunning}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.5 : 1
          }}
        >
          <Play size={16} />
          {isRunning ? 'Running...' : 'Run'}
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', padding: '16px', gap: '16px' }}>
        {/* Simple Text Editor */}
        <div style={{ flex: 1 }}>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{
              width: '100%',
              height: '100%',
              padding: '16px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '14px',
              resize: 'none',
              outline: 'none'
            }}
            placeholder="Write your Python code here..."
          />
        </div>

        {/* Output Console */}
        <div style={{ flex: 1 }}>
          <div style={{ height: '100%' }}>
            <div style={{
              height: '32px',
              backgroundColor: '#1f2937',
              color: 'white',
              padding: '4px 16px',
              fontSize: '14px',
              fontWeight: '500',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
              display: 'flex',
              alignItems: 'center'
            }}>
              Output
            </div>
            <div style={{
              height: 'calc(100% - 32px)',
              backgroundColor: '#111827',
              color: '#10b981',
              padding: '16px',
              fontFamily: 'monospace',
              fontSize: '14px',
              overflow: 'auto',
              borderBottomLeftRadius: '8px',
              borderBottomRightRadius: '8px'
            }}>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{output}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App