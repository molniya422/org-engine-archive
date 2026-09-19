import * as React from 'react';
import { cn } from '@/lib/utils';

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'flat' | 'glass' | 'pedestal';
};

/**
 * Card — three variants:
 *   flat:    bordered surface, charcoal fill. Default for content cards.
 *   glass:   frosted-glass approximation. Use for hero / overlay surfaces.
 *   pedestal: deep show-floor surface. Use as a backdrop for premium showcase cards.
 *
 * Notes:
 *   - No box-shadow drop on default (taste-skill 4.4: shadow tinted to bg, no pure black drop on light bg).
 *   - Hairline chrome top-edge for industrial feel.
 */
const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'flat', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-md text-card-foreground chrome-hairline',
        variant === 'flat' && 'bg-card border border-border',
        variant === 'glass' && 'glass-panel',
        variant === 'pedestal' && 'show-floor border border-border',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-2 px-5 pt-5 pb-3', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        'font-display text-[15px] font-medium leading-tight tracking-[-0.01em]',
        className,
      )}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-[12.5px] leading-relaxed text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-5 pb-5 pt-1', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center gap-2 px-5 py-3 border-t border-border', className)}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
