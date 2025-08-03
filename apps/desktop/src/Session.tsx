import { useState, useEffect, useRef } from 'react'
import { Play, Mic, MicOff, Loader2, ArrowLeft } from 'lucide-react'
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
  const [whisperInitialized, setWhisperInitialized] = useState(false)
  const [llmInitialized, setLlmInitialized] = useState(false)
  const [ttsInitialized, setTtsInitialized] = useState(false)

  // Initialize all AI systems on component mount
  useEffect(() => {
    const initializeAI = async () => {
      try {
        setOutput('🚀 Initializing Project-R AI systems...')
        
        // Initialize Whisper (Speech-to-Text)
        setOutput('🎵 Initializing speech recognition (Whisper)...')
        await invoke<string>('initialize_whisper')
        setWhisperInitialized(true)
        
        // Initialize LLM (AI Conversation)
        setOutput('🤖 Connecting to AI assistant (Ollama + Gemma)...')
        await invoke<string>('initialize_llm')
        setLlmInitialized(true)
        
        // Initialize TTS (Text-to-Speech)
        setOutput('🗣️ Initializing text-to-speech (System TTS)...')
        await invoke<string>('initialize_tts')
        setTtsInitialized(true)
        
        setOutput('✅ All systems ready! Full audio-audio conversation pipeline is active.\n\n🎯 Click the Voice button to start talking with your AI Python tutor!')
      } catch (error) {
        setOutput(`❌ Failed to initialize AI systems: ${error}`)
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
      setOutput('🔄 AI systems not ready. Please wait for all components to initialize...')
      return
    }

    if (isRecording) {
      // Stop recording and process complete audio-audio pipeline
      setIsRecording(false)
      setIsProcessing(true)
      setOutput('🎙️ Processing your voice...')
      
      try {
        // Step 1: Stop recording and get the audio file path
        const audioFilePath = await invoke<string>('stop_recording')
        setOutput('🎵 Transcribing speech with Whisper...')
        
        // Step 2: Transcribe the audio using Whisper
        const transcription = await invoke<string>('transcribe_audio', { 
          audioFilePath: audioFilePath 
        })
        
        if (!transcription.trim()) {
          setOutput('❌ No speech detected. Please try again.')
          return
        }

        setOutput(`You said: "${transcription}"\n\n🤖 AI is thinking...`)
        
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
        
        // Update the output with the conversation response
        setOutput(`You: "${transcription}"\n\nAI Tutor: ${aiResponse.conversation_response}`)
        
        // Step 4: Update code if the AI provided new code
        if (aiResponse.code_to_insert && aiResponse.code_to_insert.trim()) {
          setCode(cleanCodeForEditor(aiResponse.code_to_insert))
          setOutput(prev => prev + `\n\n📝 Code has been updated!`)
        }
        
        // Step 5: Generate and play TTS response to complete audio-audio pipeline
        setOutput(prev => prev + `\n\n🗣️ Speaking response...`)
        
        await invoke<string>('generate_and_play_speech', {
          text: aiResponse.conversation_response
        })
        
        setOutput(prev => prev + `\n\n✅ Complete audio-audio conversation cycle completed!`)
        
      } catch (error) {
        setOutput(`❌ Voice processing error: ${error}`)
      } finally {
        setIsProcessing(false)
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
        setOutput('🎤 Listening... Speak your question to the AI tutor. Click mic button again to stop.')
        
      } catch (error) {
        setOutput(`❌ Microphone error: ${error}`)
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
        padding: '16px', 
        backgroundColor: 'white', 
        borderBottom: '1px solid #e5e7eb' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={async () => {
              // Generate session summary and practice sheet if there's an active conversation
              if (conversationSessionId && !isNewSession) {
                try {
                  setOutput(prev => prev + '\n\n📝 Generating session summary...')
                  const summary = await invoke<string>('generate_session_summary', { session_id: conversationSessionId })
                  setOutput(prev => prev + '\n✅ Session summary saved to memory!')
                  
                  // Extract and update session title from summary
                  try {
                    const titleMatch = summary.match(/Session name:\s*(.+?)(?:\n|$)/i)
                    if (titleMatch && titleMatch[1]) {
                      const extractedTitle = titleMatch[1].trim()
                      await invoke('update_session_title', { 
                        session_id: conversationSessionId, 
                        title: extractedTitle 
                      })
                      setOutput(prev => prev + '\n📝 Session title updated!')
                    }
                  } catch (error) {
                    console.error('Failed to update session title:', error)
                  }
                  
                  // Generate practice sheet from the summary
                  setOutput(prev => prev + '\n📝 Generating practice sheet...')
                  await invoke('generate_practice_sheet_from_summary', { 
                    summary: summary, 
                    session_id: conversationSessionId 
                  })
                  setOutput(prev => prev + '\n✅ Practice sheet created!')
                } catch (error) {
                  console.error('Failed to generate session content:', error)
                  setOutput(prev => prev + '\n❌ Failed to generate session content')
                }
              }
              
              // Navigate back and refresh session list
              navigate('/', { replace: true })
              window.location.reload()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#e5e7eb'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6'
            }}
          >
            <ArrowLeft size={14} />
            Exit
          </button>
          <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>Project-R</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleVoiceInteraction}
            disabled={!whisperInitialized || !llmInitialized || !ttsInitialized || isProcessing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              backgroundColor: isRecording ? '#dc2626' : '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: (!whisperInitialized || !llmInitialized || !ttsInitialized || isProcessing) ? 'not-allowed' : 'pointer',
              opacity: (!whisperInitialized || !llmInitialized || !ttsInitialized || isProcessing) ? 0.5 : 1
            }}
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing...
              </>
            ) : isRecording ? (
              <>
                <MicOff size={16} />
                Stop
              </>
            ) : (
              <>
                <Mic size={16} />
                Voice
              </>
            )}
          </button>
          <button
            onClick={handleRunCode}
            disabled={isRunning || isInteractive}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: (isRunning || isInteractive) ? 'not-allowed' : 'pointer',
              opacity: (isRunning || isInteractive) ? 0.5 : 1
            }}
          >
            <Play size={16} />
            {isRunning ? 'Running...' : (isInteractive ? 'Program Running...' : 'Run')}
          </button>
        </div>
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
            <div 
              style={{
                height: 'calc(100% - 32px)',
                backgroundColor: '#111827',
                color: '#10b981',
                padding: '16px',
                fontFamily: 'monospace',
                fontSize: '14px',
                overflow: 'auto',
                borderBottomLeftRadius: '8px',
                borderBottomRightRadius: '8px',
                position: 'relative'
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
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{output}</pre>
              {isInteractive && (
                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center' }}>
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
                      color: '#10b981',
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      width: '100%'
                    }}
                    placeholder="Type here and press Enter..."
                    autoFocus
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

export default Session