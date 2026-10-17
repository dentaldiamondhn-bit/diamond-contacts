import { ClerkProvider } from '@clerk/nextjs'
import { Inter } from 'next/font/google'
import './globals.css'
import AppShell from '@/components/AppShell'
import SupabaseTokenBridge from '@/components/SupabaseTokenBridge'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ToastProvider } from '@/components/calendar/Toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Diamond Contacts',
  description: 'Directorio de contactos de la clínica con sincronización local-first',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/contacts.svg', type: 'image/svg+xml' },
      { url: '/contacts.png', type: 'image/png', sizes: '500x500' },
    ],
    shortcut: '/contacts.svg',
    apple: '/contacts.png',
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
      <html
        lang="es"
        // next-themes (attribute="class") writes the resolved theme onto
        // documentElement after mount, from localStorage / the system
        // preference. The server cannot know that value, so <html> legitimately
        // differs on the client and React would warn. This suppression is scoped
        // to <html> only, and is the mechanism next-themes documents.
        //
        // The fully "mismatch-free" alternative is to persist the theme in a
        // cookie and render the class server-side; that needs `cookies()` in this
        // layout, which opts every route out of static prerendering for a
        // cosmetic gain. Left deliberately unimplemented - see
        // improvement_contacts.md (#11).
        suppressHydrationWarning
      >
        <head>
          <meta name="theme-color" content="#14b8a6" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content="Diamond Contacts" />
          <meta name="format-detection" content="telephone=no" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="application-name" content="Diamond Contacts" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="icon" type="image/svg+xml" href="/contacts.svg" />
          <link rel="icon" type="image/png" href="/contacts.png" />
          <link rel="shortcut icon" href="/contacts.svg" />
          <link rel="apple-touch-icon" href="/contacts.png" />
        </head>
        <body
          className={inter.className}
          // No suppressHydrationWarning here on purpose. next-themes is
          // configured with attribute="class", which writes the theme class to
          // document.documentElement only - nothing in this tree renders a
          // theme-dependent class on <body>, and nothing mutates body.classList.
          // So a hydration mismatch on <body> would be a real bug worth seeing.
        >
          <SupabaseTokenBridge />
          <ThemeProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}