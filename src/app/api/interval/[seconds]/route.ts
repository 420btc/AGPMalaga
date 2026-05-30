// GET /api/interval/[seconds] — calculate budget info at given poll rate
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ seconds: string }> }
) {
  const { seconds } = await params
  const secs = parseInt(seconds) || 120
  const callsPerDay = Math.round((86400 / secs))
  const callsPerHour = Math.round(callsPerDay / 24)
  return Response.json({
    interval: secs,
    calls_per_hour: callsPerHour,
    calls_per_day: callsPerDay,
    days_at_rate: 0,   // filled by real radar server
    budget: '',         // filled by real radar server
  })
}
