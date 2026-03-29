/**
 * NestJS API base (default port 3000).
 * Next.js dev server is usually 3001 — do not point this at the Next port.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const propertiesEndpoint = `${API_BASE_URL}/properties`;
