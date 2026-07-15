import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { MARKETING_BASE_URL, MARKETING_ROUTES, SEO_INDEXABLE } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  if (!SEO_INDEXABLE) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  const allow = routing.locales.flatMap((locale) =>
    MARKETING_ROUTES.map((route) => `/${locale}${route}`),
  );

  return {
    rules: { userAgent: '*', allow, disallow: '/' },
    sitemap: `${MARKETING_BASE_URL}/sitemap.xml`,
  };
}
