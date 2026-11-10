
import {
  apiRequest,
  initializeCsrfToken,
  setCsrfToken,
} from "./client";

// Register a new user
export async function registerUser(userData) {
  await initializeCsrfToken();

  const result = await apiRequest(
    "POST",
    "/auth/register",
    userData
  );

  // Refresh CSRF token after registration
  await initializeCsrfToken();

  return result;
}

// Login an existing user
export async function loginUser(credentials) {
  await initializeCsrfToken();

  const result = await apiRequest(
    "POST",
    "/auth/login",
    credentials
  );

  // Refresh CSRF token after login
  await initializeCsrfToken();

  return result;
}

// Get currently logged-in user
export async function getCurrentUser() {
  return apiRequest("GET", "/auth/me");
}

// Logout user
export async function logoutUser() {
  try {
    return await apiRequest("POST", "/auth/logout", {});
  } finally {
    setCsrfToken(null);
  }
}
