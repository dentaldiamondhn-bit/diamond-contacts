'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { UserButton, useUser } from '@clerk/nextjs';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';

function RailUserButton() {
  // Clerk's <UserButton/> mounts a div only on the client (clerkjs loads after
  // SSR), which blew up hydration. Gate it behind a client-only mount so the
  // server renders nothing and the client takes over cleanly.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-8 w-8" aria-hidden />;
  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: 'w-8 h-8 rounded-lg overflow-hidden',
        },
      }}
    />
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname?.startsWith('/sign-in')) {
    return <>{children}</>;
  }

  return (
    <div className="ambient relative flex h-dvh w-full overflow-hidden">
      <aside className="glass-panel hidden md:flex w-14 shrink-0 flex-col items-center gap-3 border-r border-white/50 py-3 dark:border-white/5">
        <Link href="/" className="rounded-lg p-1.5 ring-teal-500/40 transition hover:ring-2" aria-label="Contactos">
          <Image src="/contacts.svg" alt="Diamond Contacts" width={34} height={34} className="rounded-lg" priority />
        </Link>
        <Link
          href="/"
          className={cn(
            'rounded-lg p-2 transition',
            pathname === '/'
              ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400'
              : 'text-gray-500 hover:bg-white/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200',
          )}
          aria-label="Contactos"
          title="Contactos"
        >
          <Users className="h-5 w-5" />
        </Link>
        <div className="flex-1" />
        <ThemeToggle />
        <RailUserButton />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}