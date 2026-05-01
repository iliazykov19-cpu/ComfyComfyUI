'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ApiWorkflow } from '@/lib/workflow/types';
import type { WsMessage, ComfyHistory } from '@/lib/comfy/types';

export type RunStatus = 'queued' | 'running' | 'success' | 'error' | 'cancelled';

export type Run = {
  promptId: string;
  startedAt: number;
  finishedAt: number | null;
  status: RunStatus;
  progress: { value: number; max: number; nodeId: string | null } | null;
  executingNode: string | null;
  cachedNodes: string[];
  error:
    | {
        nodeId: string;
        nodeType: string;
        message: string;
        type: string;
        traceback: string[];
      }
    | null;
  preview: string | null;
  outputs: Array<{
    nodeId: string;
    filename: string;
    subfolder: string;
    type: string;
  }>;
  /** Tag labels from the prompt builder at the moment of queueing (for display). */
  builderTags?: string[];
};

type State = {
  clientId: string;
  wsStatus: 'idle' | 'connecting' | 'open' | 'closed';
  queueRemaining: number;
  runs: Run[];
  currentPromptId: string | null;
  wsTextCount: number;
  wsBinaryCount: number;
  lastBinaryDecoded: boolean;
};

type Actions = {
  ensureConnected: () => void;
  queuePrompt: (
    workflow: ApiWorkflow,
    meta?: { builderTags?: string[] },
  ) => Promise<string>;
  interrupt: () => Promise<void>;
  interruptOne: (promptId: string) => Promise<void>;
  interruptQueue: () => Promise<void>;
  clearRuns: () => void;
};

const MAX_RUNS = 20;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let lastPreviewUrl: string | null = null;

function buildWsUrl(clientId: string) {
  // WS идёт через наш сервер на /api/comfy/ws. server.js пробрасывает на ComfyUI
  // и подменяет Origin на адрес Comfy, обходя его DNS-rebinding защиту.
  const explicit = process.env.NEXT_PUBLIC_COMFY_WS_URL;
  if (explicit) {
    const u = new URL(explicit);
    u.searchParams.set('clientId', clientId);
    return u.toString();
  }
  if (typeof window === 'undefined') {
    return `ws://127.0.0.1:3000/api/comfy/ws?clientId=${clientId}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/comfy/ws?clientId=${clientId}`;
}

function genClientId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function detectMimeFromMagic(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return 'image/png';
  // WEBP: 52 49 46 46 ... 57 45 42 50
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp';
  return null;
}

async function decodeBinaryPreview(blob: Blob): Promise<string | null> {
  if (blob.size < 8) return null;
  const head = await blob.slice(0, 16).arrayBuffer();
  const view = new DataView(head);
  const headBytes = new Uint8Array(head);
  const eventType = view.getUint32(0);

  // PREVIEW_IMAGE: [event=1:4][image_type:4][bytes]
  if (eventType === 1) {
    const imageType = view.getUint32(4);
    const mime = imageType === 2 ? 'image/png' : 'image/jpeg';
    const body = blob.slice(8);
    return URL.createObjectURL(new Blob([body], { type: mime }));
  }
  // UNENCODED_PREVIEW_IMAGE: [event=2:4][image_type:4][bytes] (некоторые версии)
  if (eventType === 2) {
    const imageType = view.getUint32(4);
    const mime = imageType === 2 ? 'image/png' : 'image/jpeg';
    const body = blob.slice(8);
    return URL.createObjectURL(new Blob([body], { type: mime }));
  }
  // Fallback: попробовать определить формат по magic bytes (со сдвигом 0/4/8)
  for (const offset of [0, 4, 8]) {
    const mime = detectMimeFromMagic(headBytes.subarray(offset));
    if (mime) {
      const body = blob.slice(offset);
      return URL.createObjectURL(new Blob([body], { type: mime }));
    }
  }
  return null;
}

export const useRunStore = create<State & Actions>()(
  persist((set, get) => ({
  clientId:
    typeof window === 'undefined'
      ? 'ssr'
      : (() => {
          const k = 'comfy-panel-client-id';
          const stored = window.localStorage.getItem(k);
          if (stored) return stored;
          const id = genClientId();
          window.localStorage.setItem(k, id);
          return id;
        })(),
  wsStatus: 'idle',
  queueRemaining: 0,
  runs: [],
  currentPromptId: null,
  wsTextCount: 0,
  wsBinaryCount: 0,
  lastBinaryDecoded: false,

  ensureConnected() {
    if (typeof window === 'undefined') return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING))
      return;

    const url = buildWsUrl(get().clientId);

    set({ wsStatus: 'connecting' });
    ws = new WebSocket(url);
    ws.binaryType = 'blob';

    ws.onopen = () => {
      reconnectAttempt = 0;
      set({ wsStatus: 'open' });
    };
    ws.onclose = () => {
      set({ wsStatus: 'closed' });
      if (reconnectTimer) clearTimeout(reconnectTimer);
      // Экспоненциальный backoff: 1, 2, 4, 8, 16 (макс).
      reconnectAttempt = Math.min(reconnectAttempt + 1, 5);
      const delay = Math.min(16000, 500 * 2 ** reconnectAttempt);
      reconnectTimer = setTimeout(() => get().ensureConnected(), delay);
    };
    ws.onerror = () => {
      // onclose сработает следом
    };
    ws.onmessage = async (ev) => {
      if (typeof ev.data === 'string') {
        set((s) => ({ wsTextCount: s.wsTextCount + 1 }));
        try {
          const msg = JSON.parse(ev.data) as WsMessage;
          handleMessage(msg, set, get);
        } catch {
          /* ignore */
        }
      } else if (ev.data instanceof Blob) {
        set((s) => ({ wsBinaryCount: s.wsBinaryCount + 1 }));
        const url = await decodeBinaryPreview(ev.data);
        if (!url) {
          if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
            const head = await ev.data.slice(0, 16).arrayBuffer();
            // eslint-disable-next-line no-console
            console.warn('[comfy-ws] не удалось декодировать бинарь, первые 16 байт:', new Uint8Array(head));
          }
          set({ lastBinaryDecoded: false });
          return;
        }
        set({ lastBinaryDecoded: true });
        if (lastPreviewUrl) URL.revokeObjectURL(lastPreviewUrl);
        lastPreviewUrl = url;
        set((s) => ({
          runs: s.runs.map((r) =>
            r.promptId === s.currentPromptId
              ? { ...r, preview: url }
              : r,
          ),
        }));
      }
    };
  },

  async queuePrompt(workflow, meta) {
    get().ensureConnected();
    const r = await fetch('/api/comfy/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: get().clientId }),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`POST /prompt → ${r.status}: ${text.slice(0, 400)}`);
    }
    const data = (await r.json()) as { prompt_id: string };
    const promptId = data.prompt_id;
    const run: Run = {
      promptId,
      startedAt: Date.now(),
      finishedAt: null,
      status: 'queued',
      progress: null,
      executingNode: null,
      cachedNodes: [],
      error: null,
      preview: null,
      outputs: [],
      builderTags: meta?.builderTags,
    };
    set((s) => ({
      currentPromptId: promptId,
      runs: [run, ...s.runs].slice(0, MAX_RUNS),
    }));
    return promptId;
  },

  async interrupt() {
    const promptId = get().currentPromptId;
    await fetch('/api/comfy/interrupt', { method: 'POST' });
    if (!promptId) return;
    set((s) => ({
      runs: s.runs.map((r) =>
        r.promptId === promptId &&
        (r.status === 'queued' || r.status === 'running')
          ? {
              ...r,
              status: 'cancelled',
              finishedAt: Date.now(),
              progress: null,
              executingNode: null,
            }
          : r,
      ),
    }));
  },

  async interruptOne(promptId) {
    const run = get().runs.find((r) => r.promptId === promptId);
    if (!run) return;
    if (run.status === 'running') {
      await fetch('/api/comfy/interrupt', { method: 'POST' });
    } else if (run.status === 'queued') {
      await fetch('/api/comfy/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: [promptId] }),
      });
    }
    set((s) => ({
      runs: s.runs.map((r) =>
        r.promptId === promptId &&
        (r.status === 'queued' || r.status === 'running')
          ? {
              ...r,
              status: 'cancelled',
              finishedAt: Date.now(),
              progress: null,
              executingNode: null,
            }
          : r,
      ),
    }));
  },

  async interruptQueue() {
    // Clear all pending and interrupt the running one.
    await fetch('/api/comfy/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear: true }),
    });
    await fetch('/api/comfy/interrupt', { method: 'POST' });
    set((s) => ({
      runs: s.runs.map((r) =>
        r.status === 'queued' || r.status === 'running'
          ? {
              ...r,
              status: 'cancelled',
              finishedAt: Date.now(),
              progress: null,
              executingNode: null,
            }
          : r,
      ),
    }));
  },

  clearRuns() {
    if (lastPreviewUrl) {
      URL.revokeObjectURL(lastPreviewUrl);
      lastPreviewUrl = null;
    }
    set({ runs: [], currentPromptId: null });
  },
  }), {
    name: 'comfy-panel-runs',
    partialize: (s) => ({
      runs: s.runs.map((r) => ({ ...r, preview: null })),
      currentPromptId: s.currentPromptId,
      wsTextCount: s.wsTextCount,
      wsBinaryCount: s.wsBinaryCount,
    }),
  }),
);

function handleMessage(
  msg: WsMessage,
  set: (
    fn:
      | Partial<State & Actions>
      | ((s: State & Actions) => Partial<State & Actions>),
  ) => void,
  get: () => State & Actions,
) {
  switch (msg.type) {
    case 'status': {
      const data = msg.data as {
        status?: { exec_info?: { queue_remaining?: number } };
      };
      set({ queueRemaining: data.status?.exec_info?.queue_remaining ?? 0 });
      return;
    }
    case 'execution_start': {
      const { prompt_id } = msg.data as { prompt_id: string };
      set((s) => ({
        runs: s.runs.map((r) =>
          r.promptId === prompt_id ? { ...r, status: 'running' } : r,
        ),
      }));
      return;
    }
    case 'execution_cached': {
      const { prompt_id, nodes } = msg.data as {
        prompt_id: string;
        nodes: string[];
      };
      set((s) => ({
        runs: s.runs.map((r) =>
          r.promptId === prompt_id ? { ...r, cachedNodes: nodes } : r,
        ),
      }));
      return;
    }
    case 'executing': {
      const { node, prompt_id } = msg.data as {
        node: string | null;
        prompt_id?: string;
      };
      set((s) => ({
        runs: s.runs.map((r) =>
          r.promptId === (prompt_id ?? s.currentPromptId)
            ? { ...r, executingNode: node }
            : r,
        ),
      }));
      return;
    }
    case 'progress': {
      const d = msg.data as {
        value: number;
        max: number;
        node?: string;
        prompt_id?: string;
      };
      set((s) => ({
        runs: s.runs.map((r) =>
          r.promptId === (d.prompt_id ?? s.currentPromptId)
            ? {
                ...r,
                progress: {
                  value: d.value,
                  max: d.max,
                  nodeId: d.node ?? r.executingNode,
                },
              }
            : r,
        ),
      }));
      return;
    }
    case 'executed': {
      const d = msg.data as {
        node: string;
        output: { images?: Array<{ filename: string; subfolder: string; type: string }> };
        prompt_id?: string;
      };
      const promptId = d.prompt_id ?? get().currentPromptId;
      const newOutputs = (d.output?.images ?? []).map((img) => ({
        nodeId: d.node,
        filename: img.filename,
        subfolder: img.subfolder,
        type: img.type,
      }));
      if (newOutputs.length === 0) return;
      set((s) => ({
        runs: s.runs.map((r) =>
          r.promptId === promptId
            ? { ...r, outputs: [...r.outputs, ...newOutputs] }
            : r,
        ),
      }));
      return;
    }
    case 'execution_success': {
      const { prompt_id } = msg.data as { prompt_id: string };
      // Подтягиваем итоговые outputs из /history (на случай, если 'executed' ушло до подключения)
      void hydrateFromHistory(prompt_id, set);
      set((s) => ({
        runs: s.runs.map((r) =>
          r.promptId === prompt_id
            ? {
                ...r,
                status: 'success',
                finishedAt: Date.now(),
                progress: null,
                executingNode: null,
              }
            : r,
        ),
      }));
      return;
    }
    case 'execution_interrupted': {
      const d = msg.data as { prompt_id: string };
      set((s) => ({
        runs: s.runs.map((r) =>
          r.promptId === d.prompt_id &&
          (r.status === 'queued' || r.status === 'running')
            ? {
                ...r,
                status: 'cancelled',
                finishedAt: Date.now(),
                progress: null,
                executingNode: null,
              }
            : r,
        ),
      }));
      return;
    }
    case 'execution_error': {
      const d = msg.data as {
        prompt_id: string;
        node_id: string;
        node_type: string;
        exception_message: string;
        exception_type: string;
        traceback: string[];
      };
      set((s) => ({
        runs: s.runs.map((r) =>
          r.promptId === d.prompt_id
            ? {
                ...r,
                status: 'error',
                finishedAt: Date.now(),
                progress: null,
                executingNode: null,
                error: {
                  nodeId: d.node_id,
                  nodeType: d.node_type,
                  message: d.exception_message,
                  type: d.exception_type,
                  traceback: d.traceback,
                },
              }
            : r,
        ),
      }));
      return;
    }
  }
}

async function hydrateFromHistory(
  promptId: string,
  set: (
    fn: (s: State & Actions) => Partial<State & Actions>,
  ) => void,
) {
  try {
    const r = await fetch(`/api/comfy/history/${promptId}`);
    if (!r.ok) return;
    const data = (await r.json()) as ComfyHistory;
    const entry = data[promptId];
    if (!entry) return;
    const outputs: Run['outputs'] = [];
    for (const [nodeId, out] of Object.entries(entry.outputs ?? {})) {
      for (const img of out.images ?? []) {
        outputs.push({
          nodeId,
          filename: img.filename,
          subfolder: img.subfolder,
          type: img.type,
        });
      }
    }
    if (outputs.length === 0) return;
    set((s) => ({
      runs: s.runs.map((run) =>
        run.promptId === promptId
          ? {
              ...run,
              outputs: dedupeOutputs([...run.outputs, ...outputs]),
            }
          : run,
      ),
    }));
  } catch {
    /* ignore */
  }
}

function dedupeOutputs(arr: Run['outputs']): Run['outputs'] {
  const seen = new Set<string>();
  const out: Run['outputs'] = [];
  for (const o of arr) {
    const k = `${o.nodeId}:${o.subfolder}:${o.filename}:${o.type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out;
}

export function comfyImageUrl(
  filename: string,
  subfolder: string,
  type: string,
) {
  const params = new URLSearchParams({ filename, subfolder, type });
  return `/api/comfy/view?${params.toString()}`;
}
