import type { ExecutionResult, Judge0Submission } from '../types'

class Judge0Service {
  private baseUrl = 'https://judge0-ce.p.rapidapi.com'
  private apiKey: string

  constructor() {
    // In production, this would come from environment variables
    this.apiKey = import.meta.env.VITE_JUDGE0_API_KEY || ''
  }

  async executeCode(code: string, stdin = ''): Promise<ExecutionResult> {
    if (!this.apiKey) {
      // Fallback for when API key is not available
      console.warn('Judge0 API key not configured, using mock execution')
      return this.mockExecution(code, stdin)
    }

    const submission: Judge0Submission = {
      source_code: code,
      language_id: 71, // Python 3
      stdin: stdin,
      wait: true
    }

    try {
      const response = await fetch(`${this.baseUrl}/submissions`, {
        method: 'POST',
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submission)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Judge0 API error: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      
      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        status: result.status?.description || 'Unknown'
      }
    } catch (error) {
      console.error('Judge0 execution error:', error)
      
      // Return error as execution result
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Code execution failed',
        status: 'Error'
      }
    }
  }

  private mockExecution(code: string, stdin: string): ExecutionResult {
    // Simple mock execution for development/demo purposes
    try {
      // Basic pattern matching for common Python patterns
      if (code.includes('print(')) {
        const printMatches = code.match(/print\((.*?)\)/g)
        if (printMatches) {
          const outputs = printMatches.map(match => {
            const content = match.match(/print\((.*?)\)/)?.[1] || ''
            // Remove quotes if they exist
            return content.replace(/['"]/g, '')
          })
          return {
            stdout: outputs.join('\n') + '\n',
            stderr: '',
            status: 'Accepted'
          }
        }
      }

      if (code.includes('input(')) {
        // If code has input() and we have stdin, simulate interaction
        if (stdin) {
          return {
            stdout: `Input received: ${stdin}\n`,
            stderr: '',
            status: 'Accepted'
          }
        } else {
          return {
            stdout: '',
            stderr: 'Program requires input but none provided',
            status: 'Runtime Error'
          }
        }
      }

      // Default successful execution
      return {
        stdout: 'Code executed successfully (mock)\n',
        stderr: '',
        status: 'Accepted'
      }
    } catch (error) {
      return {
        stdout: '',
        stderr: 'Mock execution error',
        status: 'Runtime Error'
      }
    }
  }

  async getSubmission(submissionId: string): Promise<ExecutionResult> {
    if (!this.apiKey) {
      throw new Error('Judge0 API key not configured')
    }

    try {
      const response = await fetch(`${this.baseUrl}/submissions/${submissionId}`, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
        }
      })

      if (!response.ok) {
        throw new Error(`Judge0 API error: ${response.status}`)
      }

      const result = await response.json()
      
      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        status: result.status?.description || 'Unknown'
      }
    } catch (error) {
      console.error('Judge0 get submission error:', error)
      throw error
    }
  }

  // Helper method to check if Judge0 is available
  isAvailable(): boolean {
    return !!this.apiKey
  }

  // Get supported languages (for future use)
  async getLanguages(): Promise<any[]> {
    if (!this.apiKey) {
      return []
    }

    try {
      const response = await fetch(`${this.baseUrl}/languages`, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
        }
      })

      if (!response.ok) {
        throw new Error(`Judge0 API error: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Judge0 get languages error:', error)
      return []
    }
  }
}

export const judge0Service = new Judge0Service()