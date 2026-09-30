import { ClerkProvider } from '@clerk/nextjs'
import { Inter } from 'next/font/google'
import './globals.css'
import AppShell from '@/components/AppShell'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Diamond Contacts',
  description: 'Directorio de contactos de la clínica con sincronización local-first',
  manifest: '/manifest.json',
  icons: {
    icon: '/Logo.svg',
    shortcut: '/Logo.svg',
    apple: '/Logo.svg',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#14b8a6',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl="/sign-in"
      afterSignOutUrl="/sign-in"
    >
      <html lang="es">
        <head>
          <meta name="theme-color" content="#14b8a6" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content="Diamond Contacts" />
          <meta name="format-detection" content="telephone=no" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="application-name" content="Diamond Contacts" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="icon" href="/Logo.svg" />
          <link rel="shortcut icon" href="/Logo.svg" />
          <link rel="apple-touch-icon" href="/Logo.svg" />
        </head>
        <body className={inter.className} suppressHydrationWarning>
          <AppShell>{children}</AppShell>
        </body>
      </html>
    </ClerkProvider>
  )
}