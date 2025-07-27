use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Sample, SampleFormat, SizedSample, Stream, StreamConfig};
use hound::{WavSpec, WavWriter};
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tempfile::NamedTempFile;
use uuid::Uuid;

pub struct AudioRecorder {
    pub is_recording: Arc<Mutex<bool>>,
    pub recording_id: Option<String>,
    pub current_file_path: Option<String>,
}

impl AudioRecorder {
    pub fn new() -> Self {
        Self {
            is_recording: Arc::new(Mutex::new(false)),
            recording_id: None,
            current_file_path: None,
        }
    }

    pub fn start_recording(&mut self) -> Result<String, String> {
        let mut is_recording = self.is_recording.lock().map_err(|e| e.to_string())?;
        
        if *is_recording {
            return Err("Already recording".to_string());
        }

        // Generate recording ID and file path
        let recording_id = Uuid::new_v4().to_string();
        let recordings_dir = get_recordings_dir()?;
        let file_path = recordings_dir.join(format!("{}.wav", recording_id));
        
        // Update state
        *is_recording = true;
        self.recording_id = Some(recording_id.clone());
        self.current_file_path = Some(file_path.to_string_lossy().to_string());

        // Start recording in a background thread
        let is_recording_clone = self.is_recording.clone();
        let file_path_clone = file_path.clone();
        
        thread::spawn(move || {
            if let Err(e) = start_recording_thread(is_recording_clone, file_path_clone) {
                eprintln!("Recording thread error: {}", e);
            }
        });

        println!("Started recording with ID: {} at {}", recording_id, file_path.display());
        Ok(recording_id)
    }

    pub fn stop_recording(&mut self) -> Result<String, String> {
        let mut is_recording = self.is_recording.lock().map_err(|e| e.to_string())?;
        
        if !*is_recording {
            return Err("Not recording".to_string());
        }

        // Stop recording
        *is_recording = false;

        let file_path = self.current_file_path.take()
            .ok_or("No recording file path")?;
        
        let recording_id = self.recording_id.take()
            .ok_or("No recording ID")?;

        // Wait a bit for the recording thread to finish
        thread::sleep(Duration::from_millis(100));

        println!("Stopped recording with ID: {}, saved to: {}", recording_id, file_path);
        Ok(file_path)
    }

    pub fn is_recording(&self) -> bool {
        self.is_recording.lock().map(|guard| *guard).unwrap_or(false)
    }
}

// Separate function to handle recording in a background thread
fn start_recording_thread(is_recording: Arc<Mutex<bool>>, file_path: PathBuf) -> Result<(), String> {
    let device = get_default_input_device()?;
    let config = device.default_input_config().map_err(|e| e.to_string())?;

    // Create WAV file with proper 16kHz mono format for Whisper
    let spec = WavSpec {
        channels: 1, // Mono for Whisper
        sample_rate: 16000, // 16kHz for Whisper
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let writer = WavWriter::create(&file_path, spec)
        .map_err(|e| format!("Failed to create WAV file: {}", e))?;
    let writer = Arc::new(Mutex::new(Some(writer)));

    let input_sample_rate = config.sample_rate().0;
    let needs_resampling = input_sample_rate != 16000;
    
    // Create audio stream based on sample format
    let stream = match config.sample_format() {
        SampleFormat::F32 => {
            create_recording_stream::<f32>(&device, &config.into(), writer.clone(), is_recording.clone(), needs_resampling, input_sample_rate)?
        }
        SampleFormat::I16 => {
            create_recording_stream::<i16>(&device, &config.into(), writer.clone(), is_recording.clone(), needs_resampling, input_sample_rate)?
        }
        SampleFormat::U16 => {
            create_recording_stream::<u16>(&device, &config.into(), writer.clone(), is_recording.clone(), needs_resampling, input_sample_rate)?
        }
        _ => return Err("Unsupported sample format".to_string()),
    };

    // Start the stream
    stream.play().map_err(|e| e.to_string())?;

    // Keep the stream alive while recording
    while is_recording.lock().map(|guard| *guard).unwrap_or(false) {
        thread::sleep(Duration::from_millis(100));
    }

    // Finalize the WAV file
    if let Ok(mut writer_guard) = writer.lock() {
        if let Some(writer) = writer_guard.take() {
            writer.finalize().map_err(|e| format!("Failed to finalize WAV file: {}", e))?;
        }
    }

    drop(stream);
    Ok(())
}

fn create_recording_stream<T>(
    device: &Device,
    config: &StreamConfig,
    writer: Arc<Mutex<Option<WavWriter<BufWriter<File>>>>>,
    is_recording: Arc<Mutex<bool>>,
    needs_resampling: bool,
    input_sample_rate: u32,
) -> Result<Stream, String>
where
    T: Sample + SizedSample + Send + 'static,
    f32: From<T>,
{
    let channels = config.channels as usize;
    
    let stream = device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                // Check if we're still recording
                let recording = match is_recording.lock() {
                    Ok(guard) => guard,
                    Err(_) => return,
                };
                if !*recording {
                    return;
                }

                if let Ok(mut writer_guard) = writer.lock() {
                    if let Some(writer) = writer_guard.as_mut() {
                        // Convert input samples to f32
                        let samples_f32: Vec<f32> = data.iter()
                            .map(|&sample| f32::from(sample))
                            .collect();

                        // Convert to mono if needed (take left channel)
                        let mono_samples: Vec<f32> = if channels == 1 {
                            samples_f32
                        } else {
                            samples_f32.chunks_exact(channels)
                                .map(|frame| frame[0]) // Take left channel
                                .collect()
                        };

                        // Simple resampling if needed
                        let final_samples = if needs_resampling {
                            resample_to_16khz(&mono_samples, input_sample_rate)
                        } else {
                            mono_samples
                        };

                        // Convert to i16 and write to file
                        for sample in final_samples {
                            let sample_i16 = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                            if writer.write_sample(sample_i16).is_err() {
                                eprintln!("Failed to write audio sample");
                                break;
                            }
                        }
                    }
                }
            },
            |err| eprintln!("Audio stream error: {}", err),
            None,
        )
        .map_err(|e| e.to_string())?;

    Ok(stream)
}

