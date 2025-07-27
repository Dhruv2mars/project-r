use std::path::PathBuf;
use std::process::Command;
use std::fs;
use uuid::Uuid;

pub struct SystemTTSEngine {
    is_initialized: bool,
}

impl SystemTTSEngine {
    pub fn new() -> Self {
        Self {
            is_initialized: false,
        }
    }

    pub fn initialize(&mut self) -> Result<(), String> {
        if self.is_initialized {
            return Ok(());
        }

        // Test the system TTS
        self.test_system_tts()?;
        
        self.is_initialized = true;
        println!("System TTS initialized successfully");
        Ok(())
    }

    fn test_system_tts(&self) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            let output = Command::new("say")
                .arg("-v")
                .arg("?")
                .output()
                .map_err(|e| format!("macOS 'say' command not available: {}", e))?;

            if !output.status.success() {
                return Err("macOS 'say' command failed".to_string());
            }
            println!("macOS TTS (say) is available");
        }

        #[cfg(target_os = "linux")]
        {
            let output = Command::new("espeak")
                .arg("--version")
                .output()
                .map_err(|_| {
                    "Linux TTS (espeak) not available. Install with: sudo apt-get install espeak".to_string()
                })?;

            if !output.status.success() {
                return Err("Linux espeak command failed".to_string());
            }
            println!("Linux TTS (espeak) is available");
        }

        #[cfg(target_os = "windows")]
        {
            let output = Command::new("powershell")
                .args(&["-Command", "Add-Type -AssemblyName System.Speech"])
                .output()
                .map_err(|e| format!("Windows TTS not available: {}", e))?;

            if !output.status.success() {
                return Err("Windows TTS initialization failed".to_string());
            }
            println!("Windows TTS (SAPI) is available");
        }

        Ok(())
    }

    pub fn generate_speech(&self, text: &str) -> Result<(), String> {
        if !self.is_initialized {
            return Err("TTS engine not initialized. Call initialize() first.".to_string());
        }

        if text.trim().is_empty() {
            return Err("Text cannot be empty".to_string());
        }

        self.speak_text(text)
    }

    fn speak_text(&self, text: &str) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            // First, kill any hanging speech processes to prevent conflicts
            println!("Cleaning up any hanging speech processes...");
            let _ = Command::new("pkill")
                .args(&["-f", "speechsynthesisd"])
                .output();
            let _ = Command::new("pkill")
                .args(&["-f", "say"])
                .output();
            
            // Wait a moment for cleanup
            std::thread::sleep(std::time::Duration::from_millis(300));
            
            println!("Speaking: {}", &text[..std::cmp::min(50, text.len())]);
            
            // Use spawn with timeout to prevent hanging
            use std::process::{Stdio};
            use std::time::{Duration, Instant};
            
            let mut child = Command::new("say")
                .arg(text)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to spawn 'say' command: {}", e))?;

            let start = Instant::now();
            let timeout = Duration::from_secs(30); // 30 second timeout
            
            // Poll for completion with timeout
            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        if status.success() {
                            println!("macOS TTS completed successfully");
                            return Ok(());
                        } else {
                            let mut stderr = String::new();
                            if let Some(mut stderr_handle) = child.stderr.take() {
                                use std::io::Read;
                                let _ = stderr_handle.read_to_string(&mut stderr);
                            }
                            return Err(format!("macOS TTS failed with status: {:?}, stderr: {}", status, stderr));
                        }
                    }
                    Ok(None) => {
                        // Still running, check timeout
                        if start.elapsed() > timeout {
                            println!("TTS timeout reached, killing process...");
                            let _ = child.kill();
                            let _ = child.wait();
                            return Err("macOS TTS timed out after 30 seconds".to_string());
                        }
                        std::thread::sleep(Duration::from_millis(100));
                    }
                    Err(e) => {
                        let _ = child.kill();
                        return Err(format!("Error waiting for TTS process: {}", e));
                    }
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            let output = Command::new("espeak")
                .arg(text)
                .output()
                .map_err(|e| format!("Failed to execute 'espeak' command: {}", e))?;

            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Linux TTS failed: {}", error));
            }
            
            println!("Linux TTS completed successfully");
        }

        #[cfg(target_os = "windows")]
        {
            let script = format!(
                r#"Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Speak("{}")"#,
                text.replace('"', '\"')
            );

            let output = Command::new("powershell")
                .args(&["-Command", &script])
                .output()
                .map_err(|e| format!("Failed to execute PowerShell TTS: {}", e))?;

            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Windows TTS failed: {}", error));
            }
            
            println!("Windows TTS completed successfully");
        }

        Ok(())
    }

    pub fn get_tts_output_dir() -> Result<PathBuf, String> {
        let tts_dir = dirs::cache_dir()
            .ok_or("Failed to get cache directory")?
            .join("project-r")
            .join("tts");
        
        std::fs::create_dir_all(&tts_dir)
            .map_err(|e| format!("Failed to create TTS directory: {}", e))?;
        
        Ok(tts_dir)
    }
}

// Test function for System TTS
pub fn test_tts() -> Result<String, String> {
    let mut engine = SystemTTSEngine::new();
    engine.initialize()?;
    
    engine.generate_speech("Hello! This is a test of the Project-R text to speech system.")?;
    
    Ok("System TTS test completed successfully".to_string())
}