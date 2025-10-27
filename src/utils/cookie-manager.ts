import logger from "../utils/logger";

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
  maxAge?: number;
  path?: string;
  domain?: string;
}

export class CookieManager {
  private static readonly DEFAULT_OPTIONS: CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };

  /**
   * Set authentication cookies
   */
  static setAuthCookies(
    response: any,
    accessToken: string,
    refreshToken: string,
    expiresAt: number
  ): void {
    const requestId = crypto.randomUUID();
    const expiresIn = Math.floor((expiresAt - Date.now()) / 1000);

    logger.debug(
      {
        requestId,
        operation: "setAuthCookies",
        expiresIn,
        timestamp: new Date().toISOString(),
      },
      "Setting authentication cookies"
    );

    const accessTokenCookie = this.buildCookieString(
      "access_token",
      accessToken,
      {
        ...this.DEFAULT_OPTIONS,
        maxAge: expiresIn,
      }
    );

    const refreshTokenCookie = this.buildCookieString(
      "refresh_token",
      refreshToken,
      {
        ...this.DEFAULT_OPTIONS,
        maxAge: 30 * 24 * 60 * 60,
      }
    );

    const authStatusCookie = this.buildCookieString(
      "auth_status",
      "authenticated",
      {
        ...this.DEFAULT_OPTIONS,
        httpOnly: false,
        maxAge: expiresIn,
      }
    );

    // Handle Elysia's response headers - use the correct method
    try {
      if (response && typeof response.set === "function") {
        response.setHeader("Set-Cookie", [
          accessTokenCookie,
          refreshTokenCookie,
          authStatusCookie,
        ]);
      } else if (
        response &&
        response.headers &&
        typeof response.headers.append === "function"
      ) {
        // Standard Response object
        response.headers.append("Set-Cookie", accessTokenCookie);
        response.headers.append("Set-Cookie", refreshTokenCookie);
        response.headers.append("Set-Cookie", authStatusCookie);
      } else {
        logger.error(
          {
            requestId,
            operation: "setAuthCookies",
            responseType: typeof response,
            hasSet: !!(response && response.set),
            hasHeaders: !!(response && response.headers),
            timestamp: new Date().toISOString(),
          },
          "Unable to set cookies - invalid response object"
        );
      }
    } catch (error) {
      logger.error(
        {
          requestId,
          operation: "setAuthCookies",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        },
        "Error setting cookies"
      );
    }

    logger.info(
      {
        requestId,
        operation: "setAuthCookies",
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        expiresIn,
        timestamp: new Date().toISOString(),
      },
      "Authentication cookies set successfully"
    );
  }

  /**
   * Clear authentication cookies
   */
  static clearAuthCookies(response: any): void {
    const requestId = crypto.randomUUID();

    logger.debug(
      {
        requestId,
        operation: "clearAuthCookies",
        timestamp: new Date().toISOString(),
      },
      "Clearing authentication cookies"
    );

    const cookiesToClear = ["access_token", "refresh_token", "auth_status"];
    const clearCookies = cookiesToClear.map((cookieName) =>
      this.buildCookieString(cookieName, "", {
        ...this.DEFAULT_OPTIONS,
        maxAge: 0,
      })
    );

    try {
      // Handle Elysia's response headers
      if (response && typeof response.set === "function") {
        response.setHeader("Set-Cookie", clearCookies);
      } else if (
        response &&
        response.headers &&
        typeof response.headers.append === "function"
      ) {
        // Standard Response object
        clearCookies.forEach((cookie) => {
          response.headers.append("Set-Cookie", cookie);
        });
      } else {
        logger.error(
          {
            requestId,
            operation: "clearAuthCookies",
            responseType: typeof response,
            hasSet: !!(response && response.set),
            hasHeaders: !!(response && response.headers),
            timestamp: new Date().toISOString(),
          },
          "Unable to clear cookies - invalid response object"
        );
      }
    } catch (error) {
      logger.error(
        {
          requestId,
          operation: "clearAuthCookies",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        },
        "Error clearing cookies"
      );
    }

    logger.info(
      {
        requestId,
        operation: "clearAuthCookies",
        cookiesCleared: cookiesToClear,
        timestamp: new Date().toISOString(),
      },
      "Authentication cookies cleared successfully"
    );
  }

  /**
   * Extract token from cookies
   */
  static extractTokenFromCookies(
    cookieHeader: string | undefined,
    tokenName: string
  ): string | null {
    if (!cookieHeader) return null;

    const cookies = this.parseCookies(cookieHeader);
    return cookies[tokenName] || null;
  }

  /**
   * Extract access token from cookies
   */
  static extractAccessToken(cookieHeader: string | undefined): string | null {
    return this.extractTokenFromCookies(cookieHeader, "access_token");
  }

  /**
   * Extract refresh token from cookies
   */
  static extractRefreshToken(cookieHeader: string | undefined): string | null {
    return this.extractTokenFromCookies(cookieHeader, "refresh_token");
  }

  /**
   * Check if user is authenticated based on cookies
   */
  static isAuthenticated(cookieHeader: string | undefined): boolean {
    const authStatus = this.extractTokenFromCookies(
      cookieHeader,
      "auth_status"
    );
    return authStatus === "authenticated";
  }

  /**
   * Build cookie string
   */
  private static buildCookieString(
    name: string,
    value: string,
    options: CookieOptions
  ): string {
    let cookie = `${name}=${value}`;

    if (options.maxAge !== undefined) {
      cookie += `; Max-Age=${options.maxAge}`;
    }

    if (options.path) {
      cookie += `; Path=${options.path}`;
    }

    if (options.domain) {
      cookie += `; Domain=${options.domain}`;
    }

    if (options.httpOnly) {
      cookie += "; HttpOnly";
    }

    if (options.secure) {
      cookie += "; Secure";
    }

    if (options.sameSite) {
      cookie += `; SameSite=${options.sameSite}`;
    }

    return cookie;
  }

  /**
   * Parse cookies from cookie header
   */
  private static parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};

    cookieHeader.split(";").forEach((cookie) => {
      const [name, value] = cookie.trim().split("=");
      if (name && value) {
        cookies[name] = decodeURIComponent(value);
      }
    });

    return cookies;
  }
}
