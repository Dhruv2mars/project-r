import type { Session, Message, PracticeSheet, PracticeAttempt } from '../types'

class StorageService {
  private getStorageKey(key: string): string {
    return `project-r-${key}`
  }

  private save<T>(key: string, data: T): void {
    try {
      localStorage.setItem(this.getStorageKey(key), JSON.stringify(data))
    } catch (error) {
      console.error(`Failed to save ${key}:`, error)
    }
  }

  private load<T>(key: string, defaultValue: T): T {
    try {
      const data = localStorage.getItem(this.getStorageKey(key))
      return data ? JSON.parse(data) : defaultValue
    } catch (error) {
      console.error(`Failed to load ${key}:`, error)
      return defaultValue
    }
  }

  private remove(key: string): void {
    try {
      localStorage.removeItem(this.getStorageKey(key))
    } catch (error) {
      console.error(`Failed to remove ${key}:`, error)
    }
  }

  // Session management
  saveSessions(sessions: Session[]): void {
    this.save('sessions', sessions)
  }

  loadSessions(): Session[] {
    return this.load('sessions', [])
  }

  // Message management
  saveMessages(sessionId: string, messages: Message[]): void {
    this.save(`messages-${sessionId}`, messages)
  }

  loadMessages(sessionId: string): Message[] {
    return this.load(`messages-${sessionId}`, [])
  }

  deleteMessages(sessionId: string): void {
    this.remove(`messages-${sessionId}`)
  }

  // Practice sheet management
  savePracticeSheets(practiceSheets: PracticeSheet[]): void {
    this.save('practice-sheets', practiceSheets)
  }

  loadPracticeSheets(): PracticeSheet[] {
    return this.load('practice-sheets', [])
  }

  // Practice attempt management
  savePracticeAttempt(practiceSheetId: string, attempt: PracticeAttempt): void {
    this.save(`practice-attempt-${practiceSheetId}`, attempt)
  }

  loadPracticeAttempt(practiceSheetId: string): PracticeAttempt | null {
    const attempt = this.load(`practice-attempt-${practiceSheetId}`, null)
    return attempt
  }

  // Practice questions management
  savePracticeQuestions(practiceSheetId: string, questions: any[]): void {
    this.save(`practice-questions-${practiceSheetId}`, questions)
  }

  loadPracticeQuestions(practiceSheetId: string): any[] {
    return this.load(`practice-questions-${practiceSheetId}`, [])
  }

  // User memory management
  saveUserMemory(memory: string): void {
    this.save('user-memory', memory)
  }

  loadUserMemory(): string {
    return this.load('user-memory', '')
  }

  // Current code state
  saveCurrentCode(code: string): void {
    this.save('current-code', code)
  }

  loadCurrentCode(): string {
    return this.load('current-code', '')
  }

  // Clear all data (for testing/reset)
  clearAll(): void {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('project-r-')) {
        localStorage.removeItem(key)
      }
    })
  }
}

export const storageService = new StorageService()