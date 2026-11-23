const API = '/api/user-preferences';

export interface UserPreferences {
  clerk_user_id: string;
  page_preferences: {
    [page: string]: {
      viewMode?: 'grid' | 'list';
      recordsPerPage?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      columnVisibility?: string[];
      [key: string]: any;
    };
  };
  global_preferences: {
    theme?: 'light' | 'dark' | 'system';
    language?: string;
    [key: string]: any;
  };
  updated_at?: string;
}

async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
  return res;
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiRequest(path, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export class UserPreferencesService {
  // Get user preferences
  static async getUserPreferences(_clerkUserId: string): Promise<UserPreferences | null> {
    try {
      const data = await apiJson<UserPreferences | null>(``);
      return data ?? null;
    } catch (error) {
      console.error('Unexpected error fetching user preferences:', error);
      return null;
    }
  }

  // Save user preferences
  static async saveUserPreferences(preferences: UserPreferences): Promise<UserPreferences> {
    try {
      const data = await apiJson<UserPreferences>(``, {
        method: 'PUT',
        body: JSON.stringify(preferences),
      });
      return data;
    } catch (error) {
      console.error('Error saving user preferences:', error);
      throw error;
    }
  }

  // Update specific page preferences
  static async updatePagePreferences(
    _clerkUserId: string,
    page: string,
    preferences: Partial<UserPreferences['page_preferences'][string]>
  ): Promise<UserPreferences> {
    try {
      const current = (await apiJson<Partial<UserPreferences> | null>(``)) ?? {};
      const pagePrefs = { ...(current.page_preferences || {}), [page]: { ...(current.page_preferences?.[page] || {}), ...preferences } };
      const globalPrefs = current.global_preferences || {};
      const updated: UserPreferences = {
        clerk_user_id: current.clerk_user_id,
        page_preferences: pagePrefs,
        global_preferences: globalPrefs,
        updated_at: new Date().toISOString(),
      };
      const data = await apiJson<UserPreferences>(``, { method: 'PUT', body: JSON.stringify(updated) });
      return data;
    } catch (error) {
      console.error('Error updating page preferences:', error);
      throw error;
    }
  }

  // Get specific page preferences
  static async getPagePreferences(
    _clerkUserId: string,
    page: string
  ): Promise<UserPreferences['page_preferences'][string] | null> {
    try {
      const current = await apiJson<UserPreferences | null>(``);
      return current?.page_preferences?.[page] ?? null;
    } catch (error) {
      console.error('Error getting page preferences:', error);
      return null;
    }
  }

  // Update global preferences
  static async updateGlobalPreferences(
    _clerkUserId: string,
    preferences: Partial<UserPreferences['global_preferences']>
  ): Promise<UserPreferences> {
    try {
      const current = (await apiJson<Partial<UserPreferences> | null>(``)) ?? {};
      const globalPrefs = { ...(current.global_preferences || {}), ...preferences };
      const pagePrefs = current.page_preferences || {};
      const updated: UserPreferences = {
        clerk_user_id: current.clerk_user_id,
        page_preferences: pagePrefs,
        global_preferences: globalPrefs,
        updated_at: new Date().toISOString(),
      };
      const data = await apiJson<UserPreferences>(``, { method: 'PUT', body: JSON.stringify(updated) });
      return data;
    } catch (error) {
      console.error('Error updating global preferences:', error);
      throw error;
    }
  }

  // Get global preferences
  static async getGlobalPreferences(
    _clerkUserId: string
  ): Promise<UserPreferences['global_preferences'] | null> {
    try {
      const current = await apiJson<UserPreferences | null>(``);
      return current?.global_preferences ?? null;
    } catch (error) {
      console.error('Error getting global preferences:', error);
      return null;
    }
  }

  // Delete user preferences
  static async deleteUserPreferences(_clerkUserId: string): Promise<void> {
    try {
      await apiRequest(``, { method: 'DELETE' });
    } catch (error) {
      console.error('Unexpected error deleting user preferences:', error);
      throw error;
    }
  }
}
