import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { 
  AppState, 
  Session, 
  Message, 
  PracticeSheet, 
  PracticeQuestion,
  ExecutionResult,
  SessionResponse 
} from '../types'

// We'll implement these services next
import { storageService } from '../services/storage'
import { openRouterService } from '../services/openRouter'
import { judge0Service } from '../services/judge0'
import { speechService } from '../services/speech'

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: [],
      currentSession: null,
      messages: [],
      practiceSheets: [],
      currentPracticeSheet: null,
      practiceQuestions: [],
      isRecording: false,
      isProcessing: false,
      isSpeaking: false,
      loading: false,
      userMemory: '',
      currentCode: '',

      // Session management actions
      createSession: async (title: string) => {
        const session: Session = {
          id: crypto.randomUUID(),
          title,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        
        const currentSessions = get().sessions
        const updatedSessions = [session, ...currentSessions]
        
        // Save to storage
        storageService.saveSessions(updatedSessions)
        
        set({ 
          sessions: updatedSessions,
          currentSession: session,
          messages: []
        })
      },

      loadSessions: async () => {
        set({ loading: true })
        try {
          const sessions = storageService.loadSessions()
          set({ sessions, loading: false })
        } catch (error) {
          console.error('Failed to load sessions:', error)
          set({ loading: false })
        }
      },

      selectSession: async (session: Session) => {
        set({ loading: true, currentSession: session })
        try {
          const messages = storageService.loadMessages(session.id)
          set({ messages, loading: false })
        } catch (error) {
          console.error('Failed to load session messages:', error)
          set({ loading: false })
        }
      },

      addMessage: async (role: string, content: string) => {
        const currentSession = get().currentSession
        if (!currentSession) return

        const message: Message = {
          id: crypto.randomUUID(),
          session_id: currentSession.id,
          role,
          content,
          created_at: new Date().toISOString()
        }

        const currentMessages = get().messages
        const updatedMessages = [...currentMessages, message]

        // Save to storage
        storageService.saveMessages(currentSession.id, updatedMessages)

        // Update session timestamp
        const updatedSession = {
          ...currentSession,
          updated_at: new Date().toISOString()
        }
        
        const currentSessions = get().sessions
        const updatedSessions = currentSessions.map(s => 
          s.id === currentSession.id ? updatedSession : s
        )
        
        storageService.saveSessions(updatedSessions)

        set({ 
          messages: updatedMessages,
          currentSession: updatedSession,
          sessions: updatedSessions
        })
      },

      updateSessionTitle: async (sessionId: string, title: string) => {
        const currentSessions = get().sessions
        const updatedSessions = currentSessions.map(session =>
          session.id === sessionId
            ? { ...session, title, updated_at: new Date().toISOString() }
            : session
        )
        
        storageService.saveSessions(updatedSessions)
        set({ sessions: updatedSessions })

        // Update current session if it's the one being updated
        const currentSession = get().currentSession
        if (currentSession?.id === sessionId) {
          set({ currentSession: { ...currentSession, title } })
        }
      },

      deleteSession: async (sessionId: string) => {
        const currentSessions = get().sessions
        const updatedSessions = currentSessions.filter(s => s.id !== sessionId)
        
        storageService.saveSessions(updatedSessions)
        storageService.deleteMessages(sessionId)
        
        set({ 
          sessions: updatedSessions,
          currentSession: null,
          messages: []
        })
      },

      // Practice sheet actions
      loadPracticeSheets: async () => {
        try {
          const practiceSheets = storageService.loadPracticeSheets()
          set({ practiceSheets })
        } catch (error) {
          console.error('Failed to load practice sheets:', error)
        }
      },

      createPracticeSheet: async (sessionId: string, title: string) => {
        const practiceSheet: PracticeSheet = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          title,
          is_completed: false,
          is_redo_ready: false,
          created_at: new Date().toISOString()
        }

        const currentSheets = get().practiceSheets
        const updatedSheets = [practiceSheet, ...currentSheets]
        
        storageService.savePracticeSheets(updatedSheets)
        set({ practiceSheets: updatedSheets })
      },

      completePracticeSheet: async (practiceSheetId: string, userAnswers: string[], score: number) => {
        const currentSheets = get().practiceSheets
        const updatedSheets = currentSheets.map(sheet =>
          sheet.id === practiceSheetId
            ? { ...sheet, is_completed: true }
            : sheet
        )
        
        storageService.savePracticeSheets(updatedSheets)
        
        // Save the attempt
        storageService.savePracticeAttempt(practiceSheetId, {
          id: crypto.randomUUID(),
          practice_sheet_id: practiceSheetId,
          user_answers: userAnswers,
          score,
          total_questions: userAnswers.length,
          completed_at: new Date().toISOString()
        })
        
        set({ practiceSheets: updatedSheets })
      },

      // AI service actions
      executeCode: async (code: string, stdin?: string): Promise<ExecutionResult> => {
        try {
          return await judge0Service.executeCode(code, stdin)
        } catch (error) {
          console.error('Code execution failed:', error)
          return {
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Unknown error',
            status: 'Error'
          }
        }
      },

      generateResponse: async (userInput: string, currentCode: string): Promise<SessionResponse> => {
        set({ isProcessing: true })
        try {
          const response = await openRouterService.generateResponse(userInput, currentCode)
          set({ isProcessing: false })
          return response
        } catch (error) {
          console.error('Failed to generate response:', error)
          set({ isProcessing: false })
          throw error
        }
      },

      startRecording: async (): Promise<string> => {
        set({ isRecording: true })
        try {
          const transcript = await speechService.startRecording()
          set({ isRecording: false })
          return transcript
        } catch (error) {
          console.error('Recording failed:', error)
          set({ isRecording: false })
          throw error
        }
      },

      speak: async (text: string): Promise<void> => {
        set({ isSpeaking: true })
        try {
          await speechService.speak(text)
          set({ isSpeaking: false })
        } catch (error) {
          console.error('Speech failed:', error)
          set({ isSpeaking: false })
          throw error
        }
      },

      // Memory actions
      updateUserMemory: async (content: string) => {
        storageService.saveUserMemory(content)
        set({ userMemory: content })
      },

      loadUserMemory: async () => {
        const memory = storageService.loadUserMemory()
        set({ userMemory: memory })
      }
    }),
    {
      name: 'project-r-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        practiceSheets: state.practiceSheets,
        userMemory: state.userMemory
      })
    }
  )
)