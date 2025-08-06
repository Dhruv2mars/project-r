import type { VercelRequest, VercelResponse } from '@vercel/node'

interface Message {
  role: string
  content: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { messages } = req.body as { messages: Message[] }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenRouter API key not configured' })
  }

  try {
    // Format messages for summary generation
    const formattedMessages = messages.map(m => {
      const role = m.role === 'user' ? 'Student' : 'AI Tutor'
      return `${role}: ${m.content}`
    }).join('\n\n')

    const summaryMessages = [
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

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://project-r-web.vercel.app',
        'X-Title': 'Project-R Web'
      },
      body: JSON.stringify({
        model: 'google/gemma-3n-e4b-it:free',
        messages: summaryMessages,
        temperature: 0.1,
        max_tokens: 200
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const data = await response.json()
    const summary = data.choices?.[0]?.message?.content?.trim() || ''

    res.status(200).json({ summary })
  } catch (error) {
    console.error('Session summary generation error:', error)
    res.status(500).json({ 
      error: 'Failed to generate session summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}