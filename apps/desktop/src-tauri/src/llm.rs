use reqwest;
use serde::{Deserialize, Serialize};
use serde_json;

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionLLMRequest {
    pub model: String,
    pub prompt: String,
    pub stream: bool,
    pub format: String, // "json" for structured responses
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

        // Parse the JSON response from the LLM with typo correction
        let corrected_response = self.fix_common_json_typos(&llm_response.response);
        let session_response: SessionResponse = serde_json::from_str(&corrected_response)
            .map_err(|e| format!("Failed to parse session response JSON: {}. Raw response: {}", e, llm_response.response))?;

        Ok(session_response)
    }

    fn fix_common_json_typos(&self, json_str: &str) -> String {
        // Fix common typos in JSON field names
        json_str
            .replace(r#""conversaation_response""#, r#""conversation_response""#)
            .replace(r#""converstaion_response""#, r#""conversation_response""#)
            .replace(r#""conversation_reponse""#, r#""conversation_response""#)
            .replace(r#""conversaton_response""#, r#""conversation_response""#)
    }

    fn create_session_prompt(&self, user_input: &str, current_code: &str) -> String {
        format!(
            r#"You are an AI Python tutor for Project-R. You help students learn Python through conversation and code assistance.

Current Python code in the editor:
```python
{}
```

User said: "{}"

CRITICAL: You must respond with valid JSON in EXACTLY this format with NO TYPOS:
{{
  "conversation_response": "Your helpful response to the user as their Python tutor",
  "code_to_insert": "Any Python code to insert/replace in the editor, or empty string if no code changes needed"
}}

IMPORTANT JSON RULES:
- Field names must be EXACTLY: "conversation_response" and "code_to_insert"
- NO typos in field names (common errors: "conversaation_response", "converstaion_response")
- Valid JSON syntax only
- No additional text outside the JSON

Guidelines:
- Be encouraging and educational
- Explain concepts clearly
- Provide working Python code when requested
- If the user asks to fix code, provide the corrected version
- If user asks to add features, provide the enhanced code
- Keep responses conversational and friendly
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