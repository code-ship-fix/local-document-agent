#!/usr/bin/env python3
"""
Vector Service - FastAPI microservice for vector store operations
Integrates with the Local Document Agent backend
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import uvicorn
import logging
from vector_store import get_vector_store, VectorStore

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Vector Store Service",
    description="Semantic search service for Local Document Agent",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3003"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request/response
class DocumentChunksRequest(BaseModel):
    document_id: str
    document_name: str
    chunks: List[str]
    document_type: str = "contract"
    clause_type: Optional[str] = None
    risk_level: Optional[str] = None
    policy_id: Optional[str] = None

class SearchRequest(BaseModel):
    query: str
    document_id: Optional[str] = None
    top_k: int = 5

class PolicyAwareSearchRequest(BaseModel):
    query: str
    document_id: Optional[str] = None
    contract_top_k: int = 3
    policy_top_k: int = 3

class SearchResponse(BaseModel):
    chunks: List[Dict]
    total_found: int
    query: str

class PolicyAwareSearchResponse(BaseModel):
    contract_chunks: List[Dict]
    policy_chunks: List[Dict]
    query: str

class DocumentInfoResponse(BaseModel):
    document_id: str
    document_name: Optional[str]
    chunk_count: int
    document_type: Optional[str] = None

# Initialize vector store
vector_store: VectorStore = None

@app.on_event("startup")
async def startup_event():
    """Initialize vector store on startup"""
    global vector_store
    try:
        vector_store = get_vector_store()
        logger.info("✅ Vector store service started successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize vector store: {e}")
        raise

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "vector-store",
        "vector_store_ready": vector_store is not None
    }

@app.post("/add_document_chunks")
async def add_document_chunks(request: DocumentChunksRequest):
    """
    Add document chunks to the vector store
    
    Args:
        request: DocumentChunksRequest containing document info and chunks
        
    Returns:
        Success status and chunk count
    """
    try:
        success = vector_store.add_document_chunks(
            document_id=request.document_id,
            document_name=request.document_name,
            chunks=request.chunks,
            document_type=request.document_type,
            clause_type=request.clause_type,
            risk_level=request.risk_level,
            policy_id=request.policy_id
        )
        
        if success:
            # Get document info to return chunk count
            doc_info = vector_store.get_document_info(request.document_id)
            return {
                "success": True,
                "message": f"Added {len(request.chunks)} chunks for document: {request.document_name}",
                "chunk_count": doc_info["chunk_count"]
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to add document chunks")
            
    except Exception as e:
        logger.error(f"Error adding document chunks: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search_chunks")
async def search_chunks(request: SearchRequest):
    """
    Search for relevant chunks using semantic similarity
    
    Args:
        request: SearchRequest containing query and optional filters
        
    Returns:
        SearchResponse with relevant chunks and metadata
    """
    try:
        chunks = vector_store.search_chunks(
            query=request.query,
            document_id=request.document_id,
            top_k=request.top_k
        )
        
        return SearchResponse(
            chunks=chunks,
            total_found=len(chunks),
            query=request.query
        )
        
    except Exception as e:
        logger.error(f"Error searching chunks: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search_policy_aware")
async def search_policy_aware(request: PolicyAwareSearchRequest):
    """
    Search both contract and policy collections for policy-aware analysis
    
    Args:
        request: PolicyAwareSearchRequest containing query and parameters
        
    Returns:
        PolicyAwareSearchResponse with contract and policy chunks
    """
    try:
        results = vector_store.search_policy_aware(
            query=request.query,
            document_id=request.document_id,
            contract_top_k=request.contract_top_k,
            policy_top_k=request.policy_top_k
        )
        
        return PolicyAwareSearchResponse(
            contract_chunks=results["contract_chunks"],
            policy_chunks=results["policy_chunks"],
            query=request.query
        )
        
    except Exception as e:
        logger.error(f"Error searching policy-aware: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/document_info/{document_id}")
async def get_document_info(document_id: str):
    """
    Get information about a document in the vector store
    
    Args:
        document_id: ID of the document
        
    Returns:
        DocumentInfoResponse with document information
    """
    try:
        doc_info = vector_store.get_document_info(document_id)
        return DocumentInfoResponse(
            document_id=document_id,
            document_name=doc_info["document_name"],
            chunk_count=doc_info["chunk_count"]
        )
        
    except Exception as e:
        logger.error(f"Error getting document info: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/list_documents")
async def list_documents():
    """
    List all documents in the vector store
    
    Returns:
        List of document information
    """
    try:
        documents = vector_store.list_documents()
        return {"documents": documents}
        
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/delete_document/{document_id}")
async def delete_document(document_id: str):
    """
    Delete all chunks for a specific document
    
    Args:
        document_id: ID of the document to delete
        
    Returns:
        Success status
    """
    try:
        success = vector_store._delete_document_chunks(document_id)
        if success:
            return {"success": True, "message": f"Deleted chunks for document: {document_id}"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete document chunks")
            
    except Exception as e:
        logger.error(f"Error deleting document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/clear_all")
async def clear_all():
    """
    Clear all data from the vector store
    
    Returns:
        Success status
    """
    try:
        success = vector_store.clear_all()
        if success:
            return {"success": True, "message": "Cleared all data from vector store"}
        else:
            raise HTTPException(status_code=500, detail="Failed to clear vector store")
            
    except Exception as e:
        logger.error(f"Error clearing vector store: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Run the FastAPI server
    uvicorn.run(
        "vector_service:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    ) 