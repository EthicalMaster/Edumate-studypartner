/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: errors,
        });
        return;
      }
      res.status(400).json({
        error: 'INVALID_PAYLOAD',
        message: 'Malformed request payload',
      });
    }
  };
}
