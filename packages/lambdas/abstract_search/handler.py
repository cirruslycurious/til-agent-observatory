import json
import os
import sqlite3
import tempfile
import boto3
from typing import Any, Dict, List, Optional

# Environment
SEARCH_INDEX_BUCKET = os.environ.get("SEARCH_INDEX_BUCKET")
SEARCH_INDEX_KEY = os.environ.get("SEARCH_INDEX_KEY", "indexes/abstracts.sqlite")

_conn = None
_loaded = False


def _download_index() -> str:
    if not SEARCH_INDEX_BUCKET:
        raise RuntimeError("SEARCH_INDEX_BUCKET is not set")
    s3 = boto3.client("s3")
    fd, local_path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    s3.download_file(SEARCH_INDEX_BUCKET, SEARCH_INDEX_KEY, local_path)
    return local_path


def _ensure_conn():
    global _conn, _loaded
    if _loaded and _conn:
        return
    local_path = _download_index()
    _conn = sqlite3.connect(local_path)
    _conn.row_factory = sqlite3.Row
    _loaded = True


def _search(query: str, conference: Optional[str], track: Optional[str], year: Optional[int], limit: int) -> List[Dict[str, Any]]:
    _ensure_conn()
    clauses = ["fts MATCH ?"]
    params: List[Any] = [query]
    if conference:
        clauses.append("conference = ?")
        params.append(conference)
    if track:
        clauses.append("track = ?")
        params.append(track)
    if year:
        clauses.append("year = ?")
        params.append(year)
    where = " AND ".join(clauses)
    sql = f"""
        SELECT id, conference, title, abstract, track, year, bm25(fts) AS score
        FROM abstracts_fts
        WHERE {where}
        ORDER BY score ASC
        LIMIT ?
    """
    params.append(limit)
    cur = _conn.execute(sql, params)
    rows = cur.fetchall()
    return [
        {
            "id": row["id"],
            "conference": row["conference"],
            "title": row["title"],
            "abstract": row["abstract"],
            "track": row["track"],
            "year": row["year"],
            "score": row["score"],
        }
        for row in rows
    ]


def lambda_handler(event, context):
    try:
        body = event.get("body")
        if isinstance(body, str):
            body = json.loads(body or "{}")
        elif body is None:
            body = {}

        query = (body.get("query") or "").strip()
        if not query:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "query is required"}),
            }

        conference = body.get("conference")
        track = body.get("track")
        year = body.get("year")
        limit = int(body.get("limit") or 5)
        limit = max(1, min(limit, 20))

        results = _search(query=query, conference=conference, track=track, year=year, limit=limit)

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"items": results}),
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }
