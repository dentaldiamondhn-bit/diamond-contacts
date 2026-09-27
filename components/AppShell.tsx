'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { UserButton, useUser } from '@clerk/nextjs';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname?.startsWith('/sign-in')) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-gray-800">
      <aside className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-gray-700/60 bg-gray-900/80 py-3">
        <Link href="/" className="rounded-lg p-1.5 ring-teal-500/40 transition hover:ring-2" aria-label="Contactos">
          <Image src="/Logo.svg" alt="Diamond Contacts" width={34} height={34} className="rounded-lg" priority />
        </Link>
        <Link
          href="/"
          className={cn(
            'rounded-lg p-2 transition',
            pathname === '/'
              ? 'bg-teal-500/15 text-teal-400'
              : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200',
          )}
          aria-label="Contactos"
          title="Contactos"
        >
          <Users className="h-5 w-5" />
        </Link>
        <div className="flex-1" />
        <UserButton
          appearance={{
            elements: {
              avatarBox: 'w-8 h-8 rounded-lg overflow-hidden',
            },
          }}
        />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}