"""
Build SQLite FTS index of conference abstracts from DynamoDB and upload to S3.

Usage:
  python scripts/build_abstract_index.py --table til-conference-data --bucket <bucket> --key indexes/abstracts.sqlite --region us-east-1
"""

import argparse
import boto3
import os
import sqlite3
import tempfile


def scan_items(table_name: str, region: str):
    dynamodb = boto3.client("dynamodb", region_name=region)
    paginator = dynamodb.get_paginator("scan")
    for page in paginator.paginate(TableName=table_name):
        for item in page.get("Items", []):
            yield {
                "conference": item.get("conference", {}).get("S"),
                "data_type": item.get("data_type", {}).get("S"),
                "title": item.get("title", {}).get("S"),
                "abstract": item.get("abstract", {}).get("S"),
                "track": item.get("track", {}).get("S"),
                "year": int(item.get("year", {}).get("N", "0")) if "year" in item else None,
            }


def build_sqlite(items, output_path: str):
    conn = sqlite3.connect(output_path)
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS abstracts")
    cur.execute("DROP TABLE IF EXISTS abstracts_fts")
    cur.execute(
        """
        CREATE TABLE abstracts (
            id TEXT PRIMARY KEY,
            conference TEXT,
            title TEXT,
            abstract TEXT,
            track TEXT,
            year INTEGER
        )
        """
    )
    cur.execute(
        """
        CREATE VIRTUAL TABLE abstracts_fts USING fts5(
            id UNINDEXED,
            conference UNINDEXED,
            title,
            abstract,
            track UNINDEXED,
            year UNINDEXED,
            tokenize='porter'
        )
        """
    )

    rows = []
    fts_rows = []
    for item in items:
        data_type = item.get("data_type") or ""
        if not data_type.startswith("abstract_example"):
            continue
        id_ = data_type
        rows.append(
            (
                id_,
                item.get("conference"),
                item.get("title"),
                item.get("abstract"),
                item.get("track"),
                item.get("year"),
            )
        )
        fts_rows.append(
            (
                id_,
                item.get("conference"),
                item.get("title"),
                item.get("abstract"),
                item.get("track"),
                item.get("year"),
            )
        )

    cur.executemany(
        "INSERT INTO abstracts (id, conference, title, abstract, track, year) VALUES (?, ?, ?, ?, ?, ?)",
        rows,
    )
    cur.executemany(
        "INSERT INTO abstracts_fts (id, conference, title, abstract, track, year) VALUES (?, ?, ?, ?, ?, ?)",
        fts_rows,
    )
    conn.commit()
    conn.close()


def upload_to_s3(path: str, bucket: str, key: str, region: str):
    s3 = boto3.client("s3", region_name=region)
    s3.upload_file(path, bucket, key)


def main():
    parser = argparse.ArgumentParser(description="Build SQLite FTS index of abstracts from DynamoDB")
    parser.add_argument("--table", default="til-conference-data", help="DynamoDB table name")
    parser.add_argument("--bucket", required=True, help="S3 bucket to upload index")
    parser.add_argument("--key", default="indexes/abstracts.sqlite", help="S3 key for index")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"), help="AWS region")
    args = parser.parse_args()

    items = list(scan_items(args.table, args.region))
    fd, tmp_path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    build_sqlite(items, tmp_path)
    upload_to_s3(tmp_path, args.bucket, args.key, args.region)
    print(f"Uploaded index to s3://{args.bucket}/{args.key} (items: {len(items)})")


if __name__ == "__main__":
    main()
