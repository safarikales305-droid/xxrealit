'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  META_CREATIVE_SOURCE_OPTIONS,
  META_CTA_OPTIONS,
  buildListingCreativeTexts,
  type MetaCampaignCreativePayload,
} from '@/lib/meta-campaign-creative';
import {
  nestAdminMetaCenterCreativeSourcePosts,
  type MetaCampaignProductItem,
  type MetaCreativeSourcePost,
} from '@/lib/nest-client';

type CampaignDraftCreative = {
  creativeType: string;
  creativePayload: MetaCampaignCreativePayload;
  selectedProductIds: string[];
};

type Props = {
  token: string | null;
  draft: CampaignDraftCreative;
  products: MetaCampaignProductItem[];
  onChange: (patch: Partial<CampaignDraftCreative>) => void;
};

function applyProductCreative(
  product: MetaCampaignProductItem,
): MetaCampaignCreativePayload {
  const texts = buildListingCreativeTexts({
    title: product.title,
    price: product.price,
    currency: product.currency,
    city: product.city,
    propertyType: product.propertyType,
  });
  return {
    sourceType: 'listing',
    ...texts,
    link: product.detailUrl,
    detailUrl: product.detailUrl,
    image: product.imageUrl ?? undefined,
    gallery: product.imageUrl ? [product.imageUrl] : [],
    price: product.price,
    currency: product.currency,
    city: product.city ?? undefined,
    propertyType: product.propertyType ?? undefined,
  };
}

function applyPostCreative(post: MetaCreativeSourcePost): MetaCampaignCreativePayload {
  const primaryText = [post.title, post.description].filter(Boolean).join('\n\n');
  return {
    sourceType: post.source,
    primaryText,
    headline: post.title,
    description: post.city || post.description,
    text: primaryText,
    link: post.link,
    image: post.image ?? undefined,
    video: post.video ?? undefined,
    author: post.author,
    postId: post.id,
    objectStoryId: post.objectStoryId ?? undefined,
    ctaType: 'LEARN_MORE',
    cta: 'Zjistit více',
    city: post.city,
    price: post.price,
  };
}

export function MetaCampaignCreativeEditor({ token, draft, products, onChange }: Props) {
  const payload = draft.creativePayload ?? {};
  const [posts, setPosts] = useState<MetaCreativeSourcePost[]>([]);
  const [postsBusy, setPostsBusy] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [customVideoUrl, setCustomVideoUrl] = useState('');

  const loadPosts = useCallback(async () => {
    if (!token) return;
    const source =
      draft.creativeType === 'facebook_post'
        ? 'facebook_post'
        : draft.creativeType === 'instagram_post'
          ? 'instagram_post'
          : draft.creativeType === 'public_post'
            ? 'public_post'
            : undefined;
    if (!source) return;
    setPostsBusy(true);
    const r = await nestAdminMetaCenterCreativeSourcePosts(token, source, 40);
    setPostsBusy(false);
    if (r.ok) setPosts(r.items);
  }, [token, draft.creativeType]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  function setPayload(patch: MetaCampaignCreativePayload) {
    onChange({ creativePayload: { ...payload, ...patch } });
  }

  function handleSourceChange(creativeType: string) {
    onChange({ creativeType, creativePayload: { ...payload, sourceType: creativeType } });
  }

  function handleProductSelect(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const isCatalog = draft.creativeType === 'catalog_products';
    const selected = isCatalog
      ? draft.selectedProductIds.includes(productId)
        ? draft.selectedProductIds.filter((id) => id !== productId)
        : [...draft.selectedProductIds, productId]
      : [productId];
    const patch: Partial<CampaignDraftCreative> = { selectedProductIds: selected };
    if (!isCatalog) {
      patch.creativePayload = applyProductCreative(product);
      patch.creativeType = draft.creativeType === 'catalog_products' ? 'listing' : draft.creativeType;
    }
    onChange(patch);
  }

  function handlePostSelect(post: MetaCreativeSourcePost) {
    onChange({
      creativePayload: applyPostCreative(post),
      selectedProductIds: [],
    });
  }

  const showProductPicker =
    draft.creativeType === 'catalog_products' || draft.creativeType === 'listing';
  const showPostPicker = ['public_post', 'facebook_post', 'instagram_post'].includes(
    draft.creativeType,
  );

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-zinc-900">Kreativa reklamy</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Vyberte zdroj, upravte texty a CTA. Náhled vpravo se aktualizuje okamžitě.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">Zdroj kreativy</span>
          <select
            value={draft.creativeType}
            onChange={(e) => handleSourceChange(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2"
          >
            {META_CREATIVE_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {showProductPicker ? (
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium">
              {draft.creativeType === 'catalog_products'
                ? 'Katalogové produkty'
                : 'Inzerát XXREALIT'}
            </p>
            <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
              {products.map((p) => {
                const selected = draft.selectedProductIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProductSelect(p.id)}
                    className={`flex items-center gap-2 rounded-lg border p-2 text-left text-xs ${
                      selected ? 'border-[#1877f2] bg-blue-50' : 'border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded bg-zinc-100" />
                    )}
                    <span>
                      <span className="line-clamp-2 font-medium">{p.title}</span>
                      <span className="block text-zinc-500">{p.city}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {showPostPicker ? (
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium">Veřejné příspěvky z portálu</p>
            {postsBusy ? (
              <p className="text-xs text-zinc-500">Načítám příspěvky…</p>
            ) : posts.length === 0 ? (
              <p className="text-xs text-amber-800">Žádné příspěvky k dispozici.</p>
            ) : (
              <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                {posts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => handlePostSelect(post)}
                    className={`flex items-center gap-2 rounded-lg border p-2 text-left text-xs ${
                      payload.postId === post.id
                        ? 'border-[#1877f2] bg-blue-50'
                        : 'border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {post.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.image} alt="" className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded bg-zinc-100" />
                    )}
                    <span>
                      <span className="line-clamp-2 font-medium">{post.title || post.description}</span>
                      <span className="block text-zinc-500">{post.author}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {draft.creativeType === 'custom_image' ? (
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium">URL vlastního obrázku</span>
            <div className="flex gap-2">
              <input
                value={customImageUrl}
                onChange={(e) => setCustomImageUrl(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs"
                placeholder="https://…"
              />
              <button
                type="button"
                onClick={() => setPayload({ image: customImageUrl, sourceType: 'custom_image' })}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold"
              >
                Použít
              </button>
            </div>
          </label>
        ) : null}

        {draft.creativeType === 'custom_video' ? (
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium">URL vlastního videa</span>
            <div className="flex gap-2">
              <input
                value={customVideoUrl}
                onChange={(e) => setCustomVideoUrl(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs"
                placeholder="https://…"
              />
              <button
                type="button"
                onClick={() => setPayload({ video: customVideoUrl, sourceType: 'custom_video' })}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold"
              >
                Použít
              </button>
            </div>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">Primary text</span>
          <textarea
            rows={4}
            value={payload.primaryText ?? payload.text ?? ''}
            onChange={(e) => setPayload({ primaryText: e.target.value, text: e.target.value })}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Headline</span>
          <input
            value={payload.headline ?? ''}
            onChange={(e) => setPayload({ headline: e.target.value })}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Description</span>
          <input
            value={payload.description ?? ''}
            onChange={(e) => setPayload({ description: e.target.value })}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Call To Action</span>
          <select
            value={payload.ctaType ?? 'LEARN_MORE'}
            onChange={(e) => {
              const opt = META_CTA_OPTIONS.find((o) => o.value === e.target.value);
              setPayload({ ctaType: e.target.value, cta: opt?.label ?? e.target.value });
            }}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            {META_CTA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">Odkaz (URL)</span>
          <input
            value={payload.link ?? payload.detailUrl ?? ''}
            onChange={(e) => setPayload({ link: e.target.value, detailUrl: e.target.value })}
            className="rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs"
          />
        </label>
      </div>

      {(payload.image || payload.video) && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-600">
          {payload.image ? <span>✓ Obrázek načten</span> : null}
          {payload.video ? <span>✓ Video načteno</span> : null}
          {payload.link ? <span>✓ Odkaz nastaven</span> : null}
        </div>
      )}
    </section>
  );
}
