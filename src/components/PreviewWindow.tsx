'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, PinIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isPipSupported, usePiPStore } from './PiPHost';
import { useT } from '@/store/i18n';

/**
 * Toolbar buttons that toggle PiP and pinned-preview visibility. The actual
 * windows are mounted at the root (PiPHostRoot in providers) so they survive
 * navigation between /panel and /gallery.
 */
export function PreviewWindow() {
  const t = useT();
  const doc = usePiPStore((s) => s.doc);
  const open = usePiPStore((s) => s.open);
  const close = usePiPStore((s) => s.close);
  const pinned = usePiPStore((s) => s.pinned);
  const setPinned = usePiPStore((s) => s.setPinned);
  const isOpen = !!doc;
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(isPipSupported());
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => (isOpen ? close() : open())}
        disabled={!supported}
        title={isOpen ? t('panel.closePip') : t('panel.openPip')}
      >
        <ExternalLink className="size-4" />
        {isOpen ? t('panel.closePip') : t('panel.openPip')}
      </Button>
      <Button
        variant={pinned ? 'default' : 'outline'}
        size="sm"
        onClick={() => setPinned(!pinned)}
        title={pinned ? t('panel.unpinPreview') : t('panel.pinPreview')}
      >
        <PinIcon className="size-4" />
        {pinned ? t('panel.unpinPreview') : t('panel.pinPreview')}
      </Button>
    </>
  );
}
