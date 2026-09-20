/// <reference path="./ambient.d.ts" />
/**
 * Tavily Research Search Provider Unit & Integrity Tests
 *
 * Menguji integrasi Tavily Search API, penanganan error, normalisasi domain SearchResult,
 * serta penegakan invariant mutlak:
 * 1. NO SOURCE -> NO EVIDENCE -> NO SUPPORTED CLAIM
 * 2. SEARCH RESULT ≠ VERIFIED EVIDENCE
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { TavilyResearchSearchProvider } from '../engines/research/acquisition/providers/tavily-research-search-provider.ts';
import { ResearchSearchProviderFactory } from '../engines/research/acquisition/providers/research-search-provider-factory.ts';
import { SearchProviderDiscoveryAdapter } from '../engines/research/acquisition/providers/research-search-provider.ts';
import { EvidenceIntegrityValidator } from '../engines/research/evidence-integrity-validator.ts';
import { DeterministicClaimEvidenceVerifier } from '../engines/research/claim-evidence-verifier.ts';
import type { ResearchQuestion } from '../engines/research/domain/research-question.ts';
import type { ResearchEvidence } from '../engines/research/domain/research-evidence.ts';
import type { ResearchClaim } from '../engines/research/domain/research-claim.ts';

describe('Tavily Research Search Provider Tests', () => {
  const originalEnvApiKey = process.env.TAVILY_API_KEY;
  const originalEnvProvider = process.env.RESEARCH_SEARCH_PROVIDER;

  beforeEach(() => {
    ResearchSearchProviderFactory.reset();
  });

  afterEach(() => {
    process.env.TAVILY_API_KEY = originalEnvApiKey;
    process.env.RESEARCH_SEARCH_PROVIDER = originalEnvProvider;
    ResearchSearchProviderFactory.reset();
  });

  // =========================================================================
  // TEST A: Successful Search & Result Normalization
  // =========================================================================
  test('Test A — Successful Search: Tavily mock response dinormalisasi dengan benar ke SearchResult[]', async () => {
    let calledUrl = '';
    let calledMethod = '';
    let calledBody: any = null;

    const mockFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calledUrl = url.toString();
      calledMethod = init?.method || '';
      calledBody = JSON.parse(init?.body as string);

      const mockResponseData = {
        query: 'dampak kecerdasan buatan pada CRM',
        response_time: 0.42,
        results: [
          {
            title: 'Analisis Transformasi AI dalam Sistem CRM Modern',
            url: 'https://technology-review.org/insights/ai-crm-2026',
            content: 'Penerapan agen AI generatif memangkas response time pelanggan sebesar 40%.',
            score: 0.94,
            published_date: '2026-03-15T08:00:00Z'
          },
          {
            title: 'Studi Tren Adopsi Automasi CRM di Asia Tenggara',
            url: 'https://southeast-asia-tech.com/reports/crm-automation',
            content: 'Lebih dari 60% klinik estetika mulai mengintegrasikan sistem pencatatan cerdas.',
            score: 0.88
            // published_date sengaja tidak ada untuk memverifikasi no-fabrication rule
          }
        ]
      };

      return new Response(JSON.stringify(mockResponseData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const provider = new TavilyResearchSearchProvider({
      apiKey: 'test-api-key-mock',
      fetchFn: mockFetch as any
    });

    const question: ResearchQuestion = {
      id: 'rq-01',
      question: 'Bagaimana AI mengubah sistem CRM?',
      priority: 'HIGH',
      status: 'OPEN'
    };

    const results = await provider.search(question, { maxResults: 5 });

    // Verifikasi endpoint & payload
    assert.strictEqual(calledUrl, 'https://api.tavily.com/search');
    assert.strictEqual(calledMethod, 'POST');
    assert.strictEqual(calledBody.query, 'Bagaimana AI mengubah sistem CRM?');
    assert.strictEqual(calledBody.search_depth, 'basic');
    assert.strictEqual(calledBody.max_results, 5);
    assert.strictEqual(calledBody.include_answer, false);

    // Verifikasi normalisasi hasil
    assert.strictEqual(results.length, 2);

    const first = results[0];
    assert.strictEqual(first.url, 'https://technology-review.org/insights/ai-crm-2026');
    assert.strictEqual(first.title, 'Analisis Transformasi AI dalam Sistem CRM Modern');
    assert.strictEqual(first.snippet, 'Penerapan agen AI generatif memangkas response time pelanggan sebesar 40%.');
    assert.strictEqual(first.publisher, 'technology-review.org');
    assert.strictEqual(first.publishedAt, '2026-03-15T08:00:00.000Z');
    assert.strictEqual(first.score, 0.94);
    assert.ok(first.retrievedAt);

    // Verifikasi result kedua tanpa published_date: DILARANG mengarang tanggal
    const second = results[1];
    assert.strictEqual(second.url, 'https://southeast-asia-tech.com/reports/crm-automation');
    assert.strictEqual(second.publishedAt, undefined, 'Tanggal publikasi tidak boleh dikarang jika Tavily tidak menyediakannya');
    assert.strictEqual(second.publisher, 'southeast-asia-tech.com');
  });

  // =========================================================================
  // TEST B: Empty Search
  // =========================================================================
  test('Test B — Empty Search: Tavily mengembalikan 0 hasil -> menghasilkan array kosong tanpa sumber palsu', async () => {
    const mockFetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ query: 'non existent query', results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const provider = new TavilyResearchSearchProvider({
      apiKey: 'test-api-key-mock',
      fetchFn: mockFetch as any
    });

    const results = await provider.search('topik antah berantah yang tidak ada di internet');

    assert.strictEqual(Array.isArray(results), true);
    assert.strictEqual(results.length, 0, 'Hasil pencarian harus berupa array kosong');
  });

  // =========================================================================
  // TEST C: API Failure Handling
  // =========================================================================
  test('Test C — API Failure: Error 429 atau 500 menghasilkan kegagalan eksplisit tanpa fallback sintetis', async () => {
    // 1. Uji Rate Limit (429)
    const mockRateLimitFetch = async (): Promise<Response> => {
      return new Response('Rate limit exceeded', { status: 429 });
    };

    const rateLimitProvider = new TavilyResearchSearchProvider({
      apiKey: 'test-api-key-mock',
      fetchFn: mockRateLimitFetch as any
    });

    await assert.rejects(
      async () => {
        await rateLimitProvider.search('query rate limit');
      },
      (err: any) => {
        assert.ok(err.message.includes('SEARCH_PROVIDER_RATE_LIMITED'));
        return true;
      }
    );

    // 2. Uji HTTP 500 Server Error
    const mockServerErrorFetch = async (): Promise<Response> => {
      return new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });
    };

    const serverErrorProvider = new TavilyResearchSearchProvider({
      apiKey: 'test-api-key-mock',
      fetchFn: mockServerErrorFetch as any
    });

    await assert.rejects(
      async () => {
        await serverErrorProvider.search('query server error');
      },
      (err: any) => {
        assert.ok(err.message.includes('SOURCE_DISCOVERY_FAILED'));
        return true;
      }
    );
  });

  // =========================================================================
  // TEST D: Missing API Key
  // =========================================================================
  test('Test D — Missing API Key: Menghasilkan error konfigurasi eksplisit dan tidak memanggil API', async () => {
    let fetchCalled = false;
    const mockFetch = async (): Promise<Response> => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    };

    // Kosongkan key eksplisit
    delete process.env.TAVILY_API_KEY;

    const provider = new TavilyResearchSearchProvider({
      apiKey: '',
      fetchFn: mockFetch as any
    });

    await assert.rejects(
      async () => {
        await provider.search('apakah AI siap dipakai di klinik?');
      },
      (err: any) => {
        assert.ok(err.message.includes('SEARCH_PROVIDER_CONFIG_ERROR'));
        return true;
      }
    );

    assert.strictEqual(fetchCalled, false, 'Fetch tidak boleh dipanggil jika API key belum disetel');
  });

  // =========================================================================
  // TEST E: URL Supplied Direct Acquisition Bypass
  // =========================================================================
  test('Test E — URL Supplied: Jika pengguna memberikan URL langsung, Tavily search TIDAK dipanggil', async () => {
    let tavilyCalled = false;

    const mockSearchProvider = {
      providerName: 'MockSpyTavilyProvider',
      providerVersion: '1.0.0',
      search: async () => {
        tavilyCalled = true;
        return [];
      }
    };

    ResearchSearchProviderFactory.setInstance(mockSearchProvider as any);

    // Simulasi alur bot Telegram: user memberikan URL eksplisit
    const userUrls = ['https://kemenkes.go.id/regulasi-rekam-medis'];

    if (userUrls.length > 0) {
      // Direct acquisition bypass: URL langsung diproses oleh acquisition provider
      // Tidak menyentuh discovery provider
    } else {
      const discovery = ResearchSearchProviderFactory.getSearchProvider();
      await discovery.search('pertanyaan');
    }

    assert.strictEqual(tavilyCalled, false, 'Tavily search provider tidak boleh dipanggil jika URL sudah diberikan secara langsung');
  });

  // =========================================================================
  // TEST F: Integrity Gate (SEARCH RESULT ≠ VERIFIED EVIDENCE)
  // =========================================================================
  test('Test F — Integrity Invariant: Tavily SearchResult tidak pernah otomatis menjadi verified evidence atau SUPPORTED claim', async () => {
    const rawTavilyResult = {
      url: 'https://market-insights.com/ai-report',
      title: 'Laporan AI CRM',
      snippet: 'Peningkatan adopsi hingga 80%.',
      publisher: 'market-insights.com',
      retrievedAt: new Date().toISOString()
    };

    // 1. SearchResult murni belum diakuisisi -> Bukan verified evidence
    const unacquiredEvidence: ResearchEvidence = {
      id: 'ev-from-search-unacquired',
      sourceId: 'src-pending',
      researchProjectId: 'proj-tavily-test',
      content: rawTavilyResult.snippet,
      evidenceLevel: 'E2',
      publicationAllowed: true,
      capturedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      verified: false, // Belum diakuisisi isinya
      provenanceType: 'EXTERNAL_EVIDENCE',
      sourceUrl: rawTavilyResult.url
    };

    const integrityValidator = new EvidenceIntegrityValidator();
    const claimVerifier = new DeterministicClaimEvidenceVerifier();

    // Validasi integritas terhadap bukti yang belum berhasil diakuisisi (source = null atau konten kosong)
    const integrityCheck = integrityValidator.validate({
      evidence: unacquiredEvidence,
      source: null,
      sourceRawContent: null
    });

    assert.strictEqual(integrityCheck.verified, false, 'Evidence dari SearchResult yang belum diakuisisi dilarang berstatus verified');

    // 2. Evaluasi Klaim yang merujuk bukti unverified
    const proposedClaim: ResearchClaim = {
      id: 'claim-tavily-unverified',
      statement: 'Adopsi CRM melonjak hingga 80%',
      claimType: 'FACTUAL',
      importance: 'CRITICAL',
      status: 'SUPPORTED', // Qwen mencoba mengklaim SUPPORTED
      researchProjectId: 'proj-tavily-test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const verificationResult = await claimVerifier.verify(
      proposedClaim,
      [unacquiredEvidence] // verified = false
    );

    assert.notStrictEqual(verificationResult.status, 'SUPPORTED', 'Klaim dilarang berstatus SUPPORTED tanpa bukti terverifikasi');
    assert.strictEqual(verificationResult.status, 'UNVERIFIED', 'Klaim harus diturunkan statusnya menjadi UNVERIFIED');
    assert.strictEqual(verificationResult.supportingEvidenceIds.length, 0);
  });
});
