// GET /api/audio-stream?url=... — proxy audio from Vercel Blob
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const blobUrl = searchParams.get('url')

  if (!blobUrl) {
    return Response.json({ error: 'Missing url param' }, { status: 400 })
  }

  try {
    const resp = await fetch(blobUrl, {
      headers: {
        Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      },
    })

    if (!resp.ok) {
      return Response.json({ error: 'Blob fetch failed' }, { status: resp.status })
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
