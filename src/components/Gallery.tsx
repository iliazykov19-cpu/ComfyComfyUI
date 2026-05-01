'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { comfyImageUrl, useRunStore } from '@/store/run';
import { useWorkflowStore } from '@/store/workflow';
import { apiWorkflowSchema } from '@/lib/workflow/types';
import type { ComfyHistory, HistoryEntry } from '@/lib/comfy/types';
import { useT } from '@/store/i18n';
import { ImageLightbox, useLightbox, type LightboxImage } from './ImageLightbox';

async function fetchHistory(max: number): Promise<ComfyHistory> {
  const r = await fetch(`/api/comfy/history?max_items=${max}`);
  if (!r.ok) throw new Error(`history → ${r.status}`);
  return r.json();
}

type Item = {
  promptId: string;
  entry: HistoryEntry;
  number: number;
  classTypes: string[];
  images: Array<{
    nodeId: string;
    filename: string;
    subfolder: string;
    type: string;
  }>;
  isError: boolean;
};

function buildItems(history: ComfyHistory): Item[] {
  const items: Item[] = [];
  for (const [promptId, entry] of Object.entries(history)) {
    const number = (entry.prompt[0] as number) ?? 0;
    const wf = entry.prompt[2] as Record<string, { class_type?: string }>;
    const classTypes = Object.values(wf || {})
      .map((n) => n?.class_type)
      .filter((x): x is string => typeof x === 'string');
    const images: Item['images'] = [];
    for (const [nodeId, out] of Object.entries(entry.outputs ?? {})) {
      for (const img of out.images ?? []) {
        images.push({
          nodeId,
          filename: img.filename,
          subfolder: img.subfolder,
          type: img.type,
        });
      }
    }
    items.push({
      promptId,
      entry,
      number,
      classTypes,
      images,
      isError:
        entry.status?.completed === false ||
        entry.status?.status_str === 'error',
    });
  }
  return items.sort((a, b) => b.number - a.number);
}

export function Gallery() {
  const t = useT();
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);
  const localRuns = useRunStore((s) => s.runs);
  const tagsByPromptId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of localRuns)
      if (r.builderTags && r.builderTags.length) m.set(r.promptId, r.builderTags);
    return m;
  }, [localRuns]);
  const [filter, setFilter] = useState('');
  const [onlySuccess, setOnlySuccess] = useState(false);
  const [withImages, setWithImages] = useState(true);
  const [limit, setLimit] = useState(64);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['gallery-history', limit],
    queryFn: () => fetchHistory(limit),
    staleTime: 5_000,
  });

  const items = useMemo(() => (data ? buildItems(data) : []), [data]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return items.filter((it) => {
      if (onlySuccess && it.isError) return false;
      if (withImages && it.images.length === 0) return false;
      if (q) {
        const hay = `${it.promptId} ${it.classTypes.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, onlySuccess, withImages]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 flex flex-wrap gap-3 items-center">
          <Input
            placeholder={t('gallery.filterPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-md"
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={onlySuccess}
              onCheckedChange={(v) => setOnlySuccess(v === true)}
            />
            {t('gallery.onlySuccess')}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={withImages}
              onCheckedChange={(v) => setWithImages(v === true)}
            />
            {t('gallery.withImages')}
          </label>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground">{t('gallery.show')}</span>
            {[16, 64, 256, 1024].map((n) => (
              <Button
                key={n}
                size="sm"
                variant={limit === n ? 'default' : 'outline'}
                onClick={() => setLimit(n)}
              >
                {n}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? '…' : t('gallery.refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 text-sm text-destructive font-mono">
            {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t('gallery.loading')}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('gallery.empty')}{' '}
            <Link href="/panel" className="underline hover:text-foreground">
              {t('gallery.emptyLink')}
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((it) => (
            <GalleryItemCard
              key={it.promptId}
              item={it}
              builderTags={tagsByPromptId.get(it.promptId)}
              onUseWorkflow={(wf, name) => setWorkflow(wf, name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryItemCard({
  item,
  builderTags,
  onUseWorkflow,
}: {
  item: Item;
  builderTags?: string[];
  onUseWorkflow: (
    wf: ReturnType<typeof apiWorkflowSchema.parse>,
    name?: string,
  ) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const lightbox = useLightbox();
  const cover = item.images[0];
  const lightboxImages: LightboxImage[] = item.images.map((img) => ({
    src: comfyImageUrl(img.filename, img.subfolder, img.type),
    alt: img.filename,
    caption: `#${img.nodeId} · ${img.filename}`,
    download: img.filename,
  }));

  function importToWorkflow() {
    try {
      const wf = apiWorkflowSchema.parse(item.entry.prompt[2]);
      onUseWorkflow(wf, t('gallery.fromHistoryName', { n: item.number }));
      setOpen(false);
    } catch (e) {
      alert(`${t('gallery.parseError')}: ${(e as Error).message}`);
    }
  }

  return (
    <>
      <Card
        onClick={() => setOpen(true)}
        className="cursor-pointer hover:border-foreground/40 transition-colors overflow-hidden p-0 gap-0"
      >
          <div className="aspect-square bg-muted/30 relative">
            {cover ? (
              <img
                src={comfyImageUrl(cover.filename, cover.subfolder, cover.type)}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
                нет изображений
              </div>
            )}
            {item.images.length > 1 && (
              <Badge
                variant="secondary"
                className="absolute top-2 right-2 font-mono text-[10px]"
              >
                +{item.images.length - 1}
              </Badge>
            )}
            {item.isError && (
              <Badge
                variant="destructive"
                className="absolute top-2 left-2 text-[10px]"
              >
                {t('run.error')}
              </Badge>
            )}
          </div>
          <div className="px-3 py-2">
            <div className="text-xs font-mono text-muted-foreground truncate">
              #{item.number} · {item.promptId.slice(0, 8)}
            </div>
            <div
              className={
                builderTags && builderTags.length > 0
                  ? 'text-xs text-foreground/80 truncate font-medium'
                  : 'text-xs text-muted-foreground/50 truncate'
              }
              title={builderTags?.join(', ')}
            >
              {builderTags && builderTags.length > 0
                ? builderTags.join(', ')
                : 'null'}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {item.classTypes.slice(0, 3).join(' · ')}
              {item.classTypes.length > 3 && ` +${item.classTypes.length - 3}`}
            </div>
          </div>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs">#{item.number}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {item.promptId}
            </span>
            {item.isError ? (
              <Badge variant="destructive">{t('run.error')}</Badge>
            ) : (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                {item.entry.status?.status_str ?? 'success'}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto">
          <Tabs defaultValue="images">
            <TabsList>
              <TabsTrigger value="images">
                {t('gallery.tabImages')} ({item.images.length})
              </TabsTrigger>
              <TabsTrigger value="workflow">{t('gallery.tabWorkflow')}</TabsTrigger>
              <TabsTrigger value="status">{t('gallery.tabStatus')}</TabsTrigger>
            </TabsList>
            <TabsContent value="images">
              {item.images.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('gallery.noOutputImages')}
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {item.images.map((img, i) => (
                    <button
                      type="button"
                      key={`${img.nodeId}:${img.subfolder}:${img.filename}`}
                      onClick={() => lightbox.open(i)}
                      className="rounded-md overflow-hidden border border-border/60 block bg-muted/30 cursor-zoom-in text-left hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={comfyImageUrl(
                          img.filename,
                          img.subfolder,
                          img.type,
                        )}
                        alt={img.filename}
                        className="w-full h-auto max-h-[320px] object-contain"
                      />
                      <div className="text-[10px] px-2 py-1 text-muted-foreground truncate font-mono">
                        #{img.nodeId} · {img.filename}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="workflow">
              <div className="flex gap-2 mb-2">
                <Button size="sm" onClick={importToWorkflow}>
                  {t('gallery.useAsWorkflow')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      JSON.stringify(item.entry.prompt[2], null, 2),
                    );
                  }}
                >
                  {t('gallery.copyJson')}
                </Button>
              </div>
              <pre className="text-[11px] font-mono bg-muted/40 rounded p-3 overflow-auto max-h-[60vh]">
                {JSON.stringify(item.entry.prompt[2], null, 2)}
              </pre>
            </TabsContent>
            <TabsContent value="status">
              <pre className="text-[11px] font-mono bg-muted/40 rounded p-3 overflow-auto max-h-[60vh]">
                {JSON.stringify(item.entry.status, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
    <ImageLightbox
      images={lightboxImages}
      index={lightbox.index}
      onIndexChange={lightbox.setIndex}
      onClose={lightbox.close}
    />
    </>
  );
}
