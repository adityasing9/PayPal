
import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

let csrfToken = null;
let csrfRequest = null;

// Create Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Store CSRF token in memory
export function setCsrfToken(token) {
  csrfToken = token || null;
}

// Fetch CSRF token from backend
export async function initializeCsrfToken() {
  if (csrfRequest) return csrfRequest;

  csrfRequest = (async () => {
    const response = await api.get("/auth/csrf");
    const token = response.data?.data?.csrfToken;

    if (!token) {
      throw new Error("Backend did not return a CSRF token.");
    }

    setCsrfToken(token);
    return token;
  })();

  try {
    return await csrfRequest;
  } finally {
    csrfRequest = null;
  }
}

// Automatically attach CSRF token to requests that modify data
api.interceptors.request.use(async (config) => {
  const method = (config.method || "get").toUpperCase();
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);

  if (isMutation) {
    if (!csrfToken) {
      await initializeCsrfToken();
    }

    config.headers["X-CSRF-Token"] = csrfToken;
  }

  return config;
});

// Handle backend errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const responseBody = error.response?.data;

    const apiError = new Error(
      responseBody?.error?.message ||
      error.message ||
      "Unable to connect to the server."
    );

    apiError.status = error.response?.status || 0;
    apiError.code = responseBody?.error?.code || "NETWORK_ERROR";
    apiError.details = responseBody?.error?.details || [];

    return Promise.reject(apiError);
  }
);

// Reusable API request function
export async function apiRequest(method, path, data, config = {}) {
  const response = await api.request({
    method,
    url: path,
    data,
    ...config,
  });

  return response.data?.data;
}

export default api;
