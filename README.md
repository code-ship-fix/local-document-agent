# Local Document Agent

A comprehensive document processing and management system with vector storage capabilities, featuring a React frontend and Node.js backend.

## 🚀 Features

- **Document Upload & Processing**: Upload and process various document formats (PDF, TXT, etc.)
- **Vector Storage**: Advanced document indexing using ChromaDB for semantic search
- **Modern UI**: React-based frontend with TypeScript
- **RESTful API**: Node.js backend with Express
- **Automatic Backups**: GitHub Actions workflow for daily backups
- **Document Management**: View, search, and manage uploaded documents

## 📁 Project Structure

```
Local Document Agent/
├── frontend/          # React TypeScript frontend
├── backend/           # Node.js Express backend
├── chroma_db/         # Vector database storage
├── uploads/           # Document upload directory
├── .github/           # GitHub Actions workflows
└── scripts/           # Utility scripts
```

## 🛠️ Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- Python 3.8+ (for vector processing)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-github-repo-url>
   cd "Local Document Agent"
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Install Python dependencies**
   ```bash
   cd ..
   pip install -r requirements.txt
   ```

### Running the Application

1. **Start the vector service**
   ```bash
   ./start-vector.sh
   ```

2. **Start the backend server**
   ```bash
   cd backend
   npm start
   ```

3. **Start the frontend**
   ```bash
   cd frontend
   npm start
   ```

4. **Or use the combined start script**
   ```bash
   ./start.sh
   ```

## 🔄 GitHub Integration & Automatic Backups

This project is configured with GitHub Actions for automatic backups:

### Backup Schedule
- **Daily backups**: Runs every day at 2 AM UTC
- **Push-triggered backups**: Automatic backup on every push to main/master branch
- **Manual backups**: Can be triggered manually from GitHub Actions tab

### What Gets Backed Up
- All source code
- Configuration files
- Documentation
- Dependencies lists

### What's Excluded
- `node_modules/` (dependencies)
- `uploads/` (user documents)
- `chroma_db/` (vector database)
- Build artifacts
- Environment files

### Backup Artifacts
- Stored as GitHub Actions artifacts
- Retained for 30 days
- Compressed as `.tar.gz` files
- Named with timestamp: `backup-YYYYMMDD-HHMMSS.tar.gz`

## 📚 Usage

1. **Upload Documents**: Use the web interface to upload PDF, TXT, or other document formats
2. **Search Documents**: Use the search functionality to find documents by content
3. **Manage Documents**: View, download, or delete uploaded documents
4. **Vector Search**: Advanced semantic search through document content

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the backend directory:

```env
PORT=3001
NODE_ENV=development
UPLOAD_PATH=./uploads/documents
VECTOR_DB_PATH=./chroma_db
```

### Vector Database
The system uses ChromaDB for vector storage. The database is automatically initialized when the vector service starts.

## 🧪 Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## 📦 Deployment

### Production Build
```bash
# Build frontend
cd frontend
npm run build

# Start production server
cd ../backend
NODE_ENV=production npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Commit your changes: `git commit -m 'Add feature'`
5. Push to the branch: `git push origin feature-name`
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:
1. Check the existing issues
2. Create a new issue with detailed information
3. Include logs and error messages

## 🔄 Backup Recovery

To restore from a backup:
1. Download the backup artifact from GitHub Actions
2. Extract the archive: `tar -xzf backup-YYYYMMDD-HHMMSS.tar.gz`
3. Replace the current project files with the backup contents
4. Reinstall dependencies if needed

---

**Last updated**: $(date)
**Version**: 1.0.0 