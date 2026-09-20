/**
 * NexaMOS Research Search Provider Abstraction
 *
 * Sourced from NexaMOS Blog Research Integrity Hardening
 * Abstraksi provider pencarian agnostik vendor untuk penemuan sumber (Source Discovery):
 * ResearchQuestion -> Source Discovery -> Candidate Sources -> Quality Evaluation -> Selected Sources -> Acquisition
 */

import type { ResearchQuestion } from '../../domain/research-question.ts';
import type { SourceType } from '../../domain/source-type.ts';
import type { EvidenceLevel } from '../../../ideation/domain/evidence-level.ts';
import type { DiscoveryQuery } from '../source-discovery.ts';
import type { SourceCandidate } from '../source-candidate.ts';
import type { ResearchDiscoveryProvider } from './research-discovery-provider.ts';

export interface SearchOptions {
  maxResults?: number;
  preferredTypes?: SourceType[];
  requiredEvidenceLevel?: EvidenceLevel;
  dateConstraint?: string;
  language?: string;
  domainConstraints?: string[];
  timeoutMs?: number;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet?: string;
  publisher?: string;
  publishedAt?: string;
  retrievedAt: string;
  sourceType?: SourceType;
  score?: number;
}

export interface ResearchSearchProvider {
  readonly providerName: string;
  readonly providerVersion: string;
  search(
    queryOrQuestion: ResearchQuestion | string,
    options?: SearchOptions
  ): Promise<SearchResult[]>;
}

/**
 * In-memory Mock Research Search Provider untuk pengujian deterministik & offline
 */
export class MockResearchSearchProvider implements ResearchSearchProvider {
  readonly providerName = 'MockResearchSearchProvider';
  readonly providerVersion = '1.0.0';

  private queryMap = new Map<string, SearchResult[]>();
  private defaultResults: SearchResult[] = [];

  registerResults(keyword: string, results: SearchResult[]): void {
    this.queryMap.set(keyword.toLowerCase().trim(), results);
  }

  setDefaultResults(results: SearchResult[]): void {
    this.defaultResults = results;
  }

  async search(
    queryOrQuestion: ResearchQuestion | string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const rawText = typeof queryOrQuestion === 'string'
      ? queryOrQuestion
      : queryOrQuestion.question;
    const lower = rawText.toLowerCase().trim();
    const limit = options?.maxResults ?? 10;

    for (const [key, results] of this.queryMap.entries()) {
      if (lower.includes(key)) {
        return results.slice(0, limit);
      }
    }

    return this.defaultResults.slice(0, limit);
  }

  clear(): void {
    this.queryMap.clear();
    this.defaultResults = [];
  }
}

/**
 * Adapter yang menghubungkan ResearchSearchProvider generik ke ResearchDiscoveryProvider internal
 */
export class SearchProviderDiscoveryAdapter implements ResearchDiscoveryProvider {
  readonly providerName: string;
  readonly providerVersion: string;
  private searchProvider: ResearchSearchProvider;

  constructor(searchProvider: ResearchSearchProvider) {
    this.searchProvider = searchProvider;
    this.providerName = `Adapter(${searchProvider.providerName})`;
    this.providerVersion = searchProvider.providerVersion;
  }

  async search(query: DiscoveryQuery): Promise<SourceCandidate[]> {
    const searchResults = await this.searchProvider.search(query.query, {
      preferredTypes: query.preferredSourceTypes,
      requiredEvidenceLevel: query.requiredEvidenceLevel ?? undefined,
      dateConstraint: query.dateConstraint ?? undefined,
      language: query.language ?? undefined,
      domainConstraints: query.domainConstraints ?? undefined
    });

    return searchResults.map((sr, idx) => ({
      id: `cand-${query.id}-${idx + 1}`,
      queryId: query.id,
      researchProjectId: query.researchProjectId,
      title: sr.title,
      url: sr.url,
      snippet: sr.snippet || null,
      publisher: sr.publisher || null,
      publicationDate: sr.publishedAt || null,
      sourceType: sr.sourceType || 'INDUSTRY_RESEARCH',
      provider: this.searchProvider.providerName,
      rank: idx + 1,
      status: 'DISCOVERED',
      discoveredAt: sr.retrievedAt || new Date().toISOString()
    }));
  }
}
