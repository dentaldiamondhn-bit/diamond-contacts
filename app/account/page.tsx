'use client';

import Link from 'next/link';
import { UserButton, UserProfile, useClerk, useUser } from '@clerk/nextjs';
import { ArrowLeft, LogOut, Mail } from 'lucide-react';

const card = 'rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-md';

export default function AccountPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  return (
    <div className="min-h-full bg-gray-900/30 px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-teal-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a contactos
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-100">Cuenta</h1>
          <p className="mt-1 text-sm text-gray-500">
            Perfil, correo de acceso y cierre de sesión de esta cuenta.
          </p>
        </div>

        <section className={card}>
          <div className="mb-5 flex items-center gap-3">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: 'w-11 h-11 rounded-xl overflow-hidden',
                },
              }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-100">
                {isLoaded ? user?.fullName || 'Usuario' : 'Cargando…'}
              </p>
              {user?.primaryEmailAddress?.emailAddress && (
                <p className="flex items-center gap-1.5 truncate text-xs text-gray-500">
                  <Mail className="h-3 w-3 shrink-0" />
                  {user.primaryEmailAddress.emailAddress}
                </p>
              )}
            </div>
          </div>

          <UserProfile
            routing="hash"
            appearance={{
              elements: {
                rootBox: 'w-full',
                cardBox: 'shadow-none bg-transparent w-full',
                profileSectionPrimaryButton:
                  'bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-500',
                formButtonReset:
                  'bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-500',
                formButtonPrimary:
                  'bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-500',
                profileSectionTitle: 'text-sm font-semibold text-gray-200',
                profileSectionContent: 'text-sm text-gray-400',
                label: 'text-xs text-gray-500',
                fieldInput:
                  'bg-white/[0.03] border-white/[0.08] text-gray-100 rounded-lg',
                formFieldInput:
                  'bg-white/[0.03] border-white/[0.08] text-gray-100 rounded-lg',
              },
            }}
          />
        </section>

        <section className={`${card} flex items-center justify-between gap-4`}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-200">Sesión</p>
            <p className="truncate text-xs text-gray-500">
              {user?.id ? `Sesión de Clerk · ${user.id}` : 'Sesión activa'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: '/sign-in' })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-sm text-gray-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión
          </button>
        </section>
      </div>
    </div>
  );
}
