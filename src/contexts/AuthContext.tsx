import { createContext, useContext } from "react";
import type { AuthUser } from "../lib/auth";

export interface AuthContextValue {
  user: AuthUser | null;
  authChecked: boolean;
  isAuthenticated: boolean;
  refreshAuth: () => Promise<AuthUser | null>;
  startKakaoLogin: (returnTo?: string) => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
