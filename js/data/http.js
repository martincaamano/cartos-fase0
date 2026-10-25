// Single entry point for calls to Google REST APIs. Takes the token from
// getAccessToken() and logs every call (operation and HTTP code only).

import { getAccessToken, TokenExpiredError } from './auth.js';
import { logEvent } from '../storage/logs.js';

export class ApiError extends Error {
  constructor(status, op) {
    super(`Google API ${op} failed with ${status}`);
    this.status = status;
    this.op = op;
  }
}

const defaults = {
  fetch: (...args) => globalThis.fetch(...args),
  now: () => Date.now(),
};

let deps = defaults;

// Lets the tests swap fetch for a fake.
export function configureHttp(overrides = {}) {
  deps = { ...defaults, ...overrides };
}

// op: short operation name for the logs, e.g. 'sheets.append'.
export async function googleFetch(url, { method = 'GET', body, op }) {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const startedAt = deps.now();

  let response;
  try {
    response = await deps.fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    logEvent({ type: 'api', result: `${op}:network_error`, durationMs: deps.now() - startedAt });
    throw new ApiError(0, op);
  }

  logEvent({ type: 'api', result: `${op}:${response.status}`, durationMs: deps.now() - startedAt });
  if (response.status === 401) throw new TokenExpiredError();
  if (!response.ok) throw new ApiError(response.status, op);
  return response.status === 204 ? null : response.json();
}
