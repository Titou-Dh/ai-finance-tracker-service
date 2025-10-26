import { Elysia } from 'elysia';
import { AuthService } from './auth.service';

/**
 * Authentication middleware for protecting routes
 * Extracts and validates JWT token from Authorization header
 */
export const authMiddleware = new Elysia({ name: 'auth-middleware' })
  .derive({ as: 'scoped' }, async ({ headers, set }) => {
    const authHeader = headers.authorization;
    
    if (!authHeader) {
      set.status = 401;
      throw new Error('Authorization header required');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      set.status = 401;
      throw new Error('Invalid authorization header format');
    }

    const token = parts[1];
    const { user, error } = await AuthService.verifyToken(token);

    if (error || !user) {
      set.status = 401;
      throw new Error('Invalid or expired token');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name,
        created_at: user.created_at
      }
    };
  });

/**
 * Optional authentication middleware
 * Similar to authMiddleware but doesn't throw errors if no token is provided
 * Useful for routes that work with or without authentication
 */
export const optionalAuthMiddleware = new Elysia({ name: 'optional-auth-middleware' })
  .derive({ as: 'scoped' }, async ({ headers }) => {
    const authHeader = headers.authorization;
    
    if (!authHeader) {
      return { user: null };
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return { user: null };
    }

    const token = parts[1];
    const { user, error } = await AuthService.verifyToken(token);

    if (error || !user) {
      return { user: null };
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name,
        created_at: user.created_at
      }
    };
  });
