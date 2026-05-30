import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ATC Torre Málaga 118.150 MHz',
  description: 'Radar ADS-B en tiempo real del aeropuerto de Málaga-Costa del Sol (LEMG/AGP)',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
