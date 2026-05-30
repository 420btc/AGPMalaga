'use client'

import { useEffect } from 'react'

export default function Dashboard() {
  useEffect(() => {
    // ===== START OF DASHBOARD JS =====
    // This is extracted from atc_radar.py HTML template
    // All Flask endpoints replaced with /api/* routes

    const canvas = document.getElementById('map') as HTMLCanvasElement
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    // ─── STATE ───
    let airportData: any = null
    let highlightedFeatures = new Set<number>()
    let highlightTimeout: any = null
    let bounds: any = null
    let zoom = 1, panX = 0, panY = 0
    const MIN_ZOOM = 0.3, MAX_ZOOM = 12
    let isDragging = false, dragStartX = 0, dragStartY = 0, dragPanX = 0, dragPanY = 0
    let aircraft: any[] = [], acAge = 0
    const trails = new Map<string, any[]>()
    let hlPulse = 0
    let lastCount = 0, lastUpdated = 0, lastText = '', errorCount = 0, lastMsgTime = 0
    let autoPlay = false, currentAudio: HTMLAudioElement | null = null
    const autoPlayed = new Set<string>()
    let showFlights = false
    let _selectedAc: any = null

    // ─── CANVAS HELPERS ───
    function resize() {
      canvas.width = canvas.parentElement!.clientWidth * window.devicePixelRatio
      canvas.height = canvas.parentElement!.clientHeight * window.devicePixelRatio
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    window.addEventListener('resize', () => { resize(); draw() })

    function fitBounds(features: any[]) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const f of features) {
        const coords = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates
        if (!coords) continue
        for (const [lon, lat] of coords) {
          if (lon < minX) minX = lon; if (lon > maxX) maxX = lon
          if (lat < minY) minY = lat; if (lat > maxY) maxY = lat
        }
      }
      const padX = (maxX - minX) * 0.08, padY = (maxY - minY) * 0.08
      return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY }
    }

    function resetView() { zoom = 1; panX = 0; panY = 0; draw() }

    function toScreen(lon: number, lat: number): [number, number] {
      const W = canvas.parentElement!.clientWidth, H = canvas.parentElement!.clientHeight
      const cx = W / 2, cy = H / 2
      const nx = (lon - bounds.minX) / (bounds.maxX - bounds.minX)
      const ny = (lat - bounds.minY) / (bounds.maxY - bounds.minY)
      return [cx + (nx - 0.5) * W * zoom + panX, cy - (ny - 0.5) * H * zoom + panY]
    }

    function toWorld(sx: number, sy: number): [number, number] {
      const W = canvas.parentElement!.clientWidth, H = canvas.parentElement!.clientHeight
      const cx = W / 2, cy = H / 2
      const nx = ((sx - cx - panX) / (W * zoom)) + 0.5
      const ny = 0.5 - ((sy - cy - panY) / (H * zoom))
      return [bounds.minX + nx * (bounds.maxX - bounds.minX), bounds.minY + ny * (bounds.maxY - bounds.minY)]
    }

    // Mouse events
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top
      const [wx, wy] = toWorld(mx, my)
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
      if (newZoom === zoom) return
      zoom = newZoom
      const [nx, ny] = toScreen(wx, wy)
      panX += mx - nx; panY += my - ny
      draw()
    }, { passive: false })

    canvas.addEventListener('mousedown', (e) => {
      isDragging = true; dragStartX = e.clientX; dragStartY = e.clientY
      dragPanX = panX; dragPanY = panY; canvas.style.cursor = 'grabbing'
      hideTooltip()
    })
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return
      panX = dragPanX + (e.clientX - dragStartX); panY = dragPanY + (e.clientY - dragStartY)
      draw()
    })
    window.addEventListener('mouseup', () => { isDragging = false; canvas.style.cursor = 'grab' })
    canvas.style.cursor = 'grab'
    canvas.addEventListener('dblclick', resetView)

    // Click on aircraft → tooltip
    canvas.addEventListener('click', (e) => {
      if (isDragging) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      let best: any = null, bestDist = 20
      for (const a of aircraft) {
        const dlat = (a.lat - 36.675) * 111.32, dlon = (a.lon + 4.499) * 111.32 * 0.803
        if (Math.sqrt(dlat * dlat + dlon * dlon) > 30 || (a.altitude && a.altitude > 3500)) continue
        const [ax, ay] = toScreen(a.lon, a.lat)
        const dist = Math.sqrt((mx - ax) ** 2 + (my - ay) ** 2)
        if (dist < bestDist) { bestDist = dist; best = a }
      }
      if (best) { _selectedAc = best; showTooltip(best, e.clientX, e.clientY) }
      else hideTooltip()
    })

    function hideTooltip() {
      _selectedAc = null
      const tt = document.getElementById('ac-tooltip')
      if (tt) tt.style.display = 'none'
    }

    function showTooltip(a: any, x: number, y: number) {
      const tt = document.getElementById('ac-tooltip')
      if (!tt) return
      const isVeh = a.is_vehicle
      const badge = (txt: string, cls: string) => `<span class="tt-badge ${cls}">${txt}</span>`
      const row = (l: string, v: any) => `<div class="tt-row"><span class="tt-label">${l}</span><span class="tt-val">${v}</span></div>`
      let html = `<div class="tt-call">${isVeh ? '🚗' : '✈'} ${a.callsign || a.flight || 'N/A'}</div>`
      if (a.registration) html += row('Matrícula', a.registration)
      if (a.icao_type && a.icao_type !== 'TWR') html += row('Tipo', a.icao_type)
      html += row('Altitud', a.on_ground ? 'TIERRA' : Math.round(a.altitude || 0) + 'm')
      if (a.alt_geom && !a.on_ground) html += row('Alt geom', Math.round(a.alt_geom) + 'm')
      html += row('Velocidad', (a.velocity || 0) + ' kt')
      if (a.heading) html += row('Rumbo', a.heading + '°')
      if (a.baro_rate) {
        const vs = a.baro_rate
        html += row('V/S', (vs > 0 ? '↑' : '↓') + Math.abs(Math.round(vs)) + ' fpm')
      }
      if (a.squawk) html += row('Squawk', a.squawk)
      if (a.category) html += row('Categoría', a.category)
      if (a.seen_pos != null) html += row('Actualizado', 'hace ' + a.seen_pos + 's')
      if (a.rssi) html += row('Señal', a.rssi + ' dB')
      html += '<div class="tt-div"></div>'
      html += badge(isVeh ? 'VEHÍCULO' : 'AVIÓN', isVeh ? 'blue' : (a.on_ground ? 'green' : 'orange'))
      if (a.baro_rate > 500) html += badge('ASCENDIENDO', 'green')
      if (a.baro_rate < -500) html += badge('DESCENDIENDO', 'orange')
      if (a.emergency && a.emergency !== 'none') html += badge('⚠ ' + a.emergency, 'red')
      tt.innerHTML = html
      tt.style.display = 'block'
      const pw = document.getElementById('map-panel')!
      const pr = pw.getBoundingClientRect()
      let tx = x - pr.left + 15, ty = y - pr.top - 10
      if (tx + 260 > pr.width) tx = x - pr.left - 275
      if (ty + 200 > pr.height) ty = y - pr.top - 210
      tt.style.left = tx + 'px'; tt.style.top = ty + 'px'
    }

    // ─── STYLES ───
    const STYLES: any = {
      runway: { color: '#fff', width: 8, dash: [] },
      taxiway: { color: '#777', width: 2, dash: [] },
      taxilane: { color: '#555', width: 1.5, dash: [4, 4] },
      apron: { color: '#333', width: 1, dash: [] },
      terminal: { color: '#fff', width: 1.5, fill: '#1a1a1a' },
      hangar: { color: '#555', width: 1, fill: '#1a1a1a' },
      parking: { color: '#444', width: 1, dash: [] },
      tower: { color: '#fff', width: 0, fill: '#fff' },
      aerodrome: { color: '#222', width: 1, dash: [10, 10] },
      helipad: { color: '#555', width: 1, dash: [2, 2] },
      stopway: { color: '#fff', width: 3, dash: [8, 8] },
    }
    const HL_COLORS: any = {
      runway: { stroke: '#ff0', fill: 'rgba(255,255,0,0.3)', width: 12 },
      taxiway: { stroke: '#0ff', fill: 'rgba(0,255,255,0.25)', width: 5 },
      taxilane: { stroke: '#0ff', fill: 'rgba(0,255,255,0.2)', width: 4 },
      parking: { stroke: '#f0f', fill: 'rgba(255,0,255,0.3)', width: 4 },
      tower: { stroke: '#f80', fill: 'rgba(255,136,0,0.5)', width: 3 },
      terminal: { stroke: '#ff0', fill: 'rgba(255,255,0,0.2)', width: 3 },
    }

    function drawFeature(f: any, idx: number) {
      const type = f.properties.type, isHL = highlightedFeatures.has(idx)
      const hl = isHL ? (HL_COLORS[type] || {}) : {}
      const style = STYLES[type] || { color: '#555', width: 1 }
      const sc = hl.stroke || style.color, fc = hl.fill || style.fill || null
      const lw = Math.max(0.5, (hl.width || style.width || 1) * Math.min(zoom, 4))
      ctx.strokeStyle = sc; ctx.lineWidth = lw
      ctx.setLineDash(style.dash || [])

      if (f.geometry.type === 'Polygon' || (f.geometry.type === 'LineString' && f.geometry.coordinates.length >= 4 && (type === 'terminal' || type === 'hangar'))) {
        const coords = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates
        if (coords.length < 2) { ctx.setLineDash([]); return }
        ctx.beginPath()
        const [sx, sy] = toScreen(coords[0][0], coords[0][1]); ctx.moveTo(sx, sy)
        for (let i = 1; i < coords.length; i++) { const [x, y] = toScreen(coords[i][0], coords[i][1]); ctx.lineTo(x, y) }
        ctx.closePath()
        if (fc) { ctx.fillStyle = fc; ctx.fill() }
        ctx.stroke()
      } else if (f.geometry.type === 'Point') {
        const [x, y] = toScreen(f.geometry.coordinates[0], f.geometry.coordinates[1])
        const r = Math.max(1.5, (isHL ? 8 : 5) * Math.min(zoom, 3))
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
        if (fc) { ctx.fillStyle = fc; ctx.fill() }
        ctx.stroke()
      } else {
        const coords = f.geometry.coordinates
        if (coords.length < 2) { ctx.setLineDash([]); return }
        ctx.beginPath()
        const [sx, sy] = toScreen(coords[0][0], coords[0][1]); ctx.moveTo(sx, sy)
        for (let i = 1; i < coords.length; i++) { const [x, y] = toScreen(coords[i][0], coords[i][1]); ctx.lineTo(x, y) }
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    function drawLabels() {
      if (!airportData || zoom < 0.8) return
      const fs = Math.max(8, Math.min(16, 10 * Math.min(zoom, 2.5)))
      const labeled = new Set(['runway', 'tower'])
      for (const f of airportData.features) {
        const t = f.properties.type, l = f.properties.label
        if (!l || !labeled.has(t)) continue
        let cx: number, cy: number
        if (f.geometry.type === 'Point') { [cx, cy] = toScreen(f.geometry.coordinates[0], f.geometry.coordinates[1]); cy -= fs * 1.2 }
        else {
          const coords = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates
          if (coords.length < 2) continue
          let sx = 0, sy = 0
          for (const [ln, lt] of coords) { sx += ln; sy += lt }
          [cx, cy] = toScreen(sx / coords.length, sy / coords.length)
        }
        ctx.fillStyle = '#fff'; ctx.font = `bold ${fs}px "Courier New"`; ctx.textAlign = 'center'
        ctx.fillText(l, cx, cy)
      }
    }

    // Aircraft icon (Material Design airplane)
    const AIRPLANE_PATH = new Path2D("M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z")

    function drawAirplaneIcon(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, size: number, color: string) {
      ctx.save(); ctx.translate(x, y)
      ctx.rotate(heading * Math.PI / 180)
      const scale = size * 2.4 / 24; ctx.scale(scale, scale); ctx.translate(-12, -12)
      ctx.fillStyle = color; ctx.fill(AIRPLANE_PATH); ctx.restore()
    }

    function drawCarIcon(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, size: number) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(heading * Math.PI / 180)
      const w = size * 1.2, h = size * 0.7
      ctx.fillStyle = '#4488cc'; ctx.strokeStyle = '#5599dd'; ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#66aaee'
      ctx.beginPath(); ctx.roundRect(w * 0.05, -h * 0.35, w * 0.35, h * 0.7, 2); ctx.fill()
      ctx.fillStyle = '#ffff88'
      ctx.fillRect(w * 0.35, -h * 0.32, w * 0.12, h * 0.18)
      ctx.fillRect(w * 0.35, h * 0.14, w * 0.12, h * 0.18)
      ctx.restore()
    }

    function drawAircraft() {
      if (!aircraft.length) return
      const AGP_LAT = 36.675, AGP_LON = -4.499, RANGE_KM = 30
      const now = Date.now() / 1000
      for (const a of aircraft) {
        const dlat = (a.lat - AGP_LAT) * 111.32, dlon = (a.lon - AGP_LON) * 111.32 * 0.803
        const distKm = Math.sqrt(dlat * dlat + dlon * dlon)
        if (distKm > RANGE_KM || (a.altitude && a.altitude > 3500)) continue
        const [x, y] = toScreen(a.lon, a.lat)
        if (x < -80 || y < -80 || x > canvas.width / devicePixelRatio + 80 || y > canvas.height / devicePixelRatio + 80) continue
        const alpha = Math.max(0.55, 1 - (now - acAge) / 120)
        const sz = Math.max(8, Math.min(22, 12 * Math.min(zoom, 3)))
        const hdg = a.heading || 0
        ctx.shadowBlur = sz * 0.5

        if (a.is_vehicle) {
          ctx.shadowColor = 'rgba(68,136,204,0.5)'
          drawCarIcon(ctx, x, y, hdg, sz)
        } else if (a.on_ground) {
          ctx.shadowColor = 'rgba(0,255,100,0.5)'
          drawAirplaneIcon(ctx, x, y, hdg, sz, '#00ff50')
        } else {
          ctx.shadowColor = `rgba(255,160,0,${alpha * 0.5})`
          drawAirplaneIcon(ctx, x, y, hdg, sz, `rgba(255,160,0,${alpha * 0.8})`)
        }
        ctx.shadowBlur = 0

        if ((a.callsign || a.flight) && zoom > 1.0) {
          const label = a.flight || a.callsign
          ctx.fillStyle = `rgba(0,220,255,${alpha})`
          ctx.font = `bold ${Math.max(9, 11 * Math.min(zoom, 1.5))}px "Courier New"`
          ctx.textAlign = 'center'
          ctx.fillText(label, x, y - sz - 10)
        }
        if (a.altitude && zoom > 1.3) {
          ctx.fillStyle = `rgba(0,200,100,${alpha * 0.85})`
          ctx.font = `${Math.max(7, 9 * Math.min(zoom, 1.3))}px "Courier New"`
          ctx.fillText(Math.round(a.altitude) + 'm', x, y + sz + 10)
        }
      }
    }

    function drawTrails() {
      if (!aircraft.length) return
      const now = Date.now() / 1000
      for (const a of aircraft) {
        if (!a.icao24) continue
        const t = trails.get(a.icao24)
        if (!t || t.length < 2) continue
        ctx.beginPath()
        const [sx, sy] = toScreen(t[0].lon, t[0].lat); ctx.moveTo(sx, sy)
        for (let i = 1; i < t.length; i++) {
          const [x, y] = toScreen(t[i].lon, t[i].lat); ctx.lineTo(x, y)
        }
        ctx.strokeStyle = 'rgba(0,255,100,0.15)'; ctx.lineWidth = 1; ctx.stroke()
      }
    }

    function draw() {
      if (!airportData || !bounds) return
      const W = canvas.parentElement!.clientWidth, H = canvas.parentElement!.clientHeight
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H)
      const order = ['aerodrome', 'apron', 'hangar', 'terminal', 'helipad', 'stopway', 'parking', 'taxilane', 'taxiway', 'runway', 'tower']
      const byType: any = {}
      for (const t of order) byType[t] = []
      for (let i = 0; i < airportData.features.length; i++) {
        const t = airportData.features[i].properties.type
        if (byType[t]) byType[t].push([i, airportData.features[i]])
      }
      for (const t of order) { for (const [idx, f] of byType[t]) drawFeature(f, idx) }
      drawLabels()
      drawTrails()
      drawAircraft()
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(W - 130, H - 32, 122, 24)
      ctx.fillStyle = '#888'; ctx.font = '11px "Courier New"'; ctx.textAlign = 'right'
      ctx.fillText(`ZOOM ${zoom.toFixed(1)}x | ${aircraft.length} ✈`, W - 14, H - 14)
    }

    async function loadAirport() {
      const r = await fetch('/lemg_airport.geojson')
      airportData = await r.json()
      bounds = fitBounds(airportData.features)
      resize(); draw()
    }

    function updateHighlight(fids: number[]) {
      highlightedFeatures = new Set(fids); hlPulse = 8; draw()
      if (highlightTimeout) clearTimeout(highlightTimeout)
      highlightTimeout = setTimeout(() => { highlightedFeatures = new Set(); hlPulse = 0; draw() }, 8000)
    }

    let animFrame: number
    function pulseAnim() {
      hlPulse = Math.max(0, hlPulse - 0.3)
      if (hlPulse > 0) draw()
      animFrame = requestAnimationFrame(pulseAnim)
    }

    // ─── POLLING ───
    async function pollTranscriptions() {
      try {
        const r = await fetch('/api/transcriptions')
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const data = await r.json()
        const feed = document.getElementById('feed')!
        errorCount = 0
        const statusLeft = document.getElementById('status-left')!
        statusLeft.innerHTML = '● EN LÍNEA'

        if (data.entries.length !== lastCount || data.updated !== lastUpdated || data.error) {
          lastCount = data.entries.length; lastUpdated = data.updated
          // Check if user is at bottom before auto-scrolling
          const wasAtBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60
          feed.innerHTML = ''
          for (const entry of data.entries) {
            const div = document.createElement('div')
            const isLast = entry === data.entries[data.entries.length - 1]
            div.className = 'tx-line' + (isLast ? ' new' : '')
            let html = ''
            if (entry.time) html += `<span class="ts">${entry.time}</span>`
            html += entry.text
            if (entry.audio) html += ` <button class="btn-play" onclick="window.playAudio(this,'${entry.audio}')">▶</button>`
            if (entry.locations && entry.locations.length > 0) {
              html += ' '
              for (const loc of entry.locations) html += `<span class="loc-tag ${loc.type}">${loc.type}:${loc.ref}</span>`
            }
            div.innerHTML = html; feed.appendChild(div)
          }
          if (wasAtBottom) feed.scrollTop = feed.scrollHeight
          const lastEntry = data.entries[data.entries.length - 1]
          const newText = lastEntry ? lastEntry.text : ''
          const isReallyNew = newText !== lastText
          lastText = newText
          if (isReallyNew) beep()
          if (data.entries.length > 0) {
            const last = data.entries[data.entries.length - 1]
            if (last.full_ts) {
              const d = new Date(last.full_ts.replace(' ', 'T'))
              if (!isNaN(d.getTime())) lastMsgTime = d.getTime() / 1000
            }
          }
          if (data.highlighted && data.highlighted.length > 0) updateHighlight(data.highlighted)
        }
        updateTimer()
        const now = new Date()
        document.getElementById('status-right')!.textContent = now.toLocaleTimeString('es-ES') + ' | ' + data.entries.length + ' tx'
      } catch (e) {
        errorCount++
        document.getElementById('status-left')!.innerHTML = '<span style="color:#f44">● ERROR (' + errorCount + ')</span>'
      }
    }

    function updateTimer() {
      if (!lastMsgTime) return
      const elapsed = Math.floor(Date.now() / 1000 - lastMsgTime)
      const el = document.getElementById('last-timer')
      if (!el) return
      if (elapsed < 3) el.textContent = 'ahora'
      else if (elapsed < 60) el.textContent = 'hace ' + elapsed + 's'
      else el.textContent = 'hace ' + Math.floor(elapsed / 60) + 'm'
    }

    let audioCtx: AudioContext | null = null
    function getAudioCtx(): AudioContext | null {
      if (audioCtx) return audioCtx
      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        // If suspended (autoplay policy), resume on first user click
        if (audioCtx.state === 'suspended') {
          const resume = () => { audioCtx?.resume(); document.removeEventListener('click', resume) }
          document.addEventListener('click', resume)
        }
        return audioCtx
      } catch (e) { return null }
    }

    function beep() {
      try {
        const ctx = getAudioCtx()
        if (!ctx) return
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime)
        g.gain.setValueAtTime(0.04, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2)
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 2)
      } catch (e) { }
    }

    ;(window as any).playAudio = function (btn: HTMLElement | null, url: string) {
      if (currentAudio) { currentAudio.pause() }
      document.querySelectorAll('.btn-play.playing').forEach((b: any) => { b.classList.remove('playing'); b.textContent = '▶' })
      if (currentAudio && currentAudio.src.endsWith(url.split('/').pop()!)) { currentAudio = null; return }
      const a = new Audio(url)
      a.onended = () => { if (btn) { btn.classList.remove('playing'); btn.textContent = '▶' }; currentAudio = null }
      a.onerror = () => { if (btn) btn.textContent = '·'; currentAudio = null }
      a.play()
      if (btn) { btn.classList.add('playing'); btn.textContent = '■' }
      currentAudio = a
    }

    async function pollAircraft() {
      try {
        const r = await fetch('/api/aircraft')
        const data = await r.json()
        aircraft = data.states || []
        acAge = data.time || 0
        const nearAc = aircraft.filter((a: any) => {
          const dlat2 = (a.lat - 36.675) * 111.32, dlon2 = (a.lon + 4.499) * 111.32 * 0.803
          return Math.sqrt(dlat2 * dlat2 + dlon2 * dlon2) < 30 && (!a.altitude || a.altitude < 3500)
        }).length
        const acCount = document.getElementById('ac-count')
        if (acCount) { acCount.textContent = nearAc + ' ✈'; acCount.style.color = nearAc ? '#0f0' : '#555' }
        const now = Date.now() / 1000
        for (const a of aircraft) {
          if (!a.icao24 || !a.lon || !a.lat) continue
          let t = trails.get(a.icao24)
          if (!t) { t = []; trails.set(a.icao24, t) }
          t.push({ lon: a.lon, lat: a.lat, time: now, on_ground: a.on_ground })
          while (t.length > 1 && now - t[0].time > 120) t.shift()
        }
        for (const [key, t] of trails) {
          while (t.length && now - t[0].time > 120) t.shift()
          if (!t.length) trails.delete(key)
        }
        draw()
        // Update tooltip if aircraft selected
        if (_selectedAc) {
          const a = aircraft.find((x: any) => x.icao24 === _selectedAc.icao24)
          if (a) {
            const [sx, sy] = toScreen(a.lon, a.lat)
            const pw = document.getElementById('map-panel')!
            const pr = pw.getBoundingClientRect()
            showTooltip(a, sx + pr.left, sy + pr.top)
          } else hideTooltip()
        }
      } catch (e) { }
    }

    // ─── FLIGHTS PANEL ───
    function flightMeta(f: any) {
      const p: string[] = []
      if (f.type === 'live') {
        if (f.alt_ft) p.push(`FL${Math.round(f.alt_ft / 100)}`)
        if (f.speed_kmh) p.push(`${f.speed_kmh}km/h`)
        if (f.delay) p.push(`<span style="color:#f84">+${f.delay}m</span>`)
      } else {
        if (f.delay && f.delay >= 30) p.push(`<span style="color:#f84">+${f.delay}m</span>`)
        else if (f.delay) p.push(`<span style="color:#fa0">+${f.delay}m</span>`)
        if (f.gate) p.push(`P${f.gate}`)
        if (f.terminal) p.push(`T${f.terminal}`)
      }
      return p.join(' ')
    }
    function flightAircraft(f: any) {
      const a = [f.airline_name || f.airline || '']
      if (f.aircraft) a.push(f.aircraft)
      return a.join(' · ')
    }
    function flightRoute(f: any, arrow: string) {
      const from = arrow === '→' ? 'Málaga' : (f.origin_city || f.origin || '?')
      const to = arrow === '→' ? (f.dest_city || f.dest || '?') : 'Málaga'
      return `${arrow} ${arrow === '→' ? to : from}`
    }

    async function pollFlights() {
      if (!showFlights) return
      try {
        const r = await fetch('/api/schedules')
        const data = await r.json()
        const fp = document.getElementById('flights-panel')!
        const sd = data.salidas || [], ll = data.llegadas || []
        const liveS = sd.filter((f: any) => f.type === 'live')
        const liveL = ll.filter((f: any) => f.type === 'live')
        const categ = (list: any[], cat: string) => list.filter((f: any) => (f.category || f.type) === cat)
        const showBlock = (list: any[], arrow: string, _cls: string, label: string, labelColor?: string) => {
          if (!list.length) return
          const cls2 = arrow === '→' ? 'dep' : 'arr'
          let h = `<div class="flight-section${labelColor ? ' ' + labelColor : ''}"><span>${label} (${list.length})</span><span style="font-size:9px">HORA</span></div>`
          for (const f of list) {
            const time = f.sched_time || (f.type === 'live' ? 'EN VUELO' : '...')
            const cat = f.category || f.type
            const rowCls = [cls2, cat].join(' ')
            h += `<div class="flight-line ${rowCls}"><span class="fl-num">${f.flight || '?'}</span><span class="fl-route">${flightRoute(f, arrow)}</span><span class="fl-info">${flightAircraft(f)}</span><span class="fl-meta"><span style="color:${cat === 'live' ? '#0f0' : cat === 'delayed' ? '#f84' : cat === 'cancelled' ? '#f44' : 'var(--dim)'};font-weight:bold">${time}</span> ${flightMeta(f)}</span></div>`
          }
          fp.innerHTML += h
        }
        let html = `<div class="flight-section"><span>✈ AGP · ${data.updated || ''}</span><span style="color:#0f0">${liveS.length + liveL.length} EN VUELO | ${sd.length + ll.length} TOTAL</span></div>`
        fp.innerHTML = html
        showBlock(liveS, '→', 'dep', '🟢 SALIDAS EN VUELO', 'live-hdr')
        showBlock(categ(sd, 'delayed'), '→', 'dep', '🟠 SALIDAS CON RETRASO', 'delayed-hdr')
        showBlock(categ(sd, 'cancelled'), '→', 'dep', '🔴 SALIDAS CANCELADAS', 'cancelled-hdr')
        showBlock(categ(sd, 'scheduled'), '→', 'dep', '📋 PRÓXIMAS SALIDAS')
        showBlock(categ(sd, 'landed'), '→', 'dep', '✓ SALIDAS ATERRIZADAS')
        showBlock(liveL, '←', 'arr', '🟢 LLEGADAS EN VUELO', 'live-hdr')
        showBlock(categ(ll, 'delayed'), '←', 'arr', '🟠 LLEGADAS CON RETRASO', 'delayed-hdr')
        showBlock(categ(ll, 'cancelled'), '←', 'arr', '🔴 LLEGADAS CANCELADAS', 'cancelled-hdr')
        showBlock(categ(ll, 'scheduled'), '←', 'arr', '📋 PRÓXIMAS LLEGADAS')
        showBlock(categ(ll, 'landed'), '←', 'arr', '✓ LLEGADAS ATERRIZADAS')
      } catch (e) { }
    }

    // Toggle handlers
    document.getElementById('autoplay-cb')!.addEventListener('change', function () {
      autoPlay = (this as HTMLInputElement).checked
      document.getElementById('auto-toggle')!.classList.toggle('on', autoPlay)
    })
    document.getElementById('flights-cb')!.addEventListener('change', function () {
      showFlights = (this as HTMLInputElement).checked
      document.getElementById('flights-toggle')!.classList.toggle('on', showFlights)
      const fp = document.getElementById('flights-panel')!
      fp.style.display = showFlights ? 'block' : 'none'
      if (showFlights) pollFlights()
    })

    // Speed selector
    ;(window as any).setSpeed = function (secs: string) {
      fetch('/api/interval/' + secs).then(r => r.json()).then((d: any) => {
        const el = document.getElementById('cnt-budget')
        if (el) el.textContent = ' | ' + d.calls_per_hour + '/h ' + d.calls_per_day + '/d ' + d.days_at_rate + 'd ' + d.budget
      })
    }

    // Counter bar
    function pollCounters() {
      fetch('/api/counters').then(r => r.json()).then((c: any) => {
        const el1 = document.getElementById('cnt-adsbx'); if (el1) el1.textContent = c.adsbx_total || 0
        const el2 = document.getElementById('cnt-days'); if (el2) el2.textContent = c.adsbx_days_left || '--'
        const el3 = document.getElementById('cnt-pct'); if (el3) el3.textContent = (c.adsbx_pct || 0) + '%'
        const el4 = document.getElementById('cnt-bar'); if (el4) el4.style.width = (c.adsbx_pct || 0) + '%'
        const pct = c.adsbx_pct || 0
        const bar = document.getElementById('cnt-bar')
        const label = document.getElementById('cnt-pct')
        if (pct > 90) {
          if (bar) bar.style.background = '#f44'; if (label) label.style.color = '#f44'
        } else if (pct > 75) {
          if (bar) bar.style.background = '#f84'; if (label) label.style.color = '#f84'
        } else {
          if (bar) bar.style.background = '#0f0'; if (label) label.style.color = '#0f0'
        }
      })
    }

    // ─── INIT ───
    loadAirport().then(() => {
      pollTranscriptions()
      pollAircraft()
      setInterval(pollTranscriptions, 3000)
      setInterval(pollAircraft, 3000)
      setInterval(updateTimer, 1000)
      setInterval(pollFlights, 30000)
      setInterval(pollCounters, 30000)
      pollCounters()
      pulseAnim()
    })

    // Cleanup on unmount
    return () => {
      if (animFrame) cancelAnimationFrame(animFrame)
    }
    // ===== END OF DASHBOARD JS =====
  }, [])

  return (
    <>
      <style>{css}</style>
      <div id="map-panel">
        <canvas id="map"></canvas>
        <div id="map-header">ATC TORRE MÁLAGA &nbsp; 118.150 MHz &nbsp; | &nbsp; LEMG / AGP &nbsp; | &nbsp; <span id="ac-count" style={{ color: '#0f0' }}>0 ✈</span></div>
        <div id="ac-tooltip"></div>
        <div id="legend">
          <div className="legend-item"><div className="legend-swatch rw"></div>Pista</div>
          <div className="legend-item"><div className="legend-swatch tw"></div>Calle rodaje</div>
          <div className="legend-item"><div className="legend-swatch pk"></div>Parking / Gate</div>
          <div className="legend-item"><div className="legend-swatch sld"></div>Terminal / Torre</div>
          <div className="legend-item"><div className="legend-swatch" style={{ color: '#00ff50', display: 'inline-block', fontSize: '14px', lineHeight: 1 }}>✈</div>Avión en tierra</div>
          <div className="legend-item"><div className="legend-swatch" style={{ color: '#fa0', display: 'inline-block', fontSize: '14px', lineHeight: 1 }}>✈</div>Avión en vuelo</div>
          <div className="legend-item"><div className="legend-swatch" style={{ color: '#48c', display: 'inline-block', fontSize: '14px', lineHeight: 1 }}>🚗</div>Vehículo tierra</div>
        </div>
      </div>
      <div id="sidebar">
        <div id="sidebar-header">
          <span>TRANSCRIPCIONES | @torreagpbot</span>
          <label id="auto-toggle" title="Auto-play audio"><input type="checkbox" id="autoplay-cb" /><span className="knob"></span> AUTO</label>
          <label id="flights-toggle" title="Ver vuelos"><input type="checkbox" id="flights-cb" /><span className="knob"></span> ✈</label>
          <span id="last-timer"></span>
        </div>
        <div id="flights-panel" style={{ display: 'none', flex: 1, overflowY: 'auto', padding: '8px 0', borderBottom: '1px solid var(--border)' }}></div>
        <div id="feed"><div className="tx-line" style={{ color: 'var(--dim)' }}>Cargando...</div></div>
        <div id="counter-bar" style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: '9px', color: 'var(--dim)', background: '#0d0d0d', display: 'flex', gap: '18px', alignItems: 'center' }}>
          <span>📡 ADSBX: <b id="cnt-adsbx" style={{ color: '#0f0' }}>0</b>/10k</span>
          <span style={{ color: '#555' }}>|</span>
          <span>⏳ Est: <b id="cnt-days" style={{ color: '#4af' }}>--</b> días</span>
          <span style={{ color: '#555' }}>|</span>
          <span>⚡ <select id="speed-selector" style={{ background: '#111', color: '#0f0', border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: '9px', padding: '1px 4px', cursor: 'pointer' }} onChange={(e) => (window as any).setSpeed?.(e.target.value)}>
            <option value="300">5 min</option>
            <option value="120">2 min</option>
            <option value="60">1 min</option>
            <option value="30">30 seg</option>
          </select></span>
          <span id="cnt-budget" style={{ fontSize: '8px', color: 'var(--dim)' }}></span>
          <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', margin: '0 8px', overflow: 'hidden' }}>
            <div id="cnt-bar" style={{ height: '100%', width: '0%', background: '#0f0', borderRadius: '2px', transition: 'width 0.5s' }}></div>
          </div>
          <span style={{ fontSize: '9px' }}>⏱ <b id="cnt-countdown" style={{ color: '#fa0' }}>--</b></span>
          <span id="cnt-pct" style={{ color: '#0f0', fontWeight: 'bold', minWidth: '35px' }}>0%</span>
        </div>
        <div id="status-bar">
          <span id="status-left">● EN LÍNEA</span>
          <span id="status-right"></span>
        </div>
      </div>
    </>
  )
}

