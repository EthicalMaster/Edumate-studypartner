/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NotificationItem } from '../types';

export const notificationApi = {
  /**
   * Get all notifications and unread count for authenticated student.
   */
  async getNotifications(limit: number = 30): Promise<{
    notifications: NotificationItem[];
    unreadCount: number;
  }> {
    const res = await fetch(`/api/notifications?limit=${limit}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch notifications');
    }
    const data = await res.json();
    const mapped: NotificationItem[] = (data.notifications || []).map((n: any) => ({
      id: n.id,
      title: n.title,
      description: n.message || n.description,
      message: n.message,
      timeAgo: n.timeAgo || 'Recently',
      read: n.isRead ?? n.read ?? false,
      isRead: n.isRead ?? n.read ?? false,
      type: n.type || 'system',
      createdAt: n.createdAt,
      metadata: n.metadata,
    }));

    return {
      notifications: mapped,
      unreadCount: data.unreadCount ?? mapped.filter((m) => !m.read).length,
    };
  },

  /**
   * Get unread count.
   */
  async getUnreadCount(): Promise<number> {
    const res = await fetch('/api/notifications/unread-count', {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.unreadCount || 0;
  },

  /**
   * Mark a single notification read.
   */
  async markAsRead(id: string): Promise<void> {
    const res = await fetch(`/api/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error('Failed to mark notification read');
    }
  },

  /**
   * Mark all notifications read.
   */
  async markAllAsRead(): Promise<void> {
    const res = await fetch('/api/notifications/mark-all-read', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error('Failed to mark all notifications read');
    }
  },
};
