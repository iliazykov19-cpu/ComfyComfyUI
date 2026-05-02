'use client';

import { useQuery } from '@tanstack/react-query';
import { useT } from '@/store/i18n';
import { LivePreview } from './LivePreview';
import { PiPPortal, usePiPStore } from './PiPHost';
import type { ObjectInfo } from '@/lib/comfy/types';

async function fetchObjectInfo(): Promise<ObjectInfo> {
  const r = await fetch('/api/comfy/object_info');
  if (!r.ok) throw new Error(`object_info → ${r.status}`);
  return r.json();
}

/**
 * Mounts the PiP portal and the pinned-preview corner widget at the root level
 * so they survive navigation between /panel and /gallery. Reads object_info
 * via the shared react-query cache (already warmed up by /panel).
 */
export function PiPHostRoot() {
  const t = useT();
  const doc = usePiPStore((s) => s.doc);
  const pinned = usePiPStore((s) => s.pinned);
  const setPinned = usePiPStore((s) => s.setPinned);

  // Lazy: only fetch object_info if PiP/pinned is actually visible. The
  // queryClient cache will reuse the result already loaded by the panel.
  const { data: objectInfo } = useQuery({
    queryKey: ['object_info'],
    queryFn: fetchObjectInfo,
    enabled: !!doc || pinned,
    staleTime: 60_000,
  });

  return (
    <>
      <PiPPortal doc={doc}>
        <div className="fixed inset-0 flex flex-col">
          <LivePreview objectInfo={objectInfo} />
        </div>
      </PiPPortal>

      {pinned && !doc && (
        <div className="fixed bottom-4 right-4 z-50 w-80 sm:w-96 h-[480px] rounded-lg shadow-2xl border border-border bg-background overflow-hidden flex flex-col">
          <LivePreview
            objectInfo={objectInfo}
            onClose={() => setPinned(false)}
            closeLabel={t('panel.unpinPreview')}
          />
        </div>
      )}
    </>
  );
}
