import type { ButtonHTMLAttributes } from 'react';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  default: 'bg-hover text-fg-2 hover:bg-press hover:text-fg',
  primary: 'bg-accent text-on-accent font-semibold hover:brightness-110',
  ghost: 'text-fg-2 hover:bg-hover hover:text-fg',
  danger: 'bg-hover text-danger hover:bg-press',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({
  variant = 'default',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm px-2.5 text-ui whitespace-nowrap transition-colors',
        'disabled:cursor-default disabled:opacity-50',
        VARIANTS[variant],
        className,
      ].join(' ')}
      {...rest}
    />
  );
}
