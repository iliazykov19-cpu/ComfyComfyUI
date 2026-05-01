'use client';

import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export function FieldRow({
  id,
  label,
  hint,
  badge,
  trailing,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  badge?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-sm font-medium" title={hint}>
          {label}
        </Label>
        {badge}
        {trailing && <div className="ml-auto">{trailing}</div>}
      </div>
      {children}
      {hint && (
        <p className="text-xs text-muted-foreground line-clamp-2">{hint}</p>
      )}
    </div>
  );
}
