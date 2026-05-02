'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PromptLibrary, Tag } from '@/lib/prompts/types';

export type GroupMode = 'off' | 'iterate' | 'random';

type State = {
  selectedTagIds: string[];
  prefix: string;
  customText: string;
  suffix: string;
  windowOpen: boolean;
  windowPos: { x: number; y: number };
  windowSize: { w: number; h: number };
  /** groupId is "cat:<id>" or "sub:<id>" */
  groupModes: Record<string, GroupMode>;
  /** Last used index for iterate mode, per group */
  groupIndices: Record<string, number>;
  /** Tag id currently auto-injected from group, used to remove on next cycle */
  groupAutoTags: Record<string, string>;
  /** Recent picks for random mode — used to avoid immediate repeats */
  groupRecent: Record<string, string[]>;
  toggleTag: (id: string) => void;
  setSelected: (ids: string[]) => void;
  setPrefix: (s: string) => void;
  setCustomText: (s: string) => void;
  setSuffix: (s: string) => void;
  clearSelection: () => void;
  setWindowOpen: (v: boolean) => void;
  setWindowPos: (p: { x: number; y: number }) => void;
  setWindowSize: (s: { w: number; h: number }) => void;
  cycleGroupMode: (groupId: string) => void;
  setGroupMode: (groupId: string, mode: GroupMode) => void;
  applyAutoModes: (library: PromptLibrary) => void;
};

function nextMode(m: GroupMode | undefined): GroupMode {
  switch (m) {
    case undefined:
    case 'off':
      return 'iterate';
    case 'iterate':
      return 'random';
    case 'random':
      return 'off';
  }
}

function tagsForGroup(lib: PromptLibrary, groupId: string): Tag[] {
  if (groupId.startsWith('cat:')) {
    const catId = groupId.slice(4);
    const c = lib.categories.find((c) => c.id === catId);
    if (!c) return [];
    return c.subcategories.flatMap((s) => s.tags);
  }
  if (groupId.startsWith('sub:')) {
    const subId = groupId.slice(4);
    for (const c of lib.categories) {
      const s = c.subcategories.find((s) => s.id === subId);
      if (s) return s.tags;
    }
  }
  return [];
}

export const usePromptBuilder = create<State>()(
  persist(
    (set, get) => ({
      selectedTagIds: [],
      prefix: '',
      customText: '',
      suffix: '',
      windowOpen: false,
      windowPos: { x: 80, y: 120 },
      windowSize: { w: 460, h: 680 },
      groupModes: {},
      groupIndices: {},
      groupAutoTags: {},
      groupRecent: {},
      toggleTag: (id) =>
        set((s) => ({
          selectedTagIds: s.selectedTagIds.includes(id)
            ? s.selectedTagIds.filter((x) => x !== id)
            : [...s.selectedTagIds, id],
        })),
      setSelected: (ids) => set({ selectedTagIds: ids }),
      setPrefix: (s) => set({ prefix: s }),
      setCustomText: (s) => set({ customText: s }),
      setSuffix: (s) => set({ suffix: s }),
      clearSelection: () => set({ selectedTagIds: [] }),
      setWindowOpen: (v) => set({ windowOpen: v }),
      setWindowPos: (p) => set({ windowPos: p }),
      setWindowSize: (s) => set({ windowSize: s }),
      cycleGroupMode: (groupId) =>
        set((s) => ({
          groupModes: {
            ...s.groupModes,
            [groupId]: nextMode(s.groupModes[groupId]),
          },
        })),
      setGroupMode: (groupId, mode) =>
        set((s) => ({
          groupModes: { ...s.groupModes, [groupId]: mode },
        })),
      applyAutoModes: (library) => {
        const s = get();
        let selected = [...s.selectedTagIds];
        const indices = { ...s.groupIndices };
        const autos = { ...s.groupAutoTags };
        const recent = { ...s.groupRecent };

        for (const [groupId, mode] of Object.entries(s.groupModes)) {
          if (mode === 'off') continue;
          const tags = tagsForGroup(library, groupId);
          if (tags.length === 0) continue;

          // Remove the previously auto-injected tag if present.
          const prev = autos[groupId];
          if (prev) selected = selected.filter((id) => id !== prev);

          let idx: number;
          if (mode === 'random') {
            // Avoid recently picked tags. Window size ≈ half the group
            // (capped so at least one tag is always selectable).
            const window = Math.max(
              1,
              Math.min(tags.length - 1, Math.floor(tags.length / 2)),
            );
            const banned = new Set((recent[groupId] ?? []).slice(-window));
            const pool = tags.filter((t) => !banned.has(t.id));
            const candidates = pool.length > 0 ? pool : tags;
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            idx = tags.findIndex((t) => t.id === pick.id);
            const newHistory = [...(recent[groupId] ?? []), pick.id].slice(
              -Math.max(window, 1),
            );
            recent[groupId] = newHistory;
          } else {
            // iterate: bump index, wrap around
            const cur = indices[groupId];
            idx =
              typeof cur === 'number' ? (cur + 1) % tags.length : 0;
          }
          indices[groupId] = idx;
          const t = tags[idx];
          autos[groupId] = t.id;
          if (!selected.includes(t.id)) selected.push(t.id);
        }

        set({
          selectedTagIds: selected,
          groupIndices: indices,
          groupAutoTags: autos,
          groupRecent: recent,
        });
      },
    }),
    {
      name: 'comfy-panel-prompt-builder',
    },
  ),
);

export function buildPromptFromTags(
  tagValues: string[],
  prefix: string,
  suffix: string,
  customText?: string,
): string {
  const parts: string[] = [];
  if (prefix.trim()) parts.push(prefix.trim());
  for (const v of tagValues) if (v.trim()) parts.push(v.trim());
  if (customText && customText.trim()) parts.push(customText.trim());
  if (suffix.trim()) parts.push(suffix.trim());
  return parts.join(', ');
}
