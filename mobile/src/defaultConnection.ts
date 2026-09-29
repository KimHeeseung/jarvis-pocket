import personal from './personal-connection.json';
import type { Connection } from './api';
export const defaultConnection: Connection = personal;
export function resolveConnection(saved: unknown): Connection {
  if (
    saved &&
    typeof saved === 'object' &&
    'url' in saved &&
    'token' in saved &&
    typeof saved.url === 'string' &&
    typeof saved.token === 'string' &&
    /^https?:\/\//.test(saved.url) &&
    saved.token.trim().length >= 32 &&
    !/^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)([:/]|$)/i.test(saved.url)
  ) {
    // Same personal server: migrate a saved Wi-Fi address to its private HTTPS URL.
    if (
      saved.token === defaultConnection.token &&
      defaultConnection.url.startsWith('https://') &&
      saved.url.startsWith('http://')
    ) {
      return defaultConnection;
    }
    return { url: saved.url, token: saved.token };
  }
  return defaultConnection;
}
