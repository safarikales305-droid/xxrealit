import { Prisma } from '@prisma/client';

/**
 * Převod na Prisma Json: vyhodí `undefined` klíče a zaručí typ bez `undefined`,
 * který Prisma u `Json?` polí v create/update nepřijímá.
 */
export function toPrismaInputJson(
  value: Record<string, unknown>,
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
