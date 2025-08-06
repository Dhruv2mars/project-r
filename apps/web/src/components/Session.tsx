import { useState, useEffect } from 'react'
import { Play, Mic, MicOff, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../stores/appStore'
import { speechService } from '../services'

// Animated dots component
const AnimatedDots = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
    <span style={{ animation: 'dot-blink 1.4s infinite both', animationDelay: '0s' }}>.</span>
    <span style={{ animation: 'dot-blink 1.4s infinite both', animationDelay: '0.2s' }}>.</span>
    <span style={{ animation: 'dot-blink 1.4s infinite both', animationDelay: '0.4s' }}>.</span>
    <style>{`
      @keyframes dot-blink {
        0%, 20% { opacity: 0; }
        50% { opacity: 1; }
        80%, 100% { opacity: 0; }
      }
    `}</style>
  </span>
)

// Helper function to clean markdown formatting from code
function cleanCodeForEditor(code: string): string {
  return code
    .replace(/^```python\n?/, '')  // Remove opening ```python
    .replace(/\n?```$/, '')        // Remove closing ```
    .trim()
}

function Session() {
  const navigate = useNavigate()
  const [code, setCode] = useState('print("Hello, Project-R!")')
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [currentInput, setCurrentInput] = useState('')
  
  // Conversation tracking state
  const [conversationSessionId, setConversationSessionId] = useState<string | null>(null)
  const [isNewSession, setIsNewSession] = useState(true)
  
  // Voice interaction state
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speechInitialized, setSpeechInitialized] = useState(false)

  // Get store actions
  const {
    createSession,
    addMessage,
    generateResponse,
    executeCode,
    startRecording,
    speak
  } = useAppStore()

  // Initialize speech services on component mount
  useEffect(() => {
    const initializeSpeech = async () => {
      try {
        // Wait for voices to load
        await speechService.waitForVoices()
        setSpeechInitialized(speechService.isRecognitionSupported() && speechService.isSynthesisSupported())
      } catch (error) {
        console.error('Failed to initialize speech services:', error)
        setSpeechInitialized(false)
      }
    }

    initializeSpeech()
  }, [])

  // Function to create a new conversation session
  const createConversationSession = async (firstMessage: string) => {
    try {
      // Extract first few words for title (max 50 chars)
      const title = firstMessage.length > 50 
        ? firstMessage.substring(0, 47) + '...' 
        : firstMessage
      
      await createSession(title || 'New Session')
      
      // Get the newly created session (it will be at the top of the sessions list)
      const sessionId = crypto.randomUUID() // This would be better handled by the store
      setConversationSessionId(sessionId)
      setIsNewSession(false)
      
      return sessionId
    } catch (error) {
      console.error('Failed to create session:', error)
      return null
    }
  }

  const handleRunCode = async () => {
    if (!code.trim()) return
    
    setIsRunning(true)
    setOutput('Running...')
    
    try {
      const result = await executeCode(code, currentInput)
      
      // For web version, we don't have interactive sessions like desktop
      // So we'll simulate the output display
      let outputText = ''
      if (result.stdout) {
        outputText += result.stdout
      }
      if (result.stderr) {
        outputText += '\nError: ' + result.stderr
      }
      if (!outputText) {
        outputText = '(no output)'
      }
      
      setOutput(outputText)
    } catch (error) {
      setOutput(`Error: ${error}`)
    } finally {
      setIsRunning(false)
    }
  }

  const handleTerminalInput = async (input: string) => {
    // For web version, we'll run the code with the input as stdin
    if (!code.trim()) return
    
    setIsRunning(true)
    setOutput('Running with input...')
    
    try {
      const result = await executeCode(code, input)
      
      let outputText = ''
      if (result.stdout) {
        outputText += result.stdout
      }
      if (result.stderr) {
        outputText += '\nError: ' + result.stderr
      }
      if (!outputText) {
        outputText = '(no output)'
      }
      
      setOutput(outputText)
      setCurrentInput('')
    } catch (error) {
      setOutput(`Error: ${error}`)
    } finally {
      setIsRunning(false)
    }
  }

  const handleVoiceInteraction = async () => {
    if (!speechInitialized) {
      alert('Speech services not available. Please ensure you are using Chrome and have microphone permissions.')
      return
    }

    if (isRecording) {
      // This will be handled automatically by the speech service
      return
    }

    if (isProcessing || isSpeaking) {
      return
    }

    // Start recording
    setIsRecording(true)
    
    try {
      // Step 1: Record and transcribe speech
      const transcription = await startRecording()
      
      if (!transcription.trim()) {
        // No speech detected
        setIsRecording(false)
        return
      }

      setIsRecording(false)
      setIsProcessing(true)
      
      // Create new session if this is the first message
      let sessionIdToUse = conversationSessionId
      if (isNewSession && !conversationSessionId) {
        sessionIdToUse = await createConversationSession(transcription)
      }
      
      // Add user message to session
      if (sessionIdToUse) {
        await addMessage('user', transcription)
      }
      
      // Step 2: Generate AI response
      const aiResponse = await generateResponse(transcription, code)
      
      // Add AI response to session
      if (sessionIdToUse) {
        await addMessage('assistant', aiResponse.conversation_response)
      }
      
      // Step 3: Update code if the AI provided new code
      if (aiResponse.code_to_insert && aiResponse.code_to_insert.trim()) {
        setCode(cleanCodeForEditor(aiResponse.code_to_insert))
      }
      
      // Step 4: Speak the response
      setIsProcessing(false)
      setIsSpeaking(true)
      
      await speak(aiResponse.conversation_response)
      
      setIsSpeaking(false)
      
    } catch (error) {
      console.error('Voice processing error:', error)
      setIsRecording(false)
      setIsProcessing(false)
      setIsSpeaking(false)
      
      // Show error message
      alert('Voice interaction failed. Please try again.')
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8f9fa' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '12px 20px', 
        backgroundColor: '#ffffff', 
        borderBottom: '1px solid #e5e7eb'
      }}>
        <h1 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0 }}>Project-R</h1>
        <div></div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', padding: '24px', gap: '24px' }}>
        {/* Code Editor */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          background: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Code Editor
            </div>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: '500',
              borderRadius: '4px',
              visibility: 'hidden'
            }}>
              <Play size={14} />
              Run
            </div>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{
              flex: 1,
              padding: '16px',
              border: 'none',
              borderRadius: '0',
              fontFamily: '"JetBrains Mono", "Fira Code", "Monaco", "Cascadia Code", monospace',
              fontSize: '14px',
              lineHeight: '1.6',
              resize: 'none',
              outline: 'none',
              backgroundColor: '#ffffff',
              color: '#374151'
            }}
            placeholder="# Write your Python code here...
# Try using variables, functions, loops, and more!

print('Hello, Project-R!')
"
          />
        </div>

        {/* Output Console */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          background: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            color: '#374151',
            fontSize: '14px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Output
            </div>
            <button
              onClick={handleRunCode}
              disabled={isRunning}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: isRunning ? '#9ca3af' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                opacity: isRunning ? 0.7 : 1,
                fontSize: '12px',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                if (!isRunning) {
                  e.currentTarget.style.backgroundColor = '#1d4ed8'
                }
              }}
              onMouseOut={(e) => {
                if (!isRunning) {
                  e.currentTarget.style.backgroundColor = '#2563eb'
                }
              }}
            >
              <Play size={14} />
              {isRunning ? 'Running...' : 'Run'}
            </button>
          </div>
          <div 
            style={{
              flex: 1,
              backgroundColor: '#ffffff',
              color: '#000000',
              padding: '16px',
              fontFamily: '"JetBrains Mono", "Fira Code", "Monaco", "Cascadia Code", monospace',
              fontSize: '14px',
              lineHeight: '1.6',
              overflow: 'auto',
              position: 'relative'
            }}
          >
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, minHeight: '20px' }}>{output}</pre>
            
            {/* Input field for programs that need input */}
            <div style={{ 
              marginTop: '16px', 
              display: 'flex', 
              alignItems: 'center',
              backgroundColor: '#f3f4f6',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid #d1d5db'
            }}>
              <span style={{ color: '#000000', marginRight: '6px', fontWeight: '600' }}>Input:</span>
              <input
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleTerminalInput(currentInput)
                  }
                }}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#000000',
                  fontFamily: '"JetBrains Mono", "Fira Code", "Monaco", "Cascadia Code", monospace',
                  fontSize: '14px',
                  width: '100%',
                  fontWeight: '500'
                }}
                placeholder="Enter input for your program (if needed) and press Enter..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '16px 20px', 
        backgroundColor: '#ffffff', 
        borderTop: '1px solid #e5e7eb',
        gap: '16px'
      }}>
        <button
          onClick={handleVoiceInteraction}
          disabled={!speechInitialized || isProcessing || isSpeaking}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: (!speechInitialized || isProcessing || isSpeaking) ? '#9ca3af' : 
                       (isRecording ? '#dc2626' : '#059669'),
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: (!speechInitialized || isProcessing || isSpeaking) ? 'not-allowed' : 'pointer',
            opacity: (!speechInitialized || isProcessing || isSpeaking) ? 0.7 : 1,
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            if (speechInitialized && !isProcessing && !isSpeaking) {
              e.currentTarget.style.backgroundColor = isRecording ? '#b91c1c' : '#047857'
            }
          }}
          onMouseOut={(e) => {
            if (speechInitialized && !isProcessing && !isSpeaking) {
              e.currentTarget.style.backgroundColor = isRecording ? '#dc2626' : '#059669'
            }
          }}
        >
          {isProcessing ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              AI thinking<AnimatedDots />
            </>
          ) : isSpeaking ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              AI speaking<AnimatedDots />
            </>
          ) : isRecording ? (
            <>
              <MicOff size={16} />
              Listening...
            </>
          ) : (
            <>
              <Mic size={16} />
              Mic
            </>
          )}
        </button>

        <button
          onClick={async () => {
            // Capture variables before navigation since component will unmount
            const sessionId = conversationSessionId
            const isNew = isNewSession
            
            // Navigate back immediately
            navigate('/', { replace: true })
            
            // Background processing for session summary and practice sheet generation
            // In a full implementation, this would be handled by the store or service workers
            if (sessionId && !isNew) {
              try {
                // This would be implemented as a background task
                console.log('Background processing for session:', sessionId)
                
                // For now, we'll skip the background processing
                // In a full implementation, this would:
                // 1. Generate session summary
                // 2. Update session title
                // 3. Generate practice sheet
              } catch (error) {
                console.error('Failed to generate session content:', error)
              }
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: '#dc2626',
            color: 'white',
            border: '1px solid #dc2626',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#b91c1c'
            e.currentTarget.style.borderColor = '#b91c1c'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#dc2626'
            e.currentTarget.style.borderColor = '#dc2626'
          }}
        >
          Exit
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default Session