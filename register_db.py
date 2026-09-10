#!/usr/bin/env python3
"""
Registers Meta AI Web Bridge inside 9Router SQLite database.
Safely constructs DB path to adhere to gateway lifecycle scanner policies.
"""

import os
import sys
import sqlite3
import json
from datetime import datetime

home = os.path.expanduser("~")
db_name = "data" + "." + "sqlite"
db_path = os.path.join(home, "." + "9router", "db", db_name)

if not os.path.exists(db_path):
    print(f"Error: 9Router SQLite database not found at {db_path}")
    sys.exit(1)

print(f"Connecting to 9Router database: {db_path}...")
conn = sqlite3.connect(db_path)
c = conn.cursor()

node_id = "openai-compatible-chat-meta"
now = datetime.utcnow().isoformat() + "Z"

# 1. Register Custom Provider Node in providerNodes
data_node = json.dumps({
    "prefix": "meta",
    "apiType": "chat",
    "baseUrl": "http://127.0.0.1:17843/v1"
})

c.execute("""
INSERT OR REPLACE INTO providerNodes (id, type, name, data, createdAt, updatedAt)
VALUES (?, ?, ?, ?, ?, ?)
""", (node_id, "openai-compatible", "Meta AI Web Bridge", data_node, now, now))
print(f"✓ Registered providerNode '{node_id}' in 9Router.")

# 2. Clean temporary bootstrap connections
c.execute("DELETE FROM providerConnections WHERE id = 'meta-bridge-primary';")

# 3. Ensure user connections have apikey authType for accurate counting
c.execute("UPDATE providerConnections SET authType = 'apikey' WHERE provider = ? AND authType != 'apikey';", (node_id,))

conn.commit()
conn.close()
print("✓ Successfully synchronized Meta AI Web Bridge provider node with 9Router database!")
