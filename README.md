# AGP Málaga — ATC Radar Web

Dashboard público del radar ATC de la Torre de Málaga (118.150 MHz).

## Stack

- **Next.js 16** (App Router)
- **NeonDB** (PostgreSQL serverless)
- **Vercel Blob** (audio storage, opcional)
- **ADSBexchange** (aviones en tiempo real)
- **AirLabs** (horarios de vuelos)

## Setup

1. Clona e instala:
```bash
npm install
```

2. Copia `.env.example` a `.env.local` y rellena las keys.

3. Corre en local:
```bash
npm run dev
```

4. Deploy a Vercel:
```bash
vercel --prod
```

## Variables de entorno (Vercel)

| Variable | Descripción |
|----------|-------------|
| `NEON_DATABASE_URL` | Conexión a NeonDB |
| `ADSBX_API_KEY` | API key de RapidAPI ADSBexchange |
| `AIRLABS_API_KEY` | API key de AirLabs |
| `AUTH_SECRET` | Secreto para endpoint de sync |
| `BLOB_READ_WRITE_TOKEN` | Token de Vercel Blob (audio) |
| `CRON_SECRET` | Secreto para cron de limpieza |

## Sync local

El script `scripts/sync_to_web.py` lee el log de transcripciones local y las sube a la API.

```bash
# En WSL o Windows con Python:
export SYNC_URL=https://agp-malaga.vercel.app/api/sync
export AUTH_SECRET=tu_secret
python3 scripts/sync_to_web.py
```

Añádelo como cron en WSL:
```bash
crontab -e
# Cada 2 minutos:
*/2 * * * * cd /home/choco/agp-web && python3 scripts/sync_to_web.py
```

## Limpieza automática

Vercel Cron Job (`vercel.json`) ejecuta `/api/cleanup` cada día a las 04:00 UTC. Borra transcripciones y audios de más de 24h.

## Licencia

MIT
