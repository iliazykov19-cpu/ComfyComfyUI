'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePanelStore } from '@/store/panel';
import { useI18n } from '@/store/i18n';
import { SOUND_OPTIONS, playSound, type SoundType } from '@/lib/sounds';
import { cn } from '@/lib/utils';

const POPOVER_W = 220;

export function SoundSelector() {
  const sound = usePanelStore((s) => s.soundOnFinish);
  const setSound = usePanelStore((s) => s.setSoundOnFinish);
  const lang = useI18n((s) => s.lang);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null,
  );
  const btnRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      setAnchor({ top: r.bottom + 4, left: r.right - POPOVER_W });
    }
    setOpen(true);
  }

  // Reposition / close on scroll/resize while open.
  useEffect(() => {
    if (!open) return;
    function reposition() {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setAnchor({ top: r.bottom + 4, left: r.right - POPOVER_W });
    }
    function close() {
      setOpen(false);
    }
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const isOff = sound === 'off';
  const current = SOUND_OPTIONS.find((o) => o.id === sound);
  const currentLabel =
    current && (lang === 'ru' ? current.labelRu : current.labelEn);

  return (
    <>
      <Button
        ref={btnRef}
        size="sm"
        variant="outline"
        onClick={toggle}
        title={lang === 'ru' ? 'Звук по окончании' : 'Sound on finish'}
      >
        {isOff ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        <span className="hidden md:inline">{currentLabel}</span>
      </Button>
      {open &&
        anchor &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[100]"
              onClick={() => setOpen(false)}
            />
            <div
              style={{
                position: 'fixed',
                top: anchor.top,
                left: Math.max(8, anchor.left),
                width: POPOVER_W,
                zIndex: 101,
              }}
              className="rounded-md border border-border bg-popover shadow-lg p-1.5"
            >
              {SOUND_OPTIONS.map((opt) => {
                const active = sound === opt.id;
                const label = lang === 'ru' ? opt.labelRu : opt.labelEn;
                return (
                  <div
                    key={opt.id}
                    className={cn(
                      'flex items-center gap-1 rounded px-2 py-1.5 text-sm',
                      active ? 'bg-muted' : 'hover:bg-muted/60',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSound(opt.id);
                        setOpen(false);
                      }}
                      className="flex-1 text-left"
                    >
                      {label}
                    </button>
                    {opt.id !== 'off' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          playSound(opt.id as SoundType);
                        }}
                        className="size-7 grid place-items-center rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
                        title={lang === 'ru' ? 'Прослушать' : 'Preview'}
                      >
                        <Play className="size-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
