#!/usr/bin/env python3
"""
Vector Store Module for Local Document Agent
Uses ChromaDB for persistent vector storage and semantic search
"""

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import numpy as np
import json
import os
from typing import List, Dict, Tuple, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VectorStore:
    """
    ChromaDB-based vector store for semantic document search
    """
    
    def __init__(self, persist_directory: str = "./chroma_db"):
        """
        Initialize the vector store with ChromaDB
        
        Args:
            persist_directory: Directory to persist ChromaDB data
        """
        self.persist_directory = persist_directory
        self.embedding_model = None
        self.client = None
        self.contract_collection = None
        self.policy_collection = None
        
        # Initialize embedding model
        self._initialize_embedding_model()
        
        # Initialize ChromaDB
        self._initialize_chromadb()
    
    def _initialize_embedding_model(self):
        """Initialize the sentence transformer model for embeddings"""
        try:
            logger.info("Loading sentence transformer model: all-MiniLM-L6-v2")
            self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            logger.info("✅ Embedding model loaded successfully")
        except Exception as e:
            logger.error(f"❌ Failed to load embedding model: {e}")
            raise
    
    def _initialize_chromadb(self):
        """Initialize ChromaDB client and collections"""
        try:
            # Create persist directory if it doesn't exist
            os.makedirs(self.persist_directory, exist_ok=True)
            
            # Initialize ChromaDB client with persistent settings
            self.client = chromadb.PersistentClient(
                path=self.persist_directory,
                settings=Settings(
                    anonymized_telemetry=False,  # Disable telemetry for local use
                    allow_reset=True
                )
            )
            
            # Get or create the contract collection
            self.contract_collection = self.client.get_or_create_collection(
                name="uploaded_contracts",
                metadata={"description": "Contract document chunks with embeddings for semantic search"}
            )
            
            # Get or create the policy collection
            self.policy_collection = self.client.get_or_create_collection(
                name="contract_policy",
                metadata={"description": "Company policy chunks with embeddings for compliance checking"}
            )
            
            logger.info("✅ ChromaDB initialized successfully with dual collections")
            logger.info(f"📁 Persist directory: {self.persist_directory}")
            logger.info("📋 Contract collection: uploaded_contracts")
            logger.info("📋 Policy collection: contract_policy")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize ChromaDB: {e}")
            raise
    
    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for a given text
        
        Args:
            text: Input text to embed
            
        Returns:
            List of float values representing the embedding
        """
        try:
            # Generate embedding using sentence transformer
            embedding = self.embedding_model.encode(text)
            return embedding.tolist()
        except Exception as e:
            logger.error(f"❌ Failed to generate embedding: {e}")
            raise
    
    def add_document_chunks(self, document_id: str, document_name: str, chunks: List[str], 
                          document_type: str = "contract", clause_type: str = None, 
                          risk_level: str = None, policy_id: str = None) -> bool:
        """
        Add document chunks to the vector store
        
        Args:
            document_id: Unique identifier for the document
            document_name: Name of the document
            chunks: List of text chunks to add
            document_type: Type of document ("contract" or "policy")
            clause_type: Type of clause (for contracts) or policy section (for policies)
            risk_level: Risk level assessment (for policies)
            policy_id: Policy identifier (for policies)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Clear existing chunks for this document
            self._delete_document_chunks(document_id, document_type)
            
            if not chunks:
                logger.warning("No chunks provided for document")
                return True
            
            # Generate embeddings for all chunks
            logger.info(f"Generating embeddings for {len(chunks)} chunks...")
            embeddings = []
            metadatas = []
            ids = []
            
            # Select appropriate collection
            collection = self.contract_collection if document_type == "contract" else self.policy_collection
            
            for i, chunk in enumerate(chunks):
                # Generate embedding
                embedding = self.generate_embedding(chunk)
                embeddings.append(embedding)
                
                # Create metadata
                metadata = {
                    "document_id": document_id,
                    "document_name": document_name,
                    "document_type": document_type,
                    "chunk_index": i,
                    "chunk_length": len(chunk),
                    "section_label": f"chunk_{i+1}"
                }
                
                # Add policy-specific metadata
                if document_type == "policy":
                    metadata.update({
                        "clause_type": clause_type or "general",
                        "risk_level": risk_level or "medium",
                        "policy_id": policy_id or document_id
                    })
                
                metadatas.append(metadata)
                
                # Create unique ID
                chunk_id = f"{document_id}_chunk_{i}"
                ids.append(chunk_id)
            
            # Add to appropriate ChromaDB collection
            collection.add(
                embeddings=embeddings,
                metadatas=metadatas,
                ids=ids,
                documents=chunks
            )
            
            logger.info(f"✅ Added {len(chunks)} chunks for {document_type}: {document_name}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to add document chunks: {e}")
            return False
    
    def search_chunks(self, query: str, document_id: Optional[str] = None, top_k: int = 5, 
                     collection_type: str = "contract") -> List[Dict]:
        """
        Search for relevant chunks using semantic similarity
        
        Args:
            query: Search query
            document_id: Optional document ID to filter results
            top_k: Number of top results to return
            collection_type: Type of collection to search ("contract" or "policy")
            
        Returns:
            List of dictionaries containing chunk data and similarity scores
        """
        try:
            # Generate embedding for the query
            query_embedding = self.generate_embedding(query)
            
            # Prepare where clause if filtering by document
            where_clause = None
            if document_id:
                where_clause = {"document_id": document_id}
            
            # Select appropriate collection
            collection = self.contract_collection if collection_type == "contract" else self.policy_collection
            
            # Search in ChromaDB
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where=where_clause,
                include=["metadatas", "documents", "distances"]
            )
            
            # Format results
            formatted_results = []
            if results['ids'] and results['ids'][0]:
                for i in range(len(results['ids'][0])):
                    result = {
                        "chunk_id": results['ids'][0][i],
                        "text": results['documents'][0][i],
                        "metadata": results['metadatas'][0][i],
                        "similarity_score": 1 - results['distances'][0][i],  # Convert distance to similarity
                        "distance": results['distances'][0][i],
                        "collection_type": collection_type
                    }
                    formatted_results.append(result)
            
            logger.info(f"🔍 Found {len(formatted_results)} relevant {collection_type} chunks for query: '{query}'")
            return formatted_results
            
        except Exception as e:
            logger.error(f"❌ Failed to search chunks: {e}")
            return []
    
    def search_policy_aware(self, query: str, document_id: Optional[str] = None, 
                           contract_top_k: int = 5, policy_top_k: int = 8) -> Dict:
        """
        Search both contract and policy collections for policy-aware analysis
        
        Args:
            query: Search query
            document_id: Optional document ID to filter contract results
            contract_top_k: Number of top contract results to return
            policy_top_k: Number of top policy results to return
            
        Returns:
            Dictionary with contract and policy chunks
        """
        try:
            # Search contract collection
            contract_chunks = self.search_chunks(query, document_id, contract_top_k, "contract")
            
            # Search policy collection
            policy_chunks = self.search_chunks(query, None, policy_top_k, "policy")
            
            return {
                "contract_chunks": contract_chunks,
                "policy_chunks": policy_chunks,
                "query": query
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to search policy-aware: {e}")
            return {"contract_chunks": [], "policy_chunks": [], "query": query}
    
    def _delete_document_chunks(self, document_id: str, document_type: str = "contract") -> bool:
        """
        Delete all chunks for a specific document
        
        Args:
            document_id: ID of the document to delete
            document_type: Type of document ("contract" or "policy")
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Select appropriate collection
            collection = self.contract_collection if document_type == "contract" else self.policy_collection
            
            # Delete chunks where document_id matches
            collection.delete(where={"document_id": document_id})
            logger.info(f"🗑️ Deleted {document_type} chunks for document: {document_id}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to delete document chunks: {e}")
            return False
    
    def get_document_info(self, document_id: str) -> Dict:
        """
        Get information about a document in the vector store
        
        Args:
            document_id: ID of the document
            
        Returns:
            Dictionary with document information
        """
        try:
            results = self.collection.get(where={"document_id": document_id})
            
            if not results['ids']:
                return {"chunk_count": 0, "document_name": None}
            
            # Get unique document name
            document_names = set(metadata.get('document_name') for metadata in results['metadatas'])
            document_name = list(document_names)[0] if document_names else None
            
            return {
                "chunk_count": len(results['ids']),
                "document_name": document_name,
                "document_id": document_id
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get document info: {e}")
            return {"chunk_count": 0, "document_name": None}
    
    def list_documents(self, document_type: str = None) -> List[Dict]:
        """
        List all documents in the vector store
        
        Args:
            document_type: Optional filter for document type ("contract" or "policy")
            
        Returns:
            List of document information dictionaries
        """
        try:
            documents = []
            
            # List contract documents
            if document_type is None or document_type == "contract":
                contract_results = self.contract_collection.get()
                if contract_results['ids']:
                    contract_docs = self._group_documents_by_id(contract_results, "contract")
                    documents.extend(contract_docs)
            
            # List policy documents
            if document_type is None or document_type == "policy":
                policy_results = self.policy_collection.get()
                if policy_results['ids']:
                    policy_docs = self._group_documents_by_id(policy_results, "policy")
                    documents.extend(policy_docs)
            
            return documents
            
        except Exception as e:
            logger.error(f"❌ Failed to list documents: {e}")
            return []
    
    def _group_documents_by_id(self, results: Dict, doc_type: str) -> List[Dict]:
        """Helper method to group documents by ID"""
        documents = {}
        for i, metadata in enumerate(results['metadatas']):
            doc_id = metadata.get('document_id')
            if doc_id not in documents:
                documents[doc_id] = {
                    "document_id": doc_id,
                    "document_name": metadata.get('document_name'),
                    "document_type": doc_type,
                    "chunk_count": 0
                }
                # Add policy-specific fields
                if doc_type == "policy":
                    documents[doc_id].update({
                        "clause_type": metadata.get('clause_type', 'general'),
                        "risk_level": metadata.get('risk_level', 'medium'),
                        "policy_id": metadata.get('policy_id', doc_id)
                    })
            documents[doc_id]["chunk_count"] += 1
        
        return list(documents.values())
    
    def clear_all(self) -> bool:
        """
        Clear all data from the vector store
        
        Returns:
            True if successful, False otherwise
        """
        try:
            self.client.reset()
            logger.info("🗑️ Cleared all data from vector store")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to clear vector store: {e}")
            return False

# Global vector store instance
vector_store = None

def get_vector_store() -> VectorStore:
    """Get or create the global vector store instance"""
    global vector_store
    if vector_store is None:
        vector_store = VectorStore()
    return vector_store

if __name__ == "__main__":
    # Test the vector store
    vs = get_vector_store()
    print("✅ Vector store initialized successfully")
    print(f"📁 ChromaDB location: {vs.persist_directory}") 