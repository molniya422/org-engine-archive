import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Input — Industrial compact.
 * Notes (a11y from taste-skill 4.5):
 *   - WCAG AA contrast for placeholder + value text on bg (placeholder uses muted-foreground, value uses foreground)
 *   - Focus ring uses ice-blue accent
 *   - 2px chrome top-edge for consistency with Card
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-sm border border-border bg-background px-3 py-2 chrome-hairline',
        'font-mono text-[12.5px] leading-none',
        'placeholder:text-muted-foreground/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
