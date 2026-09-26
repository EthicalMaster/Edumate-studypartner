/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRequiredPool } from '../db/connection.js';

export interface NotificationRecord {
  id: string;
  student_id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, any>;
  is_read: boolean;
  created_at: Date;
  read_at: Date | null;
}

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, any>;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
  timeAgo: string;
}

export class NotificationRepository {
  /**
   * Helper to format relative time ago.
   */
  private formatTimeAgo(timestamp: Date, referenceDate: Date = new Date()): string {
    const diffMs = referenceDate.getTime() - timestamp.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  }

  toDTO(rec: NotificationRecord, referenceDate: Date = new Date()): NotificationDTO {
    return {
      id: rec.id,
      type: rec.type,
      title: rec.title,
      message: rec.message,
      metadata: typeof rec.metadata === 'string' ? JSON.parse(rec.metadata) : rec.metadata || {},
      isRead: rec.is_read,
      createdAt: rec.created_at.toISOString(),
      readAt: rec.read_at ? rec.read_at.toISOString() : null,
      timeAgo: this.formatTimeAgo(rec.created_at, referenceDate),
    };
  }

  /**
   * Retrieve all notifications for the authenticated student, strictly isolated.
   */
  async getNotifications(studentId: string, limit: number = 30): Promise<NotificationRecord[]> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT id, student_id, type, title, message, metadata, is_read, created_at, read_at
       FROM notifications
       WHERE student_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [studentId, limit]
    );

    return res.rows.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      type: r.type,
      title: r.title,
      message: r.message,
      metadata: r.metadata || {},
      is_read: Boolean(r.is_read),
      created_at: new Date(r.created_at),
      read_at: r.read_at ? new Date(r.read_at) : null,
    }));
  }

  /**
   * Get unread notification count for the authenticated student.
   */
  async getUnreadCount(studentId: string): Promise<number> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT COUNT(*)::int as unread_count
       FROM notifications
       WHERE student_id = $1 AND is_read = FALSE`,
      [studentId]
    );
    return Number(res.rows[0]?.unread_count) || 0;
  }

  /**
   * Mark a single notification as read, enforcing student ownership.
   */
  async markAsRead(id: string, studentId: string): Promise<boolean> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND student_id = $2
       RETURNING id`,
      [id, studentId]
    );
    return res.rowCount !== null && res.rowCount > 0;
  }

  /**
   * Mark all unread notifications as read for the authenticated student.
   */
  async markAllAsRead(studentId: string): Promise<number> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE student_id = $1 AND is_read = FALSE
       RETURNING id`,
      [studentId]
    );
    return res.rowCount || 0;
  }

  /**
   * Create a new notification for a student.
   */
  async createNotification(
    studentId: string,
    type: string,
    title: string,
    message: string,
    metadata: Record<string, any> = {}
  ): Promise<NotificationRecord> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `INSERT INTO notifications (student_id, type, title, message, metadata, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
       RETURNING id, student_id, type, title, message, metadata, is_read, created_at, read_at`,
      [studentId, type, title, message, JSON.stringify(metadata)]
    );

    const r = res.rows[0];
    return {
      id: r.id,
      student_id: r.student_id,
      type: r.type,
      title: r.title,
      message: r.message,
      metadata: r.metadata || {},
      is_read: Boolean(r.is_read),
      created_at: new Date(r.created_at),
      read_at: r.read_at ? new Date(r.read_at) : null,
    };
  }

  /**
   * Automatically seed a clean initial welcome notification if the student has 0 notifications.
   */
  async ensureWelcomeNotification(studentId: string, studentName?: string): Promise<void> {
    const pool = getRequiredPool();
    const countRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM notifications WHERE student_id = $1`,
      [studentId]
    );
    const count = Number(countRes.rows[0]?.count) || 0;
    if (count === 0) {
      await this.createNotification(
        studentId,
        'system',
        'Welcome to AVEN',
        `Hello ${studentName || 'Student'}! Your adaptive learning system is active. Upload course materials, take adaptive quizzes, and practice flashcards to track your mastery.`,
        { source: 'onboarding' }
      );
    }
  }
}

export const notificationRepository = new NotificationRepository();
