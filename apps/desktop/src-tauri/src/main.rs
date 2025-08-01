// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{command, State};

mod audio;
mod whisper;
mod llm;
mod tts;
mod interactive_python;
mod database;
mod session_summary;

// Global state for audio recorder
struct AudioState {
    recorder: Mutex<audio::AudioRecorder>,
}

// Global state for Whisper transcriber
struct WhisperState {
    transcriber: Mutex<whisper::WhisperTranscriber>,
}

// Global state for LLM client
struct LLMState {
    client: llm::OllamaClient,
}

// Global state for TTS engine
struct TTSState {
    engine: Mutex<tts::SystemTTSEngine>,
}

// Global state for Python session manager
struct PythonState {
    session_manager: interactive_python::PythonSessionManager,
}

// Global state for database
struct DatabaseState {
    db: Mutex<database::Database>,
}

// Global state for Summary LLM client
struct SummaryState {
    client: session_summary::SummaryLLMClient,
}

#[command]
async fn execute_python_code(code: String, state: State<'_, PythonState>) -> Result<String, String> {
    state.session_manager.start_python_session(code).await
}

#[command] 
async fn send_python_input(session_id: String, input: String, state: State<'_, PythonState>) -> Result<(), String> {
    state.session_manager.send_input(session_id, input).await
}

#[command]
async fn get_python_output(session_id: String, state: State<'_, PythonState>) -> Result<Vec<String>, String> {
    state.session_manager.get_output(session_id).await
}

#[command]
async fn is_python_session_running(session_id: String, state: State<'_, PythonState>) -> Result<bool, String> {
    state.session_manager.is_session_running(session_id).await
}

#[command]
async fn close_python_session(session_id: String, state: State<'_, PythonState>) -> Result<(), String> {
    state.session_manager.close_session(session_id).await
}

#[command]
async fn test_microphone() -> Result<String, String> {
    audio::test_microphone()
}

#[command]
async fn start_recording(state: State<'_, AudioState>) -> Result<String, String> {
    let mut recorder = state.recorder.lock().map_err(|e| e.to_string())?;
    recorder.start_recording()
}

#[command]
async fn stop_recording(state: State<'_, AudioState>) -> Result<String, String> {
    let mut recorder = state.recorder.lock().map_err(|e| e.to_string())?;
    recorder.stop_recording()
}

#[command]
async fn is_recording(state: State<'_, AudioState>) -> Result<bool, String> {
    let recorder = state.recorder.lock().map_err(|e| e.to_string())?;
    Ok(recorder.is_recording())
}

#[command]
async fn record_audio_sample(duration_secs: u64) -> Result<String, String> {
    println!("Recording audio for {} seconds...", duration_secs);
    audio::record_audio_to_file(duration_secs)
}

#[command]
async fn initialize_whisper(state: State<'_, WhisperState>) -> Result<String, String> {
    println!("Initializing Whisper model...");
    
    // Download model if needed
    let model_path = whisper::ensure_whisper_model().await?;
    
    // Initialize transcriber
    let mut transcriber = state.transcriber.lock().map_err(|e| e.to_string())?;
    transcriber.initialize(&model_path)?;
    
    Ok("Whisper model initialized successfully".to_string())
}

#[command]
async fn transcribe_audio(
    audio_file_path: String,
    state: State<'_, WhisperState>
) -> Result<String, String> {
    println!("Transcribing audio file: {}", audio_file_path);
    
    let transcriber = state.transcriber.lock().map_err(|e| e.to_string())?;
    let transcription = transcriber.transcribe_audio_file(&audio_file_path)?;
    
    println!("Transcription result: {}", transcription);
    Ok(transcription)
}

#[command]
async fn test_ollama_connection() -> Result<String, String> {
    llm::test_ollama_connection().await
}

#[command]
async fn initialize_llm(state: State<'_, LLMState>) -> Result<String, String> {
    println!("Initializing LLM connection...");
    
    // Test connection to Ollama
    state.client.check_connection().await?;
    
    // Ensure Gemma 3n model is available
    state.client.ensure_model("gemma3n").await?;
    
    Ok("LLM initialized successfully with Gemma 3n model".to_string())
}

#[command]
async fn generate_ai_response(
    user_input: String,
    current_code: String,
    session_id: Option<String>,
    llm_state: State<'_, LLMState>,
    db_state: State<'_, DatabaseState>
) -> Result<String, String> {
    println!("Generating AI response for input: {}", user_input);
    
    let response = llm_state.client
        .generate_session_response(&user_input, &current_code, "gemma3n")
        .await?;
    
    // Save conversation history if session_id is provided
    if let Some(ref session_id) = session_id {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        
        // Save user message
        db.add_message(session_id, "user", &user_input)
            .map_err(|e| format!("Failed to save user message: {}", e))?;
        
        // Save AI conversation response (not the code part)
        db.add_message(session_id, "assistant", &response.conversation_response)
            .map_err(|e| format!("Failed to save assistant message: {}", e))?;
    }
    
    // Convert the response back to JSON string for the frontend
    let json_response = serde_json::to_string(&response)
        .map_err(|e| format!("Failed to serialize response: {}", e))?;
    
    Ok(json_response)
}

