import { initDB } from '@/lib/db'
import pool from '@/lib/db'
import { Pool } from 'pg'

// GET /api/activity?hours=24&step=5
export async function GET(request: Request) {
  try {
    await initDB()
    const { searchParams } = new URL(request.url)
    const hours = Math.min(24, Math.max(1, parseInt(searchParams.get('hours') || '24')))
    const step = Math.min(60, Math.max(1, parseInt(searchParams.get('step') || '5')))

    const client = await pool.connect()
    try {
      const result = await client.query(
        `WITH intervals AS (
           SELECT generate_series(
             date_trunc('hour', NOW()) - INTERVAL '1 hour' * $1,
             date_trunc('hour', NOW()),
             INTERVAL '1 minute' * $2
           ) AS bucket
         )
         SELECT 
           to_char(intervals.bucket, 'YYYY-MM-DD"T"HH24:MI') AS hour,
           COUNT(t.id)::int AS count
         FROM intervals
         LEFT JOIN transcriptions t ON 
           t.recorded_at >= intervals.bucket 
           AND t.recorded_at < intervals.bucket + INTERVAL '1 minute' * $2
         GROUP BY intervals.bucket
         ORDER BY intervals.bucket`,
        [hours, step]
      )

      const buckets = result.rows
      const total = buckets.reduce((sum: number, b: any) => sum + b.count, 0)
      const peak = Math.max(...buckets.map((b: any) => b.count), 0)
      const avg = buckets.length > 0 ? Math.round((total / buckets.length) * 10) / 10 : 0

      return Response.json({ buckets, total, peak, avg, hours, step })
    } finally {
      client.release()
    }
  } catch (e: any) {
    console.error('[Activity API]', e.message)
    return Response.json({ buckets: [], total: 0, peak: 0, avg: 0, hours: 24, step: 5 })
  }
}
