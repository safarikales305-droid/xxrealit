import type {
  ImportSource,
  ListingImportMethod,
  ListingImportPortal,
  Prisma,
} from '@prisma/client';

/** Aktivní importní větev (ImportSource). */
export const activeImportBranchWhere: Prisma.ImportSourceWhereInput = {
  enabled: true,
  isActive: true,
  deletedAt: null,
  isDeleted: false,
};

/** Data pro skrytí importovaného inzerátu (větev vypnutá / smazaná / chybí). */
export const importPropertyHiddenData = {
  isActive: false,
  isVisible: false,
  status: 'HIDDEN',
  hiddenByImportDisabled: true,
} as const satisfies Prisma.PropertyUpdateManyMutationInput;

/** Obnovení viditelnosti po zapnutí větve. */
export const importPropertyRestoredData = {
  isActive: true,
  isVisible: true,
  status: 'APPROVED',
  hiddenByImportDisabled: false,
} as const satisfies Prisma.PropertyUpdateManyMutationInput;

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

/** Ruční / uživatelský inzerát — bez importní metadata. */
export function isImportedProperty(p: PropertyImportVisibilityFields): boolean {
  if (p.importSource == null) return false;
  return Boolean(
    p.importSourceId?.trim() || p.importExternalId?.trim() || p.importSourceUrl?.trim(),
  );
}

/**
 * Ruční / lokální inzerát — bez importní větve, zobrazit vždy při splnění schválení.
 */
export const localOrManualListingWhere: Prisma.PropertyWhereInput = {
  OR: [
    { importSource: null },
    {
      AND: [
        { importSourceId: null },
        { OR: [{ importExternalId: null }, { importExternalId: '' }] },
        { OR: [{ importSourceUrl: null }, { importSourceUrl: '' }] },
      ],
    },
  ],
};

/**
 * Importovaný inzerát veřejně jen s platnou aktivní větve (ImportSource).
 * Lokální inzeráty nejsou omezeny importní větví.
 */
export const importedListingPubliclyVisibleWhere: Prisma.PropertyWhereInput = {
  OR: [
    localOrManualListingWhere,
    {
      AND: [
        { importSource: { not: null } },
        { isVisible: true },
        { importDisabled: false },
        { hiddenByImportDisabled: false },
        { importSourceId: { not: null } },
        { importSourceBranch: { is: activeImportBranchWhere } },
      ],
    },
  ],
};

/** Importované inzeráty bez platné aktivní větve — ke skrytí při startu / migraci. */
export const importedPropertiesMissingActiveBranchWhere: Prisma.PropertyWhereInput = {
  importSource: { not: null },
  OR: [
    { importSourceId: null },
    { importSourceBranch: { is: null } },
    { importSourceBranch: { is: { enabled: false } } },
    { importSourceBranch: { is: { isActive: false } } },
    { importSourceBranch: { is: { isDeleted: true } } },
    { importSourceBranch: { is: { deletedAt: { not: null } } } },
  ],
};

export type PropertyImportVisibilityFields = {
  importSource: ListingImportPortal | null;
  importDisabled: boolean;
  hiddenByImportDisabled: boolean;
  isVisible: boolean;
  importSourceId?: string | null;
  importExternalId?: string | null;
  importSourceUrl?: string | null;
  importSourceBranch?: Pick<
    ImportSource,
    'enabled' | 'isActive' | 'deletedAt' | 'isDeleted'
  > | null;
};

export type ImportBranchAdminStatus = 'active' | 'disabled' | 'missing';

export function computeImportBranchAdminStatus(
  p: PropertyImportVisibilityFields,
): ImportBranchAdminStatus | null {
  if (p.importSource == null) return null;
  if (!p.importSourceId || !p.importSourceBranch) return 'missing';
  if (p.importSourceBranch.isDeleted || p.importSourceBranch.deletedAt) return 'missing';
  if (!p.importSourceBranch.enabled || !p.importSourceBranch.isActive) return 'disabled';
  return 'active';
}

export function isLocalOrManualListing(p: PropertyImportVisibilityFields): boolean {
  if (p.importSource == null) return true;
  if (p.importSourceId?.trim()) return false;
  if (p.importExternalId?.trim()) return false;
  if (p.importSourceUrl?.trim()) return false;
  return true;
}

export function isImportedListingPubliclyVisible(
  p: PropertyImportVisibilityFields,
): boolean {
  if (isLocalOrManualListing(p)) return true;
  if (!isImportedProperty(p)) return true;
  if (!p.isVisible) return false;
  if (p.importDisabled) return false;
  if (p.hiddenByImportDisabled) return false;
  if (!p.importSourceId) return false;
  if (!p.importSourceBranch) return false;
  if (p.importSourceBranch.isDeleted || p.importSourceBranch.deletedAt) return false;
  if (!p.importSourceBranch.enabled || !p.importSourceBranch.isActive) return false;
  return true;
}
