import {API_BASE_URL} from './config';
import {emitSosDiagnostic} from '../features/sos/services/sosDiagnosticService';

function formatErrorDetails(message, details) {
  if (!Array.isArray(details) || details.length === 0) return message;

  const detailMessages = details
    .map(detail => {
      if (typeof detail === 'string') return detail.trim();
      if (!detail || typeof detail !== 'object') return '';
      const detailMessage = String(detail.message || '').trim();
      if (!detailMessage) return '';
      const field = String(detail.field || detail.path || '').trim();
      return field ? `${field}: ${detailMessage}` : detailMessage;
    })
    .filter(Boolean);

  if (!detailMessages.length) return message;
  const base = String(message || '').trim();
  const unique = [...new Set(detailMessages)];
  return base && !/^validation failed\.?$/i.test(base)
    ? `${base}: ${unique.join(' | ')}`
    : unique.join(' | ');
}

export class ApiError extends Error {
  constructor(message, status, details = undefined) {
    super(formatErrorDetails(message, details));
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.rawMessage = message;
  }
}

const GET_CACHE_TTL_MS = 30000;
const responseCache = new Map();
const inFlightRequests = new Map();

function requestKey(path, token) {
  return `${token || 'anonymous'}:${path}`;
}

function invalidateCache() {
  responseCache.clear();
}

export function getCachedApiData(path, token) {
  return responseCache.get(requestKey(path, token))?.data || null;
}

export async function request(path, {method = 'GET', body, token, timeoutMs, forceRefresh = false, cacheTtlMs = GET_CACHE_TTL_MS} = {}) {
  const normalizedMethod = method.toUpperCase();
  const key = requestKey(path, token);
  const isSosMediaFile = normalizedMethod === 'GET' && /\/sos\/[^/]+\/media\//.test(path);
  if (normalizedMethod === 'GET') {
    const cached = responseCache.get(key);
    if (!forceRefresh && !isSosMediaFile && cached && Date.now() - cached.cachedAt < cacheTtlMs) {
            return cached.data;
    }
    const existingRequest = inFlightRequests.get(key);
    if (existingRequest) {
            return existingRequest;
    }
  } else {
    invalidateCache();
  }

  const executeRequest = async () => {
  let response;
  const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) ? timeoutMs : (isMultipart ? 90000 : 20000);
  const timeoutHandle = setTimeout(() => controller?.abort(), effectiveTimeoutMs);

  try {
        response = await fetch(`${API_BASE_URL}${path}`, {
      method: normalizedMethod,
      headers: {
        Accept: 'application/json',
        ...(isMultipart ? {} : {'Content-Type': 'application/json'}),
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
      },
      ...(body === undefined ? {} : {body: isMultipart ? body : JSON.stringify(body)}),
      ...(controller ? {signal: controller.signal} : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('The request timed out. Check your connection and try again.', 0);
    }
    throw new ApiError('Unable to connect to CoGG Safety. Check your network and try again.', 0);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    if (path === '/sos' || path.includes('/media/') || path.includes('/location')) {
      emitSosDiagnostic(`SOS DEBUG API FAILED: ${normalizedMethod} ${path} HTTP ${response.status}: ${payload.message || 'request failed'}`, 'error');
    }
        throw new ApiError(
          payload.message || 'The server could not complete that request.',
          response.status,
          payload.error?.details,
        );
  }

    return payload.data;
  };

  const requestPromise = executeRequest();
  if (normalizedMethod === 'GET') {
    inFlightRequests.set(key, requestPromise);
    requestPromise
      .then(
        data => responseCache.set(key, {data, cachedAt: Date.now()}),
        () => undefined,
      )
      .then(() => inFlightRequests.delete(key));
  }
  return requestPromise;
}

export function clearApiCache() {
  responseCache.clear();
}
