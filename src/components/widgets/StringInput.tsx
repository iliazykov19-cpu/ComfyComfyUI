'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { WidgetSpec } from '@/lib/widgets/spec';
import { cn } from '@/lib/utils';

type Props = {
  id: string;
  spec: Extract<WidgetSpec, { kind: 'string' }>;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
};

export function StringInput({ id, spec, value, onChange, readOnly }: Props) {
  if (spec.multiline) {
    return (
      <Textarea
        id={id}
        value={value}
        placeholder={spec.placeholder}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className={cn(
          'min-h-[100px] font-mono text-sm',
          readOnly && 'bg-muted/40 cursor-not-allowed',
        )}
      />
    );
  }
  return (
    <Input
      id={id}
      value={value}
      placeholder={spec.placeholder}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      className={cn(readOnly && 'bg-muted/40 cursor-not-allowed')}
    />
  );
}
