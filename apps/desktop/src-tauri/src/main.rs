// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use std::collections::HashSet;
use tauri::{command, State};
use std::sync::OnceLock;

mod audio;
mod whisper;
mod llm;
mod tts;
mod interactive_python;
mod database;
mod session_summary;
mod practice_sheet;

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

// Global state for Practice Sheet LLM client
struct PracticeSheetState {
    client: practice_sheet::PracticeSheetLLMClient,
}

// Global static to track running redo generation tasks
static RUNNING_REDO_TASKS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

#[command]
async fn execute_python_code(code: String, state: State<'_, PythonState>) -> Result<String, String> {
    state.session_manager.start_python_session(code).await
}

#[command] 
async fn send_python_input(sessionId: String, input: String, state: State<'_, PythonState>) -> Result<(), String> {
    state.session_manager.send_input(sessionId, input).await
}

#[command]
async fn get_python_output(sessionId: String, state: State<'_, PythonState>) -> Result<Vec<String>, String> {
    state.session_manager.get_output(sessionId).await
}

#[command]
async fn is_python_session_running(sessionId: String, state: State<'_, PythonState>) -> Result<bool, String> {
    state.session_manager.is_session_running(sessionId).await
}

#[command]
async fn close_python_session(sessionId: String, state: State<'_, PythonState>) -> Result<(), String> {
    state.session_manager.close_session(sessionId).await
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
    // Recording audio for {} seconds...
    audio::record_audio_to_file(duration_secs)
}

#[command]
async fn initialize_whisper(state: State<'_, WhisperState>) -> Result<String, String> {
    // Initializing Whisper model...
    
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
    // Transcribing audio file: {}
    
    let transcriber = state.transcriber.lock().map_err(|e| e.to_string())?;
    let transcription = transcriber.transcribe_audio_file(&audio_file_path)?;
    
    // Transcription result: {}
    Ok(transcription)
}

#[command]
async fn test_ollama_connection() -> Result<String, String> {
    llm::test_ollama_connection().await
}

#[command]
async fn initialize_llm(state: State<'_, LLMState>) -> Result<String, String> {
    // Initializing LLM connection...
    
    // Test connection to Ollama
    state.client.check_connection().await?;
    
    // Ensure Gemma 3n model is available
    state.client.ensure_model("gemma3n").await?;
    
    Ok("LLM initialized successfully with Gemma 3n model".to_string())
}

