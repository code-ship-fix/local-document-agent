#!/usr/bin/env python3
"""
Script to view actual embedding vectors from ChromaDB
"""

import chromadb
from chromadb.config import Settings
import numpy as np

def view_embeddings():
    """View actual embedding vectors from ChromaDB"""
    
    try:
        # Connect to ChromaDB
        client = chromadb.PersistentClient(path="./chroma_db")
        
        # Get the collection
        collection = client.get_collection("document_chunks")
        
        # Get all embeddings
        results = collection.get(
            include=['embeddings', 'documents', 'metadatas']
        )
        
        print(f"📊 Found {len(results['embeddings'])} embeddings")
        print(f"📄 Found {len(results['documents'])} documents")
        print(f"🏷️  Found {len(results['metadatas'])} metadata entries")
        
        if results['embeddings']:
            # Show first embedding vector
            first_embedding = results['embeddings'][0]
            print(f"\n🔍 First embedding vector (384 dimensions):")
            print(f"   Shape: {len(first_embedding)}")
            print(f"   First 10 values: {first_embedding[:10]}")
            print(f"   Last 10 values: {first_embedding[-10:]}")
            print(f"   Min value: {min(first_embedding):.6f}")
            print(f"   Max value: {max(first_embedding):.6f}")
            print(f"   Mean value: {np.mean(first_embedding):.6f}")
            
            # Show corresponding document text
            if results['documents']:
                print(f"\n📝 Corresponding document text:")
                print(f"   {results['documents'][0][:200]}...")
            
            # Show metadata
            if results['metadatas']:
                print(f"\n🏷️  Metadata:")
                for key, value in results['metadatas'][0].items():
                    print(f"   {key}: {value}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error accessing embeddings: {e}")
        return False

if __name__ == "__main__":
    print("🔍 Viewing ChromaDB Embeddings...")
    success = view_embeddings()
    if success:
        print("\n✅ Successfully viewed embeddings!")
    else:
        print("\n❌ Failed to view embeddings") 