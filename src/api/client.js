/**
 * IntentLock Commerce - Unified Frontend API Client
 *
 * CRITICAL TRANSPORT INVARIANTS:
 * 1. credentials: 'include' for HttpOnly SameSite=Strict intentlock_session cookie.
 * 2. Automatic CSRF token bootstrapping and injection via X-CSRF-Token header.
 * 3. Idempotency-Key generation for financial endpoints.
 * 4. Dual-signature compatibility: supports both (endpoint, options) and (method, endpoint, data, config).
 */

const API_BASE = '/api';

let cachedCsrfToken = null;
let csrfPromise = null;

/**
 * Initializes or refreshes the CSRF token.
 *
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<string>}
 */
export async function getCsrfToken(forceRefresh = false) {
  if (cachedCsrfToken && !forceRefresh) {
    return cachedCsrfToken;
  }

  if (csrfPromise && !forceRefresh) {
    return csrfPromise;
  }

  csrfPromise = fetch(`${API_BASE}/auth/csrf`, {
    method: 'GET',
    credentials: 'include'
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (data.success && data.data?.csrfToken) {
        cachedCsrfToken = data.data.csrfToken;
        return cachedCsrfToken;
      }
      throw new Error(data.error?.message || 'Failed to fetch CSRF token');
    })
    .finally(() => {
      csrfPromise = null;
    });

  return csrfPromise;
}

export const initializeCsrfToken = () => getCsrfToken(false);
export const setCsrfToken = (token) => {
  cachedCsrfToken = token || null;
};

/**
 * Raw dispatch handler with automatic CSRF management and credentials inclusion.
 *
 * @param {string} endpoint - Path relative to /api (e.g. '/intents')
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function rawApiRequest(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  // Mutating requests require X-CSRF-Token
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = await getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let url = `${API_BASE}${cleanPath}`;

  // Handle params query string if provided in config
  if (options.params && typeof options.params === 'object') {
    const searchParams = new globalThis.URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const qs = searchParams.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }

  let response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'include'
  });

  // If CSRF token expired or missing, refresh once and retry
  if (response.status === 403) {
    const errBody = await response.clone().json().catch(() => ({}));
    if (
      errBody?.error?.code === 'INVALID_CSRF_TOKEN' ||
      errBody?.error?.code === 'CSRF_TOKEN_REQUIRED' ||
      errBody?.error?.code === 'CSRF_TOKEN_MISSING' ||
      errBody?.error?.code === 'CSRF_VALIDATION_FAILED'
    ) {
      const freshToken = await getCsrfToken(true);
      headers['X-CSRF-Token'] = freshToken;
      response = await fetch(url, {
        ...options,
        method,
        headers,
        credentials: 'include'
      });
    }
  }

  const json = await response.json().catch(() => ({}));

  if (!response.ok || json.success === false) {
    const err = new Error(json.error?.message || `Request failed with HTTP ${response.status}`);
    err.status = response.status;
    err.code = json.error?.code || 'REQUEST_FAILED';
    err.details = json.error?.details || [];
    throw err;
  }

  return json.data !== undefined ? json.data : json;
}

/**
 * Universal apiRequest supporting both:
 * - apiRequest(endpoint, options)
 * - apiRequest(method, endpoint, data, config)
 */
export async function apiRequest(arg1, arg2, arg3, arg4 = {}) {
  const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  if (typeof arg1 === 'string' && HTTP_METHODS.includes(arg1.toUpperCase())) {
    const method = arg1.toUpperCase();
    const endpoint = arg2;
    const data = arg3;
    const config = arg4 || {};
    return rawApiRequest(endpoint, {
      method,
      body: data !== undefined ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined,
      ...config
    });
  }
  return rawApiRequest(arg1, arg2);
}

/**
 * Ensures there is an active session for the demo.
 * Automatically checks /auth/me; if not authenticated, logs in or registers demo buyer.
 *
 * @returns {Promise<object>} Authenticated user profile
 */
export async function ensureDemoSession() {
  try {
    const user = await rawApiRequest('/auth/me');
    if (user && user._id) {
      return user;
    }
  } catch {
    // Not logged in; proceed to auto-authenticate demo user
  }

  const demoEmail = 'demo.buyer@intentlock.io';
  const demoPassword = 'DemoPassword123!Secure';

  try {
    const loginRes = await rawApiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: demoEmail, password: demoPassword })
    });
    await getCsrfToken(true);
    return loginRes.user;
  } catch {
    try {
      const regRes = await rawApiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: demoEmail,
          password: demoPassword,
          name: 'Demo Buyer'
        })
      });
      await getCsrfToken(true);
      return regRes.user;
    } catch (regErr) {
      console.warn('Auto-session initialization fallback:', regErr);
      return null;
    }
  }
}

// -----------------------------------------------------------------------------
// Intent & Proposal API Services
// -----------------------------------------------------------------------------

export async function createIntent(params) {
  return rawApiRequest('/intents', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function getProducts(category) {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  return rawApiRequest(`/products${query}`);
}

export async function createProposal(params) {
  return rawApiRequest('/proposals', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function getProposal(id) {
  return rawApiRequest(`/proposals/${id}`);
}

// -----------------------------------------------------------------------------
// Security Firewall API Services (Member 2 Engine)
// -----------------------------------------------------------------------------

export async function verifySecurity(params) {
  return rawApiRequest('/security/verify', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

// -----------------------------------------------------------------------------
// Payment API Services (PayPal Sandbox)
// -----------------------------------------------------------------------------

export async function createPaymentOrder(params) {
  const idempotencyKey =
    params.idempotencyKey ||
    (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `idem_${Date.now()}`);

  return rawApiRequest('/payments/create-order', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      proposalId: params.proposalId,
      authorizationId: params.authorizationId,
      userConsent: true,
      acknowledgedReviewDiffs: params.acknowledgedReviewDiffs || []
    })
  });
}

export async function capturePaymentOrder(params) {
  const idempotencyKey =
    params.idempotencyKey ||
    (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `idem_${Date.now()}`);

  return rawApiRequest('/payments/capture-order', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      orderId: params.orderId,
      authorizationId: params.authorizationId,
      userConsent: true,
      confirmationChallenge: params.confirmationChallenge
    })
  });
}

export async function recoverSession(params) {
  return rawApiRequest('/payments/recover-session', {
    method: 'POST',
    body: JSON.stringify({
      orderId: params.orderId,
      returnToken: params.returnToken
    })
  });
}

const api = {
  get: (url, config) => apiRequest('GET', url, undefined, config),
  post: (url, data, config) => apiRequest('POST', url, data, config),
  put: (url, data, config) => apiRequest('PUT', url, data, config),
  delete: (url, config) => apiRequest('DELETE', url, undefined, config),
  request: (config) => apiRequest(config.method || 'GET', config.url, config.data, config)
};

export default api;
