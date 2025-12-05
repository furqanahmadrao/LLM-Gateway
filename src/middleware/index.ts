/**
 * Middleware exports
 */

export {
  authMiddleware,
  optionalAuthMiddleware,
  requirePermission,
  extractApiKey,
  requireRole,
  requireAction,
  hasRolePermission,
  getRequiredRole,
} from './auth.js';

export {
  loggingMiddleware,
  getRequestLogger,
  CORRELATION_ID_HEADER,
} from './logging.js';

export {
  hostValidationMiddleware,
  createHostValidationMiddleware,
  getHostValidationMode,
  extractHostname,
  isValidHost,
  type HostValidationMode,
} from './hostValidation.js';
