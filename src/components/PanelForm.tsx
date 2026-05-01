'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Columns2, Columns3, Square, Link2, Link2Off } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useWorkflowStore } from '@/store/workflow';
import { usePanelStore, type SeedControl, type ColumnCount } from '@/store/panel';
import { cn } from '@/lib/utils';
import { useT } from '@/store/i18n';
import { exposedKey, isLink } from '@/lib/workflow/types';
import { nodeTitle } from '@/lib/workflow/parse';
import { buildWorkflow, getCurrentValue } from '@/lib/workflow/build';
import {
  normalizeSpec,
  isSeedInput,
  type WidgetSpec,
} from '@/lib/widgets/spec';
import type { ObjectInfo } from '@/lib/comfy/types';
import { FieldRow } from './widgets/common';
import { IntInput } from './widgets/IntInput';
import { FloatInput } from './widgets/FloatInput';
import { StringInput } from './widgets/StringInput';
import { BoolInput } from './widgets/BoolInput';
import { ComboInput } from './widgets/ComboInput';
import { SeedInput } from './widgets/SeedInput';
import { RunPanel } from './RunPanel';
import { PresetMenu } from './PresetMenu';
import { SortableNodeCard } from './SortableNodeCard';

async function fetchObjectInfo(): Promise<ObjectInfo> {
  const r = await fetch('/api/comfy/object_info');
  if (!r.ok) throw new Error(`object_info → ${r.status}`);
  return r.json();
}

