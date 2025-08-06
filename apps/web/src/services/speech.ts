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
    console.log('=== STARTING SPEECH RECOGNITION DEBUG ===')
    console.log('Recognition instance:', this.recognition)
    console.log('Is initialized:', this.isInitialized)
    console.log('Navigator online:', navigator.onLine)
    console.log('Secure context:', window.isSecureContext)
    
    if (!this.recognition || !this.isInitialized) {
      console.error('❌ Speech recognition not available')
      throw new Error('Speech recognition not available in this browser. Please use Chrome.')
    }

    return new Promise((resolve, reject) => {
      let finalTranscript = ''
      let resolved = false

      // Minimal event handlers with maximum logging
      this.recognition!.onstart = () => {
        console.log('✅ Speech recognition STARTED successfully')
      }

      this.recognition!.onresult = (event: SpeechRecognitionEvent) => {
        console.log('📝 Speech recognition RESULT received:', event)
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          console.log(`Result ${i}: "${transcript}" (final: ${event.results[i].isFinal})`)
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript
            if (!resolved) {
              resolved = true
              console.log('🎉 Final transcript:', finalTranscript.trim())
              resolve(finalTranscript.trim())
            }
          }
        }
      }

      this.recognition!.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('❌ SPEECH RECOGNITION ERROR:', {
          error: event.error,
          message: event.message,
          type: event.type,
          timestamp: new Date().toISOString()
        })
        
        if (!resolved) {
          resolved = true
          // Log the EXACT error we're getting
          reject(new Error(`ACTUAL ERROR: ${event.error} - ${event.message || 'No message'}`))
        }
      }

      this.recognition!.onend = () => {
        console.log('🔚 Speech recognition ENDED')
        console.log('Final transcript at end:', finalTranscript)
        
        if (!resolved) {
          resolved = true
          if (finalTranscript.trim()) {
            resolve(finalTranscript.trim())
          } else {
            reject(new Error('Speech recognition ended without results'))
          }
        }
      }

      // Attempt to start with maximum logging
      try {
        console.log('🎤 Attempting to start recognition...')
        this.recognition!.start()
        console.log('✅ Recognition.start() called successfully')
      } catch (startError) {
        console.error('❌ Error calling start():', startError)
        reject(new Error(`Failed to start: ${startError}`))
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

  // Reset recognition instance to handle Chrome's session issues
  resetRecognition(): void {
    console.log('Resetting speech recognition instance')
    if (this.recognition) {
      try {
        this.recognition.abort()
      } catch (error) {
        console.log('Error aborting recognition:', error)
      }
    }
    
    // Re-initialize recognition
    this.initializeRecognition()
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

  // Simple standalone test that can be called from console
  simpleTest(): void {
    console.log('🧪 SIMPLE SPEECH TEST - Click allow on microphone and speak')
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    
    if (!SpeechRecognition) {
      console.error('❌ SpeechRecognition not supported')
      return
    }
    
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    
    recognition.onstart = () => console.log('🎤 Recording started - SPEAK NOW!')
    recognition.onresult = (event: any) => {
      console.log('📝 Got result:', event.results[0][0].transcript)
    }
    recognition.onerror = (event: any) => {
      console.error('❌ Error:', event.error, event.message)
    }
    recognition.onend = () => console.log('🔚 Recording ended')
    
    try {
      recognition.start()
      console.log('✅ Started successfully')
    } catch (error) {
      console.error('❌ Failed to start:', error)
    }
  }
}

export const speechService = new SpeechService()

// Make available globally for debugging
;(window as any).speechService = speechService
;(window as any).testSpeech = () => speechService.simpleTest()