import { useState, useEffect, useRef } from 'react'
import { Play, Mic, MicOff, Loader2, ArrowLeft } from 'lucide-react'

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
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'

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
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isInteractive, setIsInteractive] = useState(false)
  const [currentInput, setCurrentInput] = useState('')
  const pollingRef = useRef<number | null>(null)
  
  // Conversation tracking state
  const [conversationSessionId, setConversationSessionId] = useState<string | null>(null)
  const [isNewSession, setIsNewSession] = useState(true)
  
  
  // Voice interaction state
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [whisperInitialized, setWhisperInitialized] = useState(false)
  const [llmInitialized, setLlmInitialized] = useState(false)
  const [ttsInitialized, setTtsInitialized] = useState(false)

  // Initialize all AI systems on component mount
  useEffect(() => {
    const initializeAI = async () => {
      try {
        // Initialize Whisper (Speech-to-Text)
        await invoke<string>('initialize_whisper')
        setWhisperInitialized(true)
        
        // Initialize LLM (AI Conversation)
        await invoke<string>('initialize_llm')
        setLlmInitialized(true)
        
        // Initialize TTS (Text-to-Speech)
        await invoke<string>('initialize_tts')
        setTtsInitialized(true)
      } catch (error) {
        console.error('Failed to initialize AI systems:', error)
      }
    }

    initializeAI()
  }, [])

  // Function to create a new conversation session
  const createConversationSession = async (firstMessage: string) => {
    try {
      const sessionId = crypto.randomUUID()
      
      // Extract first few words for title (max 50 chars)
      const title = firstMessage.length > 50 
        ? firstMessage.substring(0, 47) + '...' 
        : firstMessage
      
      await invoke('create_session', { 
        sessionId, 
        title: title || 'New Session' 
      })
      
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
    setIsInteractive(false)
    setSessionId(null)
    
    try {
      const result = await invoke<string>('execute_python_code', { code })
      
      if (result.startsWith('INTERACTIVE_SESSION:')) {
        // Interactive session started
        const newSessionId = result.replace('INTERACTIVE_SESSION:', '')
        setSessionId(newSessionId)
        setIsInteractive(true)
        setOutput('')
        
        // Start polling for output
        pollForOutput(newSessionId)
      } else {
        // Non-interactive execution completed
        setOutput(result || '(no output)')
        setIsRunning(false)
      }
    } catch (error) {
      setOutput(`Error: ${error}`)
      setIsRunning(false)
    }
  }

  const pollForOutput = async (sessionId: string) => {
    try {
      const outputs = await invoke<string[]>('get_python_output', { sessionId })
      if (outputs.length > 0) {
        const outputText = outputs.join('')
        setOutput(prev => prev + outputText)
        
        // Check if this contains a program finished message
        if (outputText.includes('[Program finished') || outputText.includes('[Program exited') || outputText.includes('[Program terminated')) {
          // Program has ended, stop the session naturally
          await invoke('close_python_session', { sessionId })
          setIsInteractive(false)
          setIsRunning(false)
          setSessionId(null)
          return // Stop polling
        }
      }
      
      // Check if session is still running
      const isRunning = await invoke<boolean>('is_python_session_running', { sessionId })
      
      if (isRunning && sessionId === sessionId) {
        // Continue polling if session is still active
        pollingRef.current = window.setTimeout(() => pollForOutput(sessionId), 100)
      } else {
        // Session ended naturally, clean up
        setIsInteractive(false)
        setIsRunning(false)
        setSessionId(null)
      }
    } catch (error) {
      console.error('Error polling output:', error)
      // Stop polling on error
      setIsInteractive(false)
      setIsRunning(false)
    }
  }

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current)
      }
      if (sessionId) {
        invoke('close_python_session', { sessionId }).catch(console.error)
      }
    }
  }, [sessionId])

  const handleTerminalInput = async (input: string) => {
    if (!sessionId || !isInteractive) return
    
    try {
      await invoke('send_python_input', { sessionId, input: input + '\n' })
      setCurrentInput('')
      
      // Continue polling for response
      setTimeout(() => pollForOutput(sessionId), 50)
    } catch (error) {
      console.error('Error sending input:', error)
    }
  }

  const handleVoiceInteraction = async () => {
    if (!whisperInitialized || !llmInitialized || !ttsInitialized) {
      return
    }

    if (isRecording) {
      // Stop recording and process complete audio-audio pipeline
      setIsRecording(false)
      setIsProcessing(true)
      // Processing your voice...
      
      try {
        // Step 1: Stop recording and get the audio file path
        const audioFilePath = await invoke<string>('stop_recording')
        // Transcribing speech with Whisper...
        
        // Step 2: Transcribe the audio using Whisper
        const transcription = await invoke<string>('transcribe_audio', { 
          audioFilePath: audioFilePath 
        })
        
        if (!transcription.trim()) {
          // No speech detected
          return
        }

        // AI is thinking...
        
        // Create new session if this is the first message
        let sessionIdToUse = conversationSessionId
        if (isNewSession && !conversationSessionId) {
          sessionIdToUse = await createConversationSession(transcription)
        }
        
        // Step 3: Send transcription + current code to Session LLM (Ollama + Gemma)
        const aiResponseJson = await invoke<string>('generate_ai_response', {
          userInput: transcription,
          currentCode: code,
          sessionId: sessionIdToUse
        })
        
        // Parse the AI response
        const aiResponse = JSON.parse(aiResponseJson)
        
        // Don't show conversation response in terminal since user gets audio
        
        // Step 4: Update code if the AI provided new code
        if (aiResponse.code_to_insert && aiResponse.code_to_insert.trim()) {
          setCode(cleanCodeForEditor(aiResponse.code_to_insert))
          // Code has been updated
        }
        
        // Step 5: Generate and play TTS response to complete audio-audio pipeline
        setIsSpeaking(true)
        setIsProcessing(false)
        
        await invoke<string>('generate_and_play_speech', {
          text: aiResponse.conversation_response
        })
        
        setIsSpeaking(false)
        // Complete audio-audio conversation cycle completed
        
      } catch (error) {
        console.error('Voice processing error:', error)
      } finally {
        setIsProcessing(false)
        setIsSpeaking(false)
      }
    } else {
      // Start recording
      try {
        // Test microphone first
        const micTest = await invoke<string>('test_microphone')
        console.log('Microphone test:', micTest)
        
        // Start recording
        await invoke<string>('start_recording')
        setIsRecording(true)
        // Listening...
        
      } catch (error) {
        console.error('Microphone error:', error)
      }
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
              {isInteractive && (
                <span style={{
                  fontSize: '11px',
                  backgroundColor: '#059669',
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: '500'
                }}>
                  INTERACTIVE
                </span>
              )}
            </div>
            <button
              onClick={handleRunCode}
              disabled={isRunning || isInteractive}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: (isRunning || isInteractive) ? '#9ca3af' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (isRunning || isInteractive) ? 'not-allowed' : 'pointer',
                opacity: (isRunning || isInteractive) ? 0.7 : 1,
                fontSize: '12px',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                if (!isRunning && !isInteractive) {
                  e.currentTarget.style.backgroundColor = '#1d4ed8'
                }
              }}
              onMouseOut={(e) => {
                if (!isRunning && !isInteractive) {
                  e.currentTarget.style.backgroundColor = '#2563eb'
                }
              }}
            >
              <Play size={14} />
              {isRunning ? 'Running...' : (isInteractive ? 'Running...' : 'Run')}
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
              position: 'relative',
              cursor: isInteractive ? 'text' : 'default'
            }}
            onClick={() => {
              if (isInteractive) {
                // Focus on the input field when terminal is clicked
                const inputElement = document.getElementById('terminal-input')
                if (inputElement) {
                  inputElement.focus()
                }
              }
            }}
          >
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, minHeight: '20px' }}>{output}</pre>
            {isInteractive && (
              <div style={{ 
                marginTop: '8px', 
                display: 'flex', 
                alignItems: 'center',
                backgroundColor: '#f3f4f6',
                padding: '6px 8px',
                borderRadius: '4px',
                border: '1px solid #d1d5db'
              }}>
                <span style={{ color: '#000000', marginRight: '6px', fontWeight: '600' }}>→</span>
                <input
                  id="terminal-input"
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
                  placeholder="Type your input and press Enter..."
                  autoFocus
                />
              </div>
            )}
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
          disabled={!whisperInitialized || !llmInitialized || !ttsInitialized || isProcessing || isSpeaking}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: (!whisperInitialized || !llmInitialized || !ttsInitialized || isProcessing || isSpeaking) ? '#9ca3af' : 
                       (isRecording ? '#dc2626' : '#059669'),
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: (!whisperInitialized || !llmInitialized || !ttsInitialized || isProcessing || isSpeaking) ? 'not-allowed' : 'pointer',
            opacity: (!whisperInitialized || !llmInitialized || !ttsInitialized || isProcessing || isSpeaking) ? 0.7 : 1,
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            if (whisperInitialized && llmInitialized && ttsInitialized && !isProcessing && !isSpeaking) {
              e.currentTarget.style.backgroundColor = isRecording ? '#b91c1c' : '#047857'
            }
          }}
          onMouseOut={(e) => {
            if (whisperInitialized && llmInitialized && ttsInitialized && !isProcessing && !isSpeaking) {
              e.currentTarget.style.backgroundColor = isRecording ? '#dc2626' : '#059669'
            }
          }}
        >
          {isProcessing ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              AI thinking<AnimatedDots />
              <style>{`
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </>
          ) : isSpeaking ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              AI speaking<AnimatedDots />
              <style>{`
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </>
          ) : isRecording ? (
            <>
              <MicOff size={16} />
              Stop
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
            
            // Then run background processing if there's an active conversation
            if (sessionId && !isNew) {
              try {
                const summary = await invoke<string>('generate_session_summary', { sessionId: sessionId })
                
                // Extract and update session title from summary
                try {
                  const titleMatch = summary.match(/Session name:\s*(.+?)(?:\n|$)/i)
                  if (titleMatch && titleMatch[1]) {
                    const extractedTitle = titleMatch[1].trim()
                    await invoke('update_session_title', { 
                      sessionId: sessionId, 
                      title: extractedTitle 
                    })
                  }
                } catch (error) {
                  console.error('Failed to update session title:', error)
                }
                
                // Generate practice sheet from the summary
                await invoke('generate_practice_sheet_from_summary', { 
                  summary: summary, 
                  sessionId: sessionId 
                })
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

    </div>
  )
}

export default Session