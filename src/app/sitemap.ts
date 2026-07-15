import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { MARKETING_BASE_URL, MARKETING_ROUTES, SEO_INDEXABLE, localeAlternates } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  if (!SEO_INDEXABLE) return [];

  const lastModified = new Date();

  return MARKETING_ROUTES.map((route) => ({
    url: `${MARKETING_BASE_URL}/${routing.defaultLocale}${route}`,
    lastModified,
    alternates: { languages: localeAlternates(route) },
  }));
}
