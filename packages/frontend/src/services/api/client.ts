/**
 * API Client
 * Story 1.1: Landing Page & Conference Selection
 * 
 * Handles HTTP requests with proper error handling.
 * Treats 202 Accepted as success (not error).
 */

// Vite provides import.meta.env (see vite-env.d.ts for types)
// Empty string means use relative paths (proxy handles /api routing in dev)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

class ApiClient {
  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Treat 202 Accepted as success (not error)
    if (response.status === 202 || response.status === 200 || response.status === 204) {
      // Check Content-Type before parsing JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return response.json() as Promise<T>;
      }
      // Non-JSON response (204 No Content, etc.)
      return {} as T;
    }

    // Error response
    let errorData: any;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      errorData = await response.json().catch(() => ({}));
    }

    const error = new Error(errorData?.error || `HTTP ${response.status}`);
    (error as any).status = response.status;
    (error as any).response = errorData;
    throw error;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${API_BASE_URL}${path}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 200 || response.status === 204) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return response.json() as Promise<T>;
      }
      return {} as T;
    }

    let errorData: any;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      errorData = await response.json().catch(() => ({}));
    }

    const error = new Error(errorData?.error || `HTTP ${response.status}`);
    (error as any).status = response.status;
    (error as any).response = errorData;
    throw error;
  }
}

export const apiClient = new ApiClient();
