'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Copy,
  Check,
  X,
  Download,
  Upload,
  GripHorizontal,
  Wand2,
  RotateCw,
  Dices,
  Sparkles,
} from 'lucide-react';
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
import { useT } from '@/store/i18n';
import { useI18n } from '@/store/i18n';
import {
  usePromptBuilder,
  buildPromptFromTags,
  type GroupMode,
} from '@/store/prompt-builder';
import { usePanelStore } from '@/store/panel';
import { cn } from '@/lib/utils';
import {
  promptLibrarySchema,
  type Category,
  type PromptLibrary,
  type Subcategory,
  type Tag,
} from '@/lib/prompts/types';
import { paletteFor, type CatPalette } from '@/lib/prompts/palette';

const QUERY_KEY = ['prompt-library'];

async function fetchLibrary(): Promise<PromptLibrary> {
  const r = await fetch('/api/prompts');
  if (!r.ok) throw new Error(`prompts → ${r.status}`);
  return r.json();
}
async function saveLibrary(lib: PromptLibrary) {
  const r = await fetch('/api/prompts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lib),
  });
  if (!r.ok) throw new Error(`save prompts → ${r.status}: ${await r.text()}`);
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const MIN_W = 360;
const MIN_H = 420;

/** Pick label by current language. */
function useLocalized() {
  const lang = useI18n((s) => s.lang);
  return {
    catName: (c: Category) => (lang === 'ru' && c.nameRu ? c.nameRu : c.name),
    subName: (s: Subcategory) => (lang === 'ru' && s.nameRu ? s.nameRu : s.name),
    tagLabel: (t: Tag) => (lang === 'ru' && t.labelRu ? t.labelRu : t.label),
  };
}

export function PromptBuilderToggle() {
  const t = useT();
  const open = usePromptBuilder((s) => s.windowOpen);
  const setOpen = usePromptBuilder((s) => s.setWindowOpen);
  const targets = usePanelStore((s) => s.promptTargets);
  return (
    <Button
      size="sm"
      variant={open ? 'default' : 'outline'}
      onClick={() => setOpen(!open)}
    >
      <Wand2 className="size-4" />
      {t('pb.title')}
      {targets.length > 0 && (
        <span className="ml-1 text-[11px] opacity-80">→ {targets.length}</span>
      )}
    </Button>
  );
}

export function PromptBuilderWindow() {
  const t = useT();
  const qc = useQueryClient();
  const open = usePromptBuilder((s) => s.windowOpen);
  const setOpen = usePromptBuilder((s) => s.setWindowOpen);
  const pos = usePromptBuilder((s) => s.windowPos);
  const setPos = usePromptBuilder((s) => s.setWindowPos);
  const size = usePromptBuilder((s) => s.windowSize);
  const setSize = usePromptBuilder((s) => s.setWindowSize);

  const { data: library } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchLibrary,
    staleTime: 30_000,
    enabled: open,
  });

  const selectedTagIds = usePromptBuilder((s) => s.selectedTagIds);
  const toggleTag = usePromptBuilder((s) => s.toggleTag);
  const clearSelection = usePromptBuilder((s) => s.clearSelection);
  const prefix = usePromptBuilder((s) => s.prefix);
  const suffix = usePromptBuilder((s) => s.suffix);
  const customText = usePromptBuilder((s) => s.customText);
  const setPrefix = usePromptBuilder((s) => s.setPrefix);
  const setSuffix = usePromptBuilder((s) => s.setSuffix);
  const setCustomText = usePromptBuilder((s) => s.setCustomText);
  const groupModes = usePromptBuilder((s) => s.groupModes);
  const cycleGroupMode = usePromptBuilder((s) => s.cycleGroupMode);

  const promptTargets = usePanelStore((s) => s.promptTargets);
  const setValue = usePanelStore((s) => s.setValue);

  const [editMode, setEditMode] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{
    startW: number;
    startH: number;
    startX: number;
    startY: number;
  } | null>(null);

  const loc = useLocalized();

  useEffect(() => {
    if (!library) return;
    if (!activeCatId && library.categories[0]) {
      setActiveCatId(library.categories[0].id);
      setActiveSubId(library.categories[0].subcategories[0]?.id ?? null);
    }
  }, [library, activeCatId]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    if (!library) return m;
    for (const c of library.categories)
      for (const s of c.subcategories) for (const tg of s.tags) m.set(tg.id, tg);
    return m;
  }, [library]);

  const orderedSelected = useMemo(
    () =>
      selectedTagIds
        .map((id) => tagsById.get(id))
        .filter((x): x is Tag => !!x),
    [selectedTagIds, tagsById],
  );

  const finalPrompt = useMemo(
    () =>
      buildPromptFromTags(
        orderedSelected.map((t) => t.value),
        prefix,
        suffix,
        customText,
      ),
    [orderedSelected, prefix, suffix, customText],
  );

  useEffect(() => {
    if (promptTargets.length === 0) return;
    for (const k of promptTargets) setValue(k, finalPrompt);
  }, [finalPrompt, promptTargets, setValue]);

  const saveMutation = useMutation({
    mutationFn: saveLibrary,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  function patch(updater: (l: PromptLibrary) => PromptLibrary) {
    if (!library) return;
    const next = updater(structuredClone(library));
    saveMutation.mutate(next);
    qc.setQueryData(QUERY_KEY, next);
  }

  // ---------- Drag & resize ----------
  function onDragStart(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button,a,input,textarea')) return;
    e.preventDefault();
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  }
  function onDragMove(e: MouseEvent) {
    if (!dragRef.current) return;
    const x = Math.max(
      0,
      Math.min(window.innerWidth - 80, e.clientX - dragRef.current.dx),
    );
    const y = Math.max(
      0,
      Math.min(window.innerHeight - 40, e.clientY - dragRef.current.dy),
    );
    setPos({ x, y });
  }
  function onDragEnd() {
    dragRef.current = null;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
  }

  function onResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      startW: size.w,
      startH: size.h,
      startX: e.clientX,
      startY: e.clientY,
    };
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
  }
  function onResizeMove(e: MouseEvent) {
    if (!resizeRef.current) return;
    const w = Math.max(
      MIN_W,
      Math.min(
        window.innerWidth - pos.x - 8,
        resizeRef.current.startW + (e.clientX - resizeRef.current.startX),
      ),
    );
    const h = Math.max(
      MIN_H,
      Math.min(
        window.innerHeight - pos.y - 8,
        resizeRef.current.startH + (e.clientY - resizeRef.current.startY),
      ),
    );
    setSize({ w, h });
  }
  function onResizeEnd() {
    resizeRef.current = null;
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
  }

  // ---------- Filtering ----------
  const filterLower = filter.trim().toLowerCase();
  const flatSearchHits = useMemo(() => {
    if (!library || !filterLower) return null;
    const hits: { categoryName: string; subcategoryName: string; tag: Tag; catIdx: number }[] = [];
    for (let ci = 0; ci < library.categories.length; ci++) {
      const c = library.categories[ci];
      for (const s of c.subcategories) {
        for (const tg of s.tags) {
          const ru = (tg.labelRu ?? '').toLowerCase();
          if (
            tg.label.toLowerCase().includes(filterLower) ||
            tg.value.toLowerCase().includes(filterLower) ||
            ru.includes(filterLower)
          ) {
            hits.push({
              categoryName: loc.catName(c),
              subcategoryName: loc.subName(s),
              tag: tg,
              catIdx: ci,
            });
          }
        }
      }
    }
    return hits.slice(0, 200);
  }, [library, filterLower, loc]);

  const activeCatIdx = useMemo(
    () =>
      library?.categories.findIndex((c) => c.id === activeCatId) ?? -1,
    [library, activeCatId],
  );
  const activeCat: Category | null = useMemo(
    () => (activeCatIdx >= 0 ? library!.categories[activeCatIdx] : null),
    [library, activeCatIdx],
  );
  const activeSub: Subcategory | null = useMemo(
    () => activeCat?.subcategories.find((s) => s.id === activeSubId) ?? null,
    [activeCat, activeSubId],
  );
  const activePalette = paletteFor(activeCatIdx >= 0 ? activeCatIdx : 0);

  if (!open) return null;

  return (
    <div
      className="fixed z-40 rounded-xl border-2 border-border bg-card shadow-2xl flex flex-col select-none text-base"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
      }}
    >
      <div
        onMouseDown={onDragStart}
        className="flex items-center gap-2 px-3 py-2 border-b border-border/60 cursor-grab active:cursor-grabbing rounded-t-xl bg-muted/40"
      >
        <Sparkles className="size-4 text-muted-foreground" />
        <GripHorizontal className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{t('pb.title')}</span>
        <span className="text-xs text-muted-foreground font-mono ml-auto">
          {selectedTagIds.length} / {tagsById.size}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setEditMode((v) => !v)}
          title={editMode ? t('pb.viewMode') : t('pb.editMode')}
        >
          <Pencil className={cn('size-4', editMode && 'text-primary')} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setOpen(false)}
          title={t('common.close')}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="px-3 py-2 border-b border-border/60">
        <div className="relative">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('pb.searchPlaceholder')}
            className="h-9 text-sm pl-8"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto select-text">
        {flatSearchHits ? (
          <SearchResults
            hits={flatSearchHits}
            selectedIds={selectedTagIds}
            onToggle={toggleTag}
          />
        ) : (
          <BrowserView
            library={library}
            activeCatId={activeCatId}
            activeSubId={activeSubId}
            onPickCat={(id) => {
              setActiveCatId(id);
              const c = library?.categories.find((c) => c.id === id);
              setActiveSubId(c?.subcategories[0]?.id ?? null);
            }}
            onPickSub={setActiveSubId}
            selectedIds={selectedTagIds}
            onToggleTag={toggleTag}
            editMode={editMode}
            patch={patch}
            groupModes={groupModes}
            onCycleMode={cycleGroupMode}
          />
        )}
      </div>

      <div className="border-t border-border/60 p-3 space-y-2 select-text">
        {orderedSelected.length > 0 && (
          <div className="flex flex-wrap gap-1 max-h-[110px] overflow-auto">
            {orderedSelected.map((tg) => (
              <button
                key={tg.id}
                type="button"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-foreground text-background hover:bg-foreground/80"
                onClick={() => toggleTag(tg.id)}
                title={tg.value}
              >
                {loc.tagLabel(tg)} <X className="size-3" />
              </button>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {t('pb.customText')}
          </Label>
          <Textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={t('pb.customTextPlaceholder')}
            className="min-h-[56px] text-sm font-mono"
          />
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {t('pb.prefix')} / {t('pb.suffix')}
          </summary>
          <div className="space-y-1.5 mt-2">
            <Input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder={t('pb.prefix')}
              className="h-8 text-xs font-mono"
            />
            <Input
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              placeholder={t('pb.suffix')}
              className="h-8 text-xs font-mono"
            />
          </div>
        </details>

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-muted-foreground">
              {t('pb.preview')}
              {promptTargets.length > 0 && (
                <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                  → {promptTargets.length}
                </span>
              )}
            </Label>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={async () => {
                  await navigator.clipboard.writeText(finalPrompt);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                title={t('pb.copy')}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={clearSelection}
                disabled={orderedSelected.length === 0}
                title={t('pb.clear')}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
          <Textarea
            readOnly
            value={finalPrompt}
            placeholder="—"
            className="min-h-[80px] max-h-[140px] font-mono text-xs leading-relaxed"
          />
        </div>

        {editMode && (
          <ImportExport
            library={library}
            onReplace={(lib) => patch(() => lib)}
          />
        )}
      </div>

      <div
        onMouseDown={onResizeStart}
        className="absolute right-0 bottom-0 size-4 cursor-se-resize"
        style={{
          backgroundImage:
            'linear-gradient(135deg, transparent 50%, rgba(120,120,120,0.4) 50%)',
        }}
      />
    </div>
  );
}

function modeTitle(mode: GroupMode, t: ReturnType<typeof useT>) {
  if (mode === 'iterate') return t('pb.modeIterate');
  if (mode === 'random') return t('pb.modeRandom');
  return t('pb.modeOff');
}

function ModeIcon({ mode }: { mode: GroupMode; active?: boolean }) {
  if (mode === 'iterate')
    return <RotateCw className="size-3.5 text-sky-600 dark:text-sky-400" />;
  if (mode === 'random')
    return <Dices className="size-3.5 text-fuchsia-600 dark:text-fuchsia-400" />;
  return null;
}

function BrowserView({
  library,
  activeCatId,
  activeSubId,
  onPickCat,
  onPickSub,
  selectedIds,
  onToggleTag,
  editMode,
  patch,
  groupModes,
  onCycleMode,
}: {
  library: PromptLibrary | undefined;
  activeCatId: string | null;
  activeSubId: string | null;
  onPickCat: (id: string) => void;
  onPickSub: (id: string) => void;
  selectedIds: string[];
  onToggleTag: (id: string) => void;
  editMode: boolean;
  patch: (u: (l: PromptLibrary) => PromptLibrary) => void;
  groupModes: Record<string, GroupMode>;
  onCycleMode: (groupId: string) => void;
}) {
  const t = useT();
  const loc = useLocalized();
  if (!library) return null;
  if (library.categories.length === 0)
    return (
      <div className="p-3 text-sm text-muted-foreground text-center">
        {t('pb.empty')}
      </div>
    );

  const activeCatIdx = library.categories.findIndex((c) => c.id === activeCatId);
  const activeCat = activeCatIdx >= 0 ? library.categories[activeCatIdx] : null;
  const activeSub = activeCat?.subcategories.find((s) => s.id === activeSubId);
  const palette = paletteFor(activeCatIdx >= 0 ? activeCatIdx : 0);

  const selectedSet = new Set(selectedIds);
  const catSelectedCount = (c: Category) => {
    let n = 0;
    for (const s of c.subcategories)
      for (const tg of s.tags) if (selectedSet.has(tg.id)) n++;
    return n;
  };
  const subSelectedCount = (s: Subcategory) =>
    s.tags.reduce((n, tg) => (selectedSet.has(tg.id) ? n + 1 : n), 0);

  return (
    <div className="flex flex-col">
      {/* Categories */}
      <div className="border-b border-border/40">
        <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
          <span>{t('pb.selectCategory')}</span>
          {editMode && <AddCategoryButton patch={patch} />}
        </div>
        <div className="flex flex-wrap gap-1.5 px-2 pb-2">
          {library.categories.map((c, i) => (
            <CategoryChip
              key={c.id}
              category={c}
              palette={paletteFor(i)}
              active={activeCatId === c.id}
              selectedCount={catSelectedCount(c)}
              onPick={() => onPickCat(c.id)}
              editMode={editMode}
              patch={patch}
              mode={groupModes[`cat:${c.id}`] ?? 'off'}
              onCycleMode={() => onCycleMode(`cat:${c.id}`)}
            />
          ))}
        </div>
      </div>

      {activeCat && (
        <div className="border-b border-border/40">
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
            <span>{t('pb.selectSubcategory')}</span>
            {editMode && <AddSubcategoryButton catId={activeCat.id} patch={patch} />}
          </div>
          <div className="flex flex-wrap gap-1.5 px-2 pb-2">
            {activeCat.subcategories.map((s) => (
              <SubcategoryChip
                key={s.id}
                subcategory={s}
                palette={palette}
                active={activeSubId === s.id}
                selectedCount={subSelectedCount(s)}
                onPick={() => onPickSub(s.id)}
                editMode={editMode}
                catId={activeCat.id}
                patch={patch}
                mode={groupModes[`sub:${s.id}`] ?? 'off'}
                onCycleMode={() => onCycleMode(`sub:${s.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {activeSub && (
        <div className="px-3 py-2 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
            <span>{loc.subName(activeSub)}</span>
            {editMode && (
              <AddTagButton
                catId={activeCat!.id}
                subId={activeSub.id}
                patch={patch}
              />
            )}
          </div>
          {activeSub.tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('pb.noTags')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {activeSub.tags.map((tg) => (
                <TagChip
                  key={tg.id}
                  tag={tg}
                  palette={palette}
                  active={selectedIds.includes(tg.id)}
                  onToggle={() => onToggleTag(tg.id)}
                  editMode={editMode}
                  catId={activeCat!.id}
                  subId={activeSub.id}
                  patch={patch}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchResults({
  hits,
  selectedIds,
  onToggle,
}: {
  hits: { categoryName: string; subcategoryName: string; tag: Tag; catIdx: number }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const loc = useLocalized();
  return (
    <div className="px-3 py-2 space-y-2">
      {hits.length === 0 && (
        <p className="text-sm text-muted-foreground">No matches.</p>
      )}
      {hits.map(({ categoryName, subcategoryName, tag, catIdx }) => {
        const palette = paletteFor(catIdx);
        const active = selectedIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggle(tag.id)}
            className={cn(
              'w-full text-left rounded-md border px-2.5 py-1.5 transition-colors flex items-center gap-2',
              active
                ? `${palette.activeBg} ${palette.activeText} border-transparent`
                : 'bg-muted/30 hover:bg-muted text-foreground border-border/40',
            )}
          >
            <span
              className={cn('block size-2 rounded-full shrink-0', palette.dot)}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{loc.tagLabel(tag)}</div>
              <div className="text-[11px] font-mono opacity-70 truncate">
                {categoryName} / {subcategoryName}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CategoryChip({
  category,
  palette,
  active,
  selectedCount,
  onPick,
  editMode,
  patch,
  mode,
  onCycleMode,
}: {
  category: Category;
  palette: CatPalette;
  active: boolean;
  selectedCount: number;
  onPick: () => void;
  editMode: boolean;
  patch: (u: (l: PromptLibrary) => PromptLibrary) => void;
  mode: GroupMode;
  onCycleMode: () => void;
}) {
  const t = useT();
  const loc = useLocalized();
  const total = category.subcategories.reduce((n, s) => n + s.tags.length, 0);
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onPick}
        className={cn(
          'pl-1 pr-2.5 py-1 rounded-md text-sm transition-colors flex items-center gap-1.5 border',
          active
            ? `${palette.activeBg} ${palette.activeText} border-transparent`
            : selectedCount > 0
            ? 'bg-muted/40 hover:bg-muted text-foreground border-amber-500/60'
            : 'bg-muted/40 hover:bg-muted text-foreground border-transparent',
        )}
      >
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onCycleMode();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onCycleMode();
            }
          }}
          className={cn(
            'size-5 rounded grid place-items-center cursor-pointer transition-colors',
            active ? 'hover:bg-white/20' : 'hover:bg-foreground/10',
          )}
          title={modeTitle(mode, t)}
        >
          {mode === 'off' ? (
            <span className={cn('block size-2 rounded-full', palette.dot)} />
          ) : (
            <ModeIcon mode={mode} />
          )}
        </span>
        <span>{loc.catName(category)}</span>
        <span className="opacity-60 text-xs">({total})</span>
        {selectedCount > 0 && (
          <span
            className={cn(
              'ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums',
              active
                ? 'bg-white/30 text-white'
                : 'bg-amber-500 text-white',
            )}
            title={`${selectedCount} selected`}
          >
            {selectedCount}
          </span>
        )}
      </button>
      {editMode && (
        <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-0.5">
          <RenameButton
            current={category.name}
            currentRu={category.nameRu}
            onSave={(name, nameRu) =>
              patch((l) => ({
                ...l,
                categories: l.categories.map((c) =>
                  c.id === category.id ? { ...c, name, nameRu } : c,
                ),
              }))
            }
          />
          <DeleteButton
            confirmText={t('pb.deleteCategory', { name: loc.catName(category) })}
            onDelete={() =>
              patch((l) => ({
                ...l,
                categories: l.categories.filter((c) => c.id !== category.id),
              }))
            }
          />
        </div>
      )}
    </div>
  );
}

function SubcategoryChip({
  subcategory,
  palette,
  active,
  selectedCount,
  onPick,
  editMode,
  catId,
  patch,
  mode,
  onCycleMode,
}: {
  subcategory: Subcategory;
  palette: CatPalette;
  active: boolean;
  selectedCount: number;
  onPick: () => void;
  editMode: boolean;
  catId: string;
  patch: (u: (l: PromptLibrary) => PromptLibrary) => void;
  mode: GroupMode;
  onCycleMode: () => void;
}) {
  const t = useT();
  const loc = useLocalized();
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onPick}
        className={cn(
          'pl-1 pr-2.5 py-1 rounded-md text-sm transition-colors flex items-center gap-1.5 border',
          active
            ? `${palette.activeBg} ${palette.activeText} border-transparent`
            : selectedCount > 0
            ? 'bg-muted/30 hover:bg-muted text-foreground border-amber-500/60'
            : 'bg-muted/30 hover:bg-muted text-foreground border-transparent',
        )}
      >
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onCycleMode();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onCycleMode();
            }
          }}
          className={cn(
            'size-5 rounded grid place-items-center cursor-pointer transition-colors',
            active ? 'hover:bg-white/20' : 'hover:bg-foreground/10',
          )}
          title={modeTitle(mode, t)}
        >
          {mode === 'off' ? (
            <span
              className={cn(
                'block size-1.5 rounded-full opacity-60',
                palette.dot,
              )}
            />
          ) : (
            <ModeIcon mode={mode} />
          )}
        </span>
        <span>{loc.subName(subcategory)}</span>
        <span className="opacity-60 text-xs">({subcategory.tags.length})</span>
        {selectedCount > 0 && (
          <span
            className={cn(
              'ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums',
              active ? 'bg-white/30 text-white' : 'bg-amber-500 text-white',
            )}
            title={`${selectedCount} selected`}
          >
            {selectedCount}
          </span>
        )}
      </button>
      {editMode && (
        <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-0.5">
          <RenameButton
            current={subcategory.name}
            currentRu={subcategory.nameRu}
            onSave={(name, nameRu) =>
              patch((l) => ({
                ...l,
                categories: l.categories.map((c) =>
                  c.id !== catId
                    ? c
                    : {
                        ...c,
                        subcategories: c.subcategories.map((s) =>
                          s.id === subcategory.id ? { ...s, name, nameRu } : s,
                        ),
                      },
                ),
              }))
            }
          />
          <DeleteButton
            confirmText={t('pb.deleteSubcategory', { name: loc.subName(subcategory) })}
            onDelete={() =>
              patch((l) => ({
                ...l,
                categories: l.categories.map((c) =>
                  c.id !== catId
                    ? c
                    : {
                        ...c,
                        subcategories: c.subcategories.filter(
                          (s) => s.id !== subcategory.id,
                        ),
                      },
                ),
              }))
            }
          />
        </div>
      )}
    </div>
  );
}

function TagChip({
  tag,
  palette,
  active,
  onToggle,
  editMode,
  catId,
  subId,
  patch,
}: {
  tag: Tag;
  palette: CatPalette;
  active: boolean;
  onToggle: () => void;
  editMode: boolean;
  catId: string;
  subId: string;
  patch: (u: (l: PromptLibrary) => PromptLibrary) => void;
}) {
  const t = useT();
  const loc = useLocalized();
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const hasPreview = !!tag.previewSrc;

  function onMove(e: React.MouseEvent) {
    if (!hasPreview) return;
    setHoverPos({ x: e.clientX, y: e.clientY });
  }

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onToggle}
        title={tag.value}
        onMouseEnter={onMove}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverPos(null)}
        className={cn(
          'rounded-md text-sm transition-all border flex flex-col items-stretch overflow-hidden',
          hasPreview ? 'w-[96px] p-0' : 'px-2.5 py-1.5',
          active
            ? `${palette.activeBg} ${palette.activeText} border-transparent`
            : 'bg-muted/30 hover:bg-muted text-foreground border-border/40',
        )}
      >
        {hasPreview && (
          <img
            src={tag.previewSrc}
            alt={tag.label}
            className="w-full h-[110px] object-cover bg-muted/50"
            draggable={false}
          />
        )}
        <span
          className={cn(
            'truncate',
            hasPreview ? 'px-1.5 py-1 text-xs leading-tight' : '',
          )}
        >
          {loc.tagLabel(tag)}
        </span>
      </button>
      {hasPreview && hoverPos && (
        <FloatingPreview src={tag.previewSrc!} mouse={hoverPos} />
      )}
      {editMode && (
        <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-0.5">
          <EditTagButton
            tag={tag}
            onSave={(label, labelRu, value) =>
              patch((l) => ({
                ...l,
                categories: l.categories.map((c) =>
                  c.id !== catId
                    ? c
                    : {
                        ...c,
                        subcategories: c.subcategories.map((s) =>
                          s.id !== subId
                            ? s
                            : {
                                ...s,
                                tags: s.tags.map((x) =>
                                  x.id === tag.id
                                    ? { ...x, label, labelRu, value }
                                    : x,
                                ),
                              },
                        ),
                      },
                ),
              }))
            }
          />
          <DeleteButton
            confirmText={t('pb.deleteTag', { name: loc.tagLabel(tag) })}
            onDelete={() =>
              patch((l) => ({
                ...l,
                categories: l.categories.map((c) =>
                  c.id !== catId
                    ? c
                    : {
                        ...c,
                        subcategories: c.subcategories.map((s) =>
                          s.id !== subId
                            ? s
                            : { ...s, tags: s.tags.filter((x) => x.id !== tag.id) },
                        ),
                      },
                ),
              }))
            }
          />
        </div>
      )}
    </div>
  );
}

function AddCategoryButton({
  patch,
}: {
  patch: (u: (l: PromptLibrary) => PromptLibrary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameRu, setNameRu] = useState('');
  const t = useT();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        title={t('pb.addCategory')}
      >
        <Plus className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pb.addCategory')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="newcat">{t('pb.tagLabel')}</Label>
            <Input
              id="newcat"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Label htmlFor="newcatru">{t('pb.tagLabelRu')}</Label>
            <Input
              id="newcatru"
              value={nameRu}
              onChange={(e) => setNameRu(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('presets.cancel')}
              </Button>
              <Button
                disabled={!name.trim()}
                onClick={() => {
                  patch((l) => ({
                    ...l,
                    categories: [
                      ...l.categories,
                      {
                        id: uid('c'),
                        name: name.trim(),
                        nameRu: nameRu.trim() || undefined,
                        subcategories: [],
                      },
                    ],
                  }));
                  setName('');
                  setNameRu('');
                  setOpen(false);
                }}
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

function AddSubcategoryButton({
  catId,
  patch,
}: {
  catId: string;
  patch: (u: (l: PromptLibrary) => PromptLibrary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameRu, setNameRu] = useState('');
  const t = useT();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        title={t('pb.addSubcategory')}
      >
        <Plus className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pb.addSubcategory')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="newsub">{t('pb.tagLabel')}</Label>
            <Input
              id="newsub"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Label htmlFor="newsubru">{t('pb.tagLabelRu')}</Label>
            <Input
              id="newsubru"
              value={nameRu}
              onChange={(e) => setNameRu(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('presets.cancel')}
              </Button>
              <Button
                disabled={!name.trim()}
                onClick={() => {
                  patch((l) => ({
                    ...l,
                    categories: l.categories.map((c) =>
                      c.id !== catId
                        ? c
                        : {
                            ...c,
                            subcategories: [
                              ...c.subcategories,
                              {
                                id: uid('s'),
                                name: name.trim(),
                                nameRu: nameRu.trim() || undefined,
                                tags: [],
                              },
                            ],
                          },
                    ),
                  }));
                  setName('');
                  setNameRu('');
                  setOpen(false);
                }}
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

function AddTagButton({
  catId,
  subId,
  patch,
}: {
  catId: string;
  subId: string;
  patch: (u: (l: PromptLibrary) => PromptLibrary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [labelRu, setLabelRu] = useState('');
  const [value, setValue] = useState('');
  const t = useT();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        title={t('pb.addTag')}
      >
        <Plus className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pb.addTag')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tlabel">{t('pb.tagLabel')}</Label>
            <Input
              id="tlabel"
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Label htmlFor="tlabelru">{t('pb.tagLabelRu')}</Label>
            <Input
              id="tlabelru"
              value={labelRu}
              onChange={(e) => setLabelRu(e.target.value)}
            />
            <Label htmlFor="tvalue">{t('pb.tagValue')}</Label>
            <Textarea
              id="tvalue"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-h-[100px] font-mono text-xs"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('presets.cancel')}
              </Button>
              <Button
                disabled={!label.trim() || !value.trim()}
                onClick={() => {
                  patch((l) => ({
                    ...l,
                    categories: l.categories.map((c) =>
                      c.id !== catId
                        ? c
                        : {
                            ...c,
                            subcategories: c.subcategories.map((s) =>
                              s.id !== subId
                                ? s
                                : {
                                    ...s,
                                    tags: [
                                      ...s.tags,
                                      {
                                        id: uid('t'),
                                        label: label.trim(),
                                        labelRu: labelRu.trim() || undefined,
                                        value: value.trim(),
                                      },
                                    ],
                                  },
                            ),
                          },
                    ),
                  }));
                  setLabel('');
                  setLabelRu('');
                  setValue('');
                  setOpen(false);
                }}
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

function EditTagButton({
  tag,
  onSave,
}: {
  tag: Tag;
  onSave: (label: string, labelRu: string | undefined, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(tag.label);
  const [labelRu, setLabelRu] = useState(tag.labelRu ?? '');
  const [value, setValue] = useState(tag.value);
  const t = useT();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLabel(tag.label);
          setLabelRu(tag.labelRu ?? '');
          setValue(tag.value);
          setOpen(true);
        }}
        className="size-5 rounded bg-background border border-border grid place-items-center hover:bg-muted shadow-sm"
        title={t('presets.itemRename')}
      >
        <Pencil className="size-3" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tag.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="elabel">{t('pb.tagLabel')}</Label>
            <Input
              id="elabel"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
            <Label htmlFor="elabelru">{t('pb.tagLabelRu')}</Label>
            <Input
              id="elabelru"
              value={labelRu}
              onChange={(e) => setLabelRu(e.target.value)}
            />
            <Label htmlFor="evalue">{t('pb.tagValue')}</Label>
            <Textarea
              id="evalue"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-h-[100px] font-mono text-xs"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('presets.cancel')}
              </Button>
              <Button
                disabled={!label.trim() || !value.trim()}
                onClick={() => {
                  onSave(label.trim(), labelRu.trim() || undefined, value.trim());
                  setOpen(false);
                }}
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

function RenameButton({
  current,
  currentRu,
  onSave,
}: {
  current: string;
  currentRu?: string;
  onSave: (name: string, nameRu: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(current);
  const [nameRu, setNameRu] = useState(currentRu ?? '');
  const t = useT();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(current);
          setNameRu(currentRu ?? '');
          setOpen(true);
        }}
        className="size-5 rounded bg-background border border-border grid place-items-center hover:bg-muted shadow-sm"
        title={t('presets.itemRename')}
      >
        <Pencil className="size-3" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('presets.itemRename')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('pb.tagLabel')}</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Label>{t('pb.tagLabelRu')}</Label>
            <Input
              value={nameRu}
              onChange={(e) => setNameRu(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('presets.cancel')}
              </Button>
              <Button
                disabled={!name.trim()}
                onClick={() => {
                  onSave(name.trim(), nameRu.trim() || undefined);
                  setOpen(false);
                }}
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

function DeleteButton({
  confirmText,
  onDelete,
}: {
  confirmText: string;
  onDelete: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm(confirmText)) onDelete();
      }}
      className="size-5 rounded bg-background border border-destructive/50 grid place-items-center hover:bg-destructive/10 shadow-sm"
      title="Delete"
    >
      <Trash2 className="size-3 text-destructive" />
    </button>
  );
}

function ImportExport({
  library,
  onReplace,
}: {
  library: PromptLibrary | undefined;
  onReplace: (lib: PromptLibrary) => void;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex gap-1 pt-1 border-t border-border/40">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        disabled={!library}
        onClick={() => {
          if (!library) return;
          const blob = new Blob([JSON.stringify(library, null, 2)], {
            type: 'application/json',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'prompt-library.json';
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        <Download className="size-3.5" /> {t('pb.export')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="size-3.5" /> {t('pb.import')}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const lib = promptLibrarySchema.parse(JSON.parse(await f.text()));
            onReplace(lib);
          } catch (err) {
            alert((err as Error).message);
          } finally {
            e.target.value = '';
          }
        }}
      />
    </div>
  );
}

function FloatingPreview({
  src,
  mouse,
}: {
  src: string;
  mouse: { x: number; y: number };
}) {
  if (typeof window === 'undefined') return null;
  const SIZE = 320;
  const OFFSET = 16;
  // Flip to the other side of the cursor when running off-screen.
  const goLeft = mouse.x + OFFSET + SIZE > window.innerWidth;
  const goUp = mouse.y + OFFSET + SIZE > window.innerHeight;
  const left = goLeft ? mouse.x - OFFSET - SIZE : mouse.x + OFFSET;
  const top = goUp ? mouse.y - OFFSET - SIZE : mouse.y + OFFSET;
  return createPortal(
    <div
      className="pointer-events-none fixed z-[60] rounded-lg border-2 border-border bg-card shadow-2xl overflow-hidden"
      style={{ left, top, width: SIZE, height: SIZE }}
    >
      <img
        src={src}
        alt=""
        className="w-full h-full object-contain bg-muted/30"
        draggable={false}
      />
    </div>,
    document.body,
  );
}
