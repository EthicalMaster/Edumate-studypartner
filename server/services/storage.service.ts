/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface StorageSaveResult {
  storageKey: string;
  fileSizeBytes: number;
}

export interface IStorageService {
  save(buffer: Buffer, originalFilename: string, mimeType: string): Promise<StorageSaveResult>;
  get(storageKey: string): Promise<Buffer | null>;
  load(storageKey: string): Promise<Buffer | null>;
  getStream(storageKey: string): fs.ReadStream | null;
  delete(storageKey: string): Promise<boolean>;
  exists(storageKey: string): Promise<boolean>;
  getFilePath(storageKey: string): string | null;
}

/**
 * Local filesystem implementation of IStorageService.
 * Designed with a clean storage abstraction so self-hosted S3/MinIO
 * can replace it in future phases without touching domain code.
 */
export class LocalStorageService implements IStorageService {
  private readonly baseDir: string;

  constructor(customDir?: string) {
    this.baseDir = customDir || path.join(process.cwd(), 'uploads', 'materials');
    this.ensureDirectoryExists();
  }

  /**
   * Ensures the storage directory exists on disk.
   */
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Sanitizes and validates a storage key against path traversal attacks.
   * Disallows '/', '\', '..', and any non-alphanumeric/dot/dash/underscore characters.
   */
  private validateAndResolveKey(storageKey: string): string {
    if (!storageKey || typeof storageKey !== 'string') {
      throw new Error('STORAGE_KEY_INVALID: Storage key must be a non-empty string.');
    }

    // Strict regex: only alphanumeric, hyphen, underscore, and dot
    const safeKeyRegex = /^[a-zA-Z0-9_\-\.]+$/;
    if (!safeKeyRegex.test(storageKey) || storageKey.includes('..')) {
      throw new Error('PATH_TRAVERSAL_DETECTED: Invalid storage key characters detected.');
    }

    const resolved = path.resolve(this.baseDir, path.basename(storageKey));
    const baseResolved = path.resolve(this.baseDir);

    if (!resolved.startsWith(baseResolved)) {
      throw new Error('PATH_TRAVERSAL_DETECTED: Storage key attempts to escape storage root.');
    }

    return resolved;
  }

  /**
   * Generates a collision-safe storage key using crypto.randomUUID().
   */
  private generateStorageKey(originalFilename: string): string {
    const rawExt = path.extname(originalFilename).toLowerCase();
    // Allow only safe alphanumeric extensions up to 10 chars
    const safeExt = /^\.[a-zA-Z0-9]{1,10}$/.test(rawExt) ? rawExt : '.bin';
    const uuid = crypto.randomUUID();
    return `${uuid}${safeExt}`;
  }

  /**
   * Saves a file buffer to storage.
   */
  async save(buffer: Buffer, originalFilename: string, _mimeType: string): Promise<StorageSaveResult> {
    this.ensureDirectoryExists();

    const storageKey = this.generateStorageKey(originalFilename);
    const targetPath = this.validateAndResolveKey(storageKey);

    await fs.promises.writeFile(targetPath, buffer);
    const stats = await fs.promises.stat(targetPath);

    return {
      storageKey,
      fileSizeBytes: stats.size,
    };
  }

  /**
   * Retrieves a file's buffer from storage. Returns null if file does not exist.
   */
  async get(storageKey: string): Promise<Buffer | null> {
    try {
      const filePath = this.validateAndResolveKey(storageKey);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      return await fs.promises.readFile(filePath);
    } catch (err: any) {
      if (err.message?.includes('PATH_TRAVERSAL_DETECTED')) {
        throw err;
      }
      return null;
    }
  }

  /**
   * Alias for get to support descriptive pipeline loading.
   */
  async load(storageKey: string): Promise<Buffer | null> {
    return this.get(storageKey);
  }

  /**
   * Creates a readable stream for the stored file. Returns null if not found.
   */
  getStream(storageKey: string): fs.ReadStream | null {
    try {
      const filePath = this.validateAndResolveKey(storageKey);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      return fs.createReadStream(filePath);
    } catch (err: any) {
      if (err.message?.includes('PATH_TRAVERSAL_DETECTED')) {
        throw err;
      }
      return null;
    }
  }

  /**
   * Deletes a stored file. Returns true if successfully removed or if already gone.
   */
  async delete(storageKey: string): Promise<boolean> {
    try {
      const filePath = this.validateAndResolveKey(storageKey);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      return true;
    } catch (err: any) {
      if (err.message?.includes('PATH_TRAVERSAL_DETECTED')) {
        throw err;
      }
      return false;
    }
  }

  /**
   * Checks if a file exists in storage.
   */
  async exists(storageKey: string): Promise<boolean> {
    try {
      const filePath = this.validateAndResolveKey(storageKey);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Resolves safe local file path (for internal streaming/piping only).
   */
  getFilePath(storageKey: string): string | null {
    try {
      const filePath = this.validateAndResolveKey(storageKey);
      return fs.existsSync(filePath) ? filePath : null;
    } catch {
      return null;
    }
  }
}

// Global default storage service instance
export const storageService = new LocalStorageService();
