# 🚀 Quick Setup Guide

## Prerequisites

1. **Node.js** (v16 or higher)
2. **Ollama** installed and running
3. **Nous Hermes 2 - Mixtral** model

## Quick Start

1. **Install dependencies:**
   ```bash
   npm run install-all
   ```

2. **Start the application:**
   ```bash
   npm start
   ```

3. **Open your browser** to `http://localhost:3000`

## Manual Start

If you prefer to start services separately:

1. **Backend:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Frontend (new terminal):**
   ```bash
   cd frontend
   npm start
   ```

## Ollama Setup

Make sure Ollama is running with the correct model:

```bash
# Install Ollama
# Visit: https://ollama.ai

# Pull the model
ollama pull nous-hermes2-mixtral

# Start Ollama
ollama serve
```

## Testing

- **Backend health:** http://localhost:3001/api/health
- **Frontend:** http://localhost:3000

## Features

✅ Document upload (PDF, DOCX, TXT)  
✅ Local vector storage with FAISS  
✅ RAG-powered chat with documents  
✅ Modern, responsive UI  
✅ Local LLM integration via Ollama  
✅ Drag-and-drop file upload  

## Troubleshooting

- **Ollama not running:** Make sure `ollama serve` is running
- **Model not found:** Run `ollama pull nous-hermes2-mixtral`
- **Port conflicts:** Check if ports 3000/3001 are available
- **Memory issues:** Large documents may require more RAM 