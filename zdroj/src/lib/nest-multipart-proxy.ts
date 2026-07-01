import type { NextRequest } from 'next/server';

/** Přepošle multipart z Next route handleru do Nest jako nové FormData (nový boundary). */
export async function rebuildFormDataForNest(req: NextRequest): Promise<FormData> {
  const inbound = await req.formData();
  const outbound = new FormData();
  for (const [key, value] of inbound.entries()) {
    if (value instanceof File) {
      outbound.append(key, value, value.name);
    } else {
      outbound.append(key, String(value));
    }
  }
  return outbound;
}
