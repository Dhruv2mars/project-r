# Project-R

🤖 **AI-Powered Python Learning Companion**

An intelligent desktop application that transforms how you learn Python programming through AI tutoring, voice interaction, and personalized practice sessions.

## What is Project-R?

Project-R is a comprehensive learning ecosystem that combines cutting-edge AI technology with an intuitive desktop experience. Unlike traditional code editors, Project-R provides:

- **AI Tutor**: Conversational learning with a local LLM that understands your code and provides personalized guidance
- **Voice Interface**: Complete hands-free learning through speech-to-text and text-to-speech
- **Smart Practice**: Auto-generated quizzes that adapt to your learning progress
- **Memory System**: Tracks your journey and builds on previous sessions
- **Interactive Python**: Real-time code execution with full interactive support

## Key Features

### 🧠 **AI-Powered Tutoring**
- **Local LLM Integration**: Uses Ollama with Gemma models for privacy-focused AI tutoring
- **Contextual Help**: AI understands your current code and provides relevant assistance
- **Conversational Learning**: Natural dialogue-based teaching approach
- **Session Continuity**: AI remembers your progress across sessions

### 🎤 **Voice-First Learning**
- **Speech Recognition**: Local Whisper model for accurate voice-to-text
- **Natural Speech**: High-quality text-to-speech for AI responses
- **Hands-Free Coding**: Complete voice interaction without typing
- **Multi-Platform Audio**: Optimized for macOS, Linux, and Windows

### 🐍 **Interactive Python Environment**
- **Real-Time Execution**: Run Python code instantly with full interactive support
- **Input Handling**: Supports `input()` functions and interactive programs
- **Error Analysis**: Comprehensive error reporting with AI-powered explanations
- **Cross-Platform**: Works seamlessly across all operating systems

### 📚 **Adaptive Practice System**
- **Auto-Generated Quizzes**: Creates practice questions from your learning sessions
- **Personalized Review**: Generates targeted questions for areas needing improvement
- **Progress Tracking**: Monitors your performance and learning milestones
- **Intelligent Scoring**: Detailed feedback and explanations for all answers

### 💾 **Smart Memory System**
- **Session Summaries**: AI-generated overviews of each learning session
- **Learning Progress**: Tracks concepts covered and mastery levels
- **Persistent Data**: Local SQLite database keeps all your data private
- **Session Browser**: Review past conversations and learning history

## Getting Started

### Prerequisites
- **Bun** - [Install Bun](https://bun.sh/)
- **Rust** - [Install Rust](https://rustup.rs/)
- **Python 3** - Available as `python3` command
- **Ollama** - [Install Ollama](https://ollama.ai/) and pull `gemma:2b` model

### Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd project-r-3
   ```

2. **Install dependencies**:
   ```bash
   bun install
   cd apps/desktop
   bun install
   ```

3. **Setup AI Models**:
   ```bash
   # Install and start Ollama
   ollama pull gemma:2b
   ollama serve
   ```

### Development

**Start the application**:
```bash
cd apps/desktop
bun run dev          # Start Vite dev server
# In another terminal:
bun run tauri dev    # Launch desktop app
```

**Build for production**:
```bash
cd apps/desktop
bun run tauri build
```

## How to Use

### 1. **Start Learning**
- Launch the app and click "New Session" to begin
- The AI tutor will introduce itself and ask about your learning goals

### 2. **Voice or Text**
- **Voice Mode**: Click the microphone to speak with the AI tutor
- **Text Mode**: Type your questions in the chat interface
- **Code Mode**: Write Python code in the editor and get real-time feedback

### 3. **Interactive Learning**
- Ask questions about Python concepts, syntax, or debugging
- Request explanations, examples, or coding challenges
- Get personalized guidance based on your current skill level

### 4. **Practice & Review**
- Take auto-generated quizzes on topics you've learned
- Review session summaries to reinforce key concepts
- Access your learning history anytime

## Technology Stack

### **Frontend**
- **React 18** with TypeScript for modern UI
- **Tailwind CSS** for responsive styling
- **Monaco Editor** for syntax-highlighted coding
- **Vite** for fast development and building

### **Desktop App**
- **Tauri 2.0** for native desktop experience
- **Rust** backend for performance and security
- **Cross-platform** support (macOS, Linux, Windows)

### **AI & Audio**
- **Ollama + Gemma** for local AI inference
- **Whisper.cpp** for speech recognition
- **Native TTS** for text-to-speech
- **CPAL** for cross-platform audio handling

### **Data & Storage**
- **SQLite** for local data persistence
- **Session management** for organized learning
- **Practice tracking** for progress monitoring

## Project Structure

```
project-r-3/
├── apps/desktop/           # Main Tauri application
│   ├── src/               # React frontend
│   │   ├── components/    # UI components
│   │   ├── App.tsx        # Main app component
│   │   ├── Home.tsx       # Home page
│   │   ├── Session.tsx    # Learning session interface
│   │   └── Practice.tsx   # Practice quiz interface
│   ├── src-tauri/         # Rust backend
│   │   ├── src/           # Rust source code
│   │   │   ├── main.rs    # Main application entry
│   │   │   ├── llm.rs     # AI/LLM integration
│   │   │   ├── audio.rs   # Audio recording
│   │   │   ├── whisper.rs # Speech recognition
│   │   │   ├── tts.rs     # Text-to-speech
│   │   │   └── database.rs # Data persistence
│   │   └── resources/     # Whisper model files
│   └── public/            # Static assets
└── package.json           # Project configuration
```

## Privacy & Security

- **Local-First**: All AI processing happens on your machine
- **No Cloud Dependencies**: Works completely offline
- **Private Data**: Your code and conversations never leave your device
- **Open Source**: Full transparency in how your data is handled

## Example Learning Session

```python
# User asks: "How do I work with lists in Python?"
# AI explains list basics and provides examples

# Create and manipulate lists
fruits = ["apple", "banana", "cherry"]
print(f"I have {len(fruits)} fruits")

# Add items
fruits.append("orange")
fruits.insert(1, "grape")

# Access and modify
print(f"First fruit: {fruits[0]}")
fruits[0] = "green apple"

# List comprehension example
numbers = [1, 2, 3, 4, 5]
squares = [x**2 for x in numbers]
print(f"Squares: {squares}")
```

*The AI provides real-time feedback, suggests improvements, and generates practice questions based on the concepts covered.*

## Contributing

We welcome contributions! Please feel free to:
- Report bugs or suggest features via GitHub Issues
- Submit pull requests for improvements
- Share your learning experiences and feedback

## License

This project is open source. Check the LICENSE file for details.

---

**Built with ❤️ for Python learners everywhere**