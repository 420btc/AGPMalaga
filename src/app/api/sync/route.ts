import { insertTranscription, cleanupOldEntries } from '@/lib/db'

// POST /api/sync — called by local sync script to push transcriptions
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { entries } = body // [{ time: "2026-05-30 19:45:00", text: "...", audio_url: null, locations: [] }]

    if (!Array.isArray(entries)) {
      return Response.json({ error: 'entries must be an array' }, { status: 400 })
    }

    let inserted = 0
    for (const entry of entries) {
      if (!entry.text || entry.text.length < 2) continue
      await insertTranscription(
        entry.time || new Date().toISOString(),
        entry.text,
        entry.audio_url || null,
        entry.locations || []
      )
      inserted++
    }

    // Run cleanup (delete >24h old)
    await cleanupOldEntries()

    return Response.json({ ok: true, inserted })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
