import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: 'novaej',
  project: '4511524532256768',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { disable: false },
});
