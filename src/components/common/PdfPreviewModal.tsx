import React from 'react';
import { Download } from 'lucide-react';
import { AppleModal } from './AppleModal';
import { AppleButton } from './AppleButton';
import { usePdfPreviewStore } from '../../store/usePdfPreviewStore';
import { useAppStore } from '../../store/useAppStore';
import { toKhmerNumerals } from '../../utils/khmerNumerals';

/**
 * «មើលមុន» before every PDF download. It shows the very page images the PDF is built from,
 * so what the teacher sees here is exactly what the PDF contains.
 */
export const PdfPreviewModal: React.FC = () => {
  const request = usePdfPreviewStore((s) => s.request);
  const close = usePdfPreviewStore((s) => s.close);
  const useKhmerNumerals = useAppStore((s) => s.useKhmerNumerals);
  const fmt = (n: number) => (useKhmerNumerals ? toKhmerNumerals(n) : String(n));

  if (!request) return null;
  const { pages, fileName, orientation } = request;
  const total = pages.length;

  return (
    <AppleModal
      isOpen={true}
      onClose={() => close(false)}
      title="មើលមុន (Preview)"
      subtitle={`${fileName} · ${fmt(total)} ទំព័រ — ដូច PDF ដែលនឹងទាញយកទាំងស្រុង`}
      maxWidth={orientation === 'landscape' ? '6xl' : '4xl'}
      footer={
        <>
          <AppleButton variant="secondary" size="sm" onClick={() => close(false)}>
            បិទ
          </AppleButton>
          <AppleButton
            variant="primary"
            size="sm"
            icon={<Download size={15} />}
            onClick={() => close(true)}
          >
            ទាញយក PDF
          </AppleButton>
        </>
      }
    >
      <div
        className="space-y-5 bg-[#e8e8ed] dark:bg-black/40 -m-6 p-4 sm:p-6"
        data-testid="pdf-preview-pages"
      >
        {pages.map((src, idx) => (
          <figure key={idx} className="mx-auto" style={{ maxWidth: orientation === 'landscape' ? '1100px' : '794px' }}>
            <img
              src={src}
              alt={`ទំព័រ ${idx + 1}`}
              className="w-full h-auto bg-white shadow-[0_4px_18px_rgba(0,0,0,0.18)]"
            />
            {total > 1 && (
              <figcaption className="text-center text-[11px] text-[#6e6e73] dark:text-[#98989d] mt-1.5">
                ទំព័រ {fmt(idx + 1)} / {fmt(total)}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </AppleModal>
  );
};
