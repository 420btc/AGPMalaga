// Proxy ADSBexchange — hides API key from client
// Manual cache: hit ADSBX at most every 30s, serve cached data in between
declare global { var __adsbx_calls: number; var __adsbx_cache: any; var __adsbx_cache_time: number }

if (!globalThis.__adsbx_calls) globalThis.__adsbx_calls = 0

const CACHE_TTL = 30 // seconds between real ADSBX calls

export async function GET() {
  const now = Date.now() / 1000
  const key = process.env.ADSBX_API_KEY

  // Return cached data if fresh
  if (globalThis.__adsbx_cache && globalThis.__adsbx_cache_time && (now - globalThis.__adsbx_cache_time) < CACHE_TTL) {
    return Response.json({ ...globalThis.__adsbx_cache, time: now, cached: true })
  }

  const url = 'https://adsbexchange-com1.p.rapidapi.com/v2/lat/36.675/lon/-4.499/dist/10/'

  try {
    const resp = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': key || '',
        'X-RapidAPI-Host': 'adsbexchange-com1.p.rapidapi.com',
        'User-Agent': 'AGP-Web/1.0',
      },
    })

    if (!resp.ok) {
      // Serve stale cache on error if available
      if (globalThis.__adsbx_cache) {
        return Response.json({ ...globalThis.__adsbx_cache, time: now, cached: true, stale: true })
      }
      return Response.json({ states: [], source: 'error', error: `ADSBX ${resp.status}` })
    }

    globalThis.__adsbx_calls++
    const data = await resp.json()
    const ac = (data.ac || []).map((a: any) => {
      const alt_raw = a.alt_baro
      let alt_m = 0, on_ground = true
      if (alt_raw !== 'ground' && alt_raw != null && alt_raw !== 0 && alt_raw !== '0') {
        alt_m = parseFloat(alt_raw) * 0.3048
        on_ground = alt_m <= 0
      }
      return {
        icao24: a.hex || '',
        callsign: (a.flight || '').trim(),
        registration: a.r || '',
        icao_type: a.t || '',
        squawk: a.squawk || '',
        category: a.category || '',
        lon: a.lat ? a.lon : 0,
        lat: a.lat || 0,
        altitude: alt_m,
        alt_geom: (a.alt_geom || 0) * 0.3048,
        velocity: a.gs || 0,
        heading: a.track || 0,
        true_heading: a.true_heading || a.track || 0,
        baro_rate: a.baro_rate || 0,
        ias: a.ias || 0,
        tas: a.tas || 0,
        mach: a.mach || 0,
        emergency: a.emergency || '',
        on_ground,
        is_vehicle: a.type === 'adsb_icao_nt' || a.category === 'C0' || a.t === 'TWR',
        flight: (a.flight || '').trim(),
        airline: '',
        dep: '', arr: '',
        source: 'adsbx',
        seen_pos: a.seen_pos || 0,
        rssi: a.rssi || 0,
      }
    })

    const result = {
      time: now,
      states: ac,
      source: 'adsbx',
      cached: false,
    }

    globalThis.__adsbx_cache = result
    globalThis.__adsbx_cache_time = now

    return Response.json(result)
  } catch (e: any) {
    if (globalThis.__adsbx_cache) {
      return Response.json({ ...globalThis.__adsbx_cache, time: now, cached: true, stale: true })
    }
    return Response.json({
      time: now,
      states: [],
      source: 'error',
      error: e.message,
    })
  }
}