export function PanelForm() {
  const t = useT();
  const workflow = useWorkflowStore((s) => s.workflow);
  const exposed = useWorkflowStore((s) => s.exposed);
  const values = usePanelStore((s) => s.values);
  const setValue = usePanelStore((s) => s.setValue);
  const seedControls = usePanelStore((s) => s.seedControls);
  const setSeedControl = usePanelStore((s) => s.setSeedControl);
  const resetValues = usePanelStore((s) => s.resetValues);
  const nodeOrder = usePanelStore((s) => s.nodeOrder);
  const setNodeOrder = usePanelStore((s) => s.setNodeOrder);
  const nodeColors = usePanelStore((s) => s.nodeColors);
  const setNodeColor = usePanelStore((s) => s.setNodeColor);
  const resetLayout = usePanelStore((s) => s.resetLayout);
  const columns = usePanelStore((s) => s.columns);
  const setColumns = usePanelStore((s) => s.setColumns);
  const promptTargets = usePanelStore((s) => s.promptTargets);
  const togglePromptTarget = usePanelStore((s) => s.togglePromptTarget);

  const [showJson, setShowJson] = useState(false);

  const { data: objectInfo, isLoading: oiLoading } = useQuery({
    queryKey: ['object_info'],
    queryFn: fetchObjectInfo,
    staleTime: 60_000,
  });

  const groups = useMemo(() => {
    if (!workflow) return [];
    const byNode = new Map<string, string[]>();
    for (const k of exposed) {
      const [nodeId, inputName] = k.split('::');
      if (!nodeId || !inputName) continue;
      if (!workflow[nodeId]) continue;
      if (isLink(workflow[nodeId].inputs[inputName])) continue;
      if (!byNode.has(nodeId)) byNode.set(nodeId, []);
      byNode.get(nodeId)!.push(inputName);
    }
    return [...byNode.entries()].sort((a, b) => {
      const na = parseInt(a[0], 10);
      const nb = parseInt(b[0], 10);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a[0].localeCompare(b[0]);
    });
  }, [workflow, exposed]);

  // Финальный порядок: сначала сохранённый, потом новые ноды в естественном порядке.
  const orderedGroups = useMemo(() => {
    const map = new Map(groups);
    const seen = new Set<string>();
    const out: [string, string[]][] = [];
    for (const id of nodeOrder) {
      if (map.has(id) && !seen.has(id)) {
        out.push([id, map.get(id)!]);
        seen.add(id);
      }
    }
    for (const [id, inputs] of groups) {
      if (!seen.has(id)) {
        out.push([id, inputs]);
        seen.add(id);
      }
    }
    return out;
  }, [groups, nodeOrder]);

  const finalWorkflow = useMemo(() => {
    if (!workflow) return null;
    return buildWorkflow(workflow, values);
  }, [workflow, values]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedGroups.map(([id]) => id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    setNodeOrder(arrayMove(ids, oldIndex, newIndex));
  }

  if (!workflow) return null;

  const orderedIds = orderedGroups.map(([id]) => id);

  return (
    <div className="space-y-6">
      <RunPanel objectInfo={objectInfo} />

      <div className="flex items-center gap-2 flex-wrap">
        <PresetMenu />
        <Button variant="outline" onClick={() => setShowJson((v) => !v)}>
          {showJson ? t('panel.hideJson') : t('panel.showJson')}
        </Button>
        <Button variant="ghost" onClick={() => resetValues()}>
          {t('panel.resetValues')}
        </Button>
        <Button variant="ghost" onClick={() => resetLayout()}>
          {t('panel.resetLayout')}
        </Button>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5">
          {([1, 2, 3] as ColumnCount[]).map((n) => {
            const Icon = n === 1 ? Square : n === 2 ? Columns2 : Columns3;
            return (
              <Button
                key={n}
                size="sm"
                variant={columns === n ? 'default' : 'ghost'}
                className="h-7 px-2"
                onClick={() => setColumns(n)}
                title={t(`panel.columns${n}`)}
              >
                <Icon className="size-4" />
              </Button>
            );
          })}
        </div>
        <span className="text-sm text-muted-foreground">
          {exposed.length} {t('panel.inputs')} · {orderedGroups.length} {t('panel.nodes')}
        </span>
      </div>

      {oiLoading && (
        <div className="text-sm text-muted-foreground">
          {t('panel.loadingSchema')}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedIds} strategy={rectSortingStrategy}>
          <div
            className={cn(
              'grid gap-4 items-start',
              columns === 1 && 'grid-cols-1',
              columns === 2 && 'grid-cols-1 lg:grid-cols-2',
              columns === 3 && 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
            )}
          >
            {orderedGroups.map(([nodeId, inputs]) => {
              const node = workflow[nodeId];
              const schema = objectInfo?.[node.class_type];
              const allSpecs = {
                ...(schema?.input.required ?? {}),
                ...(schema?.input.optional ?? {}),
              };
              const color = nodeColors[nodeId] ?? 'default';

              return (
                <SortableNodeCard
                  key={nodeId}
                  id={nodeId}
                  title={nodeTitle(nodeId, node)}
                  classType={node.class_type}
                  category={schema?.category}
                  color={color}
                  onColorChange={(c) => setNodeColor(nodeId, c)}
                >
                  {inputs.map((inputName) => {
                    const key = exposedKey(nodeId, inputName);
                    const spec: WidgetSpec = normalizeSpec(allSpecs[inputName]);
                    const current = getCurrentValue(workflow, values, nodeId, inputName);
                    const fieldId = `f-${nodeId}-${inputName}`;
                    const isStringField = spec.kind === 'string';
                    const isPromptTarget =
                      isStringField && promptTargets.includes(key);
                    return (
                      <FieldRow
                        key={inputName}
                        id={fieldId}
                        label={inputName}
                        hint={'tooltip' in spec ? spec.tooltip : undefined}
                        badge={
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {specBadge(spec)}
                          </Badge>
                        }
                        trailing={
                          isStringField ? (
                            <button
                              type="button"
                              onClick={() => togglePromptTarget(key)}
                              className={cn(
                                'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                                isPromptTarget
                                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted',
                              )}
                              title={
                                isPromptTarget
                                  ? t('pb.receivingFromBuilder')
                                  : t('pb.receiveFromBuilder')
                              }
                            >
                              {isPromptTarget ? (
                                <Link2 className="size-3" />
                              ) : (
                                <Link2Off className="size-3" />
                              )}
                              {isPromptTarget
                                ? t('pb.receivingFromBuilder')
                                : t('pb.receiveFromBuilder')}
                            </button>
                          ) : undefined
                        }
                      >
                        {renderWidget({
                          fieldId,
                          spec,
                          value: current,
                          onChange: (v) => setValue(key, v),
                          seedKey: key,
                          seedControl: seedControls[key] ?? 'randomize',
                          onSeedControlChange: (c) => setSeedControl(key, c),
                          inputName,
                          readOnly: isPromptTarget,
                        })}
                      </FieldRow>
                    );
                  })}
                </SortableNodeCard>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {showJson && finalWorkflow && (
        <Card>
          <CardHeader>
            <CardTitle>{t('panel.finalWorkflow')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Separator className="mb-3" />
            <pre className="text-[11px] font-mono bg-muted/50 rounded p-3 overflow-auto max-h-[480px]">
              {JSON.stringify(finalWorkflow, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function specBadge(spec: WidgetSpec): string {
  switch (spec.kind) {
    case 'combo':
      return `COMBO(${spec.options.length})`;
    case 'int':
      return 'INT';
    case 'float':
      return 'FLOAT';
    case 'string':
      return spec.multiline ? 'STRING+' : 'STRING';
    case 'boolean':
      return 'BOOL';
    case 'link':
      return spec.linkType;
    case 'unknown':
      return spec.raw;
  }
}

function renderWidget({
  fieldId,
  spec,
  value,
  onChange,
  seedKey,
  seedControl,
  onSeedControlChange,
  inputName,
  readOnly,
}: {
  fieldId: string;
  spec: WidgetSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  seedKey: string;
  seedControl: SeedControl;
  onSeedControlChange: (c: SeedControl) => void;
  inputName: string;
  readOnly?: boolean;
}) {
  void seedKey;
  switch (spec.kind) {
    case 'int': {
      if (isSeedInput(inputName, spec)) {
        return (
          <SeedInput
            id={fieldId}
            value={asNumber(value, spec.default ?? 0)}
            onChange={(v) => onChange(v)}
            control={seedControl}
            onControlChange={onSeedControlChange}
          />
        );
      }
      return (
        <IntInput
          id={fieldId}
          spec={spec}
          value={asNumber(value, spec.default ?? 0)}
          onChange={(v) => onChange(v)}
        />
      );
    }
    case 'float':
      return (
        <FloatInput
          id={fieldId}
          spec={spec}
          value={asNumber(value, spec.default ?? 0)}
          onChange={(v) => onChange(v)}
        />
      );
    case 'string':
      return (
        <StringInput
          id={fieldId}
          spec={spec}
          value={asString(value, spec.default ?? '')}
          onChange={(v) => onChange(v)}
          readOnly={readOnly}
        />
      );
    case 'boolean':
      return (
        <BoolInput
          id={fieldId}
          value={asBool(value, spec.default ?? false)}
          onChange={(v) => onChange(v)}
        />
      );
    case 'combo':
      return (
        <ComboInput
          id={fieldId}
          spec={spec}
          value={asString(value, spec.default ?? '')}
          onChange={(v) => onChange(v)}
        />
      );
    case 'link':
      return (
        <div className="text-xs text-muted-foreground">
          Link to another node ({spec.linkType}) — not editable here.
        </div>
      );
    case 'unknown':
      return (
        <div className="text-xs text-muted-foreground font-mono">
          Unknown type: {spec.raw}. Current value: {JSON.stringify(value)}
        </div>
      );
  }
}

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
function asString(v: unknown, fallback: string): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}
function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true';
  return fallback;
}
