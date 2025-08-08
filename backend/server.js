const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3003;

// Vector service configuration
const VECTOR_SERVICE_URL = process.env.VECTOR_SERVICE_URL || 'http://localhost:8000';

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/documents';
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, and TXT files are allowed.'));
    }
  }
});

// Initialize FAISS store (kept for backward compatibility)
let faissStore = null;
let documents = [];
let documentChunks = {}; // Store chunks in memory (for fallback)
let conversationHistory = {}; // Store conversation history per document

// Available models configuration
const AVAILABLE_MODELS = {
  'nous-hermes2-mixtral': {
    name: 'Nous Hermes 2 - Mixtral',
    description: 'Fast and accurate for general tasks'
  },
  'gpt-oss:20b': {
    name: 'GPT-OSS 20B',
    description: 'Open source GPT model with 20B parameters'
  }
};

// Function to check vector service health
async function checkVectorService() {
  try {
    const response = await fetch(`${VECTOR_SERVICE_URL}/health`);
    const data = await response.json();
    return data.status === 'healthy';
  } catch (error) {
    console.log('Vector service not available, falling back to word-overlap search');
    return false;
  }
}

// Function to add document chunks to vector store
async function addChunksToVectorStore(documentId, documentName, chunks) {
  try {
    const response = await fetch(`${VECTOR_SERVICE_URL}/add_document_chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: documentId,
        document_name: documentName,
        chunks: chunks
      })
    });

    if (!response.ok) {
      throw new Error(`Vector service error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ Added ${data.chunk_count} chunks to vector store`);
    return true;
  } catch (error) {
    console.error('Error adding chunks to vector store:', error);
    return false;
  }
}

// Function to search chunks using vector store
async function searchChunksVectorStore(query, documentId = null) {
  try {
    const response = await fetch(`${VECTOR_SERVICE_URL}/search_chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        document_id: documentId,
        top_k: 5
      })
    });

    if (!response.ok) {
      throw new Error(`Vector service error: ${response.status}`);
    }

    const data = await response.json();
    return data.chunks.map(chunk => chunk.text);
  } catch (error) {
    console.error('Error searching vector store:', error);
    return [];
  }
}

// Function to generate response using selected model
async function generateResponse(prompt, modelName) {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        prompt: prompt,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error(`Error generating response with model ${modelName}:`, error);
    throw new Error(`Failed to generate response with ${modelName}: ${error.message}`);
  }
}

// Function to generate embeddings using selected model (kept for backward compatibility)
async function generateEmbedding(text, modelName = 'nous-hermes2-mixtral') {
  try {
    const response = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        prompt: text
      })
    });
    
    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Initialize FAISS store
async function initializeFaissStore() {
  try {
    const { FaissStore } = require('faiss-node');
    faissStore = new FaissStore(384); // Using 384 dimensions for embeddings
    console.log('FAISS store initialized');
  } catch (error) {
    console.error('Error initializing FAISS store:', error);
    console.log('Continuing without FAISS store...');
  }
}

// Text chunking function
function chunkText(text, chunkSize = 4000, overlap = 800) {
  // Clean the text first to preserve numbers and formatting
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  const chunks = [];
  let start = 0;
  
  while (start < cleanText.length) {
    const end = Math.min(start + chunkSize, cleanText.length);
    let chunk = cleanText.slice(start, end);
    
    // Try to break at paragraph or section boundaries for better chunking
    if (end < cleanText.length) {
      // Look for paragraph breaks (double newlines) first
      const lastParagraphBreak = chunk.lastIndexOf('\n\n');
      const lastSectionBreak = chunk.lastIndexOf('\n\n\n');
      
      // Look for sentence endings within the last 500 characters
      const lastPeriod = chunk.lastIndexOf('.');
      const lastExclamation = chunk.lastIndexOf('!');
      const lastQuestion = chunk.lastIndexOf('?');
      const lastNewline = chunk.lastIndexOf('\n');
      
      // Prioritize paragraph breaks, then section breaks, then sentence endings
      let breakPoint = -1;
      if (lastSectionBreak > start + chunkSize * 0.6) {
        breakPoint = lastSectionBreak;
      } else if (lastParagraphBreak > start + chunkSize * 0.7) {
        breakPoint = lastParagraphBreak;
      } else {
        const sentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion, lastNewline);
        if (sentenceEnd > start + chunkSize * 0.8) { // Only break if we're in the last 20% of the chunk
          breakPoint = sentenceEnd;
        }
      }
      
      if (breakPoint > 0) {
        chunk = cleanText.slice(start, start + breakPoint + 1);
        start = start + breakPoint + 1;
      } else {
        start = Math.max(end - overlap, start + 1);
      }
    } else {
      start = Math.max(end - overlap, start + 1);
    }
    
    // If we're not making progress, break to avoid infinite loop
    if (start >= cleanText.length) break;
    
    // Only add non-empty chunks with minimum length
    if (chunk.trim().length > 50) {
      chunks.push(chunk.trim());
    }
  }
  
  return chunks;
}

