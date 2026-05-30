// Proxy AirLabs schedules — hides API key from client
export async function GET() {
  const key = process.env.AIRLABS_API_KEY

  const CITY: Record<string, string> = {
    AGP: 'Málaga', MAD: 'Madrid', BCN: 'Barcelona', PMI: 'Palma de Mallorca',
    IBZ: 'Ibiza', MAH: 'Menorca', ALC: 'Alicante', VLC: 'Valencia',
    SVQ: 'Sevilla', BIO: 'Bilbao', OVD: 'Asturias', SCQ: 'Santiago',
    VGO: 'Vigo', LPA: 'Gran Canaria', TFS: 'Tenerife Sur', TFN: 'Tenerife Norte',
    ACE: 'Lanzarote', FUE: 'Fuerteventura', GRO: 'Girona', REU: 'Reus',
    LGW: 'Londres', LTN: 'Londres', STN: 'Londres', LHR: 'Londres', MAN: 'Mánchester',
    BRS: 'Brístol', BHX: 'Birmingham', EDI: 'Edimburgo', GLA: 'Glasgow',
    DUB: 'Dublín', CDG: 'París', ORY: 'París', AMS: 'Ámsterdam', BRU: 'Bruselas',
    FRA: 'Fráncfort', MUC: 'Múnich', DUS: 'Düsseldorf', BER: 'Berlín',
    CPH: 'Copenhague', OSL: 'Oslo', ARN: 'Estocolmo', HEL: 'Helsinki',
    WAW: 'Varsovia', BUD: 'Budapest', VIE: 'Viena', ZRH: 'Zúrich',
    GVA: 'Ginebra', MXP: 'Milán', BGY: 'Milán', FCO: 'Roma', LIN: 'Milán',
    LIS: 'Lisboa', OPO: 'Oporto', CMN: 'Casablanca', RAK: 'Marrakech',
    EIN: 'Eindhoven', RTM: 'Róterdam', BRQ: 'Brno', VNO: 'Vilna',
    RIX: 'Riga', TLL: 'Tallin', SOF: 'Sofía', OTP: 'Bucarest',
    TTU: 'Tetuán', TNG: 'Tánger', NDR: 'Nador', CEU: 'Ceuta',
    LEI: 'Almería', GRX: 'Granada', XRY: 'Jerez', EAS: 'San Sebastián',
    SNN: 'Shannon', LPL: 'Liverpool', NCL: 'Newcastle', EMA: 'East Midlands',
  }
  const AIRLINE: Record<string, string> = {
    FR: 'Ryanair', U2: 'easyJet', VY: 'Vueling', IB: 'Iberia',
    BA: 'British Airways', LS: 'Jet2', EW: 'Eurowings', LH: 'Lufthansa',
    LX: 'Swiss', OS: 'Austrian', SK: 'SAS', DY: 'Norwegian',
    AF: 'Air France', KL: 'KLM', TP: 'TAP Portugal', AZ: 'ITA Airways',
    AT: 'Royal Air Maroc', W4: 'Wizz Air', BT: 'airBaltic', LO: 'LOT',
    A3: 'Aegean', TK: 'Turkish', QR: 'Qatar Airways', EY: 'Etihad',
    AM: 'Aeroméxico', UX: 'Air Europa', EC: 'easyJet Europe',
    X5: 'Air Europa Express', AC: 'Air Canada', NH: 'ANA', EI: 'Aer Lingus',
    D8: 'Norwegian Air', AD: 'Azul',
  }

  try {
    const salidas: any[] = []
    const llegadas: any[] = []

    for (const [endpoint, key_name, dep_arr] of [
      [`https://airlabs.co/api/v9/schedules?api_key=${key}&dep_iata=AGP`, 'salidas', 'dep'],
      [`https://airlabs.co/api/v9/schedules?api_key=${key}&arr_iata=AGP`, 'llegadas', 'arr'],
    ] as const) {
      const resp = await fetch(endpoint, {
        headers: { 'User-Agent': 'AGP-Web/1.0' },
        next: { revalidate: 1800 }, // cache 30min
      })
      if (!resp.ok) continue
      const data = await resp.json()
      for (const f of (data.response || [])) {
        let sched_time = f[`${dep_arr}_time`] || ''
        if (sched_time && sched_time.includes(' ')) sched_time = sched_time.split(' ')[1].slice(0, 5)
        const status = f.status || ''
        const cat = status === 'active' ? 'live' : status === 'landed' ? 'landed' : status === 'cancelled' ? 'cancelled' : 'scheduled'
        const dep_iata = f.dep_iata || ''
        const arr_iata = f.arr_iata || ''
        const code = f.airline_iata || ''
        const dep_del = f.dep_delayed || 0
        const arr_del = f.arr_delayed || 0
        const entry = {
          flight: f.flight_iata || '',
          airline: code,
          airline_name: AIRLINE[code] || code,
          origin: dep_iata,
          dest: arr_iata,
          origin_city: CITY[dep_iata] || dep_iata,
          dest_city: CITY[arr_iata] || arr_iata,
          sched_time,
          gate: f.dep_gate || f.arr_gate || '',
          terminal: f.dep_terminal || f.arr_terminal || '',
          delay: key_name === 'salidas' ? dep_del : (arr_del || dep_del),
          aircraft: f.aircraft_icao || '',
          category: cat,
          type: cat,
        }
        ;(key_name === 'salidas' ? salidas : llegadas).push(entry)
      }
    }

    return Response.json({
      salidas,
      llegadas,
      updated: new Date().toISOString().slice(0, 19).replace('T', ' '),
    })
  } catch (e: any) {
    return Response.json({
      salidas: [],
      llegadas: [],
      updated: new Date().toISOString().slice(0, 19).replace('T', ' '),
      error: e.message,
    })
  }
}
