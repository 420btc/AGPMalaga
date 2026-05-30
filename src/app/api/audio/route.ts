// POST /api/audio — upload audio to Vercel Blob
import { put } from '@vercel/blob'

export async function POST(request: Request) {
  const token = request.headers.get('X-Auth-Token') || request.headers.get('Authorization')?.replace('Bearer ', '') || ''
  const secret = (process.env.AUTH_SECRET || '').trim()
  if (!secret || token !== secret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    const blob = await put(file.name, file, {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    // Return proxied URL so it works even if store is private
    const proxyUrl = `/api/audio-stream?url=${encodeURIComponent(blob.url)}`
    return Response.json({ url: proxyUrl })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
