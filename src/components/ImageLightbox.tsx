'use client';

import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ExternalLink, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/store/i18n';
import { cn } from '@/lib/utils';

export type LightboxImage = {
  src: string;
  alt?: string;
  caption?: string;
  download?: string;
};

type Props = {
  images: LightboxImage[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
};

export function ImageLightbox({ images, index, onIndexChange, onClose }: Props) {
  const t = useT();
  const open = index !== null && images.length > 0;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, images.length]);

  if (!open || index === null) return null;
  const current = images[index];
  if (!current) return null;

  function prev() {
    if (index === null) return;
    onIndexChange((index - 1 + images.length) % images.length);
  }
  function next() {
    if (index === null) return;
    onIndexChange((index + 1) % images.length);
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center gap-2 p-3 text-white">
        <span className="font-mono text-xs opacity-80">
          {t('lightbox.counter', { n: index + 1, total: images.length })}
        </span>
        {current.caption && (
          <span className="text-sm opacity-80 truncate font-mono">
            · {current.caption}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <a
            href={current.src}
            target="_blank"
            rel="noreferrer"
            title={t('lightbox.openOriginal')}
            className="size-9 grid place-items-center rounded-md text-white hover:bg-white/10"
          >
            <ExternalLink className="size-4" />
          </a>
          <a
            href={current.src}
            download={current.download || ''}
            title={t('lightbox.download')}
            className="size-9 grid place-items-center rounded-md text-white hover:bg-white/10"
          >
            <Download className="size-4" />
          </a>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={onClose}
            title={t('common.close')}
          >
            <X className="size-5" />
          </Button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 relative flex items-center justify-center"
        onClick={(e) => {
          // Click on the dimmed area (not on a child) — close.
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {images.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={prev}
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 size-12 rounded-full bg-black/40 hover:bg-black/60 text-white',
            )}
            title={t('lightbox.prev')}
          >
            <ChevronLeft className="size-6" />
          </Button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.src}
          alt={current.alt ?? ''}
          onClick={onClose}
          className="max-w-[95vw] max-h-[calc(100vh-160px)] object-contain cursor-zoom-out"
        />
        {images.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={next}
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 size-12 rounded-full bg-black/40 hover:bg-black/60 text-white',
            )}
            title={t('lightbox.next')}
          >
            <ChevronRight className="size-6" />
          </Button>
        )}
      </div>

      {images.length > 1 && (
        <div className="p-3 overflow-x-auto">
          <div className="flex gap-2 mx-auto w-fit">
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onIndexChange(i)}
                className={cn(
                  'size-16 shrink-0 rounded overflow-hidden border-2 transition-all',
                  i === index
                    ? 'border-white scale-105'
                    : 'border-transparent opacity-50 hover:opacity-100',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.src}
                  alt=""
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Hook to open lightbox by index from a click handler. */
export function useLightbox() {
  const [index, setIndex] = useState<number | null>(null);
  return {
    index,
    open: (i: number) => setIndex(i),
    close: () => setIndex(null),
    setIndex,
  };
}
