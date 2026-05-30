// GET /api/counters — API usage stats
export async function GET() {
  // Static for web version (real counters only on local radar)
  return Response.json({
    adsbx_total: 0,
    adsbx_today: 0,
    adsbx_monthly_limit: 10000,
    adsbx_remaining: 10000,
    adsbx_days_left: 99,
    adsbx_pct: 0,
    opensky: 0,
    airlabs: 0,
    last_poll: Date.now() / 1000,
    poll_interval: 120,
  })
}
