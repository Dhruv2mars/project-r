class SpeechService {
  private recognition: SpeechRecognition | null = null
  private synthesis: SpeechSynthesis
  private isInitialized = false

  constructor() {
    this.synthesis = window.speechSynthesis
    this.initializeRecognition()
  }

  private initializeRecognition() {
    try {
      console.log('Initializing speech recognition...')
      
      // Check if we're in a secure context (HTTPS or localhost)
      if (!window.isSecureContext) {
        console.error('Speech Recognition requires HTTPS or localhost')
        return
      }
      
      // Chrome-specific implementation
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      
      console.log('SpeechRecognition available:', !!SpeechRecognition)
      
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition()
        if (this.recognition) {
          this.recognition.continuous = false
          this.recognition.interimResults = true
          this.recognition.lang = 'en-US'
          this.recognition.maxAlternatives = 1
          this.isInitialized = true
          console.log('Speech recognition initialized successfully')
        }
      } else {
        console.warn('Speech Recognition not supported in this browser. Please use Chrome.')
      }
    } catch (error) {
      console.error('Failed to initialize speech recognition:', error)
    }
  }

  async startRecording(): Promise<string> {
    console.log('Starting speech recognition...')
    
    if (!this.recognition || !this.isInitialized) {
      console.error('Speech recognition not initialized')
      throw new Error('Speech recognition not available')
    }

    // Check microphone permissions first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop()) // Close the stream immediately
      console.log('Microphone permission granted')
    } catch (permissionError) {
      console.error('Microphone permission denied:', permissionError)
      throw new Error('Microphone access denied. Please allow microphone permissions and try again.')
    }

    return new Promise((resolve, reject) => {
      let finalTranscript = ''
      let timeoutId: number
      let hasStarted = false

      // Set a timeout to prevent hanging
      timeoutId = setTimeout(() => {
        console.log('Speech recognition timeout')
        this.recognition?.stop()
        if (finalTranscript.trim()) {
          resolve(finalTranscript.trim())
        } else {
          reject(new Error('Recording timeout - no speech detected'))
        }
      }, 15000) // 15 second timeout

      this.recognition!.onstart = () => {
        console.log('Speech recognition started')
        hasStarted = true
      }

      this.recognition!.onresult = (event: SpeechRecognitionEvent) => {
        console.log('Speech recognition result received')
        let interimTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript
            console.log('Final transcript:', transcript)
          } else {
            interimTranscript += transcript
            console.log('Interim transcript:', transcript)
          }
        }

        // If we have a final result, resolve immediately
        if (finalTranscript.trim()) {
          console.log('Resolving with final transcript:', finalTranscript.trim())
          clearTimeout(timeoutId)
          resolve(finalTranscript.trim())
        }
      }

      this.recognition!.onerror = (event: SpeechRecognitionErrorEvent) => {
        clearTimeout(timeoutId)
        console.error('Speech recognition error:', event.error, event.message)
        
        let errorMessage = 'Speech recognition failed'
        switch (event.error) {
          case 'no-speech':
            errorMessage = 'No speech was detected. Please try again.'
            break
          case 'audio-capture':
            errorMessage = 'Audio capture failed. Please check your microphone.'
            break
          case 'not-allowed':
            errorMessage = 'Microphone access not allowed. Please enable microphone permissions.'
            break
          case 'network':
            errorMessage = 'Network error occurred during speech recognition.'
            break
          default:
            errorMessage = `Speech recognition error: ${event.error}`
        }
        
        reject(new Error(errorMessage))
      }

      this.recognition!.onend = () => {
        console.log('Speech recognition ended')
        clearTimeout(timeoutId)
        
        if (!hasStarted) {
          reject(new Error('Speech recognition failed to start'))
          return
        }
        
        if (finalTranscript.trim()) {
          resolve(finalTranscript.trim())
        } else {
          reject(new Error('No speech was recognized. Please speak clearly and try again.'))
        }
      }

      // Start recording
      try {
        console.log('Calling recognition.start()')
        this.recognition!.start()
      } catch (error) {
        console.error('Failed to start recognition:', error)
        clearTimeout(timeoutId)
        reject(new Error('Failed to start speech recognition'))
      }
    })
  }

  async speak(text: string): Promise<void> {
    if (!text.trim()) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      // Cancel any ongoing speech
      this.synthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      
      // Configure voice settings
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = 1.0
      
      // Try to use a good English voice
      const voices = this.synthesis.getVoices()
      const preferredVoice = voices.find(voice => 
        voice.lang.startsWith('en') && voice.name.includes('Google')
      ) || voices.find(voice => voice.lang.startsWith('en'))
      
      if (preferredVoice) {
        utterance.voice = preferredVoice
      }

      utterance.onend = () => {
        resolve()
      }

      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event.error)
        reject(new Error(`Speech synthesis error: ${event.error}`))
      }

      // Small delay to ensure synthesis is ready
      setTimeout(() => {
        this.synthesis.speak(utterance)
      }, 100)
    })
  }

  stopRecording(): void {
    if (this.recognition) {
      this.recognition.stop()
    }
  }

  stopSpeaking(): void {
    this.synthesis.cancel()
  }

  isRecognitionSupported(): boolean {
    return this.isInitialized && this.recognition !== null
  }

  isSynthesisSupported(): boolean {
    return 'speechSynthesis' in window
  }

  // Get available voices (for debugging/configuration)
  getAvailableVoices(): SpeechSynthesisVoice[] {
    return this.synthesis.getVoices()
  }

  // Wait for voices to load (they load asynchronously)
  async waitForVoices(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
      let voices = this.synthesis.getVoices()
      
      if (voices.length > 0) {
        resolve(voices)
        return
      }

      const voicesChangedHandler = () => {
        voices = this.synthesis.getVoices()
        if (voices.length > 0) {
          this.synthesis.removeEventListener('voiceschanged', voicesChangedHandler)
          resolve(voices)
        }
      }

      this.synthesis.addEventListener('voiceschanged', voicesChangedHandler)
      
      // Fallback timeout
      setTimeout(() => {
        this.synthesis.removeEventListener('voiceschanged', voicesChangedHandler)
        resolve(this.synthesis.getVoices())
      }, 3000)
    })
  }

  // Diagnostic function to test speech recognition
  async testSpeechRecognition(): Promise<string> {
    console.log('=== Speech Recognition Test ===')
    console.log('Browser:', navigator.userAgent)
    console.log('Secure context:', window.isSecureContext)
    console.log('Recognition available:', !!this.recognition)
    console.log('Recognition initialized:', this.isInitialized)
    
    if (!this.recognition) {
      return 'Speech recognition not available'
    }

    try {
      // Test microphone permissions
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      console.log('Microphone access: OK')
      
      return 'Speech recognition ready'
    } catch (error) {
      console.error('Microphone test failed:', error)
      return `Microphone test failed: ${error}`
    }
  }
}

export const speechService = new SpeechService()