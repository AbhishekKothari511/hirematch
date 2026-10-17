import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Validates request body using a Zod schema
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: formatZodErrors(result.error),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validates request query parameters using a Zod schema
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: formatZodErrors(result.error),
      });
      return;
    }
    req.query = result.data as any;
    next();
  };
}

/**
 * Validates request URL parameters using a Zod schema
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: formatZodErrors(result.error),
      });
      return;
    }
    req.params = result.data as any;
    next();
  };
}

function formatZodErrors(error: ZodError) {
  return error.errors.map((e) => ({
    field: e.path.join('.'),
    message: e.message,
    code: e.code,
  }));
}
