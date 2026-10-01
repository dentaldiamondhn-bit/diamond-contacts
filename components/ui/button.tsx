import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', children, ...props }, ref) => {
const baseClasses = 'inline-flex items-center justify-center rounded-xl text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 hover:-translate-y-0.5 active:translate-y-0';

    const variants = {
      default: 'bg-gradient-to-r from-teal-600 to-blue-600 text-white shadow-sm hover:from-teal-500 hover:to-blue-500 hover:shadow-md hover:shadow-teal-600/20',
      destructive: 'bg-rose-600 text-white hover:bg-rose-500 hover:shadow-md hover:shadow-rose-600/20',
      outline: 'border border-slate-200/80 bg-white/70 hover:bg-white dark:border-slate-700/60 dark:bg-slate-800/70 dark:hover:bg-slate-800 backdrop-blur-sm',
      secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
      ghost: 'hover:bg-white/70 dark:hover:bg-white/10',
      link: 'text-teal-600 underline-offset-4 hover:underline dark:text-teal-400',
    };

    const sizes = {
      default: 'h-10 px-4 py-2',
      sm: 'h-9 rounded-md px-3',
      lg: 'h-11 rounded-md px-8',
      icon: 'h-10 w-10',
    };

    return (
      <button
        className={cn(baseClasses, variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