#[command]
async fn test_tts() -> Result<String, String> {
    tts::test_tts()
}

#[command]
async fn initialize_tts(state: State<'_, TTSState>) -> Result<String, String> {
    println!("Initializing TTS engine...");
    
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.initialize()?;
    
    Ok("TTS engine initialized successfully".to_string())
}

#[command]
async fn generate_and_play_speech(
    text: String,
    state: State<'_, TTSState>
) -> Result<String, String> {
    println!("Generating and playing speech for: {}", text);
    
    // The text is already clean conversation text from structured output
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.generate_speech(&text)?;
    
    Ok("Speech completed successfully".to_string())
}

// Database commands
#[command]
async fn create_session(session_id: String, title: String, state: State<'_, DatabaseState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_session(&session_id, &title).map_err(|e| e.to_string())
}

#[command]
async fn get_all_sessions(state: State<'_, DatabaseState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let sessions = db.get_all_sessions().map_err(|e| e.to_string())?;
    serde_json::to_string(&sessions).map_err(|e| e.to_string())
}

#[command]
async fn get_session_messages(session_id: String, state: State<'_, DatabaseState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let messages = db.get_session_messages(&session_id).map_err(|e| e.to_string())?;
    serde_json::to_string(&messages).map_err(|e| e.to_string())
}

#[command]
async fn add_message(session_id: String, role: String, content: String, state: State<'_, DatabaseState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_message(&session_id, &role, &content).map_err(|e| e.to_string())
}

#[command]
async fn update_session_title(session_id: String, title: String, state: State<'_, DatabaseState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_session_title(&session_id, &title).map_err(|e| e.to_string())
}

#[command]
async fn delete_session(session_id: String, state: State<'_, DatabaseState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_session(&session_id).map_err(|e| e.to_string())
}

// Memory management commands
#[command]
async fn generate_session_summary(
    session_id: String, 
    db_state: State<'_, DatabaseState>,
    summary_state: State<'_, SummaryState>
) -> Result<String, String> {
    // Get session messages (scope the lock)
    let messages = {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        db.get_session_messages(&session_id).map_err(|e| e.to_string())?
    };
    
    if messages.is_empty() {
        return Err("No messages found for this session".to_string());
    }
    
    // Format messages for LLM
    let formatted_session = session_summary::format_session_for_summary(&messages);
    
    // Generate summary using LLM
    let summary = summary_state.client
        .generate_session_summary(&formatted_session, "gemma3n")
        .await?;
    
    // Append summary to memory (scope the lock)
    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        let user_id = "default_user"; // Single user system for now
        db.append_to_memory(user_id, &summary).map_err(|e| e.to_string())?;
    }
    
    Ok(summary)
}

#[command]
async fn get_memory_content(state: State<'_, DatabaseState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = "default_user"; // Single user system for now
    db.get_memory_content(user_id).map_err(|e| e.to_string())
}

#[command]
async fn append_to_memory(content: String, state: State<'_, DatabaseState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = "default_user"; // Single user system for now
    db.append_to_memory(user_id, &content).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AudioState {
            recorder: Mutex::new(audio::AudioRecorder::new()),
        })
        .manage(WhisperState {
            transcriber: Mutex::new(whisper::WhisperTranscriber::new()),
        })
        .manage(LLMState {
            client: llm::OllamaClient::new(None),
        })
        .manage(TTSState {
            engine: Mutex::new(tts::SystemTTSEngine::new()),
        })
        .manage(PythonState {
            session_manager: interactive_python::PythonSessionManager::new(),
        })
        .manage(DatabaseState {
            db: Mutex::new(database::Database::new().expect("Failed to initialize database")),
        })
        .manage(SummaryState {
            client: session_summary::SummaryLLMClient::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            execute_python_code,
            send_python_input,
            get_python_output,
            is_python_session_running,
            close_python_session,
            test_microphone,
            start_recording,
            stop_recording,
            is_recording,
            record_audio_sample,
            initialize_whisper,
            transcribe_audio,
            test_ollama_connection,
            initialize_llm,
            generate_ai_response,
            test_tts,
            initialize_tts,
            generate_and_play_speech,
            create_session,
            get_all_sessions,
            get_session_messages,
            add_message,
            update_session_title,
            delete_session,
            generate_session_summary,
            get_memory_content,
            append_to_memory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}