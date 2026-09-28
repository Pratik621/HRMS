// src/components/Common/quickAccessTheme.js
//
// Shared design tokens for the Dashboard "Quick Access" widget row (Holidays,
// Leave Balance rings, On Leave Today, Celebrations/Wishes, Post composer).
// Uses a violet/purple accent (this app's own tokens, not a copy of any
// external reference design's exact brand colors, logo, or artwork).

export const QA = {
  primary: '#2563EB', primaryLight: '#EFF6FF',
  success: '#10B981', successLight: '#ECFDF5',
  warning: '#F59E0B', warningLight: '#FFFBEB',
  purple:  '#0F766E', purpleLight:  '#F0FDFA',
  danger:  '#EF4444', dangerLight:  '#FEF2F2',
  textDark: '#111827', textMuted: '#6B7280', border: '#E5E7EB',
};

export const QA_CARD_STYLE = {
  background: '#fff',
  borderRadius: 18,
  border: `1px solid ${QA.border}`,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  transition: 'transform 0.15s, box-shadow 0.15s',
};

export const QA_CARD_TITLE_STYLE = {
  fontSize: 12, fontWeight: 700, color: QA.textMuted,
  textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12,
};

// Banner gradient — this app's own violet/indigo tokens, not a copy of any
// external reference design's specific brand colors or artwork.
export const QA_BANNER_GRADIENT = '#1F4E79';

// Shared animation classes — plain CSS only (no animation library). Render once
// via <style>{QA_ANIMATIONS_CSS}</style> inside any component using these classes.
export const QA_ANIMATIONS_CSS = `
  .qa-fade-in { animation: qaFadeIn 0.3s ease; }
  @keyframes qaFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

  .qa-hover-lift { transition: transform 0.15s ease, box-shadow 0.15s ease; }
  .qa-hover-lift:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(124,58,237,0.14); }

  .qa-confetti-piece {
    position: absolute; top: 50%; left: 50%; font-size: 16px; pointer-events: none;
    animation: qaConfettiBurst 0.9s ease-out forwards;
  }
  @keyframes qaConfettiBurst {
    0%   { transform: translate(-50%, -50%) scale(0.4) rotate(0deg); opacity: 1; }
    100% { transform: translate(var(--qa-x, 40px), var(--qa-y, -60px)) scale(1) rotate(180deg); opacity: 0; }
  }

  .qa-scroll-x { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
  .qa-scroll-x::-webkit-scrollbar { height: 6px; }
  .qa-scroll-x::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 6px; }
`;
