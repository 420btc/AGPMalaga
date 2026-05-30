// Proxy ADSBexchange — hides API key from client
export async function GET() {
  const key = process.env.ADSBX_API_KEY
  const url = 'https://adsbexchange-com1.p.rapidapi.com/v2/lat/36.675/lon/-4.499/dist/16/'

  try {
    const resp = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': key || '',
        'X-RapidAPI-Host': 'adsbexchange-com1.p.rapidapi.com',
        'User-Agent': 'AGP-Web/1.0',
      },
      next: { revalidate: 30 }, // cache 30s
    })

    if (!resp.ok) {
      return Response.json({ states: [], source: 'error', error: `ADSBX ${resp.status}` })
    }

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

    return Response.json({
      time: Date.now() / 1000,
      states: ac,
      source: 'adsbx',
    })
  } catch (e: any) {
    return Response.json({
      time: Date.now() / 1000,
      states: [],
      source: 'error',
      error: e.message,
    })
  }
}
