import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchMe, logout as requestLogout, startKakaoLogin as beginKakaoLogin } from "../lib/auth";
import type { AuthUser } from "../lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  authChecked: boolean;
  isAuthenticated: boolean;
  refreshAuth: () => Promise<AuthUser | null>;
  startKakaoLogin: (returnTo?: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const bootstrapStartedRef = useRef(false);

  const refreshAuth = useCallback(async (): Promise<AuthUser | null> => {
    console.info("[auth-ui] bootstrap start");
    try {
      const nextUser = await fetchMe();
      setUser(nextUser);
      setAuthChecked(true);
      console.info("[auth-ui] bootstrap complete", { authenticated: Boolean(nextUser) });
      return nextUser;
    } catch (error) {
      console.warn("[auth-ui] bootstrap failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      setUser(null);
      setAuthChecked(true);
      return null;
    }
  }, []);

  useEffect(() => {
    if (bootstrapStartedRef.current) return;
    bootstrapStartedRef.current = true;
    void refreshAuth();
  }, [refreshAuth]);

  const logout = useCallback(async (): Promise<void> => {
    await requestLogout();
    setUser(null);
    setAuthChecked(true);
  }, []);

  const value: AuthContextValue = {
    user,
    authChecked,
    isAuthenticated: Boolean(user),
    refreshAuth,
    startKakaoLogin: beginKakaoLogin,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
