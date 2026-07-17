import { serializePayloadForMetaApi } from './meta-campaign-payload-map.util';

export type MetaAdCreateStatus = 'PAUSED' | 'ACTIVE';

export type MetaAdCreateLogicalPayload = {
  name: string;
  adset_id: string;
  creative: { creative_id: string };
  status: MetaAdCreateStatus;
};

export type MetaAdCreatePayloadBundle = {
  logical: MetaAdCreateLogicalPayload;
  /** Tělo pro graph.post — creative je JSON string, ne dvojitá serializace. */
  metaPostBody: Record<string, unknown>;
  metaForm: Record<string, string>;
};

export function buildMetaAdCreatePayload(input: {
  name: string;
  adSetId: string;
  creativeId: string;
  status?: MetaAdCreateStatus;
}): MetaAdCreatePayloadBundle {
  const logical: MetaAdCreateLogicalPayload = {
    name: input.name.trim(),
    adset_id: input.adSetId.trim(),
    creative: { creative_id: input.creativeId.trim() },
    status: input.status ?? 'PAUSED',
  };
  const metaPostBody: Record<string, unknown> = {
    name: logical.name,
    adset_id: logical.adset_id,
    creative: JSON.stringify(logical.creative),
    status: logical.status,
  };
  return {
    logical,
    metaPostBody,
    metaForm: serializePayloadForMetaApi(metaPostBody),
  };
}