#[command]
async fn generate_ai_response(
    userInput: String,
    currentCode: String,
    sessionId: Option<String>,
    llm_state: State<'_, LLMState>,
    db_state: State<'_, DatabaseState>
) -> Result<String, String> {
    // Generating AI response for input: {}
    
    let response = llm_state.client
        .generate_session_response(&userInput, &currentCode, "gemma3n")
        .await?;
    
    // Save conversation history if sessionId is provided
    if let Some(ref sessionId) = sessionId {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        
        // Save user message
        db.add_message(sessionId, "user", &userInput)
            .map_err(|e| format!("Failed to save user message: {}", e))?;
        
        // Save AI conversation response (not the code part)
        db.add_message(sessionId, "assistant", &response.conversation_response)
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
    // Initializing TTS engine...
    
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.initialize()?;
    
    Ok("TTS engine initialized successfully".to_string())
}

#[command]
async fn generate_and_play_speech(
    text: String,
    state: State<'_, TTSState>
) -> Result<String, String> {
    // Generating and playing speech for: {}
    
    // The text is already clean conversation text from structured output
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.generate_speech(&text)?;
    
    Ok("Speech completed successfully".to_string())
}

// Database commands
#[command]
async fn create_session(sessionId: String, title: String, state: State<'_, DatabaseState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_session(&sessionId, &title).map_err(|e| e.to_string())
}

#[command]
async fn get_all_sessions(state: State<'_, DatabaseState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let sessions = db.get_all_sessions().map_err(|e| e.to_string())?;
    serde_json::to_string(&sessions).map_err(|e| e.to_string())
}

#[command]
async fn get_session_messages(sessionId: String, state: State<'_, DatabaseState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let messages = db.get_session_messages(&sessionId).map_err(|e| e.to_string())?;
    serde_json::to_string(&messages).map_err(|e| e.to_string())
}

#[command]
async fn add_message(sessionId: String, role: String, content: String, state: State<'_, DatabaseState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_message(&sessionId, &role, &content).map_err(|e| e.to_string())
}

#[command]
async fn update_session_title(sessionId: String, title: String, state: State<'_, DatabaseState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_session_title(&sessionId, &title).map_err(|e| e.to_string())
}

#[command]
async fn delete_session(sessionId: String, state: State<'_, DatabaseState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_session(&sessionId).map_err(|e| e.to_string())
}

// Memory management commands
#[command]
async fn generate_session_summary(
    sessionId: String, 
    db_state: State<'_, DatabaseState>,
    summary_state: State<'_, SummaryState>
) -> Result<String, String> {
    // Get session messages (scope the lock)
    let messages = {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        db.get_session_messages(&sessionId).map_err(|e| e.to_string())?
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

// Practice sheet commands
#[command]
async fn generate_practice_sheet_from_summary(
    summary: String,
    sessionId: String,
    practice_state: State<'_, PracticeSheetState>,
    db_state: State<'_, DatabaseState>
) -> Result<String, String> {
    // Generate quiz questions using LLM
    let questions = practice_state.client
        .generate_practice_sheet(&summary, "gemma3n")
        .await?;
    
    // Extract title from summary
    let title = practice_sheet::extract_session_title_from_summary(&summary);
    
    // Save to database (scope the lock)
    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        
        // Create practice sheet
        let practice_sheet_id = db.create_practice_sheet(&sessionId, &title)
            .map_err(|e| e.to_string())?;
        
        // Add all questions
        for (index, question) in questions.iter().enumerate() {
            db.add_practice_question(
                &practice_sheet_id,
                &question.question_text,
                &question.options,
                &question.correct_answer,
                (index + 1) as i32,
            ).map_err(|e| e.to_string())?;
        }
        
        Ok(practice_sheet_id)
    }
}

#[command]
async fn get_all_practice_sheets(state: State<'_, DatabaseState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let sheets = db.get_all_practice_sheets().map_err(|e| e.to_string())?;
    serde_json::to_string(&sheets).map_err(|e| e.to_string())
}

#[command]
async fn get_practice_sheet_questions(practiceSheetId: String, state: State<'_, DatabaseState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let questions = db.get_practice_sheet_questions(&practiceSheetId).map_err(|e| e.to_string())?;
    serde_json::to_string(&questions).map_err(|e| e.to_string())
}


#[command]
async fn complete_practice_sheet(
    practiceSheetId: String,
    userAnswers: Vec<String>,
    score: i32,
    totalQuestions: i32,
    db_state: State<'_, DatabaseState>,
    _practice_state: State<'_, PracticeSheetState>
) -> Result<String, String> {
    // Completing practice sheet: {} with score {}/{}
    
    // Store the practice attempt and mark as completed (scope the lock)
    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        
        // Get practice sheet title for logging
        let sheet_title = db.get_practice_sheet_title(&practiceSheetId)
            .map_err(|e| format!("Failed to get practice sheet title: {}", e))?;
        
        // Processing completion for practice sheet '{}' (ID: {})
        
        // Create practice attempt record
        db.create_practice_attempt(&practiceSheetId, &userAnswers, score, totalQuestions)
            .map_err(|e| format!("Failed to create practice attempt: {}", e))?;
        
        // Mark practice sheet as completed
        db.mark_practice_sheet_completed(&practiceSheetId)
            .map_err(|e| format!("Failed to mark practice sheet as completed: {}", e))?;
        
        // Store results in memory
        let user_id = "default_user";
        db.store_practice_results_to_memory(&practiceSheetId, user_id)
            .map_err(|e| format!("Failed to store results to memory: {}", e))?;
        
        // Successfully stored completion data for practice sheet: {}
    }
    
    // Check if a redo task is already running for this practice sheet
    {
        let running_tasks = RUNNING_REDO_TASKS.get_or_init(|| Mutex::new(HashSet::new()));
        let mut tasks = running_tasks.lock().map_err(|e| e.to_string())?;
        if tasks.contains(&practiceSheetId) {
            // Redo generation already in progress for practice sheet: {}, skipping
            return Ok("Practice sheet completed successfully".to_string());
        }
        tasks.insert(practiceSheetId.clone());
    }
    
    // Start background redo generation (don't wait for it)
    let practice_sheet_id_clone = practiceSheetId.clone();
    
    // Spawning background redo generation task for practice sheet: {}
    
    tokio::spawn(async move {
        // Add timeout to prevent indefinite running
        let timeout_duration = std::time::Duration::from_secs(300); // 5 minutes timeout
        let result = tokio::time::timeout(
            timeout_duration,
            generate_redo_questions_background_task(practice_sheet_id_clone.clone())
        ).await;
        
        // Remove from running tasks when done (always execute this)
        {
            let running_tasks = RUNNING_REDO_TASKS.get_or_init(|| Mutex::new(HashSet::new()));
            let mut tasks = running_tasks.lock().unwrap();
            tasks.remove(&practice_sheet_id_clone);
        }
        
        match result {
            Ok(Ok(_)) => {
                // Background redo generation completed successfully for practice sheet: {}
            },
            Ok(Err(e)) => {
                eprintln!("Background redo generation failed for practice sheet {}: {}", practice_sheet_id_clone, e);
            },
            Err(_) => {
                eprintln!("Background redo generation timed out for practice sheet: {}", practice_sheet_id_clone);
            }
        }
    });
    
    Ok("Practice sheet completed successfully".to_string())
}

async fn generate_redo_questions_background_task(practice_sheet_id: String) -> Result<(), String> {
    // Starting redo generation for practice sheet: {}
    
    // Create fresh database and LLM client connections for this background task
    let db = database::Database::new().map_err(|e| e.to_string())?;
    let llm_client = practice_sheet::PracticeSheetLLMClient::new(None);
    
    // Get practice sheet specific memory content and sheet title
    let user_id = "default_user";
    let specific_memory_content = db.get_practice_sheet_specific_memory(&practice_sheet_id, user_id)
        .map_err(|e| format!("Failed to get specific memory for practice sheet {}: {}", practice_sheet_id, e))?;
    let sheet_title = db.get_practice_sheet_title(&practice_sheet_id)
        .map_err(|e| format!("Failed to get title for practice sheet {}: {}", practice_sheet_id, e))?;
    
    // Using isolated memory content for practice sheet '{}' (ID: {})
    
    // Generate redo questions using LLM with isolated memory content
    let new_questions = llm_client
        .generate_redo_practice_sheet(&specific_memory_content, &sheet_title, "gemma3n")
        .await
        .map_err(|e| format!("Failed to generate redo questions for practice sheet {}: {}", practice_sheet_id, e))?;
    
    // Generated {} new questions for practice sheet: {}
    
    // Replace questions and mark as redo ready
    db.replace_practice_sheet_questions(&practice_sheet_id, &new_questions)
        .map_err(|e| format!("Failed to replace questions for practice sheet {}: {}", practice_sheet_id, e))?;
    
    db.mark_practice_sheet_redo_ready(&practice_sheet_id)
        .map_err(|e| format!("Failed to mark practice sheet {} as redo ready: {}", practice_sheet_id, e))?;
    
    // Background redo generation completed successfully for practice sheet: {} ({})
    Ok(())
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
        .manage(PracticeSheetState {
            client: practice_sheet::PracticeSheetLLMClient::new(None),
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
            append_to_memory,
            generate_practice_sheet_from_summary,
            get_all_practice_sheets,
            get_practice_sheet_questions,
            complete_practice_sheet
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}