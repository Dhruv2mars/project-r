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

    const submission = {
      source_code: code,
      language_id: 71, // Python 3
      stdin: stdin || null
    }

    try {
      console.log('Executing code with Judge0:', { code, stdin })
      
      // Use wait=true as query parameter for synchronous execution
      const response = await fetch(`${this.baseUrl}/submissions?wait=true`, {
        method: 'POST',
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submission)
      })

      console.log('Judge0 response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Judge0 API error:', errorText)
        throw new Error(`Judge0 API error: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      console.log('Judge0 result:', result)
      
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
    // Enhanced mock execution for development/demo purposes
    try {
      console.log('Mock execution - Code:', code)
      console.log('Mock execution - Stdin:', stdin)
      
      let output = ''
      
      // Handle print statements
      const printMatches = code.match(/print\((.*?)\)/g)
      if (printMatches) {
        printMatches.forEach(match => {
          const content = match.match(/print\((.*?)\)/)?.[1] || ''
          // Simple evaluation of basic expressions
          try {
            // Handle string literals
            if (content.match(/^["'].*["']$/)) {
              output += content.replace(/['"]/g, '') + '\n'
            }
            // Handle simple arithmetic
            else if (content.match(/^\d+\s*[\+\-\*\/]\s*\d+$/)) {
              const result = eval(content)
              output += result + '\n'
            }
            // Handle variables (simplified)
            else if (content.match(/^\w+$/)) {
              output += `[${content}]\n`
            }
            // Default
            else {
              output += content.replace(/['"]/g, '') + '\n'
            }
          } catch {
            output += content.replace(/['"]/g, '') + '\n'
          }
        })
      }
      
      // Handle input statements
      if (code.includes('input(')) {
        if (stdin.trim()) {
          const inputLines = stdin.split('\n').filter(line => line.trim())
          inputLines.forEach(line => {
            output += `Input: ${line}\n`
          })
        } else {
          return {
            stdout: output,
            stderr: 'Program waiting for input (provide input below)',
            status: 'Needs Input'
          }
        }
      }
      
      // Handle simple variable assignments and calculations
      if (code.includes('=') && !code.includes('==')) {
        const lines = code.split('\n')
        lines.forEach(line => {
          if (line.includes('=') && !line.includes('print(') && !line.trim().startsWith('#')) {
            const parts = line.split('=')
            if (parts.length === 2) {
              const varName = parts[0].trim()
              const value = parts[1].trim()
              output += `${varName} = ${value}\n`
            }
          }
        })
      }
      
      // If no output generated, provide a default
      if (!output.trim()) {
        output = '(Mock execution completed)\n'
      }
      
      return {
        stdout: output,
        stderr: '',
        status: 'Accepted (Mock)'
      }
    } catch (error) {
      return {
        stdout: '',
        stderr: `Mock execution error: ${error}`,
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