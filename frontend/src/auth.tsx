import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { loginRequest, TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";

export type AuthUser = { username: string; display_name: string; role: "admin" | "agent" };

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

const USER_KEY = "agendavisite_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet(TOKEN_KEY, "");
      const saved = await storage.getItem<AuthUser | null>(USER_KEY, null);
      if (token && saved) setUser(saved as AuthUser);
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await loginRequest(username, password);
    await storage.secureSet(TOKEN_KEY, data.access_token);
    await storage.setItem(USER_KEY, data.user);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    await storage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
