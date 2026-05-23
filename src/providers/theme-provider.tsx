'use client';

// Re-export our React-19-compatible theme provider.
// next-themes' ThemeProvider injects a bare <script> React element to prevent
// FOUC, which React 19 warns about. We use our own implementation in
// theme-shim.ts and handle FOUC via <Script strategy="beforeInteractive"> in
// src/app/layout.tsx instead.
export { ThemeProvider } from '@/providers/theme-shim';
