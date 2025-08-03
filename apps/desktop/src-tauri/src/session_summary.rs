use reqwest;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionSummaryRequest {
    pub model: String,
    pub prompt: String,
    pub stream: bool,
    pub options: RequestOptions,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RequestOptions {
    pub num_predict: i32,    // Maximum tokens to generate
    pub temperature: f32,    // Randomness (0.0 to 1.0)
    pub top_p: f32,         // Nucleus sampling
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionSummaryResponse {
    pub model: String,
    pub created_at: String,
    pub response: String,
    pub done: bool,
}

pub struct SummaryLLMClient {
    base_url: String,
    client: reqwest::Client,
}

impl SummaryLLMClient {
    pub fn new(base_url: Option<String>) -> Self {
        Self {
            base_url: base_url.unwrap_or_else(|| "http://localhost:11434".to_string()),
            client: reqwest::Client::new(),
        }
    }

    pub async fn generate_session_summary(&self, session_messages: &str, model: &str) -> Result<String, String> {
        let system_prompt = r#"You are a session summary generator for an AI Python tutoring application. Your task is to create a concise summary of a tutoring session based on the conversation between a user and an AI tutor.

Given the session conversation history, generate a summary in EXACTLY this format:

Session name: [Generate a descriptive name for this session based on the main topics/concepts covered]
Summary: [Write a concise 2-3 sentence summary of what was learned, discussed, or accomplished in this session. Focus on the key programming concepts, techniques, or problems that were covered.]

Important guidelines:
- The session name should be descriptive and specific (e.g., "Python List Comprehensions and Filtering", "Debugging IndexError in For Loops", "Introduction to Functions and Parameters")
- The summary should focus on learning outcomes and key concepts
- Keep the summary concise but informative
- Use clear, educational language
- Do not include any other text or formatting outside of the specified format"#;

        let full_prompt = format!("{}\n\nSession conversation:\n{}", system_prompt, session_messages);

        let request = SessionSummaryRequest {
            model: model.to_string(),
            prompt: full_prompt,
            stream: false,
            options: RequestOptions {
                num_predict: 200,  // Limit tokens for concise summary
                temperature: 0.1,  // Low temperature for consistent formatting
                top_p: 0.9,
            },
        };

        let url = format!("{}/api/generate", self.base_url);
        
        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to send request: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("API request failed with status: {}", response.status()));
        }

        let summary_response: SessionSummaryResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        Ok(summary_response.response.trim().to_string())
    }

    pub async fn check_connection(&self) -> Result<(), String> {
        let url = format!("{}/api/tags", self.base_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(format!("Ollama connection failed with status: {}", response.status()))
        }
    }
}

// Helper function to extract session title from summary
pub fn extract_session_title_from_summary(summary: &str) -> Option<String> {
    // Look for "Session name: " pattern
    if let Some(start) = summary.find("Session name: ") {
        let after_prefix = &summary[start + 14..]; // 14 is length of "Session name: "
        if let Some(end) = after_prefix.find('\n') {
            let title = after_prefix[..end].trim().to_string();
            if !title.is_empty() {
                return Some(title);
            }
        } else {
            let title = after_prefix.trim().to_string();
            if !title.is_empty() {
                return Some(title);
            }
        }
    }
    None
}

// Helper function to format session messages for LLM input
pub fn format_session_for_summary(messages: &[crate::database::Message]) -> String {
    let mut formatted = String::new();
    
    for message in messages {
        let role = if message.role == "user" { "Student" } else { "AI Tutor" };
        formatted.push_str(&format!("{}: {}\n\n", role, message.content));
    }
    
    formatted
}