// Adapted from Excalidraw v0.18.1 ToolButton.tsx (MIT, Copyright (c) 2020 Excalidraw).
// Provenance and maintained differences: docs/adr/0011-excalidraw-extension.md.
import type { ReactNode } from 'react';

export function NativeToolButton({
  children,
  selected = false,
  onSelect,
  ...props
}: {
  children: ReactNode;
  selected?: boolean;
  onSelect: () => void;
  title: string;
  'aria-label': string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`ToolIcon ToolIcon_type_button ToolIcon_size_medium ${props.className ?? ''}`}
    >
      <input
        type="checkbox"
        className="ToolIcon_type_checkbox"
        checked={selected}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
      />
      <div className="ToolIcon__icon" aria-hidden="true">
        {children}
      </div>
    </button>
  );
}
