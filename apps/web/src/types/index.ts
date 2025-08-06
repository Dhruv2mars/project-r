// Import global type definitions
import './global'

// Core data types
export interface Session {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  session_id: string
  role: string
  content: string
  created_at: string
}

export interface PracticeSheet {
  id: string
  session_id: string
  title: string
  is_completed: boolean
  is_redo_ready: boolean
  created_at: string
}

export interface PracticeQuestion {
  id: string
  practice_sheet_id: string
  question_text: string
  options: string[]
  correct_answer: string
  question_order: number
}

export interface PracticeAttempt {
  id: string
  practice_sheet_id: string
  user_answers: string[]
  score: number
  total_questions: number
  completed_at: string
}

export interface User {
  id: string
  memory_content: string
  created_at: string
  updated_at: string
}

// API Response types
export interface SessionResponse {
  conversation_response: string
  code_to_insert: string
}

export interface ExecutionResult {
  stdout: string
  stderr: string
  status: string
}

// Service types
export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface Judge0Submission {
  source_code: string
  language_id: number
  stdin?: string | null
}

// State types
export interface AppState {
  // Session management
  sessions: Session[]
  currentSession: Session | null
  messages: Message[]
  
  // Practice system
  practiceSheets: PracticeSheet[]
  currentPracticeSheet: PracticeSheet | null
  practiceQuestions: PracticeQuestion[]
  
  // UI state
  isRecording: boolean
  isProcessing: boolean
  isSpeaking: boolean
  loading: boolean
  
  // User data
  userMemory: string
  currentCode: string
  
  // Actions
  createSession: (title: string) => Promise<void>
  loadSessions: () => Promise<void>
  selectSession: (session: Session) => Promise<void>
  addMessage: (role: string, content: string) => Promise<void>
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  
  // Practice actions
  loadPracticeSheets: () => Promise<void>
  createPracticeSheet: (sessionId: string, title: string) => Promise<void>
  completePracticeSheet: (practiceSheetId: string, userAnswers: string[], score: number) => Promise<void>
  
  // AI actions
  executeCode: (code: string, stdin?: string) => Promise<ExecutionResult>
  generateResponse: (userInput: string, currentCode: string) => Promise<SessionResponse>
  startRecording: () => Promise<string>
  speak: (text: string) => Promise<void>
  
  // Memory actions
  updateUserMemory: (content: string) => Promise<void>
  loadUserMemory: () => Promise<void>
}