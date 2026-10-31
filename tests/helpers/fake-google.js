// Shared fakes for tests of js/data/: a signed-in session with a valid token
// and a fetch that records every call. Nothing here reaches Google.
import { configureAuth } from '../../js/data/auth.js';
import { configureHttp } from '../../js/data/http.js';
import { fakeStorage } from './fake-storage.js';

export const TOKEN = 'test-token';

const storageWith = (session) => fakeStorage([['cartos.session', JSON.stringify(session)]]);

// respond(call) returns { status, body } for each request; defaults to 200 {}.
export function setupGoogleApi(respond = () => ({ status: 200, body: {} })) {
  const now = 1_000_000;
  const storage = storageWith({
    user: { sub: 'user-1', email: 'martin@example.com', name: 'Martín' },
    driveGranted: true,
    accessToken: TOKEN,
    tokenExpiresAt: now + 3_600_000,
  });
  configureAuth({ storage: () => storage, google: () => undefined, now: () => now });

  const calls = [];
  configureHttp({
    now: () => now,
    fetch: async (url, init) => {
      const call = {
        url: new URL(url),
        method: init.method,
        headers: init.headers,
        body: init.body === undefined ? undefined : JSON.parse(init.body),
      };
      calls.push(call);
      const { status = 200, body = {} } = respond(call) ?? {};
      return { status, ok: status >= 200 && status < 300, json: async () => body };
    },
  });
  return calls;
}
