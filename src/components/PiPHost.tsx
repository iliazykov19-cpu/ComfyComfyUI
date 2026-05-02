'use client';

import { create } from 'zustand';
import { createPortal } from 'react-dom';

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (opts?: {
        width?: number;
        height?: number;
        disallowReturnToOpener?: boolean;
        preferInitialWindowPlacement?: boolean;
      }) => Promise<Window>;
      window: Window | null;
    };
  }
}

export function isPipSupported() {
  return (
    typeof window !== 'undefined' && 'documentPictureInPicture' in window
  );
}

function copyStyles(target: Document) {
  document.head
    .querySelectorAll('link[rel="stylesheet"], style')
    .forEach((el) => {
      target.head.appendChild(el.cloneNode(true));
    });
  target.documentElement.className = document.documentElement.className;
  target.body.className = document.body.className;
}

type PiPState = {
  doc: Document | null;
  win: Window | null;
  open: (opts?: { width?: number; height?: number }) => Promise<void>;
  close: () => void;
  /** Pinned preview lives in the main page, but its visibility is shared across pages. */
  pinned: boolean;
  setPinned: (v: boolean) => void;
};

const PIN_KEY = 'comfy-panel-pin-preview';

function readPinned(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(PIN_KEY) === '1';
}

export const usePiPStore = create<PiPState>((set, get) => ({
  doc: null,
  win: null,
  pinned: readPinned(),
  setPinned: (v) => {
    if (typeof window !== 'undefined')
      window.localStorage.setItem(PIN_KEY, v ? '1' : '0');
    set({ pinned: v });
  },
  async open(opts) {
    if (!isPipSupported()) {
      alert(
        'Picture-in-Picture is not supported in this browser. Use Chrome or Edge 116+. Try "Pin preview" instead.',
      );
      return;
    }
    if (get().win) return; // already open
    const pip = await window.documentPictureInPicture!.requestWindow({
      width: opts?.width ?? 440,
      height: opts?.height ?? 600,
    });
    copyStyles(pip.document);
    pip.document.title = 'Comfy Panel — Live Preview';
    pip.addEventListener('pagehide', () => {
      set({ win: null, doc: null });
    });
    set({ win: pip, doc: pip.document });
  },
  close() {
    const w = get().win;
    if (w) w.close();
    set({ win: null, doc: null });
  },
}));

/**
 * Returns a React-friendly facade. Used by buttons that toggle PiP visibility.
 */
export function usePiP() {
  const doc = usePiPStore((s) => s.doc);
  const open = usePiPStore((s) => s.open);
  const close = usePiPStore((s) => s.close);
  return { open, close, doc, isOpen: !!doc };
}

export function PiPPortal({
  doc,
  children,
}: {
  doc: Document | null;
  children: React.ReactNode;
}) {
  if (!doc) return null;
  return createPortal(children, doc.body);
}
