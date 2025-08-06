import type { VercelRequest, VercelResponse } from '@vercel/node'

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

  const { sessionSummary } = req.body as { sessionSummary: string }

  if (!sessionSummary) {
    return res.status(400).json({ error: 'Session summary is required' })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenRouter API key not configured' })
  }

  try {
    const practiceMessages = [
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

    // Parse the JSON response
    const questions = JSON.parse(content)

    // Validate we have exactly 5 questions
    if (!Array.isArray(questions) || questions.length !== 5) {
      throw new Error(`Expected 5 questions, got ${questions.length}`)
    }

    // Validate each question has 4 options
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i]
      if (!question.options || question.options.length !== 4) {
        throw new Error(`Question ${i + 1} has ${question.options?.length || 0} options, expected 4`)
      }
      
      // Validate correct_answer is one of the options
      if (!question.options.includes(question.correct_answer)) {
        throw new Error(`Question ${i + 1}: correct_answer '${question.correct_answer}' is not in options`)
      }
    }

    res.status(200).json({ questions })
  } catch (error) {
    console.error('Practice questions generation error:', error)
    res.status(500).json({ 
      error: 'Failed to generate practice questions',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}