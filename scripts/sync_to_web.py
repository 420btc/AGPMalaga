#!/usr/bin/env python3
"""
Sync ATC transcriptions to the web dashboard.
Reads new entries from atc_transcripciones.log and pushes them to Vercel API.
Detects runway/taxiway/gate/tower mentions for map highlighting.

Usage:
  python3 sync_to_web.py

Environment variables needed:
  SYNC_URL=https://agp-malaga.vercel.app/api/sync
  AUTH_SECRET=your_secret_here
"""
import os, sys, json, time, re, urllib.request

SYNC_URL = os.environ.get("SYNC_URL", "https://agp-malaga.vercel.app/api/sync")
AUTH_SECRET = os.environ.get("AUTH_SECRET", "")
LOG_FILE = r"C:\Users\choco\SDR\atc_transcripciones.log"
STATE_FILE = os.path.expanduser("~/.agp_sync_state.json")

if not AUTH_SECRET:
    print("ERROR: Set AUTH_SECRET environment variable")
    sys.exit(1)

# ── Location detection ──
# Maps detected keywords → {type, ref} for GeoJSON matching
RUNWAY_MAP = {
    "13": "runway", "31": "runway",   # 13/31 — pista principal 3200m
    "12": "runway", "30": "runway",   # 12/30 — pista secundaria 2750m
}

TAXIWAY_LETTERS = set("ABCDEFGHJKLMNPRSTW")  # common taxiway letters at AGP

TOWER_KEYWORDS = ["torre", "tower", "twr", "t w r"]
TERMINAL_KEYWORDS = ["terminal", "t1", "t2", "t3"]

def detect_locations(text: str) -> list[dict]:
    """Extract locations from ATC transcription text."""
    locations = []
    text_lower = text.lower()
    seen = set()

    # ── Runways: "pista 13", "runway 31", "RWY 12", "trece", "30" ──
    # Spanish words for numbers
    num_words = {
        "trece": "13", "catorce": "14", "quince": "15",
        "doce": "12", "treinta": "30", "treinta y uno": "31",
        "treinta y dos": "32", "treinta y tres": "33",
    }
    for word, num in num_words.items():
        if word in text_lower:
            if num in RUNWAY_MAP:
                locations.append({"type": "runway", "ref": num})
                seen.add(("runway", num))

    # Numeric mentions: standalone runway numbers
    pista_pattern = re.findall(
        r'(?:pista|runway|rwy|r\.?w\.?y\.?)\s*[:#]?\s*(\d{1,2})',
        text_lower, re.IGNORECASE
    )
    for num in pista_pattern:
        if num in RUNWAY_MAP and ("runway", num) not in seen:
            locations.append({"type": "runway", "ref": num})
            seen.add(("runway", num))

    # Also catch bare numbers near "cleared for takeoff/landing"
    bare_runway = re.findall(
        r'(?:cleared|autoriz\w+)\s+(?:for\s+)?(?:takeoff|landing|despeg\w+|aterriz\w+|a\s+aterrizar|despegando|aterrizando).*?(?:runway|pista|rwy)?\s*(\d{1,2})',
        text_lower, re.IGNORECASE
    )
    for num in bare_runway:
        if num in RUNWAY_MAP and ("runway", num) not in seen:
            locations.append({"type": "runway", "ref": num})
            seen.add(("runway", num))

    # ── Taxiways: "taxiway A", "calle B", "via C", "TWY D" ──
    taxi_patterns = [
        r'(?:taxiway|taxi\s*way|twy|t\.w\.y\.?|calle\s+de\s+rodadura|calle|via|rodadura)\s*[:#]?\s*([A-Z])',
        r'\bTWY\s*([A-Z])\b',
    ]
    for pat in taxi_patterns:
        for letter in re.findall(pat, text, re.IGNORECASE):
            letter = letter.upper()
            if letter in TAXIWAY_LETTERS and ("taxiway", letter) not in seen:
                locations.append({"type": "taxiway", "ref": letter})
                seen.add(("taxiway", letter))

    # ── Parking/Gates: "gate 464", "stand 541", "parking 500", "position 523" ──
    gate_patterns = [
        r'(?:gate|stand|puerta|parking|park|position|posicion|pos)\s*[:#]?\s*(\d{2,4})',
        r'\b(G|S|P)(\d{2,4})\b',  # G464, S541, P500
    ]
    for pat in gate_patterns:
        for m in re.findall(pat, text, re.IGNORECASE):
            num = m if isinstance(m, str) else m[1] if len(m) > 1 else m[0]
            if ("parking", num) not in seen:
                locations.append({"type": "parking", "ref": num})
                seen.add(("parking", num))

    # ── Tower ──
    if any(kw in text_lower for kw in TOWER_KEYWORDS):
        if ("tower", "torre") not in seen:
            locations.append({"type": "tower", "ref": "torre"})
            seen.add(("tower", "torre"))

    # ── Terminal ──
    for kw in TERMINAL_KEYWORDS:
        if kw in text_lower:
            locations.append({"type": "terminal", "ref": kw.upper()})
            break

    return locations

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
                "locations": detect_locations(txt)
            })
        except:
            pass
    else:
        entries.append({
            "time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "text": line[:400],
            "audio_url": None,
            "locations": detect_locations(line[:400])
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
