'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play, Square, Image as ImageIcon, ChevronDown, ChevronUp, Filter, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ImageLightbox, useLightbox, type LightboxImage } from './ImageLightbox';
import { useWorkflowStore } from '@/store/workflow';
import { usePanelStore, type SeedControl } from '@/store/panel';
import { useRunStore, comfyImageUrl, type Run } from '@/store/run';
import { useRunAction } from '@/store/run-action';
import { exposedKey, isLink } from '@/lib/workflow/types';
import { nodeTitle } from '@/lib/workflow/parse';
import { buildWorkflow } from '@/lib/workflow/build';
import { isSeedInput, normalizeSpec } from '@/lib/widgets/spec';
import type { ObjectInfo } from '@/lib/comfy/types';
import { PreviewWindow } from './PreviewWindow';
import { PromptBuilderToggle } from './PromptBuilder';
import { SoundSelector } from './SoundSelector';
import { playSound } from '@/lib/sounds';
import { useT } from '@/store/i18n';
import { usePromptBuilder, buildPromptFromTags } from '@/store/prompt-builder';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import type { PromptLibrary, Tag } from '@/lib/prompts/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const MAX_SEED = 0xffffffff;

function nextSeed(current: number, control: SeedControl): number {
  switch (control) {
    case 'fixed':
      return current;
    case 'randomize':
      return Math.floor(Math.random() * MAX_SEED);
    case 'increment':
      return Math.min(MAX_SEED, (current ?? 0) + 1);
    case 'decrement':
      return Math.max(0, (current ?? 0) - 1);
  }
}

export function RunPanel({ objectInfo }: { objectInfo: ObjectInfo | undefined }) {
  const t = useT();
  const workflow = useWorkflowStore((s) => s.workflow);
  const exposed = useWorkflowStore((s) => s.exposed);
  const values = usePanelStore((s) => s.values);
  const setValue = usePanelStore((s) => s.setValue);
  const seedControls = usePanelStore((s) => s.seedControls);

  const ensureConnected = useRunStore((s) => s.ensureConnected);
  const queuePrompt = useRunStore((s) => s.queuePrompt);
  const interrupt = useRunStore((s) => s.interrupt);
  const interruptQueue = useRunStore((s) => s.interruptQueue);
  const wsStatus = useRunStore((s) => s.wsStatus);
  const queueRemaining = useRunStore((s) => s.queueRemaining);
  const runs = useRunStore((s) => s.runs);
  const currentPromptId = useRunStore((s) => s.currentPromptId);
  const wsTextCount = useRunStore((s) => s.wsTextCount);
  const wsBinaryCount = useRunStore((s) => s.wsBinaryCount);
  const lastBinaryDecoded = useRunStore((s) => s.lastBinaryDecoded);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const promptTargets = usePanelStore((s) => s.promptTargets);
  const applyAutoModes = usePromptBuilder((s) => s.applyAutoModes);
  const builderPrefix = usePromptBuilder((s) => s.prefix);
  const builderSuffix = usePromptBuilder((s) => s.suffix);
  const builderCustomText = usePromptBuilder((s) => s.customText);
  const qc = useQueryClient();

  useEffect(() => {
    ensureConnected();
  }, [ensureConnected]);

  // Play a sound when a run transitions from active → success/error.
  const soundOnFinish = usePanelStore((s) => s.soundOnFinish);
  const lastStatusRef = useRef<Map<string, string>>(new Map());
  // Initialize snapshot once so we don't fire for already-finished persisted runs.
  const initialisedRef = useRef(false);
  useEffect(() => {
    if (!initialisedRef.current) {
      initialisedRef.current = true;
      for (const r of runs) lastStatusRef.current.set(r.promptId, r.status);
      return;
    }
    for (const r of runs) {
      const prev = lastStatusRef.current.get(r.promptId);
      lastStatusRef.current.set(r.promptId, r.status);
      if (!prev) continue;
      const wasActive = prev === 'queued' || prev === 'running';
      const nowFinished = r.status === 'success' || r.status === 'error';
      if (wasActive && nowFinished) {
        playSound(soundOnFinish);
      }
    }
  }, [runs, soundOnFinish]);

  const currentRun =
    runs.find((r) => r.promptId === currentPromptId) ?? runs[0] ?? null;
  const isRunning =
    currentRun &&
    (currentRun.status === 'queued' || currentRun.status === 'running');

  async function onRun() {
    if (!workflow) return;
    setSubmitError(null);
    setBusy(true);
    const total = Math.max(1, Math.min(100, Math.floor(batchCount) || 1));
    try {
      // Локально перетасовываем сиды между запусками, чтобы шарить
      // изменения только в локальной копии перед отправкой.
      const localValues: Record<string, unknown> = { ...values };

      for (let i = 0; i < total; i++) {
        // Iterate / random: pull next tag for active groups before each run.
        const lib = qc.getQueryData(['prompt-library']) as PromptLibrary | undefined;
        if (lib) applyAutoModes(lib);

        // Re-read the latest selected tags after applyAutoModes mutated them.
        const ids = usePromptBuilder.getState().selectedTagIds;
        let labels: string[] = [];
        if (lib) {
          const allTags = new Map<string, Tag>();
          for (const c of lib.categories)
            for (const s of c.subcategories)
              for (const tg of s.tags) allTags.set(tg.id, tg);
          const resolved = ids
            .map((id) => allTags.get(id))
            .filter((x): x is Tag => !!x);
          labels = resolved.map((tg) => tg.label);
          if (promptTargets.length > 0) {
            const finalPrompt = buildPromptFromTags(
              resolved.map((tg) => tg.value),
              builderPrefix,
              builderSuffix,
              builderCustomText,
            );
            for (const k of promptTargets) localValues[k] = finalPrompt;
          }
        }

        const built = buildWorkflow(workflow, localValues);
        const idsForRun = usePromptBuilder.getState().selectedTagIds.slice();
        await queuePrompt(built, { builderTags: labels, builderTagIds: idsForRun });

        if (!objectInfo) continue;
        for (const k of exposed) {
          const [nodeId, inputName] = k.split('::');
          const node = workflow[nodeId];
          if (!node) continue;
          const raw = node.inputs[inputName];
          if (isLink(raw)) continue;
          const schema = objectInfo[node.class_type];
          const allSpecs = {
            ...(schema?.input.required ?? {}),
            ...(schema?.input.optional ?? {}),
          };
          const spec = normalizeSpec(allSpecs[inputName]);
          if (spec.kind !== 'int' || !isSeedInput(inputName, spec)) continue;
          const ctrl = seedControls[k] ?? 'randomize';
          const cur =
            typeof localValues[k] === 'number'
              ? (localValues[k] as number)
              : typeof raw === 'number'
              ? raw
              : 0;
          const next = nextSeed(cur, ctrl);
          localValues[k] = next;
          // Финальное значение в стор после последнего запуска,
          // чтобы UI отразил «следующий» seed.
          if (i === total - 1) setValue(k, next);
        }
      }
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const setRun = useRunAction((s) => s.setRun);
  const setRunBusy = useRunAction((s) => s.setBusy);
  const setCanRun = useRunAction((s) => s.setCanRun);
  useEffect(() => {
    setRun(onRun);
    return () => setRun(null);
  });
  useEffect(() => {
    setRunBusy(busy);
  }, [busy, setRunBusy]);
  useEffect(() => {
    setCanRun(!!workflow);
  }, [workflow, setCanRun]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            onClick={onRun}
            disabled={!workflow || busy}
            className="min-w-32"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('panel.sending')}
              </>
            ) : isRunning ? (
              <>
                <Play className="size-4" />
                {t('panel.runMore')}
              </>
            ) : (
              <>
                <Play className="size-4" />
                {t('panel.run')}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => (queueRemaining > 1 ? interruptQueue() : interrupt())}
            disabled={!isRunning && queueRemaining === 0}
          >
            <Square className="size-4" />
            {queueRemaining > 1
              ? `${t('panel.interrupt')} (${queueRemaining})`
              : t('panel.interrupt')}
          </Button>
          <label
            className="flex items-center gap-2 text-xs text-muted-foreground"
            title={t('panel.batchHint')}
          >
            <span>{t('panel.batchCount')}:</span>
            <Input
              type="number"
              min={1}
              max={100}
              value={batchCount}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setBatchCount(Math.max(1, Math.min(100, n)));
                else if (e.target.value === '') setBatchCount(1);
              }}
              className="w-16 h-9 font-mono text-sm"
            />
          </label>
          <div className="flex items-center gap-2 ml-1">
            <Badge
              variant={
                wsStatus === 'open'
                  ? 'default'
                  : wsStatus === 'connecting'
                  ? 'secondary'
                  : 'destructive'
              }
            >
              ws: {wsStatus}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              {t('panel.queueComfy')} {queueRemaining}
            </Badge>
            <Badge
              variant={
                wsBinaryCount === 0
                  ? 'outline'
                  : lastBinaryDecoded
                  ? 'default'
                  : 'destructive'
              }
              className="font-mono text-xs"
              title={
                wsBinaryCount === 0
                  ? 'Comfy is not sending binary previews — enable Image Preview Method'
                  : lastBinaryDecoded
                  ? 'Previews are received and decoded'
                  : 'Binary messages received but cannot decode — check console (F12)'
              }
            >
              ws: {wsTextCount} text · {wsBinaryCount} bin
            </Badge>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <SoundSelector />
            <PromptBuilderToggle />
            <PreviewWindow />
          </div>
        </CardContent>
      </Card>

      {submitError && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 text-sm font-mono whitespace-pre-wrap text-destructive">
            {submitError}
          </CardContent>
        </Card>
      )}

      {runs.length > 1 && <QueueStrip runs={runs} />}

      {currentRun && (
        <RunCard run={currentRun} workflow={workflow} objectInfo={objectInfo} />
      )}

      {runs.length > 1 && (
        <RunHistory runs={runs} workflow={workflow} objectInfo={objectInfo} />
      )}
    </div>
  );
}

