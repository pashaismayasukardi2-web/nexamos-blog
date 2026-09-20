/**
 * NexaMOS Tavily Research Search Provider
 *
 * Sourced from NexaMOS Blog Research Live Source Discovery
 * Implementasi produksi dari ResearchSearchProvider menggunakan Tavily Search API.
 *
 * Doktrin:
 * 1. Tavily hanyalah Source Discovery Provider untuk menemukan URL kandidat web.
 * 2. SEARCH RESULT ≠ VERIFIED EVIDENCE.
 * 3. NO SOURCE → NO EVIDENCE → NO SUPPORTED CLAIM.
 * 4. API Key dilindungi secara mutlak dan dibaca dari process.env.TAVILY_API_KEY.
 */

import type { ResearchSearchProvider, SearchOptions, SearchResult } from './research-search-provider.ts';
import type { ResearchQuestion } from '../../domain/research-question.ts';
import { ensureEnvLoaded } from '../../../../infrastructure/ai/ai-provider-config.ts';

export interface TavilyProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export interface TavilySearchResultItem {
  title: string;
  url: string;
  content: string;
  score?: number;
  raw_content?: string;
  published_date?: string;
}

export interface TavilySearchApiResponse {
  query: string;
  results?: TavilySearchResultItem[];
  response_time?: number;
  error?: string;
}

/**
 * Ekstraksi nama domain/publisher dari URL tanpa protokol
 */
function extractDomain(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

export class TavilyResearchSearchProvider implements ResearchSearchProvider {
  readonly providerName = 'TavilyResearchSearchProvider';
  readonly providerVersion = '1.0.0';

  private apiKey: string;
  private baseUrl: string;
  private defaultTimeoutMs: number;
  private fetchFn: typeof fetch;

  // Cache in-memory query untuk menghemat free quota Tavily API
  private queryCache = new Map<string, SearchResult[]>();

  constructor(options: TavilyProviderOptions = {}) {
    ensureEnvLoaded();

    this.apiKey = (options.apiKey || process.env.TAVILY_API_KEY || '').trim();
    this.baseUrl = (options.baseUrl || 'https://api.tavily.com/search').trim();
    this.defaultTimeoutMs = options.timeoutMs || 15000;
    this.fetchFn = options.fetchFn || globalThis.fetch.bind(globalThis);
  }

  /**
   * Melakukan pencarian sumber ke Tavily Search API secara konservatif
   */
  async search(
    queryOrQuestion: ResearchQuestion | string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const rawQuery = typeof queryOrQuestion === 'string'
      ? queryOrQuestion
      : queryOrQuestion.question;

    const queryText = rawQuery.trim();
    if (!queryText) {
      return [];
    }

    // Guard API Key
    if (!this.apiKey) {
      throw new Error(
        '[SEARCH_PROVIDER_CONFIG_ERROR] TAVILY_API_KEY tidak ditemukan di environment (.env.local). Permintaan pencarian dibatalkan.'
      );
    }

    const maxResults = options.maxResults ?? 5;
    const cacheKey = `${queryText.toLowerCase()}__limit_${maxResults}`;

    // Cek cache untuk menghindari redundant API calls
    if (this.queryCache.has(cacheKey)) {
      return this.queryCache.get(cacheKey)!;
    }

    const timeout = options.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const payload = {
      api_key: this.apiKey,
      query: queryText,
      search_depth: 'basic', // Konservatif untuk menghemat credit
      topic: 'general',
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
      include_images: false
    };

    try {
      const response = await this.fetchFn(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (response.status === 429) {
        throw new Error('[SEARCH_PROVIDER_RATE_LIMITED] Batas kuota (rate limit) Tavily Search API tercapai.');
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error('[SEARCH_PROVIDER_AUTH_ERROR] Kunci otentikasi TAVILY_API_KEY ditolak atau tidak valid.');
      }

      if (!response.ok) {
        throw new Error(`[SOURCE_DISCOVERY_FAILED] Tavily Search API mengembalikan status HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as TavilySearchApiResponse;
      const rawResults = data.results || [];

      // Normalisasi hasil ke domain SearchResult
      const normalizedResults: SearchResult[] = rawResults.map((item) => {
        const domain = extractDomain(item.url);
        return {
          url: item.url,
          title: item.title?.trim() || item.url,
          snippet: item.content?.trim(),
          publisher: domain,
          // Jangan pernah mengarang tanggal publikasi jika tidak disediakan
          publishedAt: item.published_date ? new Date(item.published_date).toISOString() : undefined,
          retrievedAt: new Date().toISOString(),
          score: typeof item.score === 'number' ? item.score : undefined
        };
      });

      // Simpan di cache in-memory
      this.queryCache.set(cacheKey, normalizedResults);

      return normalizedResults;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`[SOURCE_DISCOVERY_TIMEOUT] Permintaan ke Tavily Search API melebihi batas waktu (${timeout}ms).`);
      }
      // Re-throw structured error
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Membersihkan memori cache pencarian
   */
  clearCache(): void {
    this.queryCache.clear();
  }
}
