use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tokio::sync::mpsc;
use uuid::Uuid;

// Session manager to handle multiple Python sessions
pub struct PythonSessionManager {
    sessions: Arc<Mutex<HashMap<String, PythonSession>>>,
}

struct PythonSession {
    _pty_pair: portable_pty::PtyPair,
    writer: Box<dyn std::io::Write + Send>,
    output_receiver: mpsc::UnboundedReceiver<String>,
    session_id: String,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

impl PythonSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start_python_session(&self, code: String) -> Result<String, String> {
        let session_id = Uuid::new_v4().to_string();
        
        // Create PTY
        let pty_system = native_pty_system();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to create PTY: {}", e))?;

        // Create Python command
        let mut cmd = CommandBuilder::new("python3");
        cmd.arg("-c");
        cmd.arg(&code);

        // Spawn the Python process in the PTY
        let mut child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn Python process: {}", e))?;

        // Set up output reading
        let (output_sender, mut output_receiver) = mpsc::unbounded_channel();
        let mut reader = pty_pair.master.try_clone_reader().map_err(|e| format!("Failed to clone reader: {}", e))?;

        // Spawn thread to read output
        let output_sender_clone = output_sender.clone();
        thread::spawn(move || {
            use std::io::Read;
            let mut buffer = [0u8; 1024];
            loop {
                match reader.read(&mut buffer) {
                    Ok(n) if n > 0 => {
                        let output = String::from_utf8_lossy(&buffer[..n]).to_string();
                        if output_sender_clone.send(output).is_err() {
                            break;
                        }
                    }
                    Ok(_) => break, // EOF
                    Err(_) => break, // Error
                }
            }
        });

        // Check if process finished immediately (for non-interactive code)
        thread::sleep(Duration::from_millis(100));
        match child.try_wait() {
            Ok(Some(status)) => {
                // Process finished, collect all output
                let mut full_output = String::new();
                while let Ok(output) = output_receiver.try_recv() {
                    full_output.push_str(&output);
                }
                
                if status.success() {
                    return Ok(full_output);
                } else {
                    return Err(full_output);
                }
            }
            Ok(None) => {
                // Process is still running (interactive)
                let writer = pty_pair.master.take_writer().map_err(|e| format!("Failed to get writer: {}", e))?;
                
                let session = PythonSession {
                    _pty_pair: pty_pair,
                    writer: Box::new(writer),
                    output_receiver,
                    session_id: session_id.clone(),
                    child,
                };

                // Store session
                self.sessions.lock().unwrap().insert(session_id.clone(), session);
                
                // Return session ID to indicate interactive mode
                return Ok(format!("INTERACTIVE_SESSION:{}", session_id));
            }
            Err(e) => {
                return Err(format!("Failed to check process status: {}", e));
            }
        }
    }

    pub async fn send_input(&self, session_id: String, input: String) -> Result<(), String> {
        use std::io::Write;
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(&session_id) {
            session.writer.write_all(input.as_bytes()).map_err(|e| format!("Failed to write input: {}", e))?;
            session.writer.flush().map_err(|e| format!("Failed to flush input: {}", e))?;
            Ok(())
        } else {
            Err("Session not found".to_string())
        }
    }

    pub async fn get_output(&self, session_id: String) -> Result<Vec<String>, String> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(&session_id) {
            let mut outputs = Vec::new();
            while let Ok(output) = session.output_receiver.try_recv() {
                outputs.push(output);
            }
            
            // Check if the process has finished
            match session.child.try_wait() {
                Ok(Some(status)) => {
                    // Process finished, add final message and remove session
                    if status.success() {
                        outputs.push("\n[Program finished successfully]".to_string());
                    } else {
                        outputs.push("\n[Program exited with error]".to_string());
                    }
                    // Session will be removed by the caller after this
                    return Ok(outputs);
                }
                Ok(None) => {
                    // Process still running
                }
                Err(_) => {
                    // Error checking process status
                    outputs.push("\n[Program terminated unexpectedly]".to_string());
                    return Ok(outputs);
                }
            }
            
            Ok(outputs)
        } else {
            Err("Session not found".to_string())
        }
    }

    pub async fn is_session_running(&self, session_id: String) -> Result<bool, String> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(&session_id) {
            match session.child.try_wait() {
                Ok(Some(_)) => Ok(false), // Process finished
                Ok(None) => Ok(true),     // Process still running
                Err(_) => Ok(false),      // Error means process is not running
            }
        } else {
            Err("Session not found".to_string())
        }
    }

    pub async fn close_session(&self, session_id: String) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.remove(&session_id);
        Ok(())
    }
}