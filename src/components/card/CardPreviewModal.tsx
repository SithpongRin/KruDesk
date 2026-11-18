import React, { useState } from 'react';
import type { Student } from '../../types/cardStudent';
import { CardTemplate } from '../../types/template';
import { AppleModal } from '../common/AppleModal';
import { AppleSegmentedControl } from '../common/AppleSegmentedControl';
import { AppleButton } from '../common/AppleButton';
import { StudentCardFront } from './StudentCardFront';
import { StudentCardBack } from './StudentCardBack';
import { ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface CardPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  student?: Student;
  template: CardTemplate;
}

export const CardPreviewModal: React.FC<CardPreviewModalProps> = ({
  isOpen,
  onClose,
  student,
  template,
}) => {
  const [side, setSide] = useState<'both' | 'front' | 'back'>('both');
  const [zoom, setZoom] = useState<number>(1);

  if (!isOpen) return null;

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="មើលគំរូកាតសិស្ស (Card Preview)"
      subtitle={student ? `${student.nameKm} (${student.studentId}) — ថ្នាក់ ${student.class}` : 'គំរូកាតទទេ (Blank Template)'}
      maxWidth="4xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
              className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#6e6e73] dark:text-[#98989d]"
              title="បង្រួម (Zoom Out)"
              aria-label="បង្រួមទំហំកាត"
            >
              <ZoomOut size={18} />
            </button>
            <span className="text-xs font-medium text-[#86868b] min-w-[45px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
              className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#6e6e73] dark:text-[#98989d]"
              title="ពង្រីក (Zoom In)"
              aria-label="ពង្រីកទំហំកាត"
            >
              <ZoomIn size={18} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#6e6e73] dark:text-[#98989d]"
              title="កំណត់ទំហំដើម (Reset Zoom)"
              aria-label="កំណត់ទំហំដើម"
            >
              <RotateCw size={16} />
            </button>
          </div>

          <AppleButton variant="secondary" onClick={onClose}>
            បិទ (Close)
          </AppleButton>
        </div>
      }
    >
      <div className="flex flex-col items-center">
        {/* Apple Segmented Switcher */}
        <div className="mb-6">
          <AppleSegmentedControl
            options={[
              { value: 'both', label: 'សងខាង (Front & Back)' },
              { value: 'front', label: 'ខាងមុខ (Front)' },
              { value: 'back', label: 'ខាងក្រោយ (Back)' },
            ]}
            value={side}
            onChange={(v) => setSide(v as any)}
          />
        </div>

        {/* Display Container with Apple background grid */}
        <div className="w-full flex items-center justify-center p-6 bg-[#f5f5f7] dark:bg-black/30 rounded-2xl overflow-auto min-h-[460px]">
          <div className="flex flex-wrap items-center justify-center gap-8">
            {(side === 'both' || side === 'front') && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs font-semibold text-[#86868b] tracking-wider uppercase">
                  ខាងមុខ (Front Side)
                </span>
                <div className="shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-sm overflow-hidden bg-white">
                  <StudentCardFront
                    student={student}
                    template={template}
                    scale={zoom}
                    showCuttingBorder={false}
                  />
                </div>
              </div>
            )}

            {(side === 'both' || side === 'back') && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs font-semibold text-[#86868b] tracking-wider uppercase">
                  ខាងក្រោយ (Back Side)
                </span>
                <div className="shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-sm overflow-hidden bg-white">
                  <StudentCardBack
                    template={template}
                    scale={zoom}
                    showCuttingBorder={false}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppleModal>
  );
};
