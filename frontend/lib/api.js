const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const TOKEN_KEY = "civictrack_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);

export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export const decodeToken = (token) => {
  if (!token) {
    return null;
  }

  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(
      decodeURIComponent(
        Array.from(atob(base64), (char) =>
          `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
        ).join(""),
      ),
    );
  } catch {
    return null;
  }
};

export class ApiRequestError extends Error {
  constructor(response, status) {
    super(response?.message ?? `Request failed with status ${status}`);
    this.status = status;
    this.response = response;
  }
}

export const apiFetch = async (path, { body, headers, ...options } = {}) => {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");

  const token = getToken();
  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiRequestError(data, response.status);
  }

  return data;
};

export const registerUser = (payload) =>
  apiFetch("/api/auth/register", { method: "POST", body: payload });

export const loginUser = (payload) =>
  apiFetch("/api/auth/login", { method: "POST", body: payload });

export const listCategories = () => apiFetch("/api/categories");

export const createCategory = (payload) =>
  apiFetch("/api/categories", { method: "POST", body: payload });

export const updateCategory = (id, payload) =>
  apiFetch(`/api/categories/${id}`, { method: "PUT", body: payload });

export const deleteCategory = (id) =>
  apiFetch(`/api/categories/${id}`, { method: "DELETE" });