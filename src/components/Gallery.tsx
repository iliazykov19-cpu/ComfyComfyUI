'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Filter, X } from 'lucide-react';
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
import { useT, useI18n } from '@/store/i18n';
import { ImageLightbox, useLightbox, type LightboxImage } from './ImageLightbox';
import type { PromptLibrary, Tag } from '@/lib/prompts/types';
import { cn } from '@/lib/utils';

async function fetchHistory(max: number): Promise<ComfyHistory> {
  const r = await fetch(`/api/comfy/history?max_items=${max}`);
  if (!r.ok) throw new Error(`history → ${r.status}`);
  return r.json();
}

async function fetchPromptLibrary(): Promise<PromptLibrary> {
  const r = await fetch('/api/prompts');
  if (!r.ok) throw new Error(`prompts → ${r.status}`);
  return r.json();
}

type TagInfo = {
  tag: Tag;
  catId: string;
  catName: string;
  subId: string;
  subName: string;
};

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
  const lang = useI18n((s) => s.lang);
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);
  const localRuns = useRunStore((s) => s.runs);

  const tagsByPromptId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of localRuns)
      if (r.builderTags && r.builderTags.length) m.set(r.promptId, r.builderTags);
    return m;
  }, [localRuns]);

  const tagIdsByPromptId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of localRuns)
      if (r.builderTagIds && r.builderTagIds.length)
        m.set(r.promptId, r.builderTagIds);
    return m;
  }, [localRuns]);

  const { data: library } = useQuery({
    queryKey: ['prompt-library'],
    queryFn: fetchPromptLibrary,
    staleTime: 30_000,
  });

  // Index of tag id → enriched info (cat/sub names) and label → tag (for runs without builderTagIds).
  const { tagInfoById, tagInfoByLabel } = useMemo(() => {
    const byId = new Map<string, TagInfo>();
    const byLabel = new Map<string, TagInfo>();
    if (!library) return { tagInfoById: byId, tagInfoByLabel: byLabel };
    for (const c of library.categories) {
      const catName = lang === 'ru' && c.nameRu ? c.nameRu : c.name;
      for (const s of c.subcategories) {
        const subName = lang === 'ru' && s.nameRu ? s.nameRu : s.name;
        for (const tg of s.tags) {
          const info: TagInfo = {
            tag: tg,
            catId: c.id,
            catName,
            subId: s.id,
            subName,
          };
          byId.set(tg.id, info);
          byLabel.set(tg.label, info);
          if (tg.labelRu) byLabel.set(tg.labelRu, info);
        }
      }
    }
    return { tagInfoById: byId, tagInfoByLabel: byLabel };
  }, [library, lang]);

  const [filter, setFilter] = useState('');
  const [onlySuccess, setOnlySuccess] = useState(false);
  const [withImages, setWithImages] = useState(true);
  const [limit, setLimit] = useState(64);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [matchAll, setMatchAll] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['gallery-history', limit],
    queryFn: () => fetchHistory(limit),
    staleTime: 5_000,
  });

  const items = useMemo(() => (data ? buildItems(data) : []), [data]);

  // For each item, resolve which tag ids it used.
  const tagFiltersActive =
    selectedCats.length + selectedSubs.length + selectedTags.length > 0;

  function resolveItemTagIds(promptId: string): string[] {
    const ids = tagIdsByPromptId.get(promptId);
    if (ids && ids.length) return ids;
    // Fallback: map labels back to ids for runs queued before builderTagIds was introduced.
    const labels = tagsByPromptId.get(promptId);
    if (!labels) return [];
    const out: string[] = [];
    for (const l of labels) {
      const info = tagInfoByLabel.get(l);
      if (info) out.push(info.tag.id);
    }
    return out;
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return items.filter((it) => {
      if (onlySuccess && it.isError) return false;
      if (withImages && it.images.length === 0) return false;
      if (q) {
        const hay = `${it.promptId} ${it.classTypes.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tagFiltersActive) {
        const tagIds = resolveItemTagIds(it.promptId);
        if (tagIds.length === 0) return false;
        const itemCats = new Set<string>();
        const itemSubs = new Set<string>();
        const itemTags = new Set<string>();
        for (const id of tagIds) {
          const info = tagInfoById.get(id);
          if (!info) continue;
          itemCats.add(info.catId);
          itemSubs.add(info.subId);
          itemTags.add(info.tag.id);
        }
        const hasCat = (id: string) => itemCats.has(id);
        const hasSub = (id: string) => itemSubs.has(id);
        const hasTag = (id: string) => itemTags.has(id);
        if (matchAll) {
          if (!selectedCats.every(hasCat)) return false;
          if (!selectedSubs.every(hasSub)) return false;
          if (!selectedTags.every(hasTag)) return false;
        } else {
          const hits =
            (selectedCats.length === 0 || selectedCats.some(hasCat)) &&
            (selectedSubs.length === 0 || selectedSubs.some(hasSub)) &&
            (selectedTags.length === 0 || selectedTags.some(hasTag));
          if (!hits) return false;
        }
      }
      return true;
    });
  }, [
    items,
    filter,
    onlySuccess,
    withImages,
    tagFiltersActive,
    matchAll,
    selectedCats,
    selectedSubs,
    selectedTags,
    tagInfoById,
    tagIdsByPromptId,
    tagsByPromptId,
    tagInfoByLabel,
  ]);

  function clearFilters() {
    setSelectedCats([]);
    setSelectedSubs([]);
    setSelectedTags([]);
  }

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

      {library && (
        <Card>
          <CardContent className="py-3 flex flex-wrap items-center gap-2">
            <CategoryFilter
              library={library}
              selected={selectedCats}
              onChange={setSelectedCats}
              lang={lang}
            />
            <SubcategoryFilter
              library={library}
              selected={selectedSubs}
              onChange={setSelectedSubs}
              lang={lang}
            />
            <TagFilter
              library={library}
              selected={selectedTags}
              onChange={setSelectedTags}
              lang={lang}
            />
            {tagFiltersActive && (
              <>
                <label className="flex items-center gap-2 text-xs cursor-pointer ml-2">
                  <Checkbox
                    checked={matchAll}
                    onCheckedChange={(v) => setMatchAll(v === true)}
                  />
                  {matchAll
                    ? t('gallery.filterMatchAll')
                    : t('gallery.filterMatchAny')}
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={clearFilters}
                >
                  <X className="size-3" />
                  {t('gallery.filterClear')}
                </Button>
              </>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} / {items.length}
            </span>
          </CardContent>
        </Card>
      )}

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

function FilterPopover({
  label,
  count,
  total,
  onClear,
  children,
}: {
  label: string;
  count: number;
  total: number;
  onClear: () => void;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const POPUP_W = 320;
      const left = Math.max(
        8,
        Math.min(window.innerWidth - POPUP_W - 8, r.left),
      );
      setPos({ top: r.bottom + 4, left });
    }
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  return (
    <>
      <Button
        ref={btnRef}
        size="sm"
        variant={count > 0 ? 'default' : 'outline'}
        className="h-8 text-xs"
        onClick={() => setOpen((v) => !v)}
      >
        <Filter className="size-3" />
        {label}
        {count > 0 ? (
          <span className="font-mono ml-1">
            {count}/{total}
          </span>
        ) : (
          <span className="font-mono ml-1 opacity-60">{total}</span>
        )}
      </Button>
      {mounted && open && pos &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setOpen(false)}
            />
            <div
              className="fixed z-[61] w-[320px] rounded-md border border-border bg-popover shadow-lg p-2"
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="flex items-center justify-between pb-1 mb-1 border-b border-border/40">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {label}
                </span>
                {count > 0 && (
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={onClear}
                  >
                    <X className="size-3 inline" /> clear
                  </button>
                )}
              </div>
              {children(() => setOpen(false))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function CategoryFilter({
  library,
  selected,
  onChange,
  lang,
}: {
  library: PromptLibrary;
  selected: string[];
  onChange: (next: string[]) => void;
  lang: string;
}) {
  const t = useT();
  return (
    <FilterPopover
      label={t('gallery.filterCats')}
      count={selected.length}
      total={library.categories.length}
      onClear={() => onChange([])}
    >
      {() => (
        <div className="max-h-[300px] overflow-auto space-y-0.5">
          {library.categories.map((c) => {
            const checked = selected.includes(c.id);
            return (
              <label
                key={c.id}
                className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => {
                    onChange(
                      checked
                        ? selected.filter((id) => id !== c.id)
                        : [...selected, c.id],
                    );
                  }}
                />
                <span className="text-sm flex-1 truncate">
                  {lang === 'ru' && c.nameRu ? c.nameRu : c.name}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </FilterPopover>
  );
}

function SubcategoryFilter({
  library,
  selected,
  onChange,
  lang,
}: {
  library: PromptLibrary;
  selected: string[];
  onChange: (next: string[]) => void;
  lang: string;
}) {
  const t = useT();
  const groups = useMemo(
    () =>
      library.categories.map((c) => ({
        id: c.id,
        name: lang === 'ru' && c.nameRu ? c.nameRu : c.name,
        subs: c.subcategories.map((s) => ({
          id: s.id,
          name: lang === 'ru' && s.nameRu ? s.nameRu : s.name,
          tagCount: s.tags.length,
        })),
      })),
    [library, lang],
  );
  const total = useMemo(
    () => library.categories.reduce((n, c) => n + c.subcategories.length, 0),
    [library],
  );
  return (
    <FilterPopover
      label={t('gallery.filterSubs')}
      count={selected.length}
      total={total}
      onClear={() => onChange([])}
    >
      {() => (
        <div className="max-h-[360px] overflow-auto space-y-2">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider px-1 py-0.5">
                {g.name}
              </div>
              {g.subs.map((s) => {
                const checked = selected.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        onChange(
                          checked
                            ? selected.filter((id) => id !== s.id)
                            : [...selected, s.id],
                        );
                      }}
                    />
                    <span className="text-sm flex-1 truncate">{s.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {s.tagCount}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </FilterPopover>
  );
}

function TagFilter({
  library,
  selected,
  onChange,
  lang,
}: {
  library: PromptLibrary;
  selected: string[];
  onChange: (next: string[]) => void;
  lang: string;
}) {
  const t = useT();
  const [q, setQ] = useState('');
  const flat = useMemo(() => {
    const list: { tag: Tag; catName: string; subName: string }[] = [];
    for (const c of library.categories) {
      const cn = lang === 'ru' && c.nameRu ? c.nameRu : c.name;
      for (const s of c.subcategories) {
        const sn = lang === 'ru' && s.nameRu ? s.nameRu : s.name;
        for (const tg of s.tags)
          list.push({ tag: tg, catName: cn, subName: sn });
      }
    }
    return list;
  }, [library, lang]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    // Always show selected tags first so the user can see their picks even without searching the entire 800+ list.
    const sel: typeof flat = [];
    const rest: typeof flat = [];
    for (const it of flat) {
      const matchesQuery =
        !ql ||
        it.tag.label.toLowerCase().includes(ql) ||
        (it.tag.labelRu ?? '').toLowerCase().includes(ql) ||
        it.tag.value.toLowerCase().includes(ql) ||
        it.catName.toLowerCase().includes(ql) ||
        it.subName.toLowerCase().includes(ql);
      if (selected.includes(it.tag.id)) sel.push(it);
      else if (matchesQuery) rest.push(it);
    }
    return [...sel, ...rest].slice(0, 200);
  }, [flat, q, selected]);

  return (
    <FilterPopover
      label={t('gallery.filterTags')}
      count={selected.length}
      total={flat.length}
      onClear={() => onChange([])}
    >
      {() => (
        <div className="space-y-2">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('gallery.tagSearch')}
            className="h-8 text-sm"
          />
          <div className="max-h-[320px] overflow-auto space-y-0.5">
            {filtered.map(({ tag, catName, subName }) => {
              const checked = selected.includes(tag.id);
              return (
                <label
                  key={tag.id}
                  className={cn(
                    'flex items-center gap-2 px-1 py-1 rounded cursor-pointer',
                    checked ? 'bg-primary/10' : 'hover:bg-muted',
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => {
                      onChange(
                        checked
                          ? selected.filter((id) => id !== tag.id)
                          : [...selected, tag.id],
                      );
                    }}
                  />
                  {tag.previewSrc ? (
                    <img
                      src={tag.previewSrc}
                      alt=""
                      className="size-7 object-cover rounded shrink-0"
                    />
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {lang === 'ru' && tag.labelRu ? tag.labelRu : tag.label}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                      {catName} / {subName}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </FilterPopover>
  );
}
