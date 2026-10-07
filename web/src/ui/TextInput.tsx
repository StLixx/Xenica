import type { InputHTMLAttributes, Ref } from 'react';

export function TextInput({
  className = '',
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={[
        'h-(--x-row) w-full rounded-sm bg-hover px-2.5 text-fg outline-none placeholder:text-fg-3',
        'focus:bg-press focus-visible:outline-none focus:shadow-focus',
        className,
      ].join(' ')}
      {...rest}
    />
  );
}
