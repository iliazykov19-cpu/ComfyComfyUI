'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Pencil, Play } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWorkflowStore } from '@/store/workflow';
import { usePanelStore } from '@/store/panel';
import type { Preset, PresetSummary } from '@/lib/presets/types';
import { useT } from '@/store/i18n';

async function fetchPresets(): Promise<PresetSummary[]> {
  const r = await fetch('/api/presets');
  if (!r.ok) throw new Error(`presets → ${r.status}`);
  const data = (await r.json()) as { items: PresetSummary[] };
  return data.items;
}

async function fetchPreset(id: string): Promise<Preset> {
  const r = await fetch(`/api/presets/${id}`);
  if (!r.ok) throw new Error(`presets/${id} → ${r.status}`);
  const data = (await r.json()) as { preset: Preset };
  return data.preset;
}

function formatDate(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PresetsList() {
  const t = useT();
  const qc = useQueryClient();
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);
  const setExposedBulk = useWorkflowStore((s) => s.setExposedBulk);

  const [editing, setEditing] = useState<PresetSummary | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const presets = useQuery({ queryKey: ['presets'], queryFn: fetchPresets });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/presets/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`delete → ${r.status}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presets'] }),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { id: string; name: string; description: string }) => {
      const r = await fetch(`/api/presets/${input.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.name, description: input.description }),
      });
      if (!r.ok) throw new Error(`update → ${r.status}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['presets'] });
      setEditing(null);
    },
  });

  async function load(id: string) {
    const p = await fetchPreset(id);
    setWorkflow(p.workflow, p.workflowName);
    setExposedBulk(p.exposed);
    usePanelStore.setState({
      values: p.values,
      seedControls: p.seedControls,
      nodeOrder: p.nodeOrder ?? [],
      nodeColors: p.nodeColors ?? {},
      promptTargets: p.promptTargets ?? [],
    });
  }

  if (presets.isLoading) {
    return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;
  }
  if (presets.error) {
    return (
      <div className="text-sm text-destructive font-mono">
        {(presets.error as Error).message}
      </div>
    );
  }
  if (!presets.data || presets.data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t('presets.empty')}{' '}
          <Link href="/panel" className="underline hover:text-foreground">
            {t('presets.openPanel')}
          </Link>
          .
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {presets.data.map((p) => (
          <Card key={p.id}>
            <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{p.name}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {p.exposedCount} {t('panel.inputs')}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {p.nodeCount} {t('panel.nodes')}
                  </Badge>
                  {p.workflowName && (
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {p.workflowName}
                    </Badge>
                  )}
                </div>
                {p.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {p.description}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {t('presets.updatedAt')} {formatDate(p.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" onClick={() => load(p.id)}>
                  <Play className="size-3" />
                  {t('presets.itemLoad')}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditing(p);
                    setName(p.name);
                    setDescription(p.description ?? '');
                  }}
                  title={t('presets.itemRename')}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(t('presets.deleteConfirm', { name: p.name })))
                      deleteMutation.mutate(p.id);
                  }}
                  title={t('presets.itemDelete')}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('presets.dialogEditTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ed-name">{t('presets.dialogName')}</Label>
              <Input
                id="ed-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-desc">{t('presets.dialogDescription')}</Label>
              <Textarea
                id="ed-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                {t('presets.cancel')}
              </Button>
              <Button
                onClick={() =>
                  editing &&
                  updateMutation.mutate({ id: editing.id, name, description })
                }
                disabled={!name.trim() || updateMutation.isPending}
              >
                {t('presets.saveBtn')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
