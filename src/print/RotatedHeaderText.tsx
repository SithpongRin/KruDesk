import React from 'react';

interface RotatedHeaderTextProps {
  text: string;
  heightMm: number;
  widthMm?: number;
  fontSizePt?: number;
}

/**
 * Renders vertical Khmer header text using CSS transform rotate(-90deg) inside a fixed-size box.
 * Never uses CSS writing-mode so Khmer HarfBuzz subscript/vowel shaping stays intact before rotation.
 */
export const RotatedHeaderText: React.FC<RotatedHeaderTextProps> = ({
  text,
  heightMm,
  widthMm = 8.5,
  fontSizePt = 6.5,
}) => {
  const effectiveFontPt = text.length > 20 ? Math.min(fontSizePt, 5.4) : fontSizePt;

  return (
    <div
      style={{
        position: 'relative',
        height: `${heightMm}mm`,
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: `${Math.max(8, heightMm - 1.5)}mm`,
          maxHeight: `${widthMm}mm`,
          transform: 'translate(-50%, -50%) rotate(-90deg)',
          transformOrigin: 'center center',
          fontSize: `${effectiveFontPt}pt`,
          lineHeight: 1.05,
          fontWeight: 700,
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          wordBreak: 'keep-all',
        }}
      >
        <span>{text}</span>
      </div>
    </div>
  );
};
