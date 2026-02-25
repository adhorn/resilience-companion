import React, { createContext, useContext } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  teamId: string;
  role: string;
}

interface AuthContext {
  user: User;
}

const AuthCtx = createContext<AuthContext>(null!);

// No login needed — single-tenant app with a default user
const DEFAULT_USER: User = {
  id: "default",
  name: "Default User",
  email: "user@localhost",
  teamId: "default",
  role: "ADMIN",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthCtx.Provider value={{ user: DEFAULT_USER }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
