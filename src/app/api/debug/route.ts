// GET /api/debug — check env vars
export async function GET() {
  return Response.json({
    has_db: !!process.env.NEON_DATABASE_URL,
    has_adsbx: !!process.env.ADSBX_API_KEY,
    has_airlabs: !!process.env.AIRLABS_API_KEY,
    has_auth: !!process.env.AUTH_SECRET,
    auth_len: (process.env.AUTH_SECRET || '').length,
  })
}
