import React from 'react';

/**
 * KruDesk's logo is the word itself (teacher's choice 2026-11-21): «Kru» navy + «Desk» blue,
 * extra-bold, tight tracking. Rendered as live text in the device's system font (SF Pro on
 * iPhone, Roboto on Android, Segoe UI on Windows) so it stays sharp at every size and works
 * offline. The app UI must not use the ministry emblem.
 */
interface KruDeskWordmarkProps {
  /** Size and spacing classes, e.g. "text-4xl mb-3". */
  className?: string;
}

export const KruDeskWordmark: React.FC<KruDeskWordmarkProps> = ({ className = 'text-2xl' }) => (
  <span
    className={`inline-block font-extrabold tracking-tight leading-none select-none ${className}`}
    style={{
      fontFamily:
        '"Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Display", Roboto, "Helvetica Neue", Arial, sans-serif',
      letterSpacing: '-0.03em',
    }}
    aria-label="KruDesk"
  >
    <span className="text-[#0b1b3f] dark:text-[#f5f5f7]">Kru</span>
    <span className="text-[#1565f5] dark:text-[#5aa9ff]">Desk</span>
  </span>
);