// Simple text search function
function searchChunks(query, chunks, maxResults = 5) {
  const queryLower = query.toLowerCase();
  const results = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkLower = chunk.toLowerCase();
    
    // Simple relevance scoring based on word overlap
    const queryWords = queryLower.split(/\s+/);
    const chunkWords = chunkLower.split(/\s+/);
    
    let score = 0;
    for (const word of queryWords) {
      if (chunkWords.includes(word)) {
        score += 1;
      }
      // Also check for partial matches for numbers
      if (word.match(/\d/) && chunkLower.includes(word)) {
        score += 2; // Give higher score for number matches
      }
    }
    
    // Special handling for financial terms
    const financialTerms = ['balance', 'payment', 'amount', 'dollar', '$', 'monthly', 'interest', 'rate'];
    for (const term of financialTerms) {
      if (queryLower.includes(term) && chunkLower.includes(term)) {
        score += 1;
      }
    }
    
    if (score > 0) {
      results.push({
        text: chunk,
        score: score,
        index: i
      });
    }
  }
  
  // Sort by score and return top results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(result => result.text);
}

// Extract text from different file types
async function extractTextFromFile(filePath, fileType) {
  try {
    if (fileType === '.pdf') {
      const dataBuffer = await fs.readFile(filePath);
      
      // Try with default options first
      try {
        const data = await pdfParse(dataBuffer);
        return data.text;
      } catch (pdfError) {
        console.log('First PDF parsing attempt failed, trying with relaxed options...');
        
        // Try with relaxed options for corrupted PDFs
        try {
          const data = await pdfParse(dataBuffer, {
            normalizeWhitespace: true,
            disableCombineTextItems: false
          });
          return data.text;
        } catch (relaxedError) {
          console.log('Relaxed PDF parsing also failed, trying with minimal options...');
          
          // Try with minimal options
          try {
            const data = await pdfParse(dataBuffer, {
              normalizeWhitespace: false,
              disableCombineTextItems: true,
              verbosity: 0
            });
            return data.text;
          } catch (minimalError) {
            console.error('All PDF parsing attempts failed:', minimalError.message);
            throw new Error(`PDF parsing failed: ${minimalError.message}. The PDF may be corrupted or password-protected.`);
          }
        }
      }
    } else if (fileType === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else if (fileType === '.txt') {
      return await fs.readFile(filePath, 'utf8');
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
  } catch (error) {
    console.error('Error extracting text:', error);
    throw error;
  }
}

// Upload and process document
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileType = path.extname(fileName).toLowerCase();

    // Delete previous documents and their files
    for (const doc of documents) {
      try {
        await fs.remove(doc.path);
      } catch (error) {
        console.error('Error deleting previous document file:', error);
      }
    }
    
    // Clear previous documents, chunks, and conversation history
    documents = [];
    documentChunks = {};
    conversationHistory = {};

    // Extract text from document
    const text = await extractTextFromFile(filePath, fileType);
    
    // Chunk the text
    const chunks = chunkText(text);
    
    // Store chunks in memory for this document (for fallback)
    const documentId = Date.now().toString();
    documentChunks[documentId] = chunks;
    
    // Initialize conversation history for this document
    conversationHistory[documentId] = [];
    
    // Add chunks to vector store (ChromaDB)
    const vectorServiceAvailable = await checkVectorService();
    if (vectorServiceAvailable) {
      const success = await addChunksToVectorStore(documentId, fileName, chunks);
      if (!success) {
        console.log('⚠️ Failed to add chunks to vector store, using fallback search');
      }
    } else {
      console.log('⚠️ Vector service not available, using fallback search');
    }

    // Store document metadata
    const document = {
      id: documentId,
      name: fileName,
      path: filePath,
      chunks: chunks.length,
      uploadedAt: new Date().toISOString(),
      vectorStoreEnabled: vectorServiceAvailable
    };
    
    documents.push(document);

    res.json({ 
      success: true, 
      document,
      message: `Document uploaded and processed. ${chunks.length} chunks created.${vectorServiceAvailable ? ' Semantic search enabled.' : ' Using fallback search.'}`
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Error processing document';
    
    if (error.message.includes('PDF parsing failed')) {
      errorMessage = error.message;
    } else if (error.message.includes('Unsupported file type')) {
      errorMessage = error.message;
    } else if (error.message.includes('No file uploaded')) {
      errorMessage = 'No file uploaded';
    } else if (error.message.includes('ENOENT')) {
      errorMessage = 'File not found or inaccessible';
    } else {
      errorMessage = `Error processing document: ${error.message}`;
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// Get all documents
app.get('/api/documents', (req, res) => {
  res.json(documents);
});

// Get conversation history for a document
app.get('/api/conversation/:documentId', (req, res) => {
  const { documentId } = req.params;
  const history = conversationHistory[documentId] || [];
  res.json(history);
});

// Upload and process policy document
app.post('/api/upload-policy', upload.single('policy'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No policy file uploaded' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileType = path.extname(fileName).toLowerCase();

    // Extract text from policy document
    const text = await extractTextFromFile(filePath, fileType);
    
    // Chunk the text
    const chunks = chunkText(text);
    
    // Generate policy ID
    const policyId = `policy_${Date.now()}`;
    
    // Add policy chunks to vector store
    const vectorServiceAvailable = await checkVectorService();
    if (vectorServiceAvailable) {
      try {
        const response = await fetch(`${VECTOR_SERVICE_URL}/add_document_chunks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            document_id: policyId,
            document_name: fileName,
            chunks: chunks,
            document_type: 'policy',
            clause_type: 'general',
            risk_level: 'medium',
            policy_id: policyId
          })
        });

        if (!response.ok) {
          throw new Error(`Vector service error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ Added ${data.chunk_count} policy chunks to vector store`);
      } catch (error) {
        console.error('Error adding policy chunks to vector store:', error);
        return res.status(500).json({ error: 'Failed to process policy document' });
      }
    } else {
      return res.status(503).json({ error: 'Vector service not available' });
    }

    res.json({ 
      success: true, 
      policy_id: policyId,
      document_name: fileName,
      chunks: chunks.length,
      message: `Policy document uploaded and processed. ${chunks.length} chunks created.`
    });

  } catch (error) {
    console.error('Policy upload error:', error);
    
    let errorMessage = 'Error processing policy document';
    
    if (error.message.includes('PDF parsing failed')) {
      errorMessage = error.message;
    } else if (error.message.includes('Unsupported file type')) {
      errorMessage = error.message;
    } else if (error.message.includes('No file uploaded')) {
      errorMessage = 'No policy file uploaded';
    } else {
      errorMessage = `Error processing policy document: ${error.message}`;
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// Query endpoint for semantic search
app.post('/api/query', async (req, res) => {
  try {
    const { query, documentId } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Check if vector service is available
    const vectorServiceAvailable = await checkVectorService();
    if (!vectorServiceAvailable) {
      return res.status(503).json({ 
        error: 'Vector service not available',
        message: 'Semantic search is currently unavailable. Please ensure the Python vector service is running.'
      });
    }

    // Search using vector store
    try {
      const response = await fetch(`${VECTOR_SERVICE_URL}/search_chunks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          document_id: documentId,
          top_k: 5
        })
      });

      if (!response.ok) {
        throw new Error(`Vector service error: ${response.status}`);
      }

      const data = await response.json();
      
      res.json({
        success: true,
        query: query,
        document_id: documentId,
        chunks: data.chunks,
        total_found: data.total_found,
        search_method: 'semantic'
      });

    } catch (error) {
      console.error('Error querying vector store:', error);
      res.status(500).json({ 
        error: 'Failed to query vector store',
        message: error.message
      });
    }

  } catch (error) {
    console.error('Query endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get available models
app.get('/api/models', (req, res) => {
  res.json({
    models: AVAILABLE_MODELS,
    default: 'nous-hermes2-mixtral'
  });
});

// Policy-aware query endpoint
app.post('/api/query-policy-aware', async (req, res) => {
  try {
    const { query, documentId } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Check if vector service is available
    const vectorServiceAvailable = await checkVectorService();
    if (!vectorServiceAvailable) {
      return res.status(503).json({ 
        error: 'Vector service not available',
        message: 'Policy-aware search is currently unavailable. Please ensure the Python vector service is running.'
      });
    }

    // Search using policy-aware vector store
    try {
      const response = await fetch(`${VECTOR_SERVICE_URL}/search_policy_aware`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          document_id: documentId,
          contract_top_k: 5,
          policy_top_k: 8
        })
      });

      if (!response.ok) {
        throw new Error(`Vector service error: ${response.status}`);
      }

      const data = await response.json();
      
      res.json({
        success: true,
        query: query,
        document_id: documentId,
        contract_chunks: data.contract_chunks,
        policy_chunks: data.policy_chunks,
        search_method: 'policy-aware'
      });

    } catch (error) {
      console.error('Error querying policy-aware vector store:', error);
      res.status(500).json({ 
        error: 'Failed to query policy-aware vector store',
        message: error.message
      });
    }

  } catch (error) {
    console.error('Policy-aware query endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Chat with documents
app.post('/api/chat', async (req, res) => {
  try {
    const { message, model } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get current document
    const currentDocument = documents[0];
    if (!currentDocument) {
      return res.status(400).json({ error: 'No document uploaded' });
    }

    const documentId = currentDocument.id;
    
    // Search for relevant chunks using vector store (semantic search)
    let relevantChunks = [];
    let searchMethod = 'fallback';
    
    // Try vector store first
    const vectorServiceAvailable = await checkVectorService();
    if (vectorServiceAvailable) {
      relevantChunks = await searchChunksVectorStore(message, documentId);
      if (relevantChunks.length > 0) {
        searchMethod = 'semantic';
      }
    }
    
    // Fallback to word-overlap search if vector store fails or returns no results
    if (relevantChunks.length === 0) {
      if (documents.length > 0) {
        // Collect all chunks from all documents
        const allChunks = [];
        for (const doc of documents) {
          if (documentChunks[doc.id]) {
            allChunks.push(...documentChunks[doc.id]);
          }
        }
        
        // Search through all chunks using word overlap
        if (allChunks.length > 0) {
          relevantChunks = searchChunks(message, allChunks, 5);
          searchMethod = 'word-overlap';
        }
      }
    }
    
    // If still no results, try broader search terms for specific questions
    if (relevantChunks.length === 0 && message.toLowerCase().includes('termination')) {
      if (documents.length > 0) {
        const allChunks = [];
        for (const doc of documents) {
          if (documentChunks[doc.id]) {
            allChunks.push(...documentChunks[doc.id]);
          }
        }
        
        // Try broader search terms for termination
        const broaderTerms = ['terminate', 'termination', 'notice', 'days', 'convenience', 'breach'];
        for (const term of broaderTerms) {
          const broaderResults = searchChunks(term, allChunks, 3);
          if (broaderResults.length > 0) {
            relevantChunks = broaderResults;
            searchMethod = 'broader-search';
            break;
          }
        }
      }
    }

    // Prepare context for the LLM
    const context = relevantChunks.join('\n\n');
    
    // Debug: Log the retrieved chunks
    console.log(`🔍 Retrieved ${relevantChunks.length} chunks for query: "${message}"`);
    console.log(`📄 Search method used: ${searchMethod}`);
    if (relevantChunks.length > 0) {
      console.log(`📝 First chunk preview: ${relevantChunks[0].substring(0, 200)}...`);
    }
    
    // Get conversation history for this document
    const history = conversationHistory[documentId] || [];
    
    // Build conversation context
    let conversationContext = '';
    if (history.length > 0) {
      // Include last 5 exchanges for context
      const recentHistory = history.slice(-10);
      conversationContext = recentHistory.map(exchange => 
        `User: ${exchange.user}\nAssistant: ${exchange.assistant}`
      ).join('\n\n');
    }
    
    // Create the full prompt with conversation history
    const fullPrompt = `You are a helpful AI assistant that can analyze documents and perform calculations. You have access to document content and our conversation history.

IMPORTANT: Answer ONLY the specific question asked. Do not provide additional calculations, analysis, or information unless explicitly requested.

CRITICAL INSTRUCTIONS FOR LEGAL AND CONTRACT DOCUMENTS:
- Look VERY carefully for specific terms, dates, and durations in the provided context
- Pay special attention to sections about "Term", "Duration", "Agreement Period", "Payment Terms", "Net 30", "Payment Schedule"
- Search for exact phrases like "duration of the agreement", "term of this agreement", "payment terms", "net 30 days"
- If you find specific information in the context, provide it EXACTLY as stated
- Do NOT make assumptions or provide generic answers
- If the information is in the context, quote it directly
- Look for complete sentences and full clauses, not fragmented text
- If the requested information is NOT found in the context, clearly state: "The [specific clause] is not found in the provided contract context"
- Do NOT make up information that isn't in the document
- If asked about a specific clause that's not found, be direct: "The [clause name] is not present in this contract"
- If the contract mentions termination but doesn't specify details, state: "The contract mentions termination but doesn't specify [specific details like notice period]"

CRITICAL INSTRUCTIONS FOR FINANCIAL DOCUMENTS:
- Look carefully for financial amounts, balances, and payment information in the provided context
- Pay special attention to terms like "outstanding principal", "loan balance", "current balance", "remaining balance"
- If you find financial amounts in the context, use them to answer the question
- Be precise with numbers and amounts
- If the context contains the information needed, provide it directly

CURRENT DATE INFORMATION:
- Current Date: ${new Date().toLocaleDateString()}
- Current Month: ${new Date().toLocaleDateString('en-US', { month: 'long' })} ${new Date().getFullYear()}
- Current Year: ${new Date().getFullYear()}
- Months Remaining in Current Year: ${12 - new Date().getMonth() - 1}

When performing calculations:
- Be precise and consistent with your logic
- Double-check your math before providing answers
- If you state a number of items, use that same number in your calculation
- Show your work step by step
- Don't contradict yourself in the same response
- When reading financial data, pay attention to column headers and use the correct values
- For payment amounts, use the "Total" amount, not individual components like "Principal" or "Interest"
- Read data carefully and verify you're using the right numbers
- For date-based calculations, use the actual dates in the document
- Don't make assumptions about dates not mentioned in the document
- Use only the information provided in the document context
- For calendar year questions: count the months remaining from the current month to December
- If the next payment is in September, count September, October, November, December = 4 months
- Use the current date information provided above for accurate calculations
- Only include calendar year information when specifically asked about calendar year calculations

RESPONSE FORMATTING:
- Provide direct, concise answers to the specific question asked
- Use natural, conversational language
- Only use bullet points when listing multiple items or breaking down complex information
- For simple questions, give a direct answer in a complete sentence
- Avoid unnecessary formatting for straightforward answers
- Use bullet points only when you have multiple related points to share
- Keep responses focused and to the point

FORMATTING RULES:
- For simple questions: Answer directly in a complete sentence
- For complex questions: Use bullet points only when listing multiple items
- Avoid over-formatting simple answers
- Use natural paragraph breaks instead of forced bullet points
- Only use bullet points when you have 2+ related items to list

EXAMPLE FORMATS:

Simple Question: "What is the payment term?"
Good Answer: "The payment term is 30 days. All invoices are payable within 30 days."

Question: "Is the termination clause acceptable?"
Good Answer: "The termination clause allows either party to terminate for convenience with 60 days' written notice, or immediately upon material breach not cured within 30 days. The agreement has a 2-year term unless terminated earlier."

Complex Question: "What are the key terms of the agreement?"
Good Answer: "The key terms include:
• Duration: Two (2) years from the effective date
• Payment terms: 30 days for all invoices
• Confidentiality: Five (5) years after termination"

Document Context:
${context}

${conversationContext ? `Conversation History:\n${conversationContext}\n\n` : ''}Current User Question: ${message}

Instructions:
- Answer ONLY the specific question asked - be direct and concise
- Do NOT show your thinking process or reasoning steps
- Do NOT repeat the question in your answer
- Provide the answer immediately without preamble
- Use the information from the document context and conversation history
- If the question involves calculations and you have the necessary numbers, perform the math
- Be specific with your calculations but don't show step-by-step work unless asked
- Do NOT provide additional analysis or answer questions that weren't asked
- Keep your response focused and concise
- If you need more information, ask for it specifically
- Don't say you can't calculate if you have the required data
- Be mathematically consistent - if you say X items, calculate with X items
- Read financial data carefully - use "Total" amounts for payments, not individual components
- Use only the dates and amounts explicitly mentioned in the document
- For calendar year calculations: count remaining months from current month to December
- For simple questions: Give direct answers in complete sentences
- For complex questions: Use bullet points only when listing multiple items
- Use the current date information provided above for accurate calendar calculations
- For insight and analysis questions, provide comprehensive analysis with multiple perspectives
- For "hidden insights" or "reading between the lines" questions, explore various angles and implications
- IMPORTANT: If the document context contains financial information like outstanding principal, loan balance, or current amounts, use that information to answer the question directly
- CRITICAL: For legal/contract questions, search the context VERY carefully for exact terms and provide precise answers
- If you find specific contract terms in the context, quote them exactly
- DO NOT start responses with phrases like "Based on the document..." or "According to the contract..."
- DO NOT show your search process or what you found in the context
- Just provide the direct answer to the question

Answer:`;
    
    // Send to Ollama
    const ollamaResponse = await generateResponse(fullPrompt, model || 'nous-hermes2-mixtral');
    
    // Store the exchange in conversation history
    const exchange = {
      user: message,
      assistant: ollamaResponse,
      timestamp: new Date().toISOString()
    };
    
    if (!conversationHistory[documentId]) {
      conversationHistory[documentId] = [];
    }
    conversationHistory[documentId].push(exchange);
    
    res.json({
      response: ollamaResponse,
      context: relevantChunks,
      conversationId: documentId
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Error processing chat request' });
  }
});

// Policy-aware chat with documents
app.post('/api/chat-policy-aware', async (req, res) => {
  try {
    const { message, model } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get current document
    const currentDocument = documents[0];
    if (!currentDocument) {
      return res.status(400).json({ error: 'No document uploaded' });
    }

    const documentId = currentDocument.id;
    
    // Search for relevant chunks using policy-aware vector store
    let contractChunks = [];
    let policyChunks = [];
    let searchMethod = 'fallback';
    
    // Try policy-aware vector store first
    const vectorServiceAvailable = await checkVectorService();
    if (vectorServiceAvailable) {
      try {
        const response = await fetch(`${VECTOR_SERVICE_URL}/search_policy_aware`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: message,
            document_id: documentId,
            contract_top_k: 5,
            policy_top_k: 8
          })
        });

        if (response.ok) {
          const data = await response.json();
          contractChunks = data.contract_chunks.map(chunk => chunk.text);
          policyChunks = data.policy_chunks.map(chunk => chunk.text);
          searchMethod = 'policy-aware';
        }
      } catch (error) {
        console.error('Error in policy-aware search:', error);
      }
    }
    
    // Fallback to regular search if policy-aware search fails
    if (contractChunks.length === 0) {
      const vectorServiceAvailable = await checkVectorService();
      if (vectorServiceAvailable) {
        contractChunks = await searchChunksVectorStore(message, documentId);
        if (contractChunks.length > 0) {
          searchMethod = 'semantic';
        }
      }
      
      // Fallback to word-overlap search
      if (contractChunks.length === 0) {
        if (documents.length > 0) {
          const allChunks = [];
          for (const doc of documents) {
            if (documentChunks[doc.id]) {
              allChunks.push(...documentChunks[doc.id]);
            }
          }
          
          if (allChunks.length > 0) {
            contractChunks = searchChunks(message, allChunks, 5);
            searchMethod = 'word-overlap';
          }
        }
      }
    }

    // Prepare context for the LLM
    const contractContext = contractChunks.join('\n\n');
    const policyContext = policyChunks.join('\n\n');
    
    // Debug: Log the retrieved chunks
    console.log(`🔍 Retrieved ${contractChunks.length} contract chunks and ${policyChunks.length} policy chunks for query: "${message}"`);
    console.log(`📄 Search method used: ${searchMethod}`);
    
    // Get conversation history for this document
    const history = conversationHistory[documentId] || [];
    
    // Build conversation context
    let conversationContext = '';
    if (history.length > 0) {
      const recentHistory = history.slice(-10);
      conversationContext = recentHistory.map(exchange => 
        `User: ${exchange.user}\nAssistant: ${exchange.assistant}`
      ).join('\n\n');
    }
    
    // Create the policy-aware prompt
    const fullPrompt = `You are a contract compliance reviewer. Analyze the contract against company policies.

IMPORTANT: Provide a FOCUSED and CONCISE analysis based on the specific question asked. Do NOT include analysis instructions in your response.

CRITICAL INSTRUCTIONS:
- Focus your analysis on the specific aspect mentioned in the user's question
- If asked about a specific clause (e.g., termination, payment), focus only on that
- If asked for comprehensive analysis, then cover all policy points
- Use ✅ for compliant and ❌ for non-compliant
- Provide specific, actionable recommendations
- Be direct and professional

CURRENT DATE INFORMATION:
- Current Date: ${new Date().toLocaleDateString()}
- Current Month: ${new Date().toLocaleDateString('en-US', { month: 'long' })} ${new Date().getFullYear()}
- Current Year: ${new Date().getFullYear()}

RESPONSE FORMAT:
For specific questions: Focus on the relevant policy area only
For comprehensive questions: Cover all policy points systematically

Contract Clause:
${contractContext}

Company Policy:
${policyContext}

${conversationContext ? `Conversation History:\n${conversationContext}\n\n` : ''}Current User Question: ${message}

QUESTION ANALYSIS:
- If the question mentions a specific clause (termination, payment, liability, IP, etc.), focus ONLY on that aspect
- If the question asks for comprehensive analysis, cover all policy points
- Provide a focused, relevant response based on the question scope

TERMINATION CLAUSE ANALYSIS:
- Look for specific notice period requirements in the policy (e.g., "90 days minimum", "30 days notice")
- Compare the contract's notice period with policy requirements
- If policy doesn't specify exact numbers, note the general guidance and provide recommendations
- Be specific about what the contract allows vs what policy recommends
- ALWAYS state the exact policy requirement and contract provision when comparing
- Use specific numbers: "Policy requires 90 days, contract allows 60 days = Non-compliant"
- If contract doesn't specify notice period: "Contract doesn't specify notice period, policy requires 90 days = Non-compliant"
- If contract mentions termination but no specific period: "Contract allows termination but doesn't specify notice period, policy requires 90 days = Non-compliant"

EXAMPLES:
- Question: "Is the termination clause acceptable?" → Focus ONLY on termination/notice periods
- Question: "Are payment terms compliant?" → Focus ONLY on payment terms
- Question: "Analyze contract compliance" → Cover all policy points comprehensively

SPECIFIC ANALYSIS REQUIREMENTS:
- For termination clauses: Look for specific notice period requirements (e.g., "90 days minimum", "30 days notice")
- For payment terms: Look for specific payment term requirements (e.g., "Net 45", "30 days")
- For liability: Look for specific liability cap requirements (e.g., "2x contract value")
- Be precise about what the policy requires vs what the contract provides
- If policy doesn't specify exact numbers, note that and provide guidance
- ALWAYS quote exact numbers from policy and contract when making comparisons
- Example: "Policy requires 90 days notice, contract allows 60 days = Non-compliant"

Provide a clear, focused compliance assessment:`;
    
    // Send to Ollama
    const ollamaResponse = await generateResponse(fullPrompt, model || 'nous-hermes2-mixtral');
    
    // Store the exchange in conversation history
    const exchange = {
      user: message,
      assistant: ollamaResponse,
      timestamp: new Date().toISOString()
    };
    
    if (!conversationHistory[documentId]) {
      conversationHistory[documentId] = [];
    }
    conversationHistory[documentId].push(exchange);
    
    res.json({
      response: ollamaResponse,
      contract_context: contractChunks,
      policy_context: policyChunks,
      conversationId: documentId
    });

  } catch (error) {
    console.error('Policy-aware chat error:', error);
    res.status(500).json({ error: 'Error processing policy-aware chat request' });
  }
});

// Delete document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const documentIndex = documents.findIndex(doc => doc.id === id);
    
    if (documentIndex === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documents[documentIndex];
    
    // Remove file
    await fs.remove(document.path);
    
    // Remove from documents array
    documents.splice(documentIndex, 1);
    
    // Clear conversation history for this document
    delete conversationHistory[id];
    delete documentChunks[id];
    
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Error deleting document' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    documents: documents.length,
    faissStore: faissStore ? 'initialized' : 'not initialized',
    message: 'Local Document Agent Backend is running'
  });
});

// Initialize and start server
async function startServer() {
  try {
    await initializeFaissStore();
  } catch (error) {
    console.error('Failed to initialize FAISS store:', error);
  }
  
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📱 Frontend should be available at: http://localhost:3000`);
  });
}

startServer().catch(console.error); 