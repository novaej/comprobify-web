export const contentType = 'image/svg+xml';

// Non-production builds (staging, local dev) render the mark on a denim-blue
// chip instead of production's transparent dark-arc/teal-bolt mark, so the
// browser tab is distinguishable at a glance even at 16px (a same-shape
// color swap on just the bolt was tested and didn't read at that size).
// Denim blue was picked over amber/orange because amber is already claimed
// elsewhere in the app for "needs attention" (cert expiry, sandbox banner,
// pending status) and orange sits outside the brand's teal-led cool palette;
// blue is the smallest hue-rotation from teal that's still unmistakable.
// NEXT_PUBLIC_APP_ENV is inlined at build time, so each deployment target
// bakes in its own icon — no request-time branching.
const isProduction = process.env.NEXT_PUBLIC_APP_ENV === 'production';

export default function Icon() {
  // The mark's own bounding box (arc + bolt combined) sits ~4px off true
  // center in the source artwork — invisible on a transparent background,
  // but obvious once framed by a hard-edged chip, hence the translate below.
  const svg = isProduction
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Comprobify">
  <title>Comprobify</title>
  <path d="M 88 30 A 32 32 0 1 0 88 90" stroke="#0E1116" stroke-width="16" fill="none" stroke-linecap="round"></path>
  <path d="M 104 28 L 58 58 L 74 58 L 52 100 L 78 64 L 62 64 Z" fill="#0F766E" stroke="#F7F4EE" stroke-width="6" stroke-linejoin="round" style="paint-order: stroke fill"></path>
</svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Comprobify (staging)">
  <title>Comprobify (staging)</title>
  <rect x="4" y="4" width="112" height="112" rx="26" fill="#2563EB"></rect>
  <g transform="translate(-4,-4)">
    <path d="M 88 34 A 28 28 0 1 0 88 86" stroke="#EAF1FF" stroke-width="14" fill="none" stroke-linecap="round"></path>
    <path d="M 102 32 L 60 60 L 74 60 L 54 96 L 78 66 L 64 66 Z" fill="#EAF1FF" stroke="#1E3A8A" stroke-width="5" stroke-linejoin="round" style="paint-order: stroke fill"></path>
  </g>
</svg>`;

  return new Response(svg, {
    headers: { 'Content-Type': contentType },
  });
}
