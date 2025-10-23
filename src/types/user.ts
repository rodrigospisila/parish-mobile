export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  DIOCESAN_ADMIN = 'DIOCESAN_ADMIN',
  PARISH_PRIEST = 'PARISH_PRIEST',
  PARISH_SECRETARY = 'PARISH_SECRETARY',
  COMMUNITY_LEADER = 'COMMUNITY_LEADER',
  MEMBER = 'MEMBER',
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  avatar?: string;
  dioceseId?: string;
  parishId?: string;
  communityId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

