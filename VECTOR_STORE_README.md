# 🧠 Vector Store Integration

The Local Document Agent now includes **semantic search** using ChromaDB and sentence-transformers, providing much more accurate document retrieval compared to the previous word-overlap method.

## ✨ New Features

- **Semantic Search**: Uses vector embeddings for context-aware retrieval
- **ChromaDB Integration**: Persistent vector storage with SQLite backend
- **Sentence Transformers**: `all-MiniLM-L6-v2` model for high-quality embeddings
- **Fallback Support**: Graceful degradation to word-overlap search if vector service is unavailable
- **Python Microservice**: FastAPI-based vector service for clean separation of concerns

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Node.js       │    │   Python        │
│   (React)       │◄──►│   Backend       │◄──►│   Vector        │
│   Port 3000     │    │   Port 3003     │    │   Service       │
│                 │    │                 │    │   Port 8000     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   Ollama        │    │   ChromaDB      │
                       │   LLM Models    │    │   Vector Store  │
                       │   Port 11434    │    │   SQLite        │
                       └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### 1. Install Python Dependencies

```bash
# Install Python dependencies
pip3 install -r requirements.txt
```

### 2. Start All Services

```bash
# Start with vector store support
npm run start-vector
```

This will start:
- **Python Vector Service** (Port 8000)
- **Node.js Backend** (Port 3003) 
- **React Frontend** (Port 3000)

### 3. Verify Installation

```bash
# Check vector service health
curl http://localhost:8000/health

# Check backend health
curl http://localhost:3003/api/health
```

## 📊 Vector Store Features

### Document Processing Pipeline

1. **Text Extraction**: PDF/DOCX/TXT → Clean text
2. **Chunking**: 1000-character chunks with 200-character overlap
3. **Embedding Generation**: Using `all-MiniLM-L6-v2` model
4. **Vector Storage**: ChromaDB with metadata
5. **Semantic Search**: Cosine similarity for retrieval

### Search Methods

- **Primary**: Semantic search using vector embeddings
- **Fallback**: Word-overlap search (if vector service unavailable)
- **Hybrid**: Combines both methods for optimal results

## 🔧 API Endpoints

### Vector Service (Python/FastAPI)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service health check |
| `/add_document_chunks` | POST | Add document chunks to vector store |
| `/search_chunks` | POST | Search chunks using semantic similarity |
| `/document_info/{id}` | GET | Get document information |
| `/list_documents` | GET | List all documents |
| `/delete_document/{id}` | DELETE | Delete document chunks |
| `/clear_all` | DELETE | Clear all data |

### Backend (Node.js/Express)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/query` | POST | Semantic search endpoint |
| `/api/upload` | POST | Upload document (now with vector storage) |
| `/api/chat` | POST | Chat with documents (uses semantic search) |

## 📁 File Structure

```
Local Document Agent/
├── vector_store.py          # ChromaDB vector store implementation
├── vector_service.py        # FastAPI microservice
├── requirements.txt         # Python dependencies
├── start-vector.sh         # Startup script with vector support
├── chroma_db/              # ChromaDB persistent storage
│   └── chroma.sqlite       # SQLite database (viewable in DBeaver)
├── backend/
│   └── server.js           # Updated with vector integration
└── frontend/
    └── src/App.tsx         # React frontend
```

## 🔍 Database Inspection

### Using DBeaver

1. **Install DBeaver**: Download from https://dbeaver.io/
2. **Connect to SQLite**: 
   - File → New → Database Connection
   - Select SQLite
   - Database: `./chroma_db/chroma.sqlite`
3. **Explore Tables**:
   - `embeddings`: Vector embeddings
   - `documents`: Document metadata
   - `collections`: Collection information

### Using SQLite CLI

```bash
# Connect to database
sqlite3 chroma_db/chroma.sqlite

# List tables
.tables

# View embeddings
SELECT * FROM embeddings LIMIT 5;

# View documents
SELECT * FROM documents LIMIT 5;
```

## 🧪 Testing

### Test Vector Service

```bash
# Test health
curl http://localhost:8000/health

# Test search (after uploading a document)
curl -X POST http://localhost:8000/search_chunks \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the monthly payment?", "top_k": 5}'
```

### Test Backend Integration

```bash
# Test query endpoint
curl -X POST http://localhost:3003/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the monthly payment?", "documentId": "your_doc_id"}'
```

## 🔧 Configuration

### Environment Variables

```bash
# Vector service URL (default: http://localhost:8000)
export VECTOR_SERVICE_URL=http://localhost:8000

# Backend port (default: 3003)
export PORT=3003
```

### ChromaDB Settings

```python
# In vector_store.py
persist_directory = "./chroma_db"  # Change for different storage location
collection_name = "document_chunks"  # Change collection name if needed
```

## 🚨 Troubleshooting

### Common Issues

1. **Vector Service Not Starting**
   ```bash
   # Check Python dependencies
   pip3 install -r requirements.txt
   
   # Check if port 8000 is available
   lsof -i :8000
   ```

2. **ChromaDB Errors**
   ```bash
   # Clear ChromaDB data
   rm -rf chroma_db/
   
   # Restart vector service
   python3 vector_service.py
   ```

3. **Memory Issues**
   ```bash
   # Monitor memory usage
   top -p $(pgrep -f vector_service.py)
   
   # Reduce chunk size if needed
   # Edit chunkText function in server.js
   ```

4. **Embedding Model Download**
   ```bash
   # First run will download ~90MB model
   # Check download progress in logs
   tail -f vector_service.log
   ```

### Performance Tips

- **Chunk Size**: 1000 characters optimal for most documents
- **Overlap**: 200 characters provides good context continuity
- **Memory**: ~2GB RAM recommended for embedding generation
- **Storage**: ChromaDB uses ~1MB per 1000 chunks

## 📈 Performance Comparison

| Method | Accuracy | Speed | Memory | Setup |
|--------|----------|-------|--------|-------|
| **Word Overlap** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Semantic Search** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |

## 🔄 Migration from Word-Overlap

The system automatically:
1. **Detects** vector service availability
2. **Falls back** to word-overlap if needed
3. **Maintains** backward compatibility
4. **Provides** clear status indicators

## 📝 Logs

### Vector Service Logs
```bash
# View vector service logs
tail -f vector_service.log

# Common log messages:
# ✅ Vector store initialized successfully
# 🔍 Found 5 relevant chunks for query: 'payment'
# ⚠️ Vector service not available, falling back
```

### Backend Logs
```bash
# View backend logs
tail -f backend/server.log

# Common log messages:
# ✅ Added 15 chunks to vector store
# 🔍 Using semantic search for query
# ⚠️ Using fallback search
```

## 🎯 Advanced Usage

### Custom Embedding Models

```python
# In vector_store.py, change the model:
self.embedding_model = SentenceTransformer('all-mpnet-base-v2')  # Better quality
# or
self.embedding_model = SentenceTransformer('paraphrase-MiniLM-L3-v2')  # Faster
```

### Custom Chunking Strategy

```javascript
// In server.js, modify chunkText function:
function chunkText(text, chunkSize = 1500, overlap = 300) {
  // Custom chunking logic
}
```

### Batch Processing

```python
# Add multiple documents at once
for doc in documents:
    vector_store.add_document_chunks(doc.id, doc.name, doc.chunks)
```

## 🔮 Future Enhancements

- **Hybrid Search**: Combine semantic + keyword search
- **Multi-Modal**: Support for images and tables
- **Incremental Updates**: Update embeddings without full rebuild
- **Clustering**: Group similar documents automatically
- **Analytics**: Search performance metrics and insights 