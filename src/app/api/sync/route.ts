import { insertTranscription, cleanupOldEntries } from '@/lib/db'

// Audio base URL — served by local radar via Tailscale Serve (HTTPS)
const AUDIO_BASE = process.env.AUDIO_BASE_URL || 'https://420btc-msi.tail8f39c5.ts.net/audio'

// POST /api/sync — called by local sync script to push transcriptions
export async function POST(request: Request) {
  const token = request.headers.get('X-Auth-Token') || ''
  const secret = (process.env.AUTH_SECRET || '').trim()
  if (!secret || token !== secret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { entries } = body

    if (!Array.isArray(entries)) {
      return Response.json({ error: 'entries must be an array' }, { status: 400 })
    }

    let inserted = 0
    for (const entry of entries) {
      if (!entry.text || entry.text.length < 2) continue
      // Build audio URL from filename — Tailscale Serve gives us native HTTPS, no proxy needed
      const audioUrl = entry.audio_file
        ? `${AUDIO_BASE}/${entry.audio_file}`
        : null
      await insertTranscription(
        entry.time || new Date().toISOString(),
        entry.text,
        audioUrl,
        entry.locations || []
      )
      inserted++
    }

    await cleanupOldEntries()
    return Response.json({ ok: true, inserted })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
