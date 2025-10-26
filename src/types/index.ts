export type UUID = string;

export interface User {
  id: UUID;
  email: string;
  full_name?: string;
  created_at?: string;
}

export interface Category {
  id: UUID;
  user_id?: UUID | null;
  name: string;
  icon?: string | null;
  color?: string | null;
  is_default?: boolean;
  created_at?: string;
}

export interface Expense {
  id: UUID;
  user_id: UUID;
  category_id?: UUID | null;
  amount: number;
  note?: string | null;
  expense_date: string;
  created_at?: string;
}

// Auth types
export interface SignUpRequest {
  email: string;
  password: string;
  fullName?: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface UpdatePasswordRequest {
  newPassword: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: {
    id: string;
    email: string;
    full_name?: string;
    created_at?: string;
  };
  session?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  error?: string;
}

export interface ApiError {
  success: false;
  message: string;
  error?: string;
  code?: string;
}