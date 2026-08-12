import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import './side-panel.css'
import './anchor-reference-theme.css'

export const metadata: Metadata = {
  title: 'P-M Column Designer',
  description: 'Stage 1 P-M-M reinforced-concrete section-resistance analysis; member stability is outside scope.'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
