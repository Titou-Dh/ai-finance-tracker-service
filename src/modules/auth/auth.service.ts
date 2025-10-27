import { createClient } from '@supabase/supabase-js';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import logger from '../../utils/logger';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: AuthError | null;
}

export interface SignUpData {
  email: string;
  password: string;
  fullName?: string;
}

export interface SignInData {
  email: string;
  password: string;
}

export interface ResetPasswordData {
  email: string;
}

export class AuthService {
  /**
   * Register a new user
   */
  static async register(data: SignUpData): Promise<AuthResponse> {
    const requestId = crypto.randomUUID();
    
    logger.info({
      requestId,
      operation: 'register',
      email: data.email,
      hasFullName: !!data.fullName,
      timestamp: new Date().toISOString()
    }, 'Starting user registration');

    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName || '',
          }
        }
      });

      if (error) {
        logger.warn({
          requestId,
          operation: 'register',
          email: data.email,
          error: error.message,
          errorCode: error.status,
          timestamp: new Date().toISOString()
        }, 'User registration failed');
      } else {
        logger.info({
          requestId,
          operation: 'register',
          userId: authData.user?.id,
          email: data.email,
          hasSession: !!authData.session,
          timestamp: new Date().toISOString()
        }, 'User registration successful');
      }

      return {
        user: authData.user,
        session: authData.session,
        error
      };
    } catch (error) {
      logger.error({
        requestId,
        operation: 'register',
        email: data.email,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }, 'User registration error');

      return {
        user: null,
        session: null,
        error: error as AuthError
      };
    }
  }

  /**
   * Sign in an existing user
   */
  static async login(data: SignInData): Promise<AuthResponse> {
    const requestId = crypto.randomUUID();
    
    logger.info({
      requestId,
      operation: 'login',
      email: data.email,
      timestamp: new Date().toISOString()
    }, 'Starting user login');

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password
      });

      if (error) {
        logger.warn({
          requestId,
          operation: 'login',
          email: data.email,
          error: error.message,
          errorCode: error.status,
          timestamp: new Date().toISOString()
        }, 'User login failed');
      } else {
        logger.info({
          requestId,
          operation: 'login',
          userId: authData.user?.id,
          email: data.email,
          hasSession: !!authData.session,
          timestamp: new Date().toISOString()
        }, 'User login successful');
      }

      return {
        user: authData.user,
        session: authData.session,
        error
      };
    } catch (error) {
      logger.error({
        requestId,
        operation: 'login',
        email: data.email,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }, 'User login error');

      return {
        user: null,
        session: null,
        error: error as AuthError
      };
    }
  }

  /**
   * Sign out the current user
   */
  static async logout(): Promise<{ error: AuthError | null }> {
    const requestId = crypto.randomUUID();
    
    logger.info({
      requestId,
      operation: 'logout',
      timestamp: new Date().toISOString()
    }, 'Starting user logout');

    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        logger.warn({
          requestId,
          operation: 'logout',
          error: error.message,
          timestamp: new Date().toISOString()
        }, 'Logout failed');
      } else {
        logger.info({
          requestId,
          operation: 'logout',
          timestamp: new Date().toISOString()
        }, 'Logout successful');
      }
      
      return { error };
    } catch (error) {
      logger.error({
        requestId,
        operation: 'logout',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, 'Logout error');

      return { error: error as AuthError };
    }
  }

  /**
   * Get current user session
   */
  static async getSession(): Promise<{ session: Session | null; error: AuthError | null }> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      return { session, error };
    } catch (error) {
      return { session: null, error: error as AuthError };
    }
  }

  /**
   * Get current user
   */
  static async getUser(): Promise<{ user: User | null; error: AuthError | null }> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      return { user, error };
    } catch (error) {
      return { user: null, error: error as AuthError };
    }
  }

  /**
   * Reset password for a user
   */
  static async resetPassword(data: ResetPasswordData): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password`
      });
      return { error };
    } catch (error) {
      return { error: error as AuthError };
    }
  }

  /**
   * Update user password
   */
  static async updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      return { error };
    } catch (error) {
      return { error: error as AuthError };
    }
  }

  /**
   * Delete user account (admin operation)
   */
  static async deleteAccount(userId: string): Promise<{ error: AuthError | null }> {
    const requestId = crypto.randomUUID();
    
    logger.info({
      requestId,
      operation: 'deleteAccount',
      userId,
      timestamp: new Date().toISOString()
    }, 'Starting account deletion');

    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      
      if (error) {
        logger.error({
          requestId,
          operation: 'deleteAccount',
          userId,
          error: error.message,
          errorCode: error.status,
          timestamp: new Date().toISOString()
        }, 'Account deletion failed');
      } else {
        logger.info({
          requestId,
          operation: 'deleteAccount',
          userId,
          timestamp: new Date().toISOString()
        }, 'Account deletion successful');
      }
      
      return { error };
    } catch (error) {
      logger.error({
        requestId,
        operation: 'deleteAccount',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }, 'Account deletion error');

      return { error: error as AuthError };
    }
  }

  /**
   * Verify JWT token
   */
  static async verifyToken(token: string): Promise<{ user: User | null; error: AuthError | null }> {
    const requestId = crypto.randomUUID();
    const tokenPrefix = token.substring(0, 10) + '...';
    
    logger.debug({
      requestId,
      operation: 'verifyToken',
      tokenPrefix,
      timestamp: new Date().toISOString()
    }, 'Verifying JWT token');

    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error) {
        logger.warn({
          requestId,
          operation: 'verifyToken',
          tokenPrefix,
          error: error.message,
          errorCode: error.status,
          timestamp: new Date().toISOString()
        }, 'Token verification failed');
      } else {
        logger.debug({
          requestId,
          operation: 'verifyToken',
          userId: user?.id,
          tokenPrefix,
          timestamp: new Date().toISOString()
        }, 'Token verification successful');
      }
      
      return { user, error };
    } catch (error) {
      logger.error({
        requestId,
        operation: 'verifyToken',
        tokenPrefix,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, 'Token verification error');

      return { user: null, error: error as AuthError };
    }
  }

  /**
   * Refresh session
   */
  static async refreshSession(refreshToken: string): Promise<AuthResponse> {
    try {
      const { data: authData, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken
      });

      return {
        user: authData.user,
        session: authData.session,
        error
      };
    } catch (error) {
      return {
        user: null,
        session: null,
        error: error as AuthError
      };
    }
  }
}
