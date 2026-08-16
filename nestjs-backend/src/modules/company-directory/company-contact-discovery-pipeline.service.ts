import { Injectable, Logger } from '@nestjs/common';
import {
  CompanyContactDiscoveryEntryState,
  CompanyContactSourceType,
  CompanyContactStatus,
  CompanyDirectoryEntry,
} from '@prisma/client';
import { CompanyWebsiteCrawlerService } from '../ai-sales/company-website-crawler.service';
import {
  discoverContactPaths,
  extractEmailsFromHtml,
  extractPhonesFromHtml,
  SEED_PATHS,
} from '../ai-sales/public-contact-extractor.util';
import { WebSearchProvider } from '../ai-sales/providers/web-search.provider';
import { SearchProvidersEnvService } from '../ai-sales/search-providers-env.service';
import {
  buildContactDiscoverySearchQueries,
  deobfuscateEmailsInHtml,
  getHostFromUrl,
  mergeWebsiteCandidates,
  NOT_FOUND_REASON_LABELS,
  scoreWebsiteCandidate,
  WebsiteCandidate,
} from './company-contact-discovery-search.util';

export type ContactDiscoveryDiagnostics = {
  companyName: string;
  ico: string;
  city?: string | null;
  region?: string | null;
  searchProviderUsed: string | null;
  searchConfigured: boolean;
  searchQueries: string[];
  searchResultCount: number;
  candidateWebsites: Array<{ url: string; score: number; title?: string; snippet?: string }>;
  selectedWebsite?: string | null;
  websiteConfidence?: number | null;
  homepageHttpStatus?: number | null;
  contactPagesFound: string[];
  emailsFound: string[];
  finalStatus: string;
  notFoundReason?: string | null;
  notFoundReasonLabel?: string | null;
  logs: string[];
};

export type ContactDiscoveryPipelineResult = {
  found: boolean;
  status: CompanyContactStatus | null;
  email: string | null;
  sourceUrl: string | null;
  confidence: number | null;
  phone: string | null;
  website: string | null;
  discoveryState: CompanyContactDiscoveryEntryState;
  notFoundReason?: string | null;
  diagnostics: ContactDiscoveryDiagnostics;
};

@Injectable()
export class CompanyContactDiscoveryPipelineService {
  private readonly log = new Logger(CompanyContactDiscoveryPipelineService.name);

  constructor(
    private readonly webSearch: WebSearchProvider,
    private readonly searchEnv: SearchProvidersEnvService,
    private readonly crawler: CompanyWebsiteCrawlerService,
  ) {}

  isSearchConfigured(): boolean {
    return this.searchEnv.isWebSearchConfigured();
  }

  getProviderDiagnostics() {
    const active = this.searchEnv.getActiveWebProvider();
    return {
      contactSearchProvider: this.searchEnv.isWebSearchConfigured() ? 'Configured' : 'Missing',
      webFetch: 'Configured',
      aiAnalysis: 'NotRequired',
      searchProviderName: active?.name ?? null,
      searchProviderKey: active?.key ?? null,
    };
  }

  async discoverCompanyContact(company: CompanyDirectoryEntry): Promise<ContactDiscoveryPipelineResult> {
    const diagnostics: ContactDiscoveryDiagnostics = {
      companyName: company.name,
      ico: company.ico,
      city: company.city,
      region: company.region,
      searchProviderUsed: null,
      searchConfigured: this.isSearchConfigured(),
      searchQueries: [],
      searchResultCount: 0,
      candidateWebsites: [],
      contactPagesFound: [],
      emailsFound: [],
      finalStatus: 'STARTED',
      logs: [],
    };

    const fail = (
      reason: string,
      state: CompanyContactDiscoveryEntryState = 'NOT_FOUND',
    ): ContactDiscoveryPipelineResult => {
      diagnostics.notFoundReason = reason;
      diagnostics.notFoundReasonLabel = NOT_FOUND_REASON_LABELS[reason] ?? reason;
      diagnostics.finalStatus = reason;
      this.log.warn(JSON.stringify({ event: 'CONTACT_DISCOVERY_NOT_FOUND', companyId: company.id, reason, diagnostics }));
      return {
        found: false,
        status: null,
        email: null,
        sourceUrl: null,
        confidence: null,
        phone: null,
        website: diagnostics.selectedWebsite ?? company.website ?? null,
        discoveryState: state,
        notFoundReason: reason,
        diagnostics,
      };
    };

    if (company.verifiedBusinessEmail) {
      diagnostics.finalStatus = 'VERIFIED';
      return {
        found: false,
        status: CompanyContactStatus.VERIFIED,
        email: company.verifiedBusinessEmail,
        sourceUrl: null,
        confidence: 1,
        phone: company.phone,
        website: company.website,
        discoveryState: 'VERIFIED',
        diagnostics,
      };
    }

    const queries = buildContactDiscoverySearchQueries(company);
    diagnostics.searchQueries = queries;
    diagnostics.logs.push(`Vygenerováno ${queries.length} search dotazů.`);

    let candidates: WebsiteCandidate[] = [];
    if (company.website?.trim()) {
      const url = this.crawler.normalizeWebsiteUrl(company.website);
      candidates.push({
        url,
        title: company.name,
        snippet: company.name,
        score: 0.85,
        sourceQuery: 'known_website',
      });
      diagnostics.logs.push(`Známý web z DB: ${url}`);
    }

    if (!this.isSearchConfigured() && candidates.length === 0) {
      diagnostics.logs.push('Search provider není nakonfigurován.');
      return fail('NO_SEARCH_PROVIDER', 'FAILED');
    }

    if (this.isSearchConfigured()) {
      diagnostics.searchProviderUsed = this.webSearch.getName();
      let totalResults = 0;
      for (const query of queries.slice(0, 6)) {
        try {
          diagnostics.logs.push(`SEARCH_QUERY_EXECUTED: ${query}`);
          const rows = await this.webSearch.searchRaw(query, 8);
          totalResults += rows.length;
          diagnostics.logs.push(`SEARCH_RESULTS_FOUND: ${rows.length} pro "${query}"`);
          for (const row of rows) {
            const score = scoreWebsiteCandidate(company, row);
            if (score < 0.25) continue;
            candidates.push({
              url: row.url,
              title: row.title,
              snippet: row.snippet,
              score,
              sourceQuery: query,
            });
          }
          await this.sleep(400);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          diagnostics.logs.push(`SEARCH_ERROR: ${msg}`);
          if (/quota|limit|429/i.test(msg)) {
            return fail('PROVIDER_QUOTA', 'FAILED');
          }
        }
      }
      diagnostics.searchResultCount = totalResults;
    }

    candidates = mergeWebsiteCandidates(candidates).slice(0, 10);
    diagnostics.candidateWebsites = candidates.map((c) => ({
      url: c.url,
      score: Math.round(c.score * 100) / 100,
      title: c.title,
      snippet: c.snippet,
    }));

    if (candidates.length === 0) {
      return fail(this.isSearchConfigured() ? 'NO_SEARCH_RESULTS' : 'NO_VALID_WEBSITE');
    }

    const viable = candidates.filter((c) => c.score >= 0.3);
    const toTry = (viable.length ? viable : candidates).slice(0, 5);

    for (const candidate of toTry) {
      diagnostics.selectedWebsite = candidate.url;
      diagnostics.websiteConfidence = candidate.score;
      diagnostics.logs.push(`WEBSITE_CANDIDATE_FOUND: ${candidate.url} (${Math.round(candidate.score * 100)}%)`);

      const crawlOutcome = await this.crawlForEmails(candidate.url, diagnostics);
      if (crawlOutcome.blocked) {
        diagnostics.logs.push(`WEBSITE_BLOCKED: ${candidate.url}`);
        continue;
      }
      if (crawlOutcome.unreachable) {
        diagnostics.logs.push(`WEBSITE_UNREACHABLE: ${candidate.url}`);
        continue;
      }
      if (crawlOutcome.emails.length > 0) {
        const best = crawlOutcome.emails[0];
        const websiteConfidence = candidate.score;
        const status =
          best.confidence >= 0.9 && websiteConfidence >= 0.5
            ? CompanyContactStatus.FOUND_HIGH_CONFIDENCE
            : best.confidence >= 0.7 && websiteConfidence >= 0.4
              ? CompanyContactStatus.FOUND_MEDIUM_CONFIDENCE
              : CompanyContactStatus.REVIEW_REQUIRED;
        const discoveryState: CompanyContactDiscoveryEntryState =
          status === CompanyContactStatus.REVIEW_REQUIRED ? 'REVIEW_REQUIRED' : 'FOUND';

        diagnostics.emailsFound = crawlOutcome.emails.map((e) => e.value);
        diagnostics.finalStatus = status;
        diagnostics.logs.push(`EMAIL_FOUND: ${best.value} (${best.sourceUrl})`);

        this.log.log(
          JSON.stringify({
            event: 'CONTACT_DISCOVERY_COMPLETED',
            companyId: company.id,
            companyIco: company.ico,
            email: best.value,
            website: candidate.url,
            confidence: best.confidence,
          }),
        );

        return {
          found: true,
          status,
          email: best.value,
          sourceUrl: best.sourceUrl,
          confidence: best.confidence,
          phone: crawlOutcome.phone,
          website: candidate.url,
          discoveryState,
          diagnostics,
        };
      }

      diagnostics.logs.push(`EMAIL_NOT_FOUND_AFTER_VALID_WEBSITE: ${candidate.url}`);
    }

    const hadBlocked = diagnostics.logs.some((l) => l.startsWith('WEBSITE_BLOCKED'));
    if (hadBlocked && !diagnostics.emailsFound.length) {
      return fail('WEBSITE_BLOCKED');
    }

    if (diagnostics.contactPagesFound.length === 0 && diagnostics.homepageHttpStatus == null) {
      return fail('WEBSITE_UNREACHABLE');
    }

    if (diagnostics.contactPagesFound.length > 0) {
      return fail('NO_EMAIL_ON_WEBSITE');
    }

    return fail(viable.length === 0 ? 'COMPANY_MATCH_TOO_LOW' : 'NO_EMAIL_ON_WEBSITE');
  }

  private async crawlForEmails(
    website: string,
    diagnostics: ContactDiscoveryDiagnostics,
  ): Promise<{
    emails: Array<{ value: string; sourceUrl: string; confidence: number }>;
    phone: string | null;
    blocked: boolean;
    unreachable: boolean;
  }> {
    const startUrl = this.crawler.normalizeWebsiteUrl(website);
    const baseHost = this.crawler.getHost(startUrl);
    const emails = new Map<string, { value: string; sourceUrl: string; confidence: number }>();
    let phone: string | null = null;
    let blocked = false;
    let unreachable = false;

    diagnostics.logs.push(`WEBSITE_FETCH_STARTED: ${startUrl}`);
    const first = await this.crawler.crawl(['/'], startUrl);
    if (first.error === 'BLOCKED_BY_WEBSITE') {
      blocked = true;
      return { emails: [], phone: null, blocked, unreachable: false };
    }
    if (!first.pages.length) {
      unreachable = true;
      return { emails: [], phone: null, blocked: false, unreachable: true };
    }

    diagnostics.homepageHttpStatus = first.pages[0]?.status ?? null;
    let paths = [...SEED_PATHS];
    if (first.pages[0]) {
      paths = discoverContactPaths(first.pages[0].url, deobfuscateEmailsInHtml(first.pages[0].html));
    }

    const crawlResult = await this.crawler.crawl(paths, startUrl);
    if (crawlResult.error === 'BLOCKED_BY_WEBSITE') {
      blocked = true;
      return { emails: [], phone: null, blocked, unreachable: false };
    }

    const pages = crawlResult.pages.length ? crawlResult.pages : first.pages;
    for (const page of pages) {
      diagnostics.contactPagesFound.push(page.url);
      const html = deobfuscateEmailsInHtml(page.html);
      const host = getHostFromUrl(page.url);
      for (const row of extractEmailsFromHtml(html, page.url, baseHost)) {
        const existing = emails.get(row.normalizedValue);
        if (!existing || existing.confidence < row.confidence) {
          emails.set(row.normalizedValue, {
            value: row.normalizedValue,
            sourceUrl: page.url,
            confidence: row.confidence,
          });
        }
      }
      if (!phone) {
        const phones = extractPhonesFromHtml(html, page.url);
        phone = phones[0]?.normalizedValue ?? null;
      }
    }

    diagnostics.logs.push(`CONTACT_PAGE_FOUND: ${diagnostics.contactPagesFound.length} stránek`);
    return {
      emails: [...emails.values()].sort((a, b) => b.confidence - a.confidence),
      phone,
      blocked,
      unreachable: false,
    };
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
