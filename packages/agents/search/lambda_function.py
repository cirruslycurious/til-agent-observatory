"""
🚨🚨🚨 STOP - READ THIS BEFORE MODIFYING THIS FILE 🚨🚨🚨

MANDATORY PRE-MODIFICATION CHECKLIST:
1. Read .ai-instructions.md (lines 1-200 minimum, check for ⚠️ CRITICAL warnings)
2. Read .ai-checklists/pre-deployment.md COMPLETELY
3. Read ALL inline comments in THIS file
4. Understand SQLite FTS5 implementation before changing search logic

CRITICAL: This Lambda provides full-text search over conference abstracts.
Changes can break worker's ability to find relevant examples. Test search thoroughly!

🚨🚨🚨 DO NOT SKIP THIS - YOU WILL BREAK THINGS 🚨🚨🚨

---

Abstract Search Lambda Function
Serves keyword search over SQLite FTS index of conference abstracts.

Downloads index from S3 on cold start, caches in /tmp.
"""

import json
import os
import sqlite3
import boto3
from typing import Dict, Any, List, Optional

# Configuration
S3_BUCKET = os.environ.get('ARTIFACTS_BUCKET_NAME', 'your-artifacts-bucket')
S3_KEY = os.environ.get('INDEX_S3_KEY', 'indexes/abstracts.sqlite')
LOCAL_INDEX_PATH = '/tmp/abstracts.sqlite'
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Global connection (reused across invocations)
_conn: Optional[sqlite3.Connection] = None


def get_connection() -> sqlite3.Connection:
    """Get or create SQLite connection, downloading index if needed."""
    global _conn
    
    if _conn is not None:
        return _conn
    
    # Download index from S3 if not cached
    if not os.path.exists(LOCAL_INDEX_PATH):
        s3 = boto3.client('s3', region_name=REGION)
        s3.download_file(S3_BUCKET, S3_KEY, LOCAL_INDEX_PATH)
        print(f"Downloaded index from s3://{S3_BUCKET}/{S3_KEY}")
    
    _conn = sqlite3.connect(LOCAL_INDEX_PATH, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    return _conn


def search_abstracts(
    query: str,
    conference: Optional[str] = None,
    track: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Search abstracts using FTS5.
    
    Args:
        query: Search query (keywords)
        conference: Optional filter by conference
        track: Optional filter by track
        year: Optional filter by year
        limit: Max results (default 5)
    
    Returns:
        List of matching abstracts with scores
    """
    conn = get_connection()
    cur = conn.cursor()
    
    # Convert multi-word queries to OR syntax for FTS5
    # FTS5 defaults to AND for multi-word queries, which is too restrictive
    # Example: "kubernetes containers" becomes "kubernetes OR containers"
    # Also sanitize special FTS5 characters that could cause errors
    if ' ' in query and ' OR ' not in query.upper() and ' AND ' not in query.upper():
        # Split on whitespace and sanitize each word
        words = query.split()
        # Wrap words with hyphens in quotes to treat them as phrases
        sanitized_words = []
        for word in words:
            # If word contains special FTS5 characters, wrap in quotes
            if any(char in word for char in ['-', ':', '(', ')', '"', '*']):
                # Remove existing quotes and wrap in new ones
                word = word.replace('"', '')
                sanitized_words.append(f'"{word}"')
            else:
                sanitized_words.append(word)
        fts_query = ' OR '.join(sanitized_words)
        print(f"Converted query '{query}' to FTS5 OR syntax: '{fts_query}'")
    else:
        # User provided explicit operators or single word - use as-is
        fts_query = query
    
    # Build FTS query with optional filters
    # Use MATCH for FTS search, then filter with WHERE
    sql = """
        SELECT 
            a.id,
            a.conference,
            a.title,
            a.abstract,
            a.track,
            a.year,
            bm25(abstracts_fts) as score
        FROM abstracts_fts
        JOIN abstracts a ON abstracts_fts.id = a.id
        WHERE abstracts_fts MATCH ?
    """
    params: List[Any] = [fts_query]
    
    if conference:
        sql += " AND a.conference = ?"
        params.append(conference)
    
    if track:
        sql += " AND a.track = ?"
        params.append(track)
    
    if year:
        sql += " AND a.year = ?"
        params.append(year)
    
    sql += " ORDER BY score LIMIT ?"
    params.append(limit)
    
    cur.execute(sql, params)
    rows = cur.fetchall()
    
    results = []
    for row in rows:
        results.append({
            'id': row['id'],
            'conference': row['conference'],
            'title': row['title'],
            'abstract': row['abstract'][:500] + '...' if len(row['abstract'] or '') > 500 else row['abstract'],
            'track': row['track'],
            'year': row['year'],
            'score': row['score'],
        })
    
    return results


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for abstract search API.
    
    Expects:
        - POST body with query parameters, OR
        - Query string parameters
    
    Parameters:
        - query (required): Search query
        - conference (optional): Filter by conference
        - track (optional): Filter by track  
        - year (optional): Filter by year
        - limit (optional): Max results (default 5)
    
    Returns:
        JSON response with results array
    """
    try:
        # Parse parameters from body or query string
        if event.get('body'):
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        else:
            body = event.get('queryStringParameters') or {}
        
        query = body.get('query')
        if not query:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'query parameter is required'}),
            }
        
        conference = body.get('conference')
        track = body.get('track')
        year = int(body['year']) if body.get('year') else None
        limit = int(body.get('limit', 5))
        
        results = search_abstracts(
            query=query,
            conference=conference,
            track=track,
            year=year,
            limit=limit,
        )
        
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'query': query,
                'count': len(results),
                'results': results,
            }),
        }
    
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)}),
        }