const css = `
:root{--bg:#0a0a0a;--panel:#111;--border:#2a2a2a;--text:#ccc;--accent:#fff;--dim:#555;--rhl:#ff0;--thl:#0ff;--phl:#f0f;--tohl:#f80;--acft:#0f0}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:'Courier New',monospace;display:flex;height:100vh;overflow:hidden}
#map-panel{flex:1;position:relative;border-right:1px solid var(--border);min-width:0}
canvas{display:block;width:100%;height:100%}
#map-header{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);padding:6px 20px;border:1px solid var(--border);font-size:13px;letter-spacing:2px;white-space:nowrap;pointer-events:none}
#legend{position:absolute;bottom:12px;left:12px;background:rgba(0,0,0,0.85);padding:8px 14px;border:1px solid var(--border);font-size:11px;pointer-events:none}
.legend-item{display:flex;align-items:center;gap:8px;margin:2px 0}
.legend-swatch{width:12px;height:3px}
.legend-swatch.rw{background:#fff;height:6px}
.legend-swatch.tw{background:#888;height:3px}
.legend-swatch.pk{background:#444;height:2px}
.legend-swatch.ac{background:var(--acft);width:8px;height:8px;border-radius:50%}
.legend-swatch.sld{width:12px;height:12px;background:#fff}
#sidebar{width:420px;display:flex;flex-direction:column;background:var(--panel);border-left:1px solid var(--border)}
#sidebar-header{padding:12px 18px;border-bottom:1px solid var(--border);font-size:13px;letter-spacing:1px;background:#0d0d0d;display:flex;justify-content:space-between}
#sidebar-header span{color:var(--dim)}
#last-timer{color:var(--acft);font-size:11px}
#feed{flex:1;overflow-y:auto;padding:8px 0}
#feed::-webkit-scrollbar{width:4px}
#feed::-webkit-scrollbar-track{background:var(--panel)}
#feed::-webkit-scrollbar-thumb{background:var(--border)}
.tx-line{padding:6px 18px;font-size:12px;border-left:2px solid transparent;line-height:1.4}
.tx-line.new{animation:pulseIn 0.6s ease-out;border-left-color:var(--acft)!important;background:rgba(0,255,0,0.05)}
@keyframes pulseIn{0%{background:rgba(0,255,0,0.15)}100%{background:rgba(0,255,0,0.02)}}
.tx-line .ts{color:var(--dim);font-size:10px;margin-right:6px}
.tx-line .loc-tag{display:inline-block;font-size:9px;padding:1px 5px;margin:1px 2px;border:1px solid var(--dim);border-radius:2px;color:var(--accent)}
.tx-line .loc-tag.runway{border-color:var(--rhl);color:var(--rhl)}
.tx-line .loc-tag.taxiway{border-color:var(--thl);color:var(--thl)}
.tx-line .loc-tag.parking{border-color:var(--phl);color:var(--phl)}
.tx-line .loc-tag.tower{border-color:var(--tohl);color:var(--tohl)}
#status-bar{padding:8px 18px;border-top:1px solid var(--border);font-size:10px;color:var(--dim);display:flex;justify-content:space-between}
.btn-play{display:inline-flex;align-items:center;cursor:pointer;color:var(--dim);font-size:9px;margin-left:6px;padding:0 4px;border:1px solid var(--border);border-radius:2px;background:transparent;font-family:'Courier New',monospace;transition:all 0.2s;line-height:1.6}
.btn-play:hover{color:var(--text);border-color:var(--dim)}
.btn-play.playing{color:#888;border-color:#555;background:rgba(255,255,255,0.03)}
#auto-toggle{display:inline-flex;align-items:center;gap:5px;font-size:10px;color:var(--dim);cursor:pointer;user-select:none;margin:0 10px}
#auto-toggle input{display:none}
#auto-toggle .knob{width:24px;height:12px;background:var(--border);border-radius:6px;position:relative;transition:background 0.2s}
#auto-toggle .knob::after{content:'';position:absolute;top:1px;left:1px;width:10px;height:10px;background:var(--dim);border-radius:50%;transition:all 0.2s}
#auto-toggle.on .knob{background:#1a3a1a}
#auto-toggle.on .knob::after{left:13px;background:var(--acft)}
#flights-toggle{display:inline-flex;align-items:center;gap:5px;font-size:10px;color:var(--dim);cursor:pointer;user-select:none}
#flights-toggle input{display:none}
#flights-toggle .knob{width:24px;height:12px;background:var(--border);border-radius:6px;position:relative;transition:background 0.2s}
#flights-toggle .knob::after{content:'';position:absolute;top:1px;left:1px;width:10px;height:10px;background:var(--dim);border-radius:50%;transition:all 0.2s}
#flights-toggle.on .knob{background:#1a2a3a}
#flights-toggle.on .knob::after{left:13px;background:#4af}
.flight-line{display:flex;align-items:center;padding:5px 12px;font-size:12px;border-left:3px solid transparent;gap:6px;line-height:1.5}
.flight-line .fl-num{color:#4af;font-weight:bold;min-width:52px;font-size:12px}
.flight-line .fl-route{color:var(--text);font-size:12px}
.flight-line .fl-info{color:var(--dim);font-size:11px}
.flight-line.dep{border-left-color:#3af}
.flight-line.arr{border-left-color:#f5f}
.flight-line.live{border-left-color:#0f0!important;background:rgba(0,255,100,0.04)}
.flight-line.delayed{border-left-color:#f84!important;background:rgba(255,136,0,0.04)}
.flight-line.cancelled{border-left-color:#f44!important;background:rgba(255,0,0,0.04);text-decoration:line-through;opacity:0.6}
.flight-line.landed{border-left-color:#888!important;opacity:0.5}
.flight-line .fl-meta{color:var(--dim);font-size:11px;margin-left:auto;text-align:right;min-width:100px}
.flight-section{color:var(--dim);font-size:10px;padding:6px 12px 2px;letter-spacing:1px;display:flex;justify-content:space-between}
.flight-section.live-hdr{color:#0f0}
.flight-section.delayed-hdr{color:#f84}
.flight-section.cancelled-hdr{color:#f44}
#ac-tooltip{display:none;position:absolute;background:rgba(0,0,0,0.92);border:1px solid #0f0;padding:10px 14px;border-radius:4px;font-size:11px;z-index:100;pointer-events:none;max-width:260px;line-height:1.5}
#ac-tooltip .tt-call{color:#0f0;font-size:13px;font-weight:bold;margin-bottom:4px}
#ac-tooltip .tt-row{display:flex;justify-content:space-between;gap:12px}
#ac-tooltip .tt-label{color:#888}
#ac-tooltip .tt-val{color:#ccc;text-align:right}
#ac-tooltip .tt-div{border-top:1px solid #333;margin:4px 0}
#ac-tooltip .tt-badge{display:inline-block;padding:1px 5px;border-radius:2px;font-size:9px;margin:1px}
#ac-tooltip .tt-badge.green{background:#050;color:#0f0;border:1px solid #0a0}
#ac-tooltip .tt-badge.orange{background:#320;color:#fa0;border:1px solid #540}
#ac-tooltip .tt-badge.blue{background:#012;color:#48c;border:1px solid #248}
#ac-tooltip .tt-badge.red{background:#300;color:#f44;border:1px solid #600}
`