function QueueStrip({ runs }: { runs: Run[] }) {
  const t = useT();
  // Order chronologically: oldest queued (back of queue) → newest (right) feels
  // backwards. Show oldest first on the left so user reads "what's in line".
  const ordered = useMemo(() => [...runs].reverse(), [runs]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      queued: 0,
      running: 0,
      success: 0,
      error: 0,
      cancelled: 0,
    };
    for (const r of runs) c[r.status]++;
    return c;
  }, [runs]);

  function scrollToRun(promptId: string) {
    const el = document.getElementById(`run-${promptId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary');
      setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 1200);
    }
  }

  return (
    <Card>
      <CardContent className="py-2.5 px-3 space-y-1.5">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider">
            {t('run.queueStrip')}
          </span>
          <span className="font-mono">{runs.length}</span>
          {counts.running > 0 && (
            <span className="font-mono text-blue-500">▶ {counts.running}</span>
          )}
          {counts.queued > 0 && (
            <span className="font-mono text-muted-foreground">
              ◷ {counts.queued}
            </span>
          )}
          {counts.success > 0 && (
            <span className="font-mono text-emerald-500">✓ {counts.success}</span>
          )}
          {counts.error > 0 && (
            <span className="font-mono text-destructive">✕ {counts.error}</span>
          )}
          {counts.cancelled > 0 && (
            <span className="font-mono text-muted-foreground/70">
              ⊘ {counts.cancelled}
            </span>
          )}
          <span className="ml-auto text-muted-foreground/60">
            {t('run.queueStripHint')}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {ordered.map((r) => {
            const cls =
              r.status === 'running'
                ? 'bg-blue-500 animate-pulse'
                : r.status === 'queued'
                ? 'bg-muted-foreground/30'
                : r.status === 'success'
                ? 'bg-emerald-500'
                : r.status === 'error'
                ? 'bg-destructive'
                : 'bg-muted-foreground/20'; // cancelled
            const tagSummary =
              r.builderTags && r.builderTags.length > 0
                ? r.builderTags.join(', ')
                : r.promptId.slice(0, 8);
            return (
              <button
                key={r.promptId}
                type="button"
                onClick={() => scrollToRun(r.promptId)}
                title={`${r.status} · ${tagSummary}`}
                className={cn(
                  'size-4 rounded-sm transition-transform hover:scale-125 cursor-pointer',
                  cls,
                )}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RunHistory({
  runs,
  workflow,
  objectInfo,
}: {
  runs: Run[];
  workflow: ReturnType<typeof useWorkflowStore.getState>['workflow'];
  objectInfo: ObjectInfo | undefined;
}) {
  const t = useT();
  // Auto-collapse for big batches so 50+ runs don't render full cards on mount.
  const [open, setOpen] = useState(runs.length - 1 <= 5);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
        {t('run.history')} ({runs.length - 1})
      </summary>
      <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {runs.slice(1).map((r) => (
          <RunCard
            key={r.promptId}
            run={r}
            workflow={workflow}
            objectInfo={objectInfo}
            compact
          />
        ))}
      </div>
    </details>
  );
}

function RunCard({
  run,
  workflow,
  objectInfo,
  compact,
}: {
  run: Run;
  workflow: ReturnType<typeof useWorkflowStore.getState>['workflow'];
  objectInfo: ObjectInfo | undefined;
  compact?: boolean;
}) {
  const t = useT();
  const lightbox = useLightbox();
  const [outputsOpen, setOutputsOpen] = useState(true);
  const outputFilters = usePanelStore((s) => s.outputFilters);
  const toggleOutputFilter = usePanelStore((s) => s.toggleOutputFilter);
  const setOutputFilters = usePanelStore((s) => s.setOutputFilters);
  const interruptOne = useRunStore((s) => s.interruptOne);
  const isActive = run.status === 'queued' || run.status === 'running';
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);

  const sources = useMemo(() => {
    const map = new Map<string, { count: number; classType: string; title: string }>();
    for (const o of run.outputs) {
      const node = workflow?.[o.nodeId];
      const classType = node?.class_type ?? '';
      const title = node ? nodeTitle(o.nodeId, node) : `#${o.nodeId}`;
      const cur = map.get(o.nodeId);
      if (cur) cur.count++;
      else map.set(o.nodeId, { count: 1, classType, title });
    }
    return [...map.entries()].sort((a, b) => {
      const na = parseInt(a[0], 10);
      const nb = parseInt(b[0], 10);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a[0].localeCompare(b[0]);
    });
  }, [run.outputs, workflow]);

  const filteredOutputs = useMemo(() => {
    if (outputFilters.length === 0) return run.outputs;
    return run.outputs.filter((o) => outputFilters.includes(o.nodeId));
  }, [run.outputs, outputFilters]);

  const lightboxImages: LightboxImage[] = filteredOutputs.map((o) => ({
    src: comfyImageUrl(o.filename, o.subfolder, o.type),
    alt: o.filename,
    caption: `#${o.nodeId} · ${o.filename}`,
    download: o.filename,
  }));
  const pct = run.progress
    ? Math.round((run.progress.value / Math.max(1, run.progress.max)) * 100)
    : null;

  const elapsed = (run.finishedAt ?? Date.now()) - run.startedAt;

  const nodeLabel = useMemo(() => {
    const id = run.executingNode ?? run.progress?.nodeId ?? run.error?.nodeId;
    if (!id || !workflow?.[id]) return id ?? null;
    const node = workflow[id];
    const cat = objectInfo?.[node.class_type]?.category;
    return `#${id} · ${nodeTitle(id, node)}${cat ? ` · ${cat}` : ''}`;
  }, [run, workflow, objectInfo]);

  const statusBadge = (() => {
    switch (run.status) {
      case 'queued':
        return <Badge variant="secondary">{t('run.queued')}</Badge>;
      case 'running':
        return (
          <Badge>
            <Loader2 className="size-3 animate-spin" /> {t('run.running')}
          </Badge>
        );
      case 'success':
        return <Badge className="bg-emerald-600 hover:bg-emerald-600">{t('run.success')}</Badge>;
      case 'error':
        return <Badge variant="destructive">{t('run.error')}</Badge>;
      case 'cancelled':
        return <Badge variant="outline">{t('run.cancelled')}</Badge>;
    }
  })();

  return (
    <Card id={`run-${run.promptId}`} className="scroll-mt-4 transition-shadow">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 flex-wrap text-sm">
          {statusBadge}
          <span className="font-mono text-[11px] text-muted-foreground">
            {run.promptId.slice(0, 8)}
          </span>
          <span className="text-muted-foreground font-normal">
            · {(elapsed / 1000).toFixed(1)}s
          </span>
          {run.cachedNodes.length > 0 && (
            <span className="text-muted-foreground font-normal">
              · {run.cachedNodes.length} {t('run.cached')}
            </span>
          )}
          <span
            className={cn(
              'text-xs font-normal truncate max-w-[280px]',
              run.builderTags && run.builderTags.length > 0
                ? 'text-foreground/80'
                : 'text-muted-foreground/50',
            )}
            title={run.builderTags?.join(', ')}
          >
            {run.builderTags && run.builderTags.length > 0
              ? `· ${run.builderTags.join(', ')}`
              : '· null'}
          </span>
          {isActive && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 ml-auto"
              onClick={() => interruptOne(run.promptId)}
              title={t('panel.interrupt')}
            >
              <Square className="size-3" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {nodeLabel && run.status === 'running' && (
          <div className="text-sm font-mono text-muted-foreground truncate">
            {nodeLabel}
          </div>
        )}

        {pct !== null && (
          <div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1 font-mono">
              {run.progress!.value} / {run.progress!.max}
            </div>
          </div>
        )}

        {run.error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-1 text-xs font-mono">
            <div className="font-semibold text-destructive">
              {run.error.type}: {run.error.message}
            </div>
            <div className="text-muted-foreground">
              at node #{run.error.nodeId} ({run.error.nodeType})
            </div>
            {run.error.traceback.length > 0 && (
              <details>
                <summary className="cursor-pointer text-muted-foreground">
                  traceback
                </summary>
                <pre className="text-[10px] mt-1 whitespace-pre-wrap opacity-70">
                  {run.error.traceback.join('')}
                </pre>
              </details>
            )}
          </div>
        )}

        {run.preview && run.status === 'running' && (
          <div className="rounded-md overflow-hidden border border-border/60 bg-muted/30">
            <img
              src={run.preview}
              alt="preview"
              className="w-full h-auto max-h-[420px] object-contain"
            />
            <div className="text-[10px] px-2 py-1 text-muted-foreground bg-background/60 flex items-center gap-1">
              <ImageIcon className="size-3" />
              {t('run.livePreview')}
            </div>
          </div>
        )}

        {run.outputs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setOutputsOpen((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium hover:text-foreground text-muted-foreground transition-colors"
              >
                {outputsOpen ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
                <span>
                  {t('panel.outputsTitle')}{' '}
                  <span className="text-muted-foreground/70 font-normal">
                    ({filteredOutputs.length}
                    {filteredOutputs.length !== run.outputs.length
                      ? `/${run.outputs.length}`
                      : ''}
                    )
                  </span>
                </span>
              </button>
              {sources.length > 1 && (
                <div className="ml-auto relative">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setFilterPopoverOpen((v) => !v)}
                  >
                    <Filter className="size-3" />
                    {outputFilters.length === 0
                      ? t('panel.outputSourceAll')
                      : `${outputFilters.length}/${sources.length}`}
                  </Button>
                  {filterPopoverOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setFilterPopoverOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-40 w-[280px] rounded-md border border-border bg-popover shadow-md p-2 space-y-1">
                        <div className="flex items-center gap-2 pb-1 mb-1 border-b border-border/40">
                          <button
                            type="button"
                            className="text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() => setOutputFilters([])}
                          >
                            {t('panel.outputSourceAll')}
                          </button>
                          <span className="text-muted-foreground/40">·</span>
                          <button
                            type="button"
                            className="text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              setOutputFilters(sources.map(([id]) => id))
                            }
                          >
                            {t('panel.outputSourceNone')}
                          </button>
                        </div>
                        {sources.map(([nodeId, info]) => {
                          const checked =
                            outputFilters.length === 0 ||
                            outputFilters.includes(nodeId);
                          return (
                            <label
                              key={nodeId}
                              className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => {
                                  if (outputFilters.length === 0) {
                                    // moving from "show all" to explicit list — show all except this
                                    setOutputFilters(
                                      sources
                                        .map(([id]) => id)
                                        .filter((id) => id !== nodeId),
                                    );
                                  } else {
                                    toggleOutputFilter(nodeId);
                                  }
                                }}
                              />
                              <span className="text-xs font-mono flex-1 min-w-0 truncate">
                                #{nodeId} {info.title || info.classType}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {info.count}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
              <span
                className={`text-xs text-muted-foreground ${sources.length > 1 ? '' : 'ml-auto'}`}
              >
                {outputsOpen ? t('panel.outputsCollapse') : t('panel.outputsExpand')}
              </span>
            </div>
            {outputsOpen && (
              <div
                className={
                  compact
                    ? 'grid grid-cols-3 gap-2'
                    : 'grid grid-cols-2 sm:grid-cols-3 gap-2'
                }
              >
                {filteredOutputs.map((o, i) => (
                  <div
                    key={`${o.nodeId}:${o.subfolder}:${o.filename}:${o.type}`}
                    className="relative rounded-md overflow-hidden border border-border/60 group"
                  >
                    <button
                      type="button"
                      onClick={() => lightbox.open(i)}
                      className="block w-full text-left cursor-zoom-in"
                    >
                      <img
                        src={comfyImageUrl(o.filename, o.subfolder, o.type)}
                        alt={o.filename}
                        className="w-full h-auto max-h-[260px] object-contain bg-muted/30 group-hover:opacity-90 transition-opacity"
                      />
                      <div className="text-[10px] px-2 py-1 text-muted-foreground truncate font-mono">
                        #{o.nodeId} · {o.filename}
                      </div>
                    </button>
                    {run.builderTagIds && run.builderTagIds.length > 0 && (
                      <BindPreviewButton
                        imageSrc={comfyImageUrl(
                          o.filename,
                          o.subfolder,
                          o.type,
                        )}
                        tagIds={run.builderTagIds}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <ImageLightbox
          images={lightboxImages}
          index={lightbox.index}
          onIndexChange={lightbox.setIndex}
          onClose={lightbox.close}
        />
      </CardContent>
    </Card>
  );
}

const PROMPT_LIB_KEY = ['prompt-library'];

async function fetchPromptLibrary(): Promise<PromptLibrary> {
  const r = await fetch('/api/prompts');
  if (!r.ok) throw new Error(`prompts → ${r.status}`);
  return r.json();
}

async function savePromptLibrary(lib: PromptLibrary) {
  const r = await fetch('/api/prompts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lib),
  });
  if (!r.ok) throw new Error(`save prompts → ${r.status}: ${await r.text()}`);
}

function BindPreviewButton({
  imageSrc,
  tagIds,
}: {
  imageSrc: string;
  tagIds: string[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="absolute top-1 right-1 size-7 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
        onClick={() => setOpen(true)}
        title={t('run.bindPreview')}
      >
        <ImagePlus className="size-3.5" />
      </Button>
      {open && (
        <BindPreviewDialog
          imageSrc={imageSrc}
          tagIds={tagIds}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function BindPreviewDialog({
  imageSrc,
  tagIds,
  onClose,
}: {
  imageSrc: string;
  tagIds: string[];
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { data: library } = useQuery({
    queryKey: PROMPT_LIB_KEY,
    queryFn: fetchPromptLibrary,
    staleTime: 30_000,
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: savePromptLibrary,
    onSuccess: () => qc.invalidateQueries({ queryKey: PROMPT_LIB_KEY }),
  });

  const knownTags = useMemo(() => {
    if (!library) return [] as Tag[];
    const all = new Map<string, Tag>();
    for (const c of library.categories)
      for (const s of c.subcategories)
        for (const tg of s.tags) all.set(tg.id, tg);
    return tagIds
      .map((id) => all.get(id))
      .filter((x): x is Tag => !!x);
  }, [library, tagIds]);

  async function bind(tagId: string, src: string | undefined) {
    if (!library) return;
    setSaving(tagId);
    const next: PromptLibrary = {
      ...library,
      categories: library.categories.map((c) => ({
        ...c,
        subcategories: c.subcategories.map((s) => ({
          ...s,
          tags: s.tags.map((tg) =>
            tg.id === tagId ? { ...tg, previewSrc: src } : tg,
          ),
        })),
      })),
    };
    qc.setQueryData(PROMPT_LIB_KEY, next);
    try {
      await mutation.mutateAsync(next);
      setSavedId(tagId);
      setTimeout(() => setSavedId(null), 1200);
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!sm:max-w-lg !max-w-[min(560px,calc(100%-2rem))] !gap-0 !p-0 max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border/60">
          <DialogTitle className="pr-8">{t('run.bindPreviewTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-4 py-3 border-b border-border/60">
          <img
            src={imageSrc}
            alt=""
            className="w-full max-h-[200px] object-contain rounded-md border border-border/60 bg-muted/30"
          />
          <p className="text-xs text-muted-foreground">
            {t('run.bindPreviewHelp')}
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
          {knownTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('run.bindPreviewNoTags')}
            </p>
          ) : (
            <div className="space-y-1.5">
              {knownTags.map((tg) => {
                const isCurrent = tg.previewSrc === imageSrc;
                return (
                  <div
                    key={tg.id}
                    className="flex items-center gap-2 rounded-md border border-border/40 px-2 py-1.5"
                  >
                    {tg.previewSrc ? (
                      <img
                        src={tg.previewSrc}
                        alt=""
                        className="size-10 object-cover rounded bg-muted/50 shrink-0"
                      />
                    ) : (
                      <div className="size-10 rounded bg-muted/50 grid place-items-center text-muted-foreground/60 shrink-0">
                        <ImageIcon className="size-4" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {tg.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate font-mono">
                        {tg.value}
                      </div>
                    </div>
                    {savedId === tg.id ? (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 shrink-0">
                        {t('run.bindPreviewSaved')}
                      </span>
                    ) : isCurrent ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs shrink-0"
                        disabled={saving === tg.id}
                        onClick={() => bind(tg.id, undefined)}
                      >
                        {t('run.bindPreviewClear')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        disabled={saving === tg.id}
                        onClick={() => bind(tg.id, imageSrc)}
                      >
                        {saving === tg.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          t('run.bindPreviewSet')
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
