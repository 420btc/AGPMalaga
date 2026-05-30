import { Pool } from 'pg'

// NeonDB connection via environment variables
// Set NEON_DATABASE_URL in Vercel env vars after creating the Neon project
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
})

// Initialize table on first connection
let initialized = false
export async function initDB() {
  if (initialized) return
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS transcriptions (
        id SERIAL PRIMARY KEY,
        recorded_at TIMESTAMPTZ NOT NULL,
        text TEXT NOT NULL,
        audio_url TEXT,
        locations JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_recorded_at ON transcriptions(recorded_at DESC);
      -- Remove existing duplicates, keeping the version with audio_url
      DELETE FROM transcriptions a
      USING transcriptions b
      WHERE a.id > b.id
        AND a.recorded_at = b.recorded_at
        AND a.text = b.text;
      -- Unique constraint to prevent future duplicate transcriptions
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_transcription ON transcriptions(recorded_at, text);
    `)
    initialized = true
    console.log('[DB] Table ready')
  } finally {
    client.release()
  }
}

export async function insertTranscription(
  recordedAt: string,
  text: string,
  audioUrl: string | null,
  locations: any[]
) {
  await initDB()
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO transcriptions (recorded_at, text, audio_url, locations)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (recorded_at, text)
       DO UPDATE SET audio_url = COALESCE(transcriptions.audio_url, EXCLUDED.audio_url),
                     locations = EXCLUDED.locations`,
      [recordedAt, text, audioUrl, JSON.stringify(locations)]
    )
  } finally {
    client.release()
  }
}

export async function getTranscriptions(limit = 30) {
  await initDB()
  const client = await pool.connect()
  try {
    const result = await client.query(
      `SELECT id, recorded_at, text, audio_url, locations
       FROM transcriptions
       ORDER BY recorded_at DESC
       LIMIT $1`,
      [limit]
    )
    return result.rows.map(row => ({
      id: row.id,
      time: new Date(row.recorded_at).toISOString().slice(11, 19),
      full_ts: new Date(row.recorded_at).toISOString().slice(0, 19).replace('T', ' '),
      text: row.text,
      audio: row.audio_url || null,
      locations: row.locations || [],
    }))
  } finally {
    client.release()
  }
}

// Cleanup: delete entries older than 24 hours
export async function cleanupOldEntries() {
  await initDB()
  const client = await pool.connect()
  try {
    const result = await client.query(
      `DELETE FROM transcriptions WHERE recorded_at < NOW() - INTERVAL '1 day'
       RETURNING id, audio_url`
    )
    // Also clean up blob storage for deleted entries
    const deletedAudio = result.rows.filter((r: any) => r.audio_url).map((r: any) => r.audio_url)
    if (deletedAudio.length > 0) {
      console.log(`[Cleanup] Deleted ${result.rows.length} entries, ${deletedAudio.length} audio files to purge`)
    }
    return { deleted: result.rows.length, audio_urls: deletedAudio }
  } finally {
    client.release()
  }
}

export default pool
