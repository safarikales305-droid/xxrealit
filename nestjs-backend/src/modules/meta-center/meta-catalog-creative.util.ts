export const META_CATALOG_CREATIVE_FORBIDDEN_TEMPLATE_FIELDS = [
  'catalog_id',
  'product_catalog_id',
  'dataset_id',
  'pixel_id',
  'product_set_id',
] as const;

export type CatalogCreativeBuildInput = {
  name: string;
  pageId: string;
  instagramActorId?: string | null;
  productSetId: string;
  link: string;
  message: string;
  headline: string;
  description: string;
  ctaType: string;
};

export type CatalogCreativeTemplateData = {
  link: string;
  message: string;
  name: string;
  description: string;
  call_to_action: {
    type: string;
    value: { link: string };
  };
};

export type CatalogCreativeDiagnostics = {
  productSetId: string;
  pageId: string;
  templateData: {
    link: string;
    message: string;
    name: string;
    description: string;
    ctaType: string;
    ctaLink: string;
  };
  forbiddenFields: {
    catalogIdInTemplateData: boolean;
    productCatalogIdInTemplateData: boolean;
    datasetIdInTemplateData: boolean;
    pixelIdInTemplateData: boolean;
    productSetIdInTemplateData: boolean;
  };
};

export type CatalogCreativeBuildResult = {
  body: Record<string, string>;
  templateData: CatalogCreativeTemplateData;
  diagnostics: CatalogCreativeDiagnostics;
};

function buildTemplateData(input: CatalogCreativeBuildInput): CatalogCreativeTemplateData {
  return {
    link: input.link.trim(),
    message: input.message,
    name: input.headline,
    description: input.description,
    call_to_action: {
      type: input.ctaType,
      value: { link: input.link.trim() },
    },
  };
}

export function validateCatalogCreativeTemplateData(
  templateData: Record<string, unknown>,
): void {
  if (templateData.catalog_id !== undefined) {
    throw new Error(
      'Invalid Meta Creative payload: catalog_id must not be inside object_story_spec.template_data',
    );
  }
  if (templateData.product_catalog_id !== undefined) {
    throw new Error(
      'Invalid Meta Creative payload: product_catalog_id must not be inside object_story_spec.template_data',
    );
  }
  if (templateData.dataset_id !== undefined) {
    throw new Error(
      'Invalid Meta Creative payload: dataset_id must not be inside object_story_spec.template_data',
    );
  }
  if (templateData.pixel_id !== undefined) {
    throw new Error(
      'Invalid Meta Creative payload: pixel_id must not be inside object_story_spec.template_data',
    );
  }
  if (templateData.product_set_id !== undefined) {
    throw new Error(
      'Invalid Meta Creative payload: product_set_id must not be inside object_story_spec.template_data',
    );
  }
}

export function parseCatalogCreativeObjectStorySpec(
  creativeBody: Record<string, unknown>,
): { pageId: string | null; templateData: Record<string, unknown> | null } {
  const raw = creativeBody.object_story_spec;
  if (typeof raw !== 'string' || !raw.trim()) {
    return { pageId: null, templateData: null };
  }
  try {
    const spec = JSON.parse(raw) as Record<string, unknown>;
    const templateData =
      spec.template_data && typeof spec.template_data === 'object'
        ? (spec.template_data as Record<string, unknown>)
        : null;
    return {
      pageId: typeof spec.page_id === 'string' ? spec.page_id : null,
      templateData,
    };
  } catch {
    return { pageId: null, templateData: null };
  }
}

export function buildCatalogCreativeDiagnostics(
  creativeBody: Record<string, unknown>,
): CatalogCreativeDiagnostics | null {
  const productSetId =
    typeof creativeBody.product_set_id === 'string' ? creativeBody.product_set_id : null;
  const parsed = parseCatalogCreativeObjectStorySpec(creativeBody);
  if (!productSetId || !parsed.templateData) return null;

  const td = parsed.templateData;
  const cta =
    td.call_to_action && typeof td.call_to_action === 'object'
      ? (td.call_to_action as Record<string, unknown>)
      : null;
  const ctaValue =
    cta?.value && typeof cta.value === 'object'
      ? (cta.value as Record<string, unknown>)
      : null;

  return {
    productSetId,
    pageId: parsed.pageId ?? '',
    templateData: {
      link: String(td.link ?? ''),
      message: String(td.message ?? ''),
      name: String(td.name ?? ''),
      description: String(td.description ?? ''),
      ctaType: String(cta?.type ?? ''),
      ctaLink: String(ctaValue?.link ?? ''),
    },
    forbiddenFields: {
      catalogIdInTemplateData: td.catalog_id !== undefined,
      productCatalogIdInTemplateData: td.product_catalog_id !== undefined,
      datasetIdInTemplateData: td.dataset_id !== undefined,
      pixelIdInTemplateData: td.pixel_id !== undefined,
      productSetIdInTemplateData: td.product_set_id !== undefined,
    },
  };
}

export function validateCatalogCreativeBodyBeforeMetaApi(
  creativeBody: Record<string, unknown>,
): void {
  const parsed = parseCatalogCreativeObjectStorySpec(creativeBody);
  if (parsed.templateData) {
    validateCatalogCreativeTemplateData(parsed.templateData);
  }
  const diagnostics = buildCatalogCreativeDiagnostics(creativeBody);
  if (diagnostics) {
    for (const [key, present] of Object.entries(diagnostics.forbiddenFields)) {
      if (present) {
        throw new Error(`Invalid Meta Creative payload: forbidden field in template_data (${key})`);
      }
    }
  }
}

/**
 * Centrální builder Catalog Sales Creative pro POST /act_<AD_ACCOUNT_ID>/adcreatives.
 * product_set_id pouze na kořeni — template_data bez catalog_id / product_set_id.
 */
export function buildCatalogCreativePayload(
  input: CatalogCreativeBuildInput,
): CatalogCreativeBuildResult {
  const templateData = buildTemplateData(input);
  validateCatalogCreativeTemplateData(templateData as unknown as Record<string, unknown>);

  const objectStorySpec: Record<string, unknown> = {
    page_id: input.pageId.trim(),
    ...(input.instagramActorId?.trim()
      ? { instagram_actor_id: input.instagramActorId.trim() }
      : {}),
    template_data: templateData,
  };

  const body: Record<string, string> = {
    name: input.name.trim(),
    product_set_id: input.productSetId.trim(),
    object_story_spec: JSON.stringify(objectStorySpec),
  };

  const diagnostics = buildCatalogCreativeDiagnostics(body);
  if (!diagnostics) {
    throw new Error('Invalid Meta Creative payload: diagnostics build failed');
  }

  return { body, templateData, diagnostics };
}

export type MetaLaunchResumePlan = {
  createCampaign: boolean;
  createAdSet: boolean;
  createCreative: boolean;
  createAd: boolean;
};

export function planMetaLaunchResume(input: {
  metaCampaignId: string | null;
  metaAdSetId: string | null;
  metaCreativeId: string | null;
  metaAdId: string | null;
}): MetaLaunchResumePlan {
  return {
    createCampaign: !input.metaCampaignId,
    createAdSet: Boolean(input.metaCampaignId && !input.metaAdSetId),
    createCreative: Boolean(input.metaCampaignId && input.metaAdSetId && !input.metaCreativeId),
    createAd: Boolean(
      input.metaCampaignId && input.metaAdSetId && input.metaCreativeId && !input.metaAdId,
    ),
  };
}
