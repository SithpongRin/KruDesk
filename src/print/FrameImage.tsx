import React from 'react';
import type { DocumentBorderImage } from '../utils/documentBorder';

/**
 * A frame image stretched over the whole page. A built-in landscape frame on a portrait page
 * (`rotate`) is drawn at the page's swapped size and turned 90° around the page centre.
 */
export const FrameImage: React.FC<{
  image: DocumentBorderImage;
  pageWidthMm: number;
  pageHeightMm: number;
}> = ({ image, pageWidthMm, pageHeightMm }) =>
  image.rotate ? (
    <img
      src={image.dataUrl}
      alt=""
      className="absolute pointer-events-none select-none max-w-none"
      style={{
        width: `${pageHeightMm}mm`,
        height: `${pageWidthMm}mm`,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%) rotate(90deg)',
        objectFit: 'fill',
      }}
    />
  ) : (
    <img
      src={image.dataUrl}
      alt=""
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      style={{ objectFit: 'fill' }}
    />
  );
