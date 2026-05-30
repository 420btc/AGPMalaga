// GET /api/debug — check all env vars
export async function GET() {
  const vars: Record<string, boolean> = {}
  for (const k of ['NEON_DATABASE_URL', 'DATABASE_URL', 'POSTGRES_URL',
                    'ADSBX_API_KEY', 'AIRLABS_API_KEY', 'AUTH_SECRET',
                    'BLOB_READ_WRITE_TOKEN', 'CRON_SECRET']) {
    vars[k] = !!process.env[k]
  }
  return Response.json(vars)
}
