import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import './Dialog.css';

type Props = { videoId: string; open: boolean; onClose: () => void };

/** YouTube intro in a modal (privacy-enhanced embed, loaded only when opened). */
export function VideoModal({ videoId, open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dlg dlg--video" aria-label="Studio intro video" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <button type="button" className="dlg__close" onClick={onClose} aria-label="Close video">
        <X size={22} />
      </button>
      {open && (
        <div className="video">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`}
            title="NIKHILs TECH STUDIO intro"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </dialog>
  );
}
