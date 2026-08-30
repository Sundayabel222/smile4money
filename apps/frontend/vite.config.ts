import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Content Security Policy for smile4money frontend.
 *
 * Directives:
 *   default-src 'self'          — block anything not explicitly allowed
 *   script-src  'self'          — only scripts from the same origin; no inline
 *                                 scripts and no eval (prevents XSS from
 *                                 injecting scripts that steal signed txs)
 *   style-src   'self' 'unsafe-inline'
 *                               — Tailwind CSS-in-JS inlines styles at runtime;
 *                                 remove 'unsafe-inline' and add hashes here
 *                                 once the project migrates to static CSS
 *   connect-src 'self' https://soroban-testnet.stellar.org
 *               https://soroban-mainnet.stellar.org
 *               https://horizon-testnet.stellar.org
 *               https://horizon.stellar.org
 *                               — allow Stellar RPC / Horizon calls; no other
 *                                 origins may receive XHR / fetch requests
 *   img-src     'self' data:    — inline SVG favicons and og-image use data URIs
 *   font-src    'self'          — no external font CDNs
 *   object-src  'none'          — disable Flash / plugin embeds entirely
 *   base-uri    'self'          — prevent <base> tag injection
 *   frame-ancestors 'none'     — clickjacking protection
 *   form-action 'self'          — forms may only post to same origin
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  [
    "connect-src 'self'",
    'https://soroban-testnet.stellar.org',
    'https://soroban-mainnet.stellar.org',
    'https://horizon-testnet.stellar.org',
    'https://horizon.stellar.org',
  ].join(' '),
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    headers: {
      'Content-Security-Policy': CSP,
      // Belt-and-suspenders headers that reinforce the CSP
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    // css: false was removed — keep CSS processing enabled so that importing a
    // non-existent CSS module fails the test immediately rather than silently
    // succeeding. CI will catch missing CSS imports as a Vite transform error.
    coverage: {
      provider: 'v8',
      // Collect coverage only from source files (not test helpers or generated files)
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Entry points — not unit-testable in isolation
        'src/main.tsx',
        // Pure type definitions
        'src/types.ts',
        // Test setup helper
        'src/test-setup.ts',
        // Next.js / framework scaffold pages that have no unit tests yet
        'src/app/**',
        'src/pages/**',

      ],
      // Enforce minimum coverage thresholds on testable source.
      // CI will fail (exit non-zero) if any metric drops below these values.
      // Baseline measured at ~69% lines / ~77% functions / ~74% branches.
      // Raise these values as test coverage improves.
      thresholds: {
        lines: 65,
        functions: 70,
        branches: 70,
        statements: 65,
      },
    },
  },
});
