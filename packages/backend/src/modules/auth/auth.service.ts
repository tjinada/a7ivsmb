import { timingSafeEqual } from 'node:crypto';
import { config } from '../../config/index.js';
import { AppError, generateToken, generateRefreshToken, verifyRefreshToken } from '../../middleware/index.js';
import type { AuthResponse, AuthUser } from '@sonycam/shared';
import type { LoginInput } from './auth.validation.js';

/** Constant-time string compare to avoid leaking length/timing on creds. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const authService = {
  login(input: LoginInput): AuthResponse {
    const userOk = safeEqual(input.username, config.appUser);
    const passOk = config.appPass.length > 0 && safeEqual(input.password, config.appPass);

    if (!userOk || !passOk) {
      throw new AppError('Invalid username or password', 401);
    }

    const user: AuthUser = { username: config.appUser };
    return {
      token: generateToken(user.username),
      refreshToken: generateRefreshToken(user.username),
      user,
    };
  },

  refresh(refreshToken: string): { token: string; refreshToken: string } {
    const { username } = verifyRefreshToken(refreshToken);
    if (!safeEqual(username, config.appUser)) {
      throw new AppError('Invalid refresh token', 401);
    }
    return {
      token: generateToken(username),
      refreshToken: generateRefreshToken(username),
    };
  },
};
