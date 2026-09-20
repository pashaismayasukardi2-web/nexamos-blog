/**
 * NexaMOS Research Agent Integrity Hardening Tests
 *
 * Sourced from NexaMOS Blog Research Integrity Hardening Specifications
 * Menguji kepatuhan sistemik terhadap invariant:
 * NO SOURCE -> NO EVIDENCE -> NO SUPPORTED CLAIM
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { DeterministicClaimEvidenceVerifier } from '../engines/research/claim-evidence-verifier.ts';
import { EvidenceIntegrityValidator } from '../engines/research/evidence-integrity-validator.ts';
import {
  MockResearchSearchProvider,
  SearchProviderDiscoveryAdapter
} from '../engines/research/acquisition/providers/research-search-provider.ts';
import { HttpSourceAcquisitionProvider } from '../engines/research/acquisition/providers/http-source-acquisition-provider.ts';
import { ResearchIngestionService } from '../engines/research/ingestion/research-ingestion-service.ts';
import { ResearchAcquisitionService } from '../engines/research/acquisition/research-acquisition-service.ts';
import { InMemoryResearchSourceRepository } from '../engines/research/repository/in-memory-research-source-repository.ts';
import { InMemoryResearchEvidenceRepository } from '../engines/research/repository/in-memory-research-evidence-repository.ts';
import { InMemoryResearchEventRepository } from '../engines/research/repository/in-memory-research-event-repository.ts';
import { InMemoryResearchClaimRepository } from '../engines/research/repository/in-memory-research-claim-repository.ts';
import { InMemoryResearchFindingRepository } from '../engines/research/repository/in-memory-research-finding-repository.ts';
import { ResearchBriefBuilder } from '../engines/research/orchestrator/research-brief-builder.ts';
import { evaluateClaimGrounding } from '../engines/research/claim-grounding-evaluator.ts';
import type { ResearchClaim } from '../engines/research/domain/research-claim.ts';
import type { ResearchEvidence } from '../engines/research/domain/research-evidence.ts';
import type { ResearchSource } from '../engines/research/domain/research-source.ts';
import type { SourceCandidate } from '../engines/research/acquisition/source-candidate.ts';

describe('NexaMOS Research Integrity Hardening Tests', () => {
  // ==========================================================================
  // TEST 1: No source found -> no verified evidence -> no supported claim
  // ==========================================================================
  test('Test 1: No source found -> no verified evidence -> no supported claim', async () => {
    const searchProvider = new MockResearchSearchProvider();
    // Search provider kosong (tidak ada sumber yang ditemukan di web)
    const discoveryAdapter = new SearchProviderDiscoveryAdapter(searchProvider);

    const sourceRepo = new InMemoryResearchSourceRepository();
    const evidenceRepo = new InMemoryResearchEvidenceRepository();
    const eventRepo = new InMemoryResearchEventRepository();
    const ingestionService = new ResearchIngestionService({ sourceRepo, evidenceRepo, eventRepo });
    const acquisitionService = new ResearchAcquisitionService({
      discoveryProvider: discoveryAdapter,
      acquisitionProvider: new HttpSourceAcquisitionProvider(),
      ingestionService,
      eventRepo,
      sourceRepo
    });

    const reportRes = await acquisitionService.runAcquisitionPipeline(
      { id: 'q-empty', question: 'Topik antah berantah tanpa sumber', priority: 'HIGH', status: 'OPEN' },
      'proj-test-1'
    );

    assert.ok(reportRes.ok);
    assert.strictEqual(reportRes.value.acceptedCandidates.length, 0);
    assert.strictEqual(reportRes.value.ingestionResults.length, 0);

    // Repositori bukti tetap kosong (NO EVIDENCE)
    const storedEvidence = await evidenceRepo.listByProjectId('proj-test-1');
    assert.strictEqual(storedEvidence.length, 0);

    // Qwen mengusulkan klaim hipotesis
    const proposedClaim: ResearchClaim = {
      id: 'claim-t1-1',
      researchProjectId: 'proj-test-1',
      statement: 'Pangsa pasar produk X mencapai 80 persen di Indonesia.',
      claimType: 'FACTUAL',
      importance: 'CRITICAL',
      status: 'UNVERIFIED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Evaluasi melalui ClaimEvidenceVerifier
    const verifier = new DeterministicClaimEvidenceVerifier();
    const verification = await verifier.verify(proposedClaim, storedEvidence);

    // Mutlak: Status klaim BUKAN SUPPORTED, melainkan UNVERIFIED
    assert.notStrictEqual(verification.status, 'SUPPORTED');
    assert.strictEqual(verification.status, 'UNVERIFIED');
    assert.strictEqual(verification.supportingEvidenceIds.length, 0);
  });

  // ==========================================================================
  // TEST 2: Source acquisition failed -> evidence cannot become verified
  // ==========================================================================
  test('Test 2: Source acquisition failed -> evidence cannot become verified', async () => {
    const validator = new EvidenceIntegrityValidator();

    // Skenario: Sumber gagal diakuisisi (misalnya 404, timeout, SSRF) sehingga tidak ada entity tersimpan
    const unacquiredEvidence: ResearchEvidence = {
      id: 'evi-fail-1',
      sourceId: 'src-unacquired',
      researchProjectId: 'proj-test-2',
      content: 'Data statistik yang konon diambil dari website yang gagal dibuka.',
      evidenceLevel: 'E2',
      capturedAt: new Date().toISOString(),
      publicationAllowed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Validasi tanpa entitas sumber riil
    const resultMissingSource = validator.validate({
      evidence: unacquiredEvidence,
      source: null
    });

    assert.strictEqual(resultMissingSource.verified, false);
    assert.ok(resultMissingSource.issues.includes('MISSING_SOURCE_ENTITY'));

    // Skenario: Sumber ada tetapi URL kosong / rusak
    const brokenSource: ResearchSource = {
      id: 'src-broken',
      researchProjectId: 'proj-test-2',
      type: 'INDUSTRY_RESEARCH',
      title: 'Laporan Gagal',
      publisher: 'Unknown Publisher',
      author: null,
      url: '', // URL kosong
      publicationDate: null,
      accessedAt: new Date().toISOString(),
      language: 'id',
      evidenceLevel: 'E2',
      qualityAssessment: {
        authority: 50,
        relevance: 50,
        recency: 50,
        methodologicalTransparency: 50,
        independence: 50,
        verifiability: 50,
        qualitySummary: 'Broken'
      },
      isPrimarySource: false,
      isInternal: false,
      recencyRisk: 'LOW',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const resultBrokenSource = validator.validate({
      evidence: unacquiredEvidence,
      source: brokenSource
    });

    assert.strictEqual(resultBrokenSource.verified, false);
    assert.ok(resultBrokenSource.issues.includes('MISSING_SOURCE_URL'));
  });

  // ==========================================================================
  // TEST 3: Qwen proposes claim + no matching evidence -> claim != SUPPORTED
  // ==========================================================================
  test('Test 3: Qwen proposes claim + no matching evidence -> claim != SUPPORTED', async () => {
    const verifier = new DeterministicClaimEvidenceVerifier();

    const claim: ResearchClaim = {
      id: 'claim-t3-1',
      researchProjectId: 'proj-test-3',
      statement: 'Pertumbuhan adopsi AI di sektor perbankan Indonesia tumbuh 75% YoY pada 2025.',
      claimType: 'FACTUAL',
      importance: 'CRITICAL',
      status: 'UNVERIFIED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Bukti yang ada membahas topik lain (misal: resep kuliner tradisional atau arsitektur CSS)
    const unrelatedEvidence: ResearchEvidence[] = [
      {
        id: 'evi-unrelated-1',
        sourceId: 'src-culinary',
        researchProjectId: 'proj-test-3',
        content: 'Bumbu rendang autentik Minangkabau membutuhkan kelapa tua pilihan dan pemasakan lambat selama 6 jam.',
        evidenceLevel: 'E2',
        capturedAt: new Date().toISOString(),
        publicationAllowed: true,
        verified: true,
        provenanceType: 'EXTERNAL_EVIDENCE',
        sourceUrl: 'https://kuliner.example.com/rendang',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    const result = await verifier.verify(claim, unrelatedEvidence);

    // Invariant: Tanpa kecocokan substantif, klaim TIDAK BOLEH berstatus SUPPORTED
    assert.notStrictEqual(result.status, 'SUPPORTED');
    assert.strictEqual(result.status, 'UNVERIFIED');
    assert.strictEqual(result.supportingEvidenceIds.length, 0);

    // Uji juga via ClaimGroundingEvaluator
    const grounding = evaluateClaimGrounding({
      claim,
      relations: [], // Tidak ada relasi yang terverifikasi
      evidence: unrelatedEvidence,
      sources: []
    });
    assert.notStrictEqual(grounding.claimStatus, 'SUPPORTED');
  });

  // ==========================================================================
  // TEST 4: Qwen proposes claim + verified supporting evidence exists -> SUPPORTED
  // ==========================================================================
  test('Test 4: Qwen proposes claim + verified supporting evidence exists -> SUPPORTED', async () => {
    const verifier = new DeterministicClaimEvidenceVerifier();

    const claim: ResearchClaim = {
      id: 'claim-t4-1',
      researchProjectId: 'proj-test-4',
      statement: 'Riset McKinsey mencatat efisiensi operasional perbankan meningkat sebesar 25% setelah implementasi model otomasi AI.',
      claimType: 'FACTUAL',
      importance: 'CRITICAL',
      status: 'UNVERIFIED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const genuineEvidence: ResearchEvidence[] = [
      {
        id: 'evi-genuine-401',
        sourceId: 'src-mckinsey',
        researchProjectId: 'proj-test-4',
        content: 'Laporan McKinsey Global Institute 2025 menunjukkan efisiensi operasional perbankan meningkat rata-rata 25% melalui implementasi otomasi AI.',
        evidenceLevel: 'E3',
        capturedAt: new Date().toISOString(),
        publicationAllowed: true,
        verified: true, // Bukti terverifikasi riil
        provenanceType: 'EXTERNAL_EVIDENCE',
        sourceUrl: 'https://mckinsey.com/reports/ai-banking-2025',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    const result = await verifier.verify(claim, genuineEvidence);

    // Status berhasil diverifikasi menjadi SUPPORTED
    assert.strictEqual(result.status, 'SUPPORTED');
    assert.strictEqual(result.supportingEvidenceIds.length, 1);
    assert.strictEqual(result.supportingEvidenceIds[0], 'evi-genuine-401');
    assert.ok(result.confidence >= 0.5);
  });

  // ==========================================================================
  // TEST 5: Internal NexaMOS knowledge remains distinguishable from external evidence
  // ==========================================================================
  test('Test 5: Internal NexaMOS knowledge remains distinguishable from external evidence', () => {
    const validator = new EvidenceIntegrityValidator();

    const internalSource: ResearchSource = {
      id: 'src-nexamos-doctrine-internal',
      researchProjectId: 'proj-test-5',
      type: 'INTERNAL_DATA',
      title: 'Pedoman Metodologi Editorial NexaMOS v1.0',
      publisher: 'NexaMOS Core Engineering',
      author: 'Editorial Lead',
      url: 'https://internal.nexamos.com/docs/methodology',
      publicationDate: '2026-01-01',
      accessedAt: new Date().toISOString(),
      language: 'id',
      evidenceLevel: 'E2',
      qualityAssessment: {
        authority: 90,
        relevance: 90,
        recency: 90,
        methodologicalTransparency: 90,
        independence: 90,
        verifiability: 90,
        qualitySummary: 'Internal Sovereign Knowledge'
      },
      isPrimarySource: false,
      isInternal: true, // Sumber internal
      recencyRisk: 'LOW',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const internalEvidence: ResearchEvidence = {
      id: 'evi-internal-501',
      sourceId: 'src-nexamos-doctrine-internal',
      researchProjectId: 'proj-test-5',
      content: 'Prinsip arsitektur informasi sovereign NexaMOS mengutamakan Information Gain di atas komoditas SEO.',
      evidenceLevel: 'E2',
      capturedAt: new Date().toISOString(),
      publicationAllowed: false,
      notes: 'Doktrin editorial internal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const result = validator.validate({
      evidence: internalEvidence,
      source: internalSource
    });

    // Wajib: Ditandai sebagai INTERNAL_KNOWLEDGE
    assert.strictEqual(result.provenanceType, 'INTERNAL_KNOWLEDGE');
    // Wajib: Tidak boleh berstatus verified = true untuk pembuktian klaim faktual eksternal
    assert.strictEqual(result.verified, false);
  });

  // ==========================================================================
  // TEST 6: Pastikan tidak ada production fallback yang dapat menghasilkan:
  // fake source + fake evidence + verified=true + SUPPORTED
  // ==========================================================================
  test('Test 6: Menolak keras segala fallback sintetis: fake source + fake evidence + verified=true + SUPPORTED', async () => {
    const validator = new EvidenceIntegrityValidator();
    const verifier = new DeterministicClaimEvidenceVerifier();

    // 1. Uji pemblokiran sumber sintetis 'NexaMOS Sovereign Knowledge Base'
    const syntheticSource: ResearchSource = {
      id: 'src-nexamos-internal',
      researchProjectId: 'proj-test-6',
      type: 'COMPANY_PUBLICATION',
      title: 'Doktrin Riset Otoritas NexaMOS',
      publisher: 'NexaMOS Sovereign Knowledge Base', // Banned synthetic publisher
      author: null,
      url: 'https://nexamos.com/knowledge',
      publicationDate: null,
      accessedAt: new Date().toISOString(),
      language: 'id',
      evidenceLevel: 'E2',
      qualityAssessment: {
        authority: 100,
        relevance: 100,
        recency: 100,
        methodologicalTransparency: 100,
        independence: 100,
        verifiability: 100,
        qualitySummary: 'Fake'
      },
      isPrimarySource: false,
      isInternal: true,
      recencyRisk: 'LOW',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const syntheticEvidence: ResearchEvidence = {
      id: 'ev-nexamos-internal-01',
      sourceId: 'src-nexamos-internal',
      researchProjectId: 'proj-test-6',
      content: 'Kutipan palsu yang diklaim sebagai riset otoritatif eksternal padahal sintetis.',
      evidenceLevel: 'E2',
      capturedAt: new Date().toISOString(),
      publicationAllowed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Validator menolak memberi status verified pada sumber fiktif
    const evalResult = validator.validate({
      evidence: syntheticEvidence,
      source: syntheticSource
    });

    assert.strictEqual(evalResult.verified, false);
    assert.ok(evalResult.issues.includes('SYNTHETIC_SOURCE_PROHIBITED'));

    // 2. Verifier menolak klaim yang mencoba mengandalkan bukti sintetis tidak terverifikasi
    syntheticEvidence.verified = false;
    const fakeClaim: ResearchClaim = {
      id: 'claim-fake-1',
      researchProjectId: 'proj-test-6',
      statement: 'Kutipan palsu yang diklaim sebagai riset otoritatif eksternal padahal sintetis.',
      claimType: 'FACTUAL',
      importance: 'CRITICAL',
      status: 'UNVERIFIED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const claimVerification = await verifier.verify(fakeClaim, [syntheticEvidence]);
    assert.notStrictEqual(claimVerification.status, 'SUPPORTED');
    assert.strictEqual(claimVerification.status, 'UNVERIFIED');
    assert.strictEqual(claimVerification.supportingEvidenceIds.length, 0);

    // 3. ResearchBriefBuilder memverifikasi bahwa bukti yang tidak verified tidak lolos
    const sourceRepo = new InMemoryResearchSourceRepository();
    const evidenceRepo = new InMemoryResearchEvidenceRepository();
    const claimRepo = new InMemoryResearchClaimRepository();
    const findingRepo = new InMemoryResearchFindingRepository();

    await sourceRepo.create(syntheticSource);
    await evidenceRepo.create(syntheticEvidence);
    await claimRepo.create(fakeClaim);

    const briefBuilder = new ResearchBriefBuilder(sourceRepo, evidenceRepo, claimRepo, findingRepo);
    const briefResult = await briefBuilder.buildBrief({
      project: {
        id: 'proj-test-6',
        topicId: 'top-test-6',
        title: 'Uji Fallback Sintetis',
        objective: 'Verifikasi pembatasan fallback',
        researchQuestions: [],
        requiredEvidenceLevel: 'E2',
        status: 'COLLECTING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      synthesis: {
        projectId: 'proj-test-6',
        topicId: 'top-test-6',
        answeredQuestions: [],
        openQuestions: [],
        supportedClaims: [], // Tidak ada klaim supported
        disputedClaims: [],
        keyFindings: [],
        limitations: [],
        gaps: [],
        evidenceSummary: 'N/A',
        readiness: 'NOT_READY',
        recommendedTopicAction: 'NONE',
        synthesizedAt: new Date().toISOString()
      },
      sufficiencyResult: {
        status: 'INSUFFICIENT',
        highestAchievedLevel: 'E0',
        requiredLevelMet: false,
        missingEvidence: ['Tidak ada bukti terverifikasi'],
        gaps: [],
        summary: 'Gagal kecukupan bukti'
      }
    });

    assert.ok(briefResult.ok);
    const brief = briefResult.value;
    assert.strictEqual(brief.supportedClaims.length, 0);
    assert.strictEqual(brief.readiness, 'NOT_READY');
    assert.strictEqual(brief.evidenceIndex[0].verified, false);
  });
});
