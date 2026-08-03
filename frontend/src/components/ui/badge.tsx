import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Badge — Sharp-cornered (radius-xs 2px), no full pill.
 * Mono font, tracking 0.08em, micro-text.
 * Shape consistency lock: matches card radii system, not the wrong pill default.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
  {
    variants: {
      variant: {
        default: 'border border-border bg-secondary text-secondary-foreground',
        accent: 'border border-accent/40 bg-accent/10 text-accent',
        outline: 'border border-border bg-transparent text-foreground',
        muted: 'border border-transparent bg-muted text-muted-foreground',
        success: 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
        warning: 'border border-amber-500/40 bg-amber-500/10 text-amber-300',
        destructive: 'border border-destructive/40 bg-destructive/15 text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
