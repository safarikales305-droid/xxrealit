import {
  META_FORBIDDEN_DEFAULT_SCOPES,
  resolveScopesForOAuthFlow,
} from '../src/modules/meta-center/meta-oauth-scope-resolver';

const pages = resolveScopesForOAuthFlow('pages');
const scopeSet = new Set(pages.approvedScopes);

for (const forbidden of META_FORBIDDEN_DEFAULT_SCOPES) {
  if (scopeSet.has(forbidden) || pages.scope.includes(forbidden)) {
    console.error(`FAIL: pages flow contains forbidden scope "${forbidden}"`);
    console.error('scope:', pages.scope);
    process.exit(1);
  }
}

const expectedPages = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
];

if (pages.approvedScopes.join(',') !== expectedPages.join(',')) {
  console.error('FAIL: pages flow scopes mismatch');
  console.error('got:', pages.approvedScopes);
  console.error('expected:', expectedPages);
  process.exit(1);
}

const catalogWithoutEnv = resolveScopesForOAuthFlow('catalog', {});
if (catalogWithoutEnv.approvedScopes.length > 0) {
  console.error('FAIL: catalog flow without product ENV must be empty');
  process.exit(1);
}

const catalogWithEnv = resolveScopesForOAuthFlow('catalog', {
  META_APPROVED_OAUTH_SCOPES_CATALOG: 'business_management,catalog_management',
});
if (catalogWithEnv.approvedScopes.join(',') !== 'business_management,catalog_management') {
  console.error('FAIL: catalog flow with META_APPROVED_OAUTH_SCOPES_CATALOG mismatch');
  console.error('got:', catalogWithEnv.approvedScopes);
  process.exit(1);
}

const marketing = resolveScopesForOAuthFlow('marketing', {
  META_APPROVED_OAUTH_SCOPES_MARKETING: 'ads_management,ads_read,business_management',
});
if (marketing.approvedScopes.length !== 3) {
  console.error('FAIL: marketing flow scopes mismatch');
  process.exit(1);
}

if (!catalogWithEnv.warnings.some((w) => w.includes('META_APPROVED_OAUTH_SCOPES_CATALOG'))) {
  const missing = resolveScopesForOAuthFlow('catalog', {
    META_APPROVED_OAUTH_SCOPES_CATALOG: 'business_management',
  });
  if (!missing.warnings.some((w) => w.includes('META_APPROVED_OAUTH_SCOPES_CATALOG'))) {
    console.error('FAIL: catalog warnings must reference META_APPROVED_OAUTH_SCOPES_CATALOG');
    process.exit(1);
  }
}

console.log('OK: pages OAuth scopes verified');
console.log(`  flow=pages scope=${pages.scope}`);
console.log('OK: per-product OAuth scope ENV verified');
