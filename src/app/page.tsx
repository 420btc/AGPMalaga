import type { Metadata } from 'next'
import Dashboard from './dashboard'

export const metadata: Metadata = {
  title: 'ATC Torre Málaga 118.150 MHz',
  description: 'Radar ADS-B en tiempo real del aeropuerto de Málaga-Costa del Sol (LEMG/AGP)',
  openGraph: {
    title: 'ATC Torre Málaga — Radar en vivo',
    description: 'Aviones en tiempo real, transcripciones ATC y horarios de vuelos',
    type: 'website',
  },
}

export default function Home() {
  return <Dashboard />
}
