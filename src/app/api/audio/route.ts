// POST /api/audio — upload audio to Vercel Blob
import { put } from '@vercel/blob'

export async function POST(request: Request) {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.AUTH_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    const blob = await put(file.name, file, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    return Response.json({ url: blob.url })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
