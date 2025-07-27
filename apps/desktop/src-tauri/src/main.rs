// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::sync::Mutex;
use tauri::{command, State};

mod audio;
mod whisper;
mod llm;
mod tts;

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

#[command]
async fn execute_python_code(code: String) -> Result<String, String> {
    let output = Command::new("python3")
        .arg("-c")
        .arg(&code)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
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
    state: State<'_, LLMState>
) -> Result<String, String> {
    println!("Generating AI response for input: {}", user_input);
    
    let response = state.client
        .generate_session_response(&user_input, &current_code, "gemma3n")
        .await?;
    
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
    
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.generate_speech(&text)?;
    
    Ok("Speech completed successfully".to_string())
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
        .invoke_handler(tauri::generate_handler![
            execute_python_code,
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
            generate_and_play_speech
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}