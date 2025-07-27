# Project-R

An AI-powered learning companion for Python programming, built with Tauri 2.0 and React.

## Phase 1: Code Editor Foundation ✅

This initial phase provides a working code editor with Python execution capabilities.

### Features

- **Monaco Editor**: Full-featured code editor with Python syntax highlighting
- **Split-screen Layout**: Code editor on the left, output console on the right  
- **Python Execution**: Run Python code directly in the app using your local Python interpreter
- **Error Handling**: Displays execution errors in the output console
- **Modern UI**: Clean interface built with Tailwind CSS

### Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Desktop App**: Tauri 2.0
- **Styling**: Tailwind CSS
- **Editor**: Monaco Editor
- **Monorepo**: Turborepo + Bun
- **Backend**: Rust

### Getting Started

1. **Prerequisites**:
   - [Bun](https://bun.sh/) installed
   - [Rust](https://rustup.rs/) installed 
   - Python 3 installed and available as `python3` command

2. **Installation**:
   ```bash
   git clone <your-repo>
   cd project-r-3
   bun install
   cd apps/desktop
   bun install
   ```

3. **Development**:
   ```bash
   cd apps/desktop
   bun run dev          # Start Vite dev server
   # In another terminal:
   bun run tauri dev    # Start Tauri app
   ```

4. **Build**:
   ```bash
   cd apps/desktop
   bun run tauri build  # Build for production
   ```

### Project Structure

```
project-r-3/
├── apps/
│   └── desktop/          # Main Tauri application
│       ├── src/          # React frontend
│       ├── src-tauri/    # Rust backend
│       └── public/       # Static assets
├── packages/             # Shared packages (future)
└── turbo.json           # Turborepo configuration
```

### Testing the Editor

1. Start the development server
2. Write Python code in the left editor panel
3. Click the "Run" button
4. See output in the right console panel

Example code to try:
```python
# Basic Python
print("Hello, Project-R!")

# Math operations  
result = 2 + 2
print(f"2 + 2 = {result}")

# Error handling
try:
    x = 10 / 2
    print(f"10 / 2 = {x}")
except Exception as e:
    print(f"Error: {e}")
```

### Next Phases

Future development will add:
- AI integration (local LLMs)
- Voice interaction
- Memory system
- Practice sheets
- Session management

---

**Built with [Claude Code](https://claude.ai/code)**