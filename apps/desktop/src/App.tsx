import { useState, useEffect } from 'react'
import { Play, Mic, MicOff, Loader2 } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

// Helper function to clean markdown formatting from code
function cleanCodeForEditor(code: string): string {
  return code
    .replace(/^```python\n?/, '')  // Remove opening ```python
    .replace(/\n?```$/, '')        // Remove closing ```
    .trim()
}

function App() {
  const [code, setCode] = useState('print("Hello, Project-R!")')
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  
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
        
        // Step 3: Send transcription + current code to Session LLM (Ollama + Gemma)
        const aiResponseJson = await invoke<string>('generate_ai_response', {
          userInput: transcription,
          currentCode: code
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
        <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>Project-R</h1>
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