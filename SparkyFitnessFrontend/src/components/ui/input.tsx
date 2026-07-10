import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown } from 'lucide-react';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, dir, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(ref, () => innerRef.current!);

    const handleStep = (direction: 'up' | 'down') => {
      const input = innerRef.current;
      if (!input || input.disabled || input.readOnly) return;
      if (direction === 'up') {
        input.stepUp();
      } else {
        input.stepDown();
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const inputElement = (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          'dark:[color-scheme:dark]',
          type === 'number' && [
            '[appearance:textfield]',
            '[&::-webkit-outer-spin-button]:appearance-none',
            '[&::-webkit-inner-spin-button]:appearance-none',
            'pe-6',
          ],
          className
        )}
        ref={innerRef}
        dir={dir ?? (type === 'number' ? 'ltr' : undefined)}
        {...props}
      />
    );

    if (type !== 'number') return inputElement;

    return (
      <div className="group/input relative w-full">
        {inputElement}
        <div className="absolute end-0 top-0 z-10 flex h-full w-5 flex-col border-s bg-muted/5 opacity-0 transition-opacity group-hover/input:opacity-100">
          <button
            type="button"
            tabIndex={-1}
            aria-label="+"
            disabled={props.disabled || props.readOnly}
            className="flex flex-1 items-center justify-center border-b transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => handleStep('up')}
          >
            <ChevronUp className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="−"
            disabled={props.disabled || props.readOnly}
            className="flex flex-1 items-center justify-center transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => handleStep('down')}
          >
            <ChevronDown className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
