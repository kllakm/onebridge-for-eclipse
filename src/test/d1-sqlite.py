"""Test-only D1-shaped SQLite executor. Never bundled into the Worker."""
import json
import sqlite3
import sys

payload = json.load(sys.stdin)
db = sqlite3.connect(sys.argv[1])
db.row_factory = sqlite3.Row
db.execute('PRAGMA foreign_keys=ON')
results = []
if 'script' in payload:
    db.executescript(payload['script'])
else:
    with db:
        for statement in payload['statements']:
            cursor = db.execute(statement['sql'], statement.get('values', []))
            results.append([dict(row) for row in cursor.fetchall()] if cursor.description else [])
print(json.dumps(results))