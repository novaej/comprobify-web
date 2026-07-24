export const contentType = 'image/svg+xml';

// Every environment renders the mark on a solid chip so the difference between
// tabs is purely color, not shape — a same-shape color swap on just the bolt
// (no chip) was tested first and didn't read at real 16px favicon size.
//
// Production's chip is the brand's own teal: it shouldn't need a *new* color
// to feel legitimate, just the most solid version of the existing mark — chip
// colors reuse logo.tsx's existing dark-mode mark palette (cream arc, bright
// teal bolt, ink stroke), not an invented one. Staging is denim blue: the
// smallest hue-rotation from teal that's still unmistakable at a glance, and
// picked over amber/orange because amber is already claimed elsewhere in the
// app for "needs attention" (cert expiry, sandbox banner, pending status).
//
// NEXT_PUBLIC_APP_ENV is inlined at build time, so each deployment target
// bakes in its own icon — no request-time branching.
const isProduction = process.env.NEXT_PUBLIC_APP_ENV === 'production';

const chip = isProduction
  ? { label: 'Comprobify', bg: '#0F766E', arc: '#F7F4EE', bolt: '#2DD4BF', boltStroke: '#0B1220' }
  : { label: 'Comprobify (staging)', bg: '#2563EB', arc: '#EAF1FF', bolt: '#EAF1FF', boltStroke: '#1E3A8A' };

export default function Icon() {
  // The mark's own bounding box (arc + bolt combined) sits ~4px off true
  // center in the source artwork — invisible on a transparent background,
  // but obvious once framed by a hard-edged chip, hence the translate below.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="${chip.label}">
  <title>${chip.label}</title>
  <rect x="4" y="4" width="112" height="112" rx="26" fill="${chip.bg}"></rect>
  <g transform="translate(-4,-4)">
    <path d="M 88 34 A 28 28 0 1 0 88 86" stroke="${chip.arc}" stroke-width="14" fill="none" stroke-linecap="round"></path>
    <path d="M 102 32 L 60 60 L 74 60 L 54 96 L 78 66 L 64 66 Z" fill="${chip.bolt}" stroke="${chip.boltStroke}" stroke-width="5" stroke-linejoin="round" style="paint-order: stroke fill"></path>
  </g>
</svg>`;

  return new Response(svg, {
    headers: { 'Content-Type': contentType },
  });
}
