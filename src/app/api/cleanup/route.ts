import { cleanupOldEntries } from '@/lib/db'
import { del } from '@vercel/blob'

// GET /api/cleanup — called via Vercel Cron every 24h
export async function GET(request: Request) {
  const auth = request.headers.get('Authorization')
  const cronSecret = request.headers.get('x-vercel-cron-secret') || auth
  if (!cronSecret || cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await cleanupOldEntries()
    return Response.json({ ok: true, ...result })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
