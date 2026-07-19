import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'P-M Column Designer',
  description: 'Geometry-first P-M-M column section design platform'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
