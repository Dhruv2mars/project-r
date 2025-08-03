use reqwest;
use serde::{Deserialize, Serialize};
use serde_json;

#[derive(Debug, Serialize, Deserialize)]
pub struct PracticeSheetRequest {
    pub model: String,
    pub prompt: String,
    pub stream: bool,
    pub format: String,
    pub options: RequestOptions,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RequestOptions {
    pub num_predict: i32,
    pub temperature: f32,
    pub top_p: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PracticeSheetLLMResponse {
    pub model: String,
    pub created_at: String,
    pub response: String,
    pub done: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QuizQuestion {
    pub question_text: String,
    pub options: Vec<String>,
    pub correct_answer: String,
}

pub struct PracticeSheetLLMClient {
    base_url: String,
    client: reqwest::Client,
}

impl PracticeSheetLLMClient {
    pub fn new(base_url: Option<String>) -> Self {
        Self {
            base_url: base_url.unwrap_or_else(|| "http://localhost:11434".to_string()),
            client: reqwest::Client::new(),
        }
    }

    pub async fn generate_practice_sheet(&self, session_summary: &str, model: &str) -> Result<Vec<QuizQuestion>, String> {
        let prompt = self.create_practice_sheet_prompt(session_summary);
        
        let request = PracticeSheetRequest {
            model: model.to_string(),
            prompt,
            stream: false,
            format: "json".to_string(),
            options: RequestOptions {
                num_predict: 2000,
                temperature: 0.3,  // Lower temperature for more consistent quiz generation
                top_p: 0.9,
            },
        };

        let url = format!("{}/api/generate", self.base_url);
        
        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to send request to Ollama: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Ollama request failed: {}", error_text));
        }

        let llm_response: PracticeSheetLLMResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

        // Parse the JSON response from the LLM
        let questions = self.parse_quiz_response(&llm_response.response)?;
        Ok(questions)
    }

    pub async fn generate_redo_practice_sheet(&self, memory_content: &str, sheet_title: &str, model: &str) -> Result<Vec<QuizQuestion>, String> {
        let prompt = self.create_redo_practice_sheet_prompt(memory_content, sheet_title);
        
        let request = PracticeSheetRequest {
            model: model.to_string(),
            prompt,
            stream: false,
            format: "json".to_string(),
            options: RequestOptions {
                num_predict: 2000,
                temperature: 0.3,  // Lower temperature for more consistent quiz generation
                top_p: 0.9,
            },
        };

        let url = format!("{}/api/generate", self.base_url);
        
        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to send request to Ollama: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Ollama request failed: {}", error_text));
        }

        let llm_response: PracticeSheetLLMResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

        // Parse the JSON response from the LLM
        let questions = self.parse_quiz_response(&llm_response.response)?;
        Ok(questions)
    }

    fn parse_quiz_response(&self, response: &str) -> Result<Vec<QuizQuestion>, String> {
        // First try normal JSON parsing
        match serde_json::from_str::<Vec<QuizQuestion>>(response) {
            Ok(questions) => {
                // Validate we have exactly 5 questions
                if questions.len() != 5 {
                    return Err(format!("Expected 5 questions, got {}", questions.len()));
                }
                
                // Validate each question has 4 options
                for (i, question) in questions.iter().enumerate() {
                    if question.options.len() != 4 {
                        return Err(format!("Question {} has {} options, expected 4", i + 1, question.options.len()));
                    }
                    
                    // Validate correct_answer is one of the options
                    if !question.options.contains(&question.correct_answer) {
                        return Err(format!("Question {}: correct_answer '{}' is not in options", i + 1, question.correct_answer));
                    }
                }
                
                Ok(questions)
            },
            Err(e) => {
                // Try to fix common JSON issues and retry
                let fixed_response = self.fix_json_response(response);
                match serde_json::from_str::<Vec<QuizQuestion>>(&fixed_response) {
                    Ok(questions) => {
                        if questions.len() != 5 {
                            return Err(format!("Expected 5 questions, got {}", questions.len()));
                        }
                        Ok(questions)
                    },
                    Err(_) => Err(format!("Failed to parse quiz JSON: {}. Raw response: {}", e, response))
                }
            }
        }
    }

    fn fix_json_response(&self, response: &str) -> String {
        let mut fixed = response.to_string();
        
        // Remove any text before the first [
        if let Some(start) = fixed.find('[') {
            fixed = fixed[start..].to_string();
        }
        
        // Remove any text after the last ]
        if let Some(end) = fixed.rfind(']') {
            fixed = fixed[..=end].to_string();
        }
        
        // Try to close incomplete JSON if it ends abruptly
        if !fixed.trim().ends_with(']') {
            // Count brackets to see if we need to close
            let open_brackets = fixed.matches('[').count();
            let close_brackets = fixed.matches(']').count();
            let open_braces = fixed.matches('{').count();
            let close_braces = fixed.matches('}').count();
            
            // Close any open braces first
            for _ in close_braces..open_braces {
                fixed.push('}');
            }
            
            // Close any open brackets
            for _ in close_brackets..open_brackets {
                fixed.push(']');
            }
        }
        
        fixed
    }

    fn create_practice_sheet_prompt(&self, session_summary: &str) -> String {
        format!(
            r#"You are a Quiz Creator. Based on the following session summary, generate 5 multiple-choice questions in a valid JSON array format. Each question object should have keys: 'question_text', 'options' (an array of 4 strings), and 'correct_answer'.

Session Summary:
{}

CRITICAL: You must respond with valid JSON in EXACTLY this format:
[
  {{
    "question_text": "What is the main concept discussed in this session?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Option A"
  }},
  {{
    "question_text": "Which Python feature was demonstrated?",
    "options": ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],
    "correct_answer": "Feature 2"
  }},
  {{
    "question_text": "What was the key learning outcome?",
    "options": ["Outcome A", "Outcome B", "Outcome C", "Outcome D"],
    "correct_answer": "Outcome C"
  }},
  {{
    "question_text": "Which programming technique was explained?",
    "options": ["Technique 1", "Technique 2", "Technique 3", "Technique 4"],
    "correct_answer": "Technique 4"
  }},
  {{
    "question_text": "What was the practical application shown?",
    "options": ["Application A", "Application B", "Application C", "Application D"],
    "correct_answer": "Application B"
  }}
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

Remember: Respond ONLY with valid JSON array, no additional text."#,
            session_summary
        )
    }

    fn create_redo_practice_sheet_prompt(&self, memory_content: &str, sheet_title: &str) -> String {
        format!(
            r#"You are an Adaptive Learning Specialist. Analyze the user's memory profile provided below, specifically their past incorrect answers on the quiz titled '{}'. Generate 5 NEW, targeted multiple-choice questions that focus on those specific weak areas. Respond in a valid JSON array format.

User's Memory Profile:
{}

CRITICAL: You must respond with valid JSON in EXACTLY this format:
[
  {{
    "question_text": "Based on your previous mistakes, what is the correct approach to...?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Option A"
  }},
  {{
    "question_text": "You previously got this wrong - which Python concept is most important for...?",
    "options": ["Concept 1", "Concept 2", "Concept 3", "Concept 4"],
    "correct_answer": "Concept 2"
  }},
  {{
    "question_text": "Let's reinforce this topic where you made an error - what happens when...?",
    "options": ["Result A", "Result B", "Result C", "Result D"],
    "correct_answer": "Result C"
  }},
  {{
    "question_text": "This was a challenging area for you - which method should be used to...?",
    "options": ["Method 1", "Method 2", "Method 3", "Method 4"],
    "correct_answer": "Method 4"
  }},
  {{
    "question_text": "Building on your previous attempt, what is the best practice for...?",
    "options": ["Practice A", "Practice B", "Practice C", "Practice D"],
    "correct_answer": "Practice B"
  }}
]

IMPORTANT ADAPTIVE LEARNING RULES:
- Generate EXACTLY 5 questions
- Each question must have EXACTLY 4 options
- The correct_answer must be one of the 4 options (exact match)
- Focus on the topics where the user made mistakes in their previous attempt
- If the user got everything right, create questions that deepen understanding of the same topics
- Make questions MORE challenging and specific than the original practice sheet
- Reference their learning journey subtly in question phrasing
- Valid JSON syntax only
- No additional text outside the JSON array

Remember: These questions should help the user master the areas where they struggled. Respond ONLY with valid JSON array, no additional text."#,
            sheet_title,
            memory_content
        )
    }
}

// Helper function to extract session title from summary
pub fn extract_session_title_from_summary(summary: &str) -> String {
    // Look for "Session name: " pattern
    if let Some(start) = summary.find("Session name: ") {
        let after_prefix = &summary[start + 14..]; // 14 is length of "Session name: "
        if let Some(end) = after_prefix.find('\n') {
            return after_prefix[..end].trim().to_string();
        } else {
            return after_prefix.trim().to_string();
        }
    }
    
    // Fallback to generic title
    "Practice Sheet".to_string()
}