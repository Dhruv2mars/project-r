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
      // Chrome-specific implementation
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition()
        if (this.recognition) {
          this.recognition.continuous = false
          this.recognition.interimResults = true
          this.recognition.lang = 'en-US'
          this.isInitialized = true
        }
      } else {
        console.warn('Speech Recognition not supported in this browser')
      }
    } catch (error) {
      console.error('Failed to initialize speech recognition:', error)
    }
  }

  async startRecording(): Promise<string> {
    if (!this.recognition || !this.isInitialized) {
      throw new Error('Speech recognition not available')
    }

    return new Promise((resolve, reject) => {
      let finalTranscript = ''
      let timeoutId: number

      // Set a timeout to prevent hanging
      timeoutId = setTimeout(() => {
        this.recognition?.stop()
        if (finalTranscript) {
          resolve(finalTranscript)
        } else {
          reject(new Error('Recording timeout - no speech detected'))
        }
      }, 30000) // 30 second timeout

      this.recognition!.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }

        // If we have a final result, resolve immediately
        if (finalTranscript.trim()) {
          clearTimeout(timeoutId)
          resolve(finalTranscript.trim())
        }
      }

      this.recognition!.onerror = (event: SpeechRecognitionErrorEvent) => {
        clearTimeout(timeoutId)
        console.error('Speech recognition error:', event.error)
        reject(new Error(`Speech recognition error: ${event.error}`))
      }

      this.recognition!.onend = () => {
        clearTimeout(timeoutId)
        if (finalTranscript.trim()) {
          resolve(finalTranscript.trim())
        } else {
          reject(new Error('No speech was recognized'))
        }
      }

      // Start recording
      try {
        this.recognition!.start()
      } catch (error) {
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
}

export const speechService = new SpeechService()