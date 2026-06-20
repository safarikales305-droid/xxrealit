'use client';

import { useAuth } from '@/hooks/use-auth';
import { useAppBadgeSync } from '@/hooks/use-app-badge';
import { useMessagesUnreadCount } from '@/hooks/use-messages-unread';
import { useNotificationsUnreadCount } from '@/hooks/use-notifications-unread';

/** Aktualizuje badge na ikoně PWA (zprávy + in-app notifikace). */
export function AppBadgeSync() {
  const { apiAccessToken } = useAuth();
  const unreadMessages = useMessagesUnreadCount(apiAccessToken);
  const unreadNotifications = useNotificationsUnreadCount(apiAccessToken);

  useAppBadgeSync(unreadMessages + unreadNotifications);
  return null;
}
