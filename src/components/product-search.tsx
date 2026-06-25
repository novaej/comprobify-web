'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import type { CatalogProduct } from '@/app/actions/catalog';

export function ProductSearch({
  value,
  onChange,
  onSelect,
  products,
  className,
  'aria-invalid': ariaInvalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (p: CatalogProduct) => void;
  products: CatalogProduct[];
  className?: string;
  'aria-invalid'?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePos = () => {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left });
    }
  };

  const filtered = value.trim().length > 0
    ? products
        .filter(
          (p) =>
            p.mainCode.toLowerCase().includes(value.toLowerCase()) ||
            p.description.toLowerCase().includes(value.toLowerCase()),
        )
        .slice(0, 7)
    : [];

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); updatePos(); setOpen(true); }}
        onFocus={() => { updatePos(); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={className}
        aria-invalid={ariaInvalid}
      />
      {open && filtered.length > 0 && pos && createPortal(
        <div
          className="fixed z-50 min-w-[220px] rounded-md border bg-popover shadow-md"
          style={{ top: pos.top, left: pos.left }}
        >
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted"
              onMouseDown={() => { onSelect(p); setOpen(false); }}
            >
              <span className="font-mono text-xs font-medium">{p.mainCode}</span>
              <span className="truncate text-xs text-muted-foreground">{p.description}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
