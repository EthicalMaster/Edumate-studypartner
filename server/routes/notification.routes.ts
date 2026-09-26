/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { requireAuth, getAuthenticatedStudentId } from '../middleware/auth.middleware.js';
import { notificationService } from '../services/notification.service.js';

export const notificationRouter = Router();

// Strictly require student authentication on all notification endpoints
notificationRouter.use(requireAuth);

/**
 * GET /api/notifications
 * Retrieves real authenticated notifications and unread count.
 */
notificationRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getAuthenticatedStudentId(req);
    const studentName = req.user?.profile?.full_name || 'Student';
    const limit = req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : 30;

    const result = await notificationService.getNotifications(studentId, studentName, limit);
    res.json(result);
  } catch (err: any) {
    console.error('[Notification Routes] GET /api/notifications error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to fetch notifications.',
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Lightweight endpoint to fetch only unread notifications count.
 */
notificationRouter.get('/unread-count', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getAuthenticatedStudentId(req);
    const unreadCount = await notificationService.getUnreadCount(studentId);
    res.json({ unreadCount });
  } catch (err: any) {
    console.error('[Notification Routes] GET /api/notifications/unread-count error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to fetch unread count.',
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read for the authenticated student.
 */
notificationRouter.patch('/:id/read', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getAuthenticatedStudentId(req);
    const { id } = req.params;

    const success = await notificationService.markAsRead(id, studentId);
    if (!success) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Notification not found or access denied.',
      });
      return;
    }

    const unreadCount = await notificationService.getUnreadCount(studentId);
    res.json({ success: true, unreadCount });
  } catch (err: any) {
    console.error('[Notification Routes] PATCH /api/notifications/:id/read error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to mark notification as read.',
    });
  }
});

/**
 * POST /api/notifications/mark-all-read
 * Marks all notifications as read for the authenticated student.
 */
notificationRouter.post('/mark-all-read', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getAuthenticatedStudentId(req);
    const count = await notificationService.markAllAsRead(studentId);
    res.json({
      success: true,
      markedCount: count,
      unreadCount: 0,
    });
  } catch (err: any) {
    console.error('[Notification Routes] POST /api/notifications/mark-all-read error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to mark all notifications as read.',
    });
  }
});
