use reqwest;
use serde::{Deserialize, Serialize};
use serde_json;

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionLLMRequest {
    pub model: String,
    pub prompt: String,
    pub stream: bool,
    pub format: String, // "json" for structured responses
    pub options: RequestOptions,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RequestOptions {
    pub num_predict: i32,    // Maximum tokens to generate
    pub temperature: f32,    // Randomness (0.0 to 1.0)
    pub top_p: f32,         // Nucleus sampling
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionLLMResponse {
    pub model: String,
    pub created_at: String,
    pub response: String,
    pub done: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionResponse {
    pub conversation_response: String,
    pub code_to_insert: String,
}

pub struct OllamaClient {
    base_url: String,
    client: reqwest::Client,
}

impl OllamaClient {
    pub fn new(base_url: Option<String>) -> Self {
        Self {
            base_url: base_url.unwrap_or_else(|| "http://localhost:11434".to_string()),
            client: reqwest::Client::new(),
        }
    }

    pub async fn check_connection(&self) -> Result<(), String> {
        let url = format!("{}/api/tags", self.base_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}. Make sure Ollama is running.", e))?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(format!("Ollama returned status: {}", response.status()))
        }
    }

    pub async fn ensure_model(&self, model_name: &str) -> Result<(), String> {
        // Check if model exists by listing models
        let url = format!("{}/api/tags", self.base_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to check models: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to list models: {}", response.status()));
        }

        let models_response: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse models response: {}", e))?;

        // Check if our model is in the list
        if let Some(models) = models_response.get("models").and_then(|m| m.as_array()) {
            let model_exists = models.iter().any(|model| {
                model.get("name")
                    .and_then(|name| name.as_str())
                    .map(|name| name.contains(model_name))
                    .unwrap_or(false)
            });

            if model_exists {
                println!("Model {} is already available", model_name);
                return Ok(());
            }
        }

        // Model doesn't exist, try to pull it
        println!("Model {} not found. Attempting to pull...", model_name);
        self.pull_model(model_name).await
    }

    pub async fn pull_model(&self, model_name: &str) -> Result<(), String> {
        let url = format!("{}/api/pull", self.base_url);
        
        let request_body = serde_json::json!({
            "name": model_name
        });

        let response = self.client
            .post(&url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to pull model: {}", e))?;

        if response.status().is_success() {
            println!("Successfully pulled model: {}", model_name);
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(format!("Failed to pull model {}: {}", model_name, error_text))
        }
    }

    pub async fn generate_session_response(
        &self,
        user_input: &str,
        current_code: &str,
        model_name: &str,
    ) -> Result<SessionResponse, String> {
        let prompt = self.create_session_prompt(user_input, current_code);
        
        let request = SessionLLMRequest {
            model: model_name.to_string(),
            prompt,
            stream: false,
            format: "json".to_string(),
            options: RequestOptions {
                num_predict: 2000,    // Increase token limit to prevent truncation
                temperature: 0.7,     
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

        let llm_response: SessionLLMResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

        // Parse the JSON response from the LLM with error handling for truncation
        let session_response = self.parse_json_response(&llm_response.response)?;
        Ok(session_response)
    }

    fn parse_json_response(&self, response: &str) -> Result<SessionResponse, String> {
        // First try normal JSON parsing
        match serde_json::from_str::<SessionResponse>(response) {
            Ok(parsed) => return Ok(parsed),
            Err(_) => {
                // If JSON parsing fails, try to fix common issues
                
                // Handle truncated JSON by attempting to complete it
                let mut fixed_response = response.to_string();
                
                // If response ends abruptly, try to close the JSON properly
                if !fixed_response.trim().ends_with('}') {
                    // Count opening and closing braces to see if we need to close
                    let open_braces = fixed_response.matches('{').count();
                    let close_braces = fixed_response.matches('}').count();
                    
                    if open_braces > close_braces {
                        // Try to find where conversation_response field ends
                        if fixed_response.contains("\"conversation_response\"") && !fixed_response.contains("\"code_to_insert\"") {
                            // Add empty code field and close JSON
                            fixed_response.push_str("\", \"code_to_insert\": \"\"}");
                        } else if !fixed_response.trim().ends_with('"') {
                            // Close the current string and JSON
                            fixed_response.push_str("\"}");
                        } else {
                            // Just close the JSON
                            fixed_response.push('}');
                        }
                    }
                }
                
                // Try parsing the fixed JSON
                match serde_json::from_str::<SessionResponse>(&fixed_response) {
                    Ok(parsed) => Ok(parsed),
                    Err(e) => {
                        // If still failing, try extracting manually
                        self.manual_json_extraction(response)
                            .or_else(|_| Err(format!("Failed to parse JSON response: {}. Raw response: {}", e, response)))
                    }
                }
            }
        }
    }
    
    fn manual_json_extraction(&self, response: &str) -> Result<SessionResponse, String> {
        // Manual extraction for severely malformed JSON
        let mut conversation_response = String::new();
        let mut code_to_insert = String::new();
        
        // Try to extract conversation_response
        if let Some(start) = response.find("\"conversation_response\"") {
            if let Some(colon_pos) = response[start..].find(':') {
                let after_colon = start + colon_pos + 1;
                if let Some(quote_start) = response[after_colon..].find('"') {
                    let content_start = after_colon + quote_start + 1;
                    // Find the end quote, handling escaped quotes
                    let mut end_pos = content_start;
                    let chars: Vec<char> = response.chars().collect();
                    while end_pos < chars.len() {
                        if chars[end_pos] == '"' && (end_pos == 0 || chars[end_pos - 1] != '\\') {
                            break;
                        }
                        end_pos += 1;
                    }
                    if end_pos < chars.len() {
                        conversation_response = response[content_start..end_pos].to_string();
                    }
                }
            }
        }
        
        // Try to extract code_to_insert
        if let Some(start) = response.find("\"code_to_insert\"") {
            if let Some(colon_pos) = response[start..].find(':') {
                let after_colon = start + colon_pos + 1;
                if let Some(quote_start) = response[after_colon..].find('"') {
                    let content_start = after_colon + quote_start + 1;
                    let mut end_pos = content_start;
                    let chars: Vec<char> = response.chars().collect();
                    while end_pos < chars.len() {
                        if chars[end_pos] == '"' && (end_pos == 0 || chars[end_pos - 1] != '\\') {
                            break;
                        }
                        end_pos += 1;
                    }
                    if end_pos < chars.len() {
                        code_to_insert = response[content_start..end_pos].to_string();
                    }
                }
            }
        }
        
        if !conversation_response.is_empty() {
            Ok(SessionResponse {
                conversation_response,
                code_to_insert,
            })
        } else {
            Err("Could not extract conversation_response".to_string())
        }
    }

    fn create_session_prompt(&self, user_input: &str, current_code: &str) -> String {
        format!(
            r#"You are an AI Python tutor for Project-R. You help students learn Python through conversation and code assistance.

Current Python code in the editor:
```python
{}
```

User said: "{}"

CRITICAL: You must respond with valid JSON in EXACTLY this format:
{{
  "conversation_response": "Your helpful response to the user as their Python tutor. Keep this conversational and friendly. Avoid code blocks in this field.",
  "code_to_insert": "Any Python code to insert/replace in the editor, or empty string if no code changes needed"
}}

IMPORTANT JSON RULES:
- Field names must be EXACTLY: "conversation_response" and "code_to_insert"
- Valid JSON syntax only
- No additional text outside the JSON
- Keep conversation_response concise to avoid truncation
- Escape quotes properly with \"

Guidelines:
- Be encouraging and educational in conversation_response
- Explain concepts clearly but keep responses reasonably short
- Provide working Python code in code_to_insert when requested
- If the user asks to fix code, provide the corrected version in code_to_insert
- If user asks to add features, provide the enhanced code in code_to_insert
- Only include runnable Python code in code_to_insert

Remember: Respond ONLY with valid JSON, no additional text."#,
            current_code,
            user_input
        )
    }
}

// Test function to verify Ollama connection
pub async fn test_ollama_connection() -> Result<String, String> {
    let client = OllamaClient::new(None);
    client.check_connection().await?;
    Ok("Successfully connected to Ollama".to_string())
}