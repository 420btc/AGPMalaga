// POST /api/audio — deprecated, audio now served from local radar via Tailscale
// Kept as no-op for backward compatibility with old sync scripts
export async function POST(request: Request) {
  return Response.json({ error: 'Audio uploads disabled — audio is served directly from local radar via Tailscale' }, { status: 410 })
}
