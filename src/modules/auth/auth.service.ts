import { createClient } from '@supabase/supabase-js';
import type { User, Session, AuthError } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

// Client for user operations (uses anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations (uses service key)
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

  /**
   * Sign in an existing user
   */
  static async login(data: SignInData): Promise<AuthResponse> {
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password
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

  /**
   * Sign out the current user
   */
  static async logout(): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.signOut();
      return { error };
    } catch (error) {
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
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      return { error };
    } catch (error) {
      return { error: error as AuthError };
    }
  }

  /**
   * Verify JWT token
   */
  static async verifyToken(token: string): Promise<{ user: User | null; error: AuthError | null }> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      return { user, error };
    } catch (error) {
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
