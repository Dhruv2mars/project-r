# Development Guide - Project-R

## Issue & Solution

There's a known issue with Vite hanging during development when run through Tauri's `beforeDevCommand`. This is likely due to a timing issue or dependency conflict between Tauri 2.7 and Vite 6.x.

## Manual Development Workflow (Recommended)

Since the automatic dev server integration is currently having issues, use this manual approach:

### Step 1: Start the Frontend Dev Server
In terminal 1:
```bash
cd apps/desktop
bun run dev
```

Wait for Vite to show: `Local: http://localhost:5173/`

### Step 2: Start the Tauri App (in a new terminal)
In terminal 2:
```bash
cd apps/desktop
bun run tauri dev --no-dev-server
```

This will:
- Skip the automatic frontend server startup
- Connect to the already running Vite dev server
- Launch the Tauri desktop app

## Testing the App

Once both terminals are running and the app window opens:

1. **Write Python code** in the Monaco editor (left side)
2. **Click the Run button** 
3. **See output** in the console (right side)

### Test Code Examples:
```python
# Basic test
print("Hello, Project-R!")

# Math operations
result = 5 + 3
print(f"5 + 3 = {result}")

# Error testing
print(undefined_variable)  # Should show error
```

## Build for Production

```bash
cd apps/desktop
bun run build           # Build frontend
bun run tauri build    # Build Tauri app
```

## Troubleshooting

### If Vite hangs on startup:
1. Kill any existing processes: `pkill -f "vite\|node"`
2. Check port availability: `lsof -i :5173`
3. Try restarting your terminal

### If Tauri shows blank screen:
1. Ensure Vite dev server is running first
2. Check browser console for errors
3. Verify the devUrl in tauri.conf.json matches Vite's port

### If Python execution fails:
1. Ensure Python 3 is installed: `python3 --version`
2. Check that `python3` command is available in PATH

## Technical Notes

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Rust + Tauri 2.7
- **Editor**: Monaco Editor with Python syntax highlighting
- **Python Execution**: Direct system calls to `python3` command

This manual workflow ensures reliable development until the Vite integration issue is resolved.