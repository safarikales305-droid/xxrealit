import type {
  ImportSource,
  ListingImportMethod,
  ListingImportPortal,
  Prisma,
} from '@prisma/client';

/** WHERE pro všechny inzeráty patřící k jedné importní větvi (FK nebo legacy metadata). */
export function propertiesForImportBranchWhere(source: {
  id: string;
  portal: ListingImportPortal;
  method: ListingImportMethod;
  portalKey: string;
  categoryKey: string;
}): Prisma.PropertyWhereInput {
  return {
    OR: [
      { importSourceId: source.id },
      {
        importSourceId: null,
        importSource: source.portal,
        importMethod: source.method,
        importCategoryKey: source.categoryKey,
        sourcePortalKey: source.portalKey,
      },
    ],
  };
}

/**
 * Importované inzeráty jen pokud nejsou ručně vypnuté a jejich větev je zapnutá.
 * Ruční (neimportované) inzeráty — `importSource` null — projdou.
 */
export const importedListingPubliclyVisibleWhere: Prisma.PropertyWhereInput = {
  OR: [
    { importSource: null },
    {
      AND: [
        { importSource: { not: null } },
        { importDisabled: false },
        { hiddenByImportDisabled: false },
        {
          OR: [{ importSourceId: null }, { importSourceBranch: { enabled: true } }],
        },
      ],
    },
  ],
};

export type PropertyImportVisibilityFields = {
  importSource: ListingImportPortal | null;
  importDisabled: boolean;
  hiddenByImportDisabled: boolean;
  importSourceBranch?: Pick<ImportSource, 'enabled'> | null;
};

export function isImportedListingPubliclyVisible(
  p: PropertyImportVisibilityFields,
): boolean {
  if (p.importSource == null) return true;
  if (p.importDisabled) return false;
  if (p.hiddenByImportDisabled) return false;
  if (p.importSourceBranch && !p.importSourceBranch.enabled) return false;
  return true;
}
