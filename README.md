# 📄 Local Document Agent

A fast, lightweight local-first document Q&A application that allows you to upload documents and chat with them using your local LLM via Ollama.

## ✨ Features

- **Local-First**: Everything runs on your machine, no cloud dependencies
- **Multi-Agent Support**: Choose between different LLM models (Nous Hermes 2 - Mixtral, GPT-OSS 20B)
- **Semantic Search**: Advanced vector-based retrieval using ChromaDB and sentence-transformers
- **Document Upload**: Support for PDF, DOCX, and TXT files
- **Smart Chunking**: Documents are intelligently chunked for better retrieval
- **Vector Storage**: Uses ChromaDB for persistent vector storage with SQLite backend
- **RAG Chat**: Ask questions about your documents using Retrieval-Augmented Generation
- **Modern UI**: Clean, responsive interface with drag-and-drop upload and model selection
- **Ollama Integration**: Works with your local Ollama models
- **Fallback Support**: Graceful degradation to word-overlap search if vector service unavailable

## 🚀 Quick Start

### Prerequisites

1. **Node.js** (v16 or higher)
2. **Python 3.8+** (for vector store functionality)
3. **Ollama** installed and running
4. **Nous Hermes 2 - Mixtral** and **GPT-OSS 20B** models pulled in Ollama

### Installation

1. **Clone or navigate to the project:**
   ```bash
   cd "Local Document Agent"
   ```

2. **Install backend dependencies:**
   ```bash
   cd backend
   npm install
   ```

3. **Install frontend dependencies:**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Install Python dependencies (for vector store):**
   ```bash
   cd ..
   pip3 install -r requirements.txt
   ```

### Running the Application

#### Option 1: Start with Vector Store (Recommended)
```bash
# Start all services with semantic search
npm run start-vector
```

#### Option 2: Start without Vector Store (Legacy)
```bash
# Start backend and frontend only
npm start
```

The application will be available at:
- **Frontend**: `http://localhost:3000`
- **Backend**: `http://localhost:3003`
- **Vector Service**: `http://localhost:8000` (if using vector store)

## 🔧 Configuration

### Ollama Setup

Make sure you have Ollama running and the required models installed:

```bash
# Install Ollama (if not already installed)
# Visit: https://ollama.ai

# Pull the required models
ollama pull nous-hermes2-mixtral
ollama pull gpt-oss:20b

# Start Ollama
ollama serve
```

### Backend Configuration

The backend is configured to:
- Run on port 3003
- Accept file uploads up to 50MB
- Use FAISS for vector storage (continues without FAISS if not available)
- Connect to Ollama on `localhost:11434`

You can modify these settings in `backend/server.js`.

## 📁 Project Structure

```
Local Document Agent/
├── backend/
│   ├── server.js          # Express server with API endpoints
│   ├── package.json       # Backend dependencies
│   └── uploads/           # Document storage
├── frontend/
│   ├── src/
│   │   ├── App.tsx        # Main React component
│   │   ├── App.css        # Styles
│   │   └── ...
│   └── package.json       # Frontend dependencies
└── README.md
```

## 🎯 Usage

### Uploading Documents

1. Click the "Upload Document" button
2. Select a PDF, DOCX, or TXT file
3. The document will be processed and chunked automatically
4. You'll see it appear in the documents list

### Chatting with Documents

1. Upload a document using the upload area
2. Select your preferred AI model from the dropdown in the chat header
3. Type your question in the input field
4. Press Enter or click the send button
5. The AI will search through your documents and provide an answer using the selected model

### Managing Documents

- View all uploaded documents in the Documents tab
- See how many chunks each document was split into
- Delete documents you no longer need

## 🔍 How It Works

1. **Document Processing**: When you upload a document, it's:
   - Extracted (PDF → text, DOCX → text, TXT → text)
   - Chunked into smaller pieces (1000 characters with 200 character overlap)
   - Embedded using your local LLM
   - Stored in FAISS vector database

2. **Question Answering**: When you ask a question:
   - Your question is embedded
   - Similar document chunks are retrieved from FAISS
   - The relevant context is sent to your LLM
   - The LLM generates an answer based on the context

## 🛠️ Technical Stack

- **Backend**: Express.js, Node.js
- **Frontend**: React, TypeScript
- **Vector Store**: FAISS
- **Document Processing**: pdf-parse, mammoth
- **Multi-Agent LLM**: Ollama with support for multiple models
- **UI**: Lucide React icons, custom CSS

## 🔧 Troubleshooting

### Common Issues

1. **Ollama not running**
   - Make sure Ollama is installed and running
   - Check that the model is pulled: `ollama list`

2. **Backend connection errors**
   - Ensure the backend is running on port 3003
   - Check that Ollama is accessible on port 11434

3. **File upload issues**
   - Check file size (should be under 50MB)
   - Ensure file type is supported (PDF, DOCX, TXT)

4. **Memory issues**
   - Large documents may require more RAM
   - Consider chunking documents into smaller files

### Performance Tips

- Use smaller documents for faster processing
- Close other applications to free up memory
- Consider using a more powerful machine for large document collections

## 🤝 Contributing

This is a local-first application designed for personal use. Feel free to modify and extend it for your needs!

## 📄 License

This project is open source and available under the MIT License. 