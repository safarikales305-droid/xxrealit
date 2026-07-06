import {
  META_FORBIDDEN_DEFAULT_SCOPES,
  resolveScopesForOAuthFlow,
} from '../src/modules/meta-center/meta-oauth-scope-resolver';

const pages = resolveScopesForOAuthFlow('pages', null);
const scopeSet = new Set(pages.approvedScopes);

for (const forbidden of META_FORBIDDEN_DEFAULT_SCOPES) {
  if (scopeSet.has(forbidden) || pages.scope.includes(forbidden)) {
    console.error(`FAIL: pages flow contains forbidden scope "${forbidden}"`);
    console.error('scope:', pages.scope);
    process.exit(1);
  }
}

const expected = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
];

if (pages.approvedScopes.join(',') !== expected.join(',')) {
  console.error('FAIL: pages flow scopes mismatch');
  console.error('got:', pages.approvedScopes);
  console.error('expected:', expected);
  process.exit(1);
}

const catalog = resolveScopesForOAuthFlow('catalog', null);
if (catalog.approvedScopes.length > 0) {
  console.error('FAIL: catalog flow without META_APPROVED_OAUTH_SCOPES must be empty');
  process.exit(1);
}

console.log('OK: pages OAuth scopes verified');
console.log(`  flow=pages scope=${pages.scope}`);
