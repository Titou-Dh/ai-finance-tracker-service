/**
 * Cookie configuration constants for authentication
 */

const isProduction = process.env.NODE_ENV === "production";

export const secureCookieSettings = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
  ...(isProduction && { domain: process.env.COOKIE_DOMAIN }),
};

export const refreshCookieSettings = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 24 * 60 * 60,
  ...(isProduction && { domain: process.env.COOKIE_DOMAIN }),
};

export const authStatusCookieSettings = {
  httpOnly: false,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
  ...(isProduction && { domain: process.env.COOKIE_DOMAIN }),
};

export const oauthCookieSettings = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 10 * 60,
  ...(isProduction && { domain: process.env.COOKIE_DOMAIN }),
};
