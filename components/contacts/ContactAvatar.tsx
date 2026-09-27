import { cn } from '@/lib/utils'
import { avatarColor } from '@/lib/contacts/db'

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-16 h-16 text-xl',
} as const

interface ContactAvatarProps {
  name: string
  size?: keyof typeof SIZES
  imageUrl?: string | null
  className?: string
}

export function ContactAvatar({ name, size = 'md', imageUrl, className }: ContactAvatarProps) {
  const initial = (name[0] ?? 'C').toUpperCase()
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-white shrink-0 select-none',
        SIZES[size],
        avatarColor(name || '?'),
        className,
      )}
    >
      {imageUrl ? <img src={imageUrl} alt={name} className="w-full h-full rounded-full object-cover" /> : initial}
    </div>
  )
}