import type { NextFunction, Request, Response } from 'express';
import {
  inspectSessionToken,
  type StoredUserRecord,
} from '../store/vpsStore.ts';

export interface AuthenticatedRequest extends Request {
  authUser?: StoredUserRecord;
  authToken?: string;
}

export function extractBearerToken(req: Request): string {
  const rawHeader = String(req.headers.authorization || '').trim();
  if (rawHeader.toLowerCase().startsWith('bearer ')) {
    return rawHeader.slice(7).trim();
  }
  return '';
}

export function extractRequestDeviceId(req: Request): string | undefined {
  const raw = String(req.headers['x-orglens-device-id'] || '')
    .trim()
    .slice(0, 96);
  return raw || undefined;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);
  const requestDeviceId = extractRequestDeviceId(req);
  const check = inspectSessionToken(token, requestDeviceId);
  if (!check.user) {
    res.status(401).json({
      error:
        check.message ||
        'Authentication required. Please sign in to continue.',
      code: check.code || 'AUTH_REQUIRED',
    });
    return;
  }
  req.authUser = check.user;
  req.authToken = token;
  next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);
  const requestDeviceId = extractRequestDeviceId(req);
  const check = inspectSessionToken(token, requestDeviceId);
  if (!check.user) {
    res.status(401).json({
      error: check.message || 'Administrator authentication required.',
      code: check.code || 'AUTH_REQUIRED',
    });
    return;
  }
  if (!check.user.isRootAdmin && check.user.role !== 'admin') {
    res.status(403).json({
      error: 'Administrator privileges are required.',
      code: 'ADMIN_FORBIDDEN',
    });
    return;
  }
  req.authUser = check.user;
  req.authToken = token;
  next();
}
