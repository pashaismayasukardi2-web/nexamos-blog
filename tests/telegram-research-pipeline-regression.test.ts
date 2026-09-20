/// <reference path="./ambient.d.ts" />
/**
 * Telegram Production Research Pipeline Regression Tests
 *
 * Menguji integrasi penuh alur riset kanonikal (CanonicalResearchPipeline)
 * yang digunakan dalam workflow produksi Telegram Editorial Bot.
 *
 * Invariant yang diuji:
 * 1. NO SOURCE -> NO EVIDENCE -> NO SUPPORTED CLAIM
 * 2. SEARCH RESULT ≠ VERIFIED EVIDENCE
 * 3. Qwen TIDAK BOLEH memiliki otoritas final menetapkan status SUPPORTED
 * 4. User URL -> Direct Acquisition (Bypass Search Provider)
 * 5. Topic only -> Autonomous Search Provider (Tavily/Mock)
 * 6. Provenance Chain lengkap: Claim -> Evidence -> Source
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { CanonicalResearchPipeline } from '../engines/research/canonical-research-pipeline.ts';
import { MockResearchSearchProvider } from '../engines/research/acquisition/providers/research-search-provider.ts';
import { MockSourceAcquisitionProvider } from '../engines/research/acquisition/providers/mock-acquisition-provider.ts';
import { MockAIResearchProvider } from '../engines/research/orchestrator/providers/mock-ai-research-provider.ts';
import type { Topic } from '../engines/ideation/domain/topic.types.ts';

describe('Telegram Production Research Pipeline Regression Tests', () => {
  let sampleTopic: Topic;

  beforeEach(() => {
    sampleTopic = {
      id: 'top-reg-01',
      title: 'Dampak AI terhadap Retensi Pelanggan Klinik',
      slug: 'dampak-ai-retensi-pelanggan-klinik',
      territory: 'INTELLIGENCE',
      recommendedArticleType: 'ANALYSIS',
      editorialRole: 'AUTHORITY',
      status: 'APPROVED',
      intent: {},
      informationGain: { originalityType: [], expectedContribution: '', commodityRisk: 'LOW' },
      evidencePlan: { requiredEvidenceLevel: 'E2', plannedSources: [], originalEvidenceRequired: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });

  // =========================================================================
  // TEST 1 — Topic Only (Autonomous Discovery Flow)
  // =========================================================================
  test('Test 1 — Topic Only: Pencarian otonom memanggil SearchProvider, mengakuisisi konten nyata, mengekstrak bukti, dan menghasilkan ResearchBrief ter-grounding', async () => {
    const mockSearch = new MockResearchSearchProvider();
    mockSearch.registerResults('dampak ai', [
      {
        url: 'https://healthtech-journal.org/ai-retention-2026',
        title: 'Studi Retensi Pasien Berbasis AI 2026',
        snippet: 'Adopsi CRM bertenaga AI meningkatkan retensi pasien sebesar 35% dalam 6 bulan.',
        publisher: 'healthtech-journal.org',
        retrievedAt: new Date().toISOString()
      }
    ]);

    const mockAcquisition = new MockSourceAcquisitionProvider();
    mockAcquisition.registerMockContent('https://healthtech-journal.org/ai-retention-2026', {
      researchProjectId: 'proj-test-1',
      sourceType: 'INDUSTRY_RESEARCH',
      format: 'MARKDOWN',
      title: 'Studi Retensi Pasien Berbasis AI 2026',
      url: 'https://healthtech-journal.org/ai-retention-2026',
      publisher: 'HealthTech Journal',
      content: '# Studi Retensi Pasien Berbasis AI 2026\nAdopsi CRM bertenaga AI meningkatkan retensi pasien sebesar 35% dalam 6 bulan secara konsisten di seluruh klinik mitra.'
    });

    const mockAI = new MockAIResearchProvider();
    mockAI.setOptions({
      customClaims: [
        {
          statement: 'Adopsi CRM bertenaga AI meningkatkan retensi pasien sebesar 35%',
          claimType: 'FACTUAL',
          importance: 'CRITICAL'
        }
      ]
    });

    const pipeline = new CanonicalResearchPipeline({
      searchProvider: mockSearch,
      acquisitionProvider: mockAcquisition,
      aiResearchProvider: mockAI
    });

    const result = await pipeline.execute({
      topic: sampleTopic,
      directUrls: [] // Topic only (tanpa URL)
    });

    assert.ok(result.ok, 'Pipeline harus berhasil mengeksekusi topik');
    const { researchBrief, metrics, provenanceTrace } = result.value;

    assert.strictEqual(metrics.searchRequestsCount, 1, 'Search provider harus dipanggil tepat 1 kali');
    assert.strictEqual(metrics.candidateSourcesCount, 1);
    assert.strictEqual(metrics.acquiredSourcesCount, 1);
    assert.ok(metrics.verifiedEvidenceCount > 0, 'Harus ada bukti terverifikasi');
    assert.strictEqual(metrics.supportedClaimsCount, 1, 'Klaim harus berstatus SUPPORTED setelah verifikasi deterministik');
    assert.strictEqual(researchBrief.readiness, 'READY_FOR_EDITORIAL');

    // Provenance check
    assert.strictEqual(provenanceTrace.length, 1);
    assert.strictEqual(provenanceTrace[0].supportingEvidence.length, 1);
    assert.strictEqual(provenanceTrace[0].supportingEvidence[0].sourceUrl, 'https://healthtech-journal.org/ai-retention-2026');
  });

  // =========================================================================
  // TEST 2 — Direct URL (Search Provider Bypass)
  // =========================================================================
  test('Test 2 — Direct URL: Jika pengguna memberikan URL, direct acquisition berjalan dan Search Provider TIDAK dipanggil', async () => {
    let searchCalled = false;
    const mockSearch: any = {
      providerName: 'SpySearchProvider',
      providerVersion: '1.0.0',
      search: async () => {
        searchCalled = true;
        return [];
      }
    };

    const directUrl = 'https://kemenkes.go.id/laporan-digitalisasi-klinik-2026';
    const mockAcquisition = new MockSourceAcquisitionProvider();
    mockAcquisition.registerMockContent(directUrl, {
      researchProjectId: 'proj-test-2',
      sourceType: 'REGULATORY_DOCUMENT',
      format: 'HTML',
      title: 'Laporan Digitalisasi Klinik 2026',
      url: directUrl,
      publisher: 'Kemenkes RI',
      content: 'Kementerian Kesehatan mencatat 72% klinik spesialis telah menggunakan rekam medis elektronik terintegrasi.'
    });

    const pipeline = new CanonicalResearchPipeline({
      searchProvider: mockSearch,
      acquisitionProvider: mockAcquisition
    });

    const result = await pipeline.execute({
      topic: sampleTopic,
      directUrls: [directUrl]
    });

    assert.ok(result.ok);
    assert.strictEqual(searchCalled, false, 'Search provider TIDAK BOLEH dipanggil jika URL langsung diberikan oleh pengguna');
    assert.strictEqual(result.value.metrics.searchRequestsCount, 0);
    assert.strictEqual(result.value.metrics.acquiredSourcesCount, 1);
  });

  // =========================================================================
  // TEST 3 — Qwen Unsupported Claim Demotion
  // =========================================================================
  test('Test 3 — Qwen Unsupported Claim: Usulan klaim Qwen tanpa bukti terverifikasi mutlak diturunkan ke UNVERIFIED', async () => {
    const directUrl = 'https://verified-source.com/report';
    const mockAcquisition = new MockSourceAcquisitionProvider();
    mockAcquisition.registerMockContent(directUrl, {
      researchProjectId: 'proj-test-3',
      sourceType: 'INDUSTRY_RESEARCH',
      format: 'PLAIN_TEXT',
      title: 'Laporan Finansial Klinik',
      url: directUrl,
      publisher: 'Verified Source',
      content: 'Biaya operasional klinik turun 15% berkat automasi pencatatan inventaris obat.'
    });

    const mockAI = new MockAIResearchProvider();
    mockAI.setOptions({
      customClaims: [
        {
          // Klaim halusinasi / tidak didukung konten sumber
          statement: 'Dokter bedah estetika akan digantikan 100% oleh robot humanoid dalam 2 tahun',
          claimType: 'FORECAST',
          importance: 'CRITICAL'
        }
      ]
    });

    const pipeline = new CanonicalResearchPipeline({
      acquisitionProvider: mockAcquisition,
      aiResearchProvider: mockAI
    });

    const result = await pipeline.execute({
      topic: sampleTopic,
      directUrls: [directUrl]
    });

    assert.ok(result.ok);
    const { researchBrief, metrics } = result.value;

    // Klaim halusinasi harus ditolak menjadi UNVERIFIED
    assert.strictEqual(metrics.supportedClaimsCount, 0, 'Klaim tanpa bukti tidak boleh menjadi SUPPORTED');
    assert.strictEqual(metrics.unverifiedClaimsCount, 1, 'Klaim harus bergeser ke unverifiedClaims');
    assert.strictEqual(researchBrief.supportedClaims.length, 0);
    assert.strictEqual(researchBrief.readiness, 'NOT_READY', 'Riset harus berstatus NOT_READY karena tidak ada klaim terverifikasi');
  });

  // =========================================================================
  // TEST 4 — No Source Found Propagates Explicit Failure
  // =========================================================================
  test('Test 4 — No Source Found: Jika search provider 0 hasil, pipeline mengembalikan error eksplisit NO_SOURCE_FOUND tanpa membuat data palsu', async () => {
    const mockSearch = new MockResearchSearchProvider();
    // Tidak ada hasil terdaftar (default 0 hasil)

    const pipeline = new CanonicalResearchPipeline({
      searchProvider: mockSearch
    });

    const result = await pipeline.execute({
      topic: sampleTopic,
      directUrls: []
    });

    assert.strictEqual(result.ok, false, 'Pipeline harus mengembalikan error jika tidak ada sumber ditemukan');
    assert.strictEqual(result.error.code, 'NO_SOURCE_FOUND', 'Kode error harus NO_SOURCE_FOUND');
    assert.match(result.error.message, /Tidak ditemukan kandidat sumber/);
  });

  // =========================================================================
  // TEST 5 — Legacy Fallback Prevention
  // =========================================================================
  test('Test 5 — Legacy Fallback Prevention: Pipeline menolak keras publisher palsu NexaMOS Sovereign Knowledge Base', async () => {
    const directUrl = 'https://internal-notes.local/fake-report';
    const mockAcquisition = new MockSourceAcquisitionProvider();
    mockAcquisition.registerMockContent(directUrl, {
      researchProjectId: 'proj-test-5',
      sourceType: 'COMPANY_PUBLICATION',
      format: 'PLAIN_TEXT',
      title: 'Doktrin NexaMOS',
      url: directUrl,
      publisher: 'NexaMOS Sovereign Knowledge Base', // Banned synthetic publisher
      content: 'Klaim doktriner mandiri tanpa verifikasi eksternal.'
    });

    const pipeline = new CanonicalResearchPipeline({
      acquisitionProvider: mockAcquisition
    });

    const result = await pipeline.execute({
      topic: sampleTopic,
      directUrls: [directUrl]
    });

    // Harus gagal karena satu-satunya sumber adalah publisher terlarang sehingga verifiedEvidence = 0
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'NO_VERIFIED_EVIDENCE');
  });

  // =========================================================================
  // TEST 6 — Supported Provenance Invariant
  // =========================================================================
  test('Test 6 — Supported Provenance Invariant: Setiap klaim SUPPORTED wajib memiliki supportingEvidenceIds terverifikasi dengan URL sumber valid', async () => {
    const directUrl = 'https://clinical-evidence.org/dermatology-crm-study';
    const mockAcquisition = new MockSourceAcquisitionProvider();
    mockAcquisition.registerMockContent(directUrl, {
      researchProjectId: 'proj-test-6',
      sourceType: 'ACADEMIC_PAPER',
      format: 'PLAIN_TEXT',
      title: 'Efektivitas CRM Klinis',
      url: directUrl,
      publisher: 'Clinical Evidence Press',
      content: 'Tingkat kepatuhan janji temu konsultasi kulit naik 48 persen dengan automasi reminder WhatsApp.'
    });

    const mockAI = new MockAIResearchProvider();
    mockAI.setOptions({
      customClaims: [
        {
          statement: 'Tingkat kepatuhan janji temu konsultasi kulit naik 48 persen dengan automasi reminder WhatsApp',
          claimType: 'FACTUAL',
          importance: 'CRITICAL'
        }
      ]
    });

    const pipeline = new CanonicalResearchPipeline({
      acquisitionProvider: mockAcquisition,
      aiResearchProvider: mockAI
    });

    const result = await pipeline.execute({
      topic: sampleTopic,
      directUrls: [directUrl]
    });

    assert.ok(result.ok);
    const { researchBrief, provenanceTrace, verifiedEvidence } = result.value;

    assert.ok(researchBrief.supportedClaims.length > 0);

    for (const claim of researchBrief.supportedClaims) {
      assert.strictEqual(claim.status, 'SUPPORTED');

      // Cari di trace
      const trace = provenanceTrace.find((t) => t.claimId === claim.id);
      assert.ok(trace, `Trace untuk claim ${claim.id} harus tersedia`);
      assert.ok(trace.supportingEvidence.length > 0, 'Klaim SUPPORTED wajib memiliki setidaknya 1 supporting evidence');

      for (const ev of trace.supportingEvidence) {
        assert.ok(ev.evidenceId);
        assert.ok(ev.sourceUrl, 'Supporting evidence wajib memiliki URL sumber primer yang sah');
        assert.strictEqual(ev.sourceUrl, directUrl);

        // Bukti rujukan harus benar-benar ada di daftar verifiedEvidence
        const matchedVerified = verifiedEvidence.find((ve) => ve.id === ev.evidenceId);
        assert.ok(matchedVerified);
        assert.strictEqual(matchedVerified.verified, true);
      }
    }
  });
});