pub fn get_default_input_device() -> Result<Device, String> {
    let host = cpal::default_host();
    host.default_input_device()
        .ok_or_else(|| "No input device available".to_string())
}

pub fn record_audio_to_file(duration_secs: u64) -> Result<String, String> {
    let device = get_default_input_device()?;
    let config = device.default_input_config().map_err(|e| e.to_string())?;

    // Create temporary WAV file
    let temp_file = NamedTempFile::new().map_err(|e| e.to_string())?;
    let file_path = temp_file.path().to_string_lossy().to_string() + ".wav";
    
    let spec = WavSpec {
        channels: config.channels(),
        sample_rate: config.sample_rate().0,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let writer = WavWriter::create(&file_path, spec).map_err(|e| e.to_string())?;
    let writer = Arc::new(Mutex::new(Some(writer)));

    let err_fn = |err| eprintln!("An error occurred on the audio stream: {}", err);

    // Record audio based on sample format
    match config.sample_format() {
        SampleFormat::F32 => {
            record_with_format::<f32>(&device, &config.into(), writer.clone(), duration_secs, err_fn)?;
        }
        SampleFormat::I16 => {
            record_with_format::<i16>(&device, &config.into(), writer.clone(), duration_secs, err_fn)?;
        }
        SampleFormat::U16 => {
            record_with_format::<u16>(&device, &config.into(), writer.clone(), duration_secs, err_fn)?;
        }
        _ => return Err("Unsupported sample format".to_string()),
    }

    // Finalize the WAV file
    if let Ok(mut writer_guard) = writer.lock() {
        if let Some(writer) = writer_guard.take() {
            writer.finalize().map_err(|e| e.to_string())?;
        }
    }

    Ok(file_path)
}

fn record_with_format<T>(
    device: &Device,
    config: &StreamConfig,
    writer: Arc<Mutex<Option<WavWriter<BufWriter<File>>>>>,
    duration_secs: u64,
    err_fn: impl Fn(cpal::StreamError) + Send + 'static,
) -> Result<(), String>
where
    T: Sample + SizedSample + Send + 'static,
    f32: From<T>,
{
    let stream = device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                if let Ok(mut writer_guard) = writer.lock() {
                    if let Some(writer) = writer_guard.as_mut() {
                        for &sample in data {
                            let sample_f32: f32 = sample.into();
                            let sample_i16 = (sample_f32 * i16::MAX as f32) as i16;
                            if writer.write_sample(sample_i16).is_err() {
                                eprintln!("Failed to write audio sample");
                            }
                        }
                    }
                }
            },
            err_fn,
            None,
        )
        .map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;

    // Record for the specified duration
    thread::sleep(Duration::from_secs(duration_secs));

    drop(stream);
    Ok(())
}

// Helper function to get recordings directory
fn get_recordings_dir() -> Result<PathBuf, String> {
    let recordings_dir = dirs::cache_dir()
        .ok_or("Failed to get cache directory")?
        .join("project-r")
        .join("recordings");
    
    std::fs::create_dir_all(&recordings_dir)
        .map_err(|e| format!("Failed to create recordings directory: {}", e))?;
    
    Ok(recordings_dir)
}

// Simple linear interpolation resampling to 16kHz
fn resample_to_16khz(samples: &[f32], input_sample_rate: u32) -> Vec<f32> {
    if input_sample_rate == 16000 {
        return samples.to_vec();
    }
    
    let ratio = input_sample_rate as f64 / 16000.0;
    let output_len = (samples.len() as f64 / ratio) as usize;
    let mut output = Vec::with_capacity(output_len);
    
    for i in 0..output_len {
        let input_index = (i as f64 * ratio) as usize;
        if input_index < samples.len() {
            output.push(samples[input_index]);
        }
    }
    
    output
}

// Test function to verify audio recording works
pub fn test_microphone() -> Result<String, String> {
    let device = get_default_input_device()?;
    let device_name = device.name().map_err(|e| e.to_string())?;
    Ok(format!("Microphone detected: {}", device_name))
}