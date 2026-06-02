// GET /api/audio-stream?url=... — proxy audio from Tailscale local radar
// Works for both legacy blob URLs and new Tailscale URLs
const TAILSCALE_IP = process.env.TAILSCALE_IP || '100.111.21.20'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const audioUrl = searchParams.get('url')

  if (!audioUrl) {
    return Response.json({ error: 'Missing url param' }, { status: 400 })
  }

  try {
    // If it's a Tailscale URL already, fetch directly (no auth needed)
    // If it's a legacy blob URL, that's broken now — return 410 Gone
    if (audioUrl.includes('vercel-blob') || audioUrl.includes('blob.vercel')) {
      // Try fetching anyway (might still work for cached blobs)
    }

    const resp = await fetch(audioUrl, {
      signal: AbortSignal.timeout(8000),
    })

    if (!resp.ok) {
      return Response.json(
        { error: `Audio fetch failed: ${resp.status}` },
        { status: resp.status }
      )
    }

    return new Response(resp.body, {
      headers: {
        'Content-Type': resp.headers.get('Content-Type') || 'audio/wav',
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': resp.headers.get('Content-Length') || '',
      },
    })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
