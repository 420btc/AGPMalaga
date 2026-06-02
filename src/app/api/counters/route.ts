// GET /api/counters — API usage stats (real counters tracked in aircraft route)
declare global { var __adsbx_calls: number; var __adsbx_start: number }

export async function GET() {
  const total = globalThis.__adsbx_calls || 0
  const monthly_limit = 10000
  const days_in_month = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const day_of_month = new Date().getDate()
  const days_left = days_in_month - day_of_month
  const pct = Math.min(100, Math.round((total / monthly_limit) * 100))

  return Response.json({
    adsbx_total: total,
    adsbx_today: 0, // would need daily reset; approximate via total
    adsbx_monthly_limit: monthly_limit,
    adsbx_remaining: monthly_limit - total,
    adsbx_days_left: days_left,
    adsbx_pct: pct,
    opensky: 0,
    airlabs: 0,
    last_poll: Date.now() / 1000,
    poll_interval: 120,
  })
}
