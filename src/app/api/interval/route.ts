// GET /api/interval — current poll interval (static for web)
export async function GET() {
  return Response.json({ interval: 120 })
}

// GET /api/interval/[seconds] — set interval (no-op on web)
export async function POST() {
  return Response.json({ interval: 120 })
}
