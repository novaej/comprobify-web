import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { getNotificationPreferences } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { NotificationPreferences } from '@/components/notification-preferences';

export default async function NotificationsPreferencesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('notificationPreferences');

  const ctx = await requirePermission('notifications.manage', { skipIssuer: true });

  // Fetch current preferences from the API (defaults to all enabled).
  const preferences = await getNotificationPreferences({ apiKey: ctx.apiKey }).catch(() => []);

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('title')} description={t('description')} />
      <NotificationPreferences initialPreferences={preferences} />
    </div>
  );
}
