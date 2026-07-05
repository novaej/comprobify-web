import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // API accepts up to 5 proof files × 2 MB each. Set to 11 MB to give
      // a small buffer above the 10 MB worst case.
      bodySizeLimit: '11mb',
    },
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: 'novaej',
  project: '4511524532256768',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { disable: false },
});
