/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { notificationRepository, type NotificationDTO } from '../repositories/notification.repository.js';

export class NotificationService {
  /**
   * Get all notifications for the authenticated student.
   */
  async getNotifications(studentId: string, studentName?: string, limit: number = 30): Promise<{
    notifications: NotificationDTO[];
    unreadCount: number;
  }> {
    // Ensure initial welcome notification if fresh student
    await notificationRepository.ensureWelcomeNotification(studentId, studentName);

    const [records, unreadCount] = await Promise.all([
      notificationRepository.getNotifications(studentId, limit),
      notificationRepository.getUnreadCount(studentId),
    ]);

    const dtos = records.map((r) => notificationRepository.toDTO(r));
    return {
      notifications: dtos,
      unreadCount,
    };
  }

  /**
   * Get unread count only.
   */
  async getUnreadCount(studentId: string): Promise<number> {
    return notificationRepository.getUnreadCount(studentId);
  }

  /**
   * Mark single notification read.
   */
  async markAsRead(id: string, studentId: string): Promise<boolean> {
    return notificationRepository.markAsRead(id, studentId);
  }

  /**
   * Mark all read.
   */
  async markAllAsRead(studentId: string): Promise<number> {
    return notificationRepository.markAllAsRead(studentId);
  }

  /**
   * Event trigger: Quiz completed.
   */
  async notifyQuizCompleted(
    studentId: string,
    quizTitle: string,
    score: number,
    percentage: number,
    totalQuestions: number
  ): Promise<void> {
    try {
      await notificationRepository.createNotification(
        studentId,
        'quiz_completed',
        `Quiz Completed: ${quizTitle}`,
        `You scored ${score} pts (${percentage}%) across ${totalQuestions} questions.`,
        { quizTitle, score, percentage, totalQuestions }
      );
    } catch (err) {
      console.warn('[NotificationService] Failed to create quiz_completed notification:', err);
    }
  }

  /**
   * Event trigger: Study Material processed.
   */
  async notifyMaterialProcessed(
    studentId: string,
    materialTitle: string,
    chunksCount: number
  ): Promise<void> {
    try {
      await notificationRepository.createNotification(
        studentId,
        'material_processed',
        `Document Structured: ${materialTitle}`,
        `Successfully analyzed and indexed ${chunksCount} knowledge chunks for retrieval.`,
        { materialTitle, chunksCount }
      );
    } catch (err) {
      console.warn('[NotificationService] Failed to create material_processed notification:', err);
    }
  }

  /**
   * Event trigger: Weak topic detected.
   */
  async notifyWeakTopicDetected(
    studentId: string,
    subject: string,
    topic: string,
    accuracy: number
  ): Promise<void> {
    try {
      await notificationRepository.createNotification(
        studentId,
        'weak_topic_detected',
        `Remedial Focus: ${topic}`,
        `Empirical accuracy is ${accuracy}% in ${subject}. Targeted practice drill queued.`,
        { subject, topic, accuracy }
      );
    } catch (err) {
      console.warn('[NotificationService] Failed to create weak_topic_detected notification:', err);
    }
  }

  /**
   * Event trigger: Flashcards generated.
   */
  async notifyCardsGenerated(
    studentId: string,
    subject: string,
    cardsCount: number
  ): Promise<void> {
    try {
      await notificationRepository.createNotification(
        studentId,
        'flashcards_generated',
        `Flashcards Prepared: ${subject}`,
        `Added ${cardsCount} spaced repetition cards for ${subject} to your retention library.`,
        { subject, cardsCount }
      );
    } catch (err) {
      console.warn('[NotificationService] Failed to create flashcards_generated notification:', err);
    }
  }
}

export const notificationService = new NotificationService();
