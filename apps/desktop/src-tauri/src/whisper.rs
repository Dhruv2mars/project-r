use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};
use hound;

pub struct WhisperTranscriber {
    context: Option<WhisperContext>,
}

impl WhisperTranscriber {
    pub fn new() -> Self {
        Self { context: None }
    }

    pub fn initialize(&mut self, model_path: &str) -> Result<(), String> {
        let ctx_params = WhisperContextParameters::default();
        
        let context = WhisperContext::new_with_params(model_path, ctx_params)
            .map_err(|e| format!("Failed to load Whisper model: {}", e))?;
        
        self.context = Some(context);
        Ok(())
    }

    pub fn transcribe_audio_file(&self, audio_file_path: &str) -> Result<String, String> {
        let context = self.context.as_ref()
            .ok_or("Whisper context not initialized")?;

        // Load audio data from file
        let audio_data = self.load_audio_from_wav(audio_file_path)?;

        // Set up transcription parameters
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("en"));
        params.set_translate(false);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        // Run transcription
        let mut state = context.create_state()
            .map_err(|e| format!("Failed to create Whisper state: {}", e))?;
        
        state.full(params, &audio_data)
            .map_err(|e| format!("Transcription failed: {}", e))?;

        // Extract transcription text
        let num_segments = state.full_n_segments()
            .map_err(|e| format!("Failed to get segment count: {}", e))?;

        let mut full_text = String::new();
        for i in 0..num_segments {
            let segment_text = state.full_get_segment_text(i)
                .map_err(|e| format!("Failed to get segment text: {}", e))?;
            full_text.push_str(&segment_text);
            if i < num_segments - 1 {
                full_text.push(' ');
            }
        }

        Ok(full_text.trim().to_string())
    }

    fn load_audio_from_wav(&self, file_path: &str) -> Result<Vec<f32>, String> {
        let mut reader = hound::WavReader::open(file_path)
            .map_err(|e| format!("Failed to open WAV file: {}", e))?;

        let spec = reader.spec();
        
        // Whisper expects 16kHz mono audio
        if spec.sample_rate != 16000 {
            return Err(format!("Audio must be 16kHz, got {}Hz", spec.sample_rate));
        }
        
        if spec.channels != 1 {
            return Err(format!("Audio must be mono, got {} channels", spec.channels));
        }

        // Convert samples to f32 in the range [-1.0, 1.0]
        let samples: Result<Vec<f32>, _> = match spec.sample_format {
            hound::SampleFormat::Int => {
                match spec.bits_per_sample {
                    16 => {
                        reader.samples::<i16>()
                            .map(|s| s.map(|sample| sample as f32 / i16::MAX as f32))
                            .collect()
                    }
                    32 => {
                        reader.samples::<i32>()
                            .map(|s| s.map(|sample| sample as f32 / i32::MAX as f32))
                            .collect()
                    }
                    _ => return Err(format!("Unsupported bit depth: {}", spec.bits_per_sample)),
                }
            }
            hound::SampleFormat::Float => {
                reader.samples::<f32>().collect()
            }
        };

        samples.map_err(|e| format!("Failed to read audio samples: {}", e))
    }
}

// Utility function to download Whisper model if needed
pub async fn ensure_whisper_model() -> Result<String, String> {
    use std::fs;
    use tokio::io::AsyncWriteExt;
    
    let model_dir = dirs::config_dir()
        .ok_or("Failed to get config directory")?
        .join("project-r")
        .join("models");
    
    fs::create_dir_all(&model_dir)
        .map_err(|e| format!("Failed to create model directory: {}", e))?;
    
    let model_path = model_dir.join("ggml-base.en.bin");
    
    // Check if model already exists
    if model_path.exists() {
        return Ok(model_path.to_string_lossy().to_string());
    }
    
    // Download the model
    println!("Downloading Whisper model...");
    let model_url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
    
    let response = reqwest::get(model_url).await
        .map_err(|e| format!("Failed to download model: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Failed to download model: HTTP {}", response.status()));
    }
    
    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to read model data: {}", e))?;
    
    let mut file = tokio::fs::File::create(&model_path).await
        .map_err(|e| format!("Failed to create model file: {}", e))?;
    
    file.write_all(&bytes).await
        .map_err(|e| format!("Failed to write model file: {}", e))?;
    
    println!("Whisper model downloaded successfully");
    Ok(model_path.to_string_lossy().to_string())
}