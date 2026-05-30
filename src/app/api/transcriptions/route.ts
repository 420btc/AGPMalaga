import { getTranscriptions, insertTranscription, cleanupOldEntries } from '@/lib/db'

// GET /api/transcriptions — fetch latest
export async function GET() {
  try {
    const entries = await getTranscriptions(30)
    const lastTx = entries.length > 0 ? entries[0].text : ''
    const locations = entries.length > 0 ? entries[0].locations : []

    return Response.json({
      entries: entries.reverse(), // oldest first for feed
      highlighted: [], // would need GeoJSON on server for detection
      updated: Date.now() / 1000,
    })
  } catch (e: any) {
    return Response.json({
      entries: [],
      highlighted: [],
      updated: Date.now() / 1000,
      error: e.message,
    })
  }
}
