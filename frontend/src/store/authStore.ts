import { create } from 'zustand';
import api, { setAccessToken } from '../api/client';

interface User {
  id: string;
  username: string;
  role: string;
  totpEnabled: boolean;
}

interface LoginResult {
  requireTotp?: boolean;
  requireSetup2FA?: boolean;
  userId?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsSetup2FA: boolean;
  login: (username: string, password: string, totpCode?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setNeedsSetup2FA: (needs: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  needsSetup2FA: false,

  login: async (username: string, password: string, totpCode?: string) => {
    const { data } = await api.post('/auth/login', { username, password, totpCode });

    // User has 2FA enabled but didn't provide code yet
    if (data.requireTotp) {
      return { requireTotp: true, userId: data.userId };
    }

    // User authenticated but needs to set up 2FA
    setAccessToken(data.accessToken);
    if (data.requireSetup2FA) {
      set({ user: data.user, isAuthenticated: true, needsSetup2FA: true });
      return { requireSetup2FA: true };
    }

    // Full login
    set({ user: data.user, isAuthenticated: true, needsSetup2FA: false });
    return {};
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    setAccessToken(null);
    set({ user: null, isAuthenticated: false, needsSetup2FA: false });
  },

  checkAuth: async () => {
    try {
      const { data } = await api.get('/auth/me');
      const needsSetup = !data.user.totpEnabled;
      set({ user: data.user, isAuthenticated: true, isLoading: false, needsSetup2FA: needsSetup });
    } catch {
      setAccessToken(null);
      set({ user: null, isAuthenticated: false, isLoading: false, needsSetup2FA: false });
    }
  },

  setNeedsSetup2FA: (needs: boolean) => {
    set({ needsSetup2FA: needs });
  },
}));
