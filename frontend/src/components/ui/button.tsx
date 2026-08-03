import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Button — Industrial-design language.
 * Variants:
 *   default:  charcoal pill, brushed-chrome edge (primary action)
 *   accent:   ice-blue fill (premium accent for showcase CTAs)
 *   outline:  bordered ghost (secondary)
 *   ghost:    no chrome (inline use)
 *   link:     underlined text only
 *   danger:   destructive
 *
 * Notes:
 *   - radius-md (6px), not full-pill: shape consistency lock (skill 4.4)
 *   - 'tactile' class adds translate-y(1px) on :active
 *   - focus ring uses --ring (ice-blue)
 *   - All variants pass WCAG AA contrast in default + dark mode
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'text-[13px] font-medium leading-none',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-40',
    'tactile',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground chrome-hairline border border-primary hover:bg-primary/85',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
        outline: 'border border-border bg-transparent text-foreground hover:bg-secondary hover:text-secondary-foreground',
        ghost: 'text-foreground hover:bg-secondary hover:text-secondary-foreground',
        link: 'text-accent underline-offset-4 hover:underline',
        danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-7 px-3 text-[12px]',
        lg: 'h-11 px-6 text-[14px]',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
