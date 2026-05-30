#!/usr/bin/env python3
"""
Sync ATC transcriptions to the web dashboard.
Reads new entries from atc_transcripciones.log and pushes them to Vercel API.

Usage:
  python3 sync_to_web.py

Environment variables needed:
  SYNC_URL=https://agp-malaga.vercel.app/api/sync
  AUTH_SECRET=your_secret_here
"""
import os, sys, json, time, urllib.request

SYNC_URL = os.environ.get("SYNC_URL", "https://agp-malaga.vercel.app/api/sync")
AUTH_SECRET = os.environ.get("AUTH_SECRET", "")
LOG_FILE = r"C:\Users\choco\SDR\atc_transcripciones.log"
STATE_FILE = os.path.expanduser("~/.agp_sync_state.json")

if not AUTH_SECRET:
    print("ERROR: Set AUTH_SECRET environment variable")
    sys.exit(1)

# Read last synced position
try:
    with open(STATE_FILE) as f:
        state = json.load(f)
        last_line = state.get("last_line", 0)
except:
    last_line = 0

# Read log file
try:
    with open(LOG_FILE, encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
except:
    print("Log file not found:", LOG_FILE)
    sys.exit(0)

if len(lines) <= last_line:
    print(f"No new entries (line {last_line}/{len(lines)})")
    sys.exit(0)

# Parse new entries
entries = []
for line in lines[last_line:]:
    line = line.strip()
    if not line:
        continue
    if line.startswith("[20") and "] " in line[:22]:
        try:
            ts = line[1:20]
            txt = line[22:]
            entries.append({
                "time": ts,
                "text": txt,
                "audio_url": None,
                "locations": []  # Could add regex detection here
            })
        except:
            pass
    else:
        entries.append({
            "time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "text": line[:400],
            "audio_url": None,
            "locations": []
        })

if not entries:
    print("No parsable entries")
    sys.exit(0)

# Push to API
print(f"Pushing {len(entries)} entries to {SYNC_URL}...")
try:
    data = json.dumps({"entries": entries}).encode()
    req = urllib.request.Request(SYNC_URL, data=data, headers={
        "Content-Type": "application/json",
        "X-Auth-Token": AUTH_SECRET,
    }, method="POST")
    resp = urllib.request.urlopen(req, timeout=30)
    result = json.loads(resp.read())
    print(f"OK: {result.get('inserted', 0)} inserted")
    
    # Save state
    with open(STATE_FILE, "w") as f:
        json.dump({"last_line": len(lines), "last_sync": time.strftime("%Y-%m-%d %H:%M:%S")}, f)
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
