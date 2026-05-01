'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

export function PresetMenu() {
  const t = useT();
  const qc = useQueryClient();
  const workflow = useWorkflowStore((s) => s.workflow);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const exposed = useWorkflowStore((s) => s.exposed);
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);
  const setExposedBulk = useWorkflowStore((s) => s.setExposedBulk);
  const values = usePanelStore((s) => s.values);
  const seedControls = usePanelStore((s) => s.seedControls);
  const nodeOrder = usePanelStore((s) => s.nodeOrder);
  const nodeColors = usePanelStore((s) => s.nodeColors);
  const promptTargets = usePanelStore((s) => s.promptTargets);
  const panelStore = usePanelStore;

  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const presets = useQuery({
    queryKey: ['presets'],
    queryFn: fetchPresets,
    staleTime: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!workflow) throw new Error('Workflow не загружен');
      const r = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          workflow,
          workflowName,
          exposed,
          values,
          seedControls,
          nodeOrder,
          nodeColors,
          promptTargets,
        }),
      });
      if (!r.ok) throw new Error(`save → ${r.status}: ${await r.text()}`);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['presets'] });
      setSaveOpen(false);
      setName('');
      setDescription('');
    },
  });

  async function load(id: string) {
    const p = await fetchPreset(id);
    setWorkflow(p.workflow, p.workflowName);
    setExposedBulk(p.exposed);
    panelStore.setState({
      values: p.values,
      seedControls: p.seedControls,
      nodeOrder: p.nodeOrder ?? [],
      nodeColors: p.nodeColors ?? {},
      promptTargets: p.promptTargets ?? [],
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setName(workflowName || '');
          setSaveOpen(true);
        }}
        disabled={!workflow}
      >
        <Save className="size-4" />
        {t('presets.save')}
      </Button>

      <Select value="" onValueChange={(v) => v && load(v)}>
        <SelectTrigger size="sm" className="w-[220px]">
          <FolderOpen className="size-4" />
          <SelectValue placeholder={t('presets.load')} />
        </SelectTrigger>
        <SelectContent>
          {presets.isLoading && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {t('presets.menuLoading')}
            </div>
          )}
          {presets.data?.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {t('presets.menuEmpty')}
            </div>
          )}
          {presets.data?.map((p) => (
            <SelectItem key={p.id} value={p.id} className="text-sm">
              <div className="flex flex-col items-start">
                <span>{p.name}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {p.exposedCount} {t('panel.inputs')} · {p.nodeCount} {t('panel.nodes')}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('presets.dialogSaveTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="preset-name">{t('presets.dialogName')}</Label>
              <Input
                id="preset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder={t('presets.dialogNamePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preset-desc">{t('presets.dialogDescription')}</Label>
              <Textarea
                id="preset-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('presets.dialogDescriptionPlaceholder')}
                className="min-h-[80px]"
              />
            </div>
            {createMutation.error && (
              <p className="text-sm text-destructive font-mono">
                {(createMutation.error as Error).message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('presets.dialogHint', { n: exposed.length })}
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => setSaveOpen(false)}
                disabled={createMutation.isPending}
              >
                {t('presets.cancel')}
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? t('presets.savingBtn') : t('presets.saveBtn')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
