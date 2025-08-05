import type { SessionResponse, OpenRouterMessage } from '../types'

class OpenRouterService {
  private baseUrl = 'https://openrouter.ai/api/v1'
  private model = 'google/gemma-3n-e4b-it:free'
  private apiKey: string

  constructor() {
    // In production, this would come from environment variables
    this.apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || ''
  }

  async generateResponse(userInput: string, currentCode: string): Promise<SessionResponse> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured')
    }

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are an AI Python tutor for Project-R. You help students learn Python through conversation and code assistance.

CRITICAL: You must respond with valid JSON in EXACTLY this format:
{
  "conversation_response": "Your helpful response to the user as their Python tutor. Keep this conversational and friendly. Avoid code blocks in this field.",
  "code_to_insert": "Any Python code to insert/replace in the editor, or empty string if no code changes needed"
}

IMPORTANT JSON RULES:
- Field names must be EXACTLY: "conversation_response" and "code_to_insert"
- Valid JSON syntax only
- No additional text outside the JSON
- Keep conversation_response concise to avoid truncation
- Escape quotes properly with \\"
- Only include runnable Python code in code_to_insert

Guidelines:
- Be encouraging and educational in conversation_response
- Explain concepts clearly but keep responses reasonably short
- Provide working Python code in code_to_insert when requested
- If the user asks to fix code, provide the corrected version in code_to_insert
- If user asks to add features, provide the enhanced code in code_to_insert

Remember: Respond ONLY with valid JSON, no additional text.`
      },
      {
        role: 'user',
        content: `Current Python code in the editor:
\`\`\`python
${currentCode}
\`\`\`

User said: "${userInput}"`
      }
    ]

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.href,
          'X-Title': 'Project-R Web'
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.7,
          max_tokens: 2000
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenRouter API error: ${response.status} ${errorText}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content

      if (!content) {
        throw new Error('No response content from OpenRouter')
      }

      return this.parseJsonResponse(content)
    } catch (error) {
      console.error('OpenRouter API error:', error)
      throw error
    }
  }

  private parseJsonResponse(response: string): SessionResponse {
    try {
      // First try normal JSON parsing
      return JSON.parse(response)
    } catch (error) {
      // Try to fix common JSON issues
      let fixedResponse = response.trim()
      
      // Remove any text before the first {
      const firstBrace = fixedResponse.indexOf('{')
      if (firstBrace > 0) {
        fixedResponse = fixedResponse.substring(firstBrace)
      }
      
      // Remove any text after the last }
      const lastBrace = fixedResponse.lastIndexOf('}')
      if (lastBrace < fixedResponse.length - 1) {
        fixedResponse = fixedResponse.substring(0, lastBrace + 1)
      }

      try {
        return JSON.parse(fixedResponse)
      } catch (secondError) {
        // Manual extraction as fallback
        return this.manualJsonExtraction(response)
      }
    }
  }

  private manualJsonExtraction(response: string): SessionResponse {
    let conversationResponse = ''
    let codeToInsert = ''

    // Try to extract conversation_response
    const conversationMatch = response.match(/"conversation_response"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/)
    if (conversationMatch) {
      conversationResponse = conversationMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
    }

    // Try to extract code_to_insert
    const codeMatch = response.match(/"code_to_insert"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/)
    if (codeMatch) {
      codeToInsert = codeMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
    }

    if (!conversationResponse) {
      throw new Error('Could not extract conversation_response from LLM response')
    }

    return {
      conversation_response: conversationResponse,
      code_to_insert: codeToInsert
    }
  }

  async generateSessionSummary(messages: any[]): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured')
    }

    const formattedMessages = messages.map(m => {
      const role = m.role === 'user' ? 'Student' : 'AI Tutor'
      return `${role}: ${m.content}`
    }).join('\n\n')

    const summaryMessages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are a session summary generator for an AI Python tutoring application. Your task is to create a concise summary of a tutoring session based on the conversation between a user and an AI tutor.

Given the session conversation history, generate a summary in EXACTLY this format:

Session name: [Generate a descriptive name for this session based on the main topics/concepts covered]
Summary: [Write a concise 2-3 sentence summary of what was learned, discussed, or accomplished in this session. Focus on the key programming concepts, techniques, or problems that were covered.]

Important guidelines:
- The session name should be descriptive and specific (e.g., "Python List Comprehensions and Filtering", "Debugging IndexError in For Loops", "Introduction to Functions and Parameters")
- The summary should focus on learning outcomes and key concepts
- Keep the summary concise but informative
- Use clear, educational language
- Do not include any other text or formatting outside of the specified format`
      },
      {
        role: 'user',
        content: `Session conversation:\n${formattedMessages}`
      }
    ]

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.href,
          'X-Title': 'Project-R Web'
        },
        body: JSON.stringify({
          model: this.model,
          messages: summaryMessages,
          temperature: 0.1,
          max_tokens: 200
        })
      })

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`)
      }

      const data = await response.json()
      return data.choices?.[0]?.message?.content?.trim() || ''
    } catch (error) {
      console.error('Session summary generation error:', error)
      throw error
    }
  }

  async generatePracticeQuestions(sessionSummary: string): Promise<any[]> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured')
    }

    const practiceMessages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are a Quiz Creator. Based on the following session summary, generate 5 multiple-choice questions in a valid JSON array format. Each question object should have keys: 'question_text', 'options' (an array of 4 strings), and 'correct_answer'.

CRITICAL: You must respond with valid JSON in EXACTLY this format:
[
  {
    "question_text": "What is the main concept discussed in this session?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Option A"
  },
  {
    "question_text": "Which Python feature was demonstrated?",
    "options": ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],
    "correct_answer": "Feature 2"
  },
  {
    "question_text": "What was the key learning outcome?",
    "options": ["Outcome A", "Outcome B", "Outcome C", "Outcome D"],
    "correct_answer": "Outcome C"
  },
  {
    "question_text": "Which programming technique was explained?",
    "options": ["Technique 1", "Technique 2", "Technique 3", "Technique 4"],
    "correct_answer": "Technique 4"
  },
  {
    "question_text": "What was the practical application shown?",
    "options": ["Application A", "Application B", "Application C", "Application D"],
    "correct_answer": "Application B"
  }
]

IMPORTANT RULES:
- Generate EXACTLY 5 questions
- Each question must have EXACTLY 4 options
- The correct_answer must be one of the 4 options (exact match)
- Valid JSON syntax only
- No additional text outside the JSON array
- Base questions on the session content provided
- Make questions educational and relevant to Python learning
- Ensure correct_answer value exactly matches one of the options

Remember: Respond ONLY with valid JSON array, no additional text.`
      },
      {
        role: 'user',
        content: `Session Summary:\n${sessionSummary}`
      }
    ]

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.href,
          'X-Title': 'Project-R Web'
        },
        body: JSON.stringify({
          model: this.model,
          messages: practiceMessages,
          temperature: 0.3,
          max_tokens: 2000
        })
      })

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content?.trim()

      if (!content) {
        throw new Error('No practice questions generated')
      }

      return JSON.parse(content)
    } catch (error) {
      console.error('Practice questions generation error:', error)
      throw error
    }
  }
}

export const openRouterService = new OpenRouterService()