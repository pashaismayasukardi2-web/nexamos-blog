/// <reference path="./ambient.d.ts" />
/**
 * NexaMOS Editorial Grounding & Draft Claim Integrity Test Suite
 *
 * Menguji kepatuhan doktrin editorial:
 * NO VERIFIED RESEARCH CLAIM -> NO EXTERNAL FACTUAL CLAIM IN FINAL ARTICLE
 * LLM PROPOSES -> APPLICATION VERIFIES -> POLICY DECIDES -> HUMAN APPROVES
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { DraftClaimAuditor } from '../engines/editorial/draft-claim-auditor.ts';
import { GroundingGuard } from '../engines/editorial/grounding-guard.ts';
import { EditorialIntegrityGate } from '../engines/editorial/editorial-integrity-gate.ts';
import { RealAIEditorialProvider } from '../infrastructure/ai/real-ai-editorial-provider.ts';
import { AIHttpClient } from '../infrastructure/ai/ai-http-client.ts';
import type { AIProviderConfig } from '../infrastructure/ai/ai-provider-config.ts';
import type { ResearchBrief } from '../engines/research/orchestrator/research-brief.ts';
import type { ArticleDraft } from '../engines/editorial/article-draft.ts';
import type { Topic } from '../engines/ideation/domain/topic.types.ts';
import type { EditorialPlan } from '../engines/editorial/editorial-plan.ts';
import type { EditorialGenerationRequest } from '../engines/editorial/editorial-generation-request.ts';
import { TelegramEditorialBot } from '../agent/telegram-editorial-bot.ts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const VALID_TEST_CONFIG: AIProviderConfig = {
  provider: 'gemini',
  apiKey: 'test-valid-key-gemini',
  model: 'gemini-3.8-flash',
  timeoutMs: 5000,
  maxRetries: 1
};

function createMockFetch(handler: (url: string, init?: any) => Promise<any>): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return (await handler(urlStr, init)) as Response;
  };
}

function createBaseBrief(overrides: Partial<ResearchBrief> = {}): ResearchBrief {
  return {
    id: 'brief-test-001',
    topicId: 'top-test-001',
    researchProjectId: 'proj-test-001',
    objective: 'Uji Integritas Editorial Grounding',
    answeredQuestions: [],
    openQuestions: [],
    supportedClaims: [
      {
        id: 'claim-01',
        researchProjectId: 'proj-test-001',
        statement: 'CRM systems store customer interaction data.',
        claimType: 'FACTUAL',
        importance: 'CORE',
        status: 'SUPPORTED',
        evidenceIds: ['ev-01'],
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z'
      }
    ],
    partiallySupportedClaims: [],
    disputedClaims: [],
    unverifiedClaims: [],
    keyFindings: [
      {
        id: 'finding-01',
        researchProjectId: 'proj-test-001',
        statement: 'Temuan interaksi pelanggan',
        supportingClaimIds: ['claim-01'],
        confidence: 'HIGH',
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z'
      } as any
    ],
    limitations: [],
    evidenceIndex: [
      {
        id: 'ev-01',
        evidenceId: 'ev-01',
        sourceId: 'src-01',
        quote: 'CRM systems store customer interaction data accurately.',
        textSnippet: 'CRM systems store customer interaction data accurately.',
        evidenceType: 'FACTUAL',
        evidenceLevel: 'E2'
      } as any
    ],
    sourceIndex: [
      {
        id: 'src-01',
        sourceId: 'src-01',
        title: 'Modern CRM Documentation',
        url: 'https://crm-docs.example.com/system',
        canonicalUrl: 'https://crm-docs.example.com/system',
        publisher: 'Enterprise CRM Institute',
        sourceType: 'DOCUMENTATION',
        authorityScore: 90,
        publicationAllowed: true
      } as any
    ],
    readiness: 'READY_FOR_EDITORIAL',
    builtAt: '2026-03-01T00:00:00Z',
    briefVersion: '1.0.0',
    ...overrides
  };
}

function createBaseDraft(content: string, overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  return {
    id: 'draft-test-001',
    topicId: 'top-test-001',
    researchProjectId: 'proj-test-001',
    title: 'Analisis CRM Modern',
    dek: 'Dek analisis CRM modern',
    slug: 'analisis-crm-modern',
    territory: 'TACTICAL',
    articleType: 'ANALYSIS',
    editorialRole: 'AUTHORITY',
    thesis: 'CRM adalah sistem penyimpanan interaksi.',
    editorialAngle: 'Perspektif data terintegrasi',
    sections: [
      {
        id: 'sec-1',
        heading: 'Seksi Utama',
        content,
        order: 1,
        purpose: 'ARGUMENT',
        claimUsageIds: ['cu-1']
      }
    ],
    claimUsages: [
      {
        id: 'cu-1',
        claimId: 'claim-01',
        sectionId: 'sec-1',
        usageType: 'DIRECT',
        statement: content
      }
    ],
    citationMap: [
      {
        claimUsageId: 'cu-1',
        claimId: 'claim-01',
        sourceIds: ['src-01'],
        evidenceIds: ['ev-01']
      }
    ],
    status: 'GENERATED',
    generatedAt: '2026-03-01T00:00:00Z',
    generatorVersion: 'test-v1',
    promptVersion: '1.0.0',
    ...overrides
  };
}

describe('NexaMOS Editorial Grounding & Draft Claim Integrity Suite', () => {
  let auditor: DraftClaimAuditor;
  let gate: EditorialIntegrityGate;

  beforeEach(() => {
    auditor = new DraftClaimAuditor();
    gate = new EditorialIntegrityGate();
  });

  // =========================================================================
  // Test 1 — Fully Grounded External Fact
  // =========================================================================
  test('Test 1 — Fully Grounded External Fact: Proposisi yang didukung penuh klaim riset berstatus ENTAILED dan PASS', () => {
    const brief = createBaseBrief();
    const draft = createBaseDraft('CRM systems store customer interaction data.');

    const result = auditor.audit(draft, brief);

    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.groundedExternalFacts, 1);
    assert.strictEqual(result.ungroundedExternalFacts, 0);

    const prop = result.propositions[0];
    assert.ok(prop);
    assert.strictEqual(prop.classification, 'EXTERNAL_FACT');
    assert.strictEqual(prop.supportLevel, 'ENTAILED');
    assert.deepStrictEqual(prop.claimIds, ['claim-01']);
    assert.deepStrictEqual(prop.evidenceIds, ['ev-01']);
    assert.deepStrictEqual(prop.sourceIds, ['src-01']);
  });

  // =========================================================================
  // Test 2 — Semantic Extension
  // =========================================================================
  test('Test 2 — Semantic Extension: Klaim draf yang melampaui bukti riset terdeteksi PARTIALLY_SUPPORTED dan FAIL', () => {
    const brief = createBaseBrief({
      supportedClaims: [
        {
          id: 'claim-01',
          researchProjectId: 'proj-test-001',
          statement: 'Lead magnets collect contact information in exchange for valuable content.',
          claimType: 'FACTUAL',
          importance: 'CORE',
          status: 'SUPPORTED',
          evidenceIds: ['ev-01'],
          createdAt: '',
          updatedAt: ''
        }
      ]
    });

    const draft = createBaseDraft(
      'Lead magnets accelerate monetization of customer attention and collect contact information.'
    );

    const result = auditor.audit(draft, brief);

    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(result.partialSupportCount, 1);
    const prop = result.propositions[0];
    assert.strictEqual(prop.supportLevel, 'PARTIALLY_SUPPORTED');
    assert.ok(result.issues.some((i) => i.code === 'PARTIALLY_SUPPORTED_CLAIM'));
  });

  // =========================================================================
  // Test 3 — Valid Paraphrase
  // =========================================================================
  test('Test 3 — Valid Paraphrase: Parafrasa sah yang tidak melampaui bukti riset berstatus ENTAILED dan PASS', () => {
    const brief = createBaseBrief({
      supportedClaims: [
        {
          id: 'claim-01',
          researchProjectId: 'proj-test-001',
          statement: 'Lead magnets exchange valuable content for contact information.',
          claimType: 'FACTUAL',
          importance: 'CORE',
          status: 'SUPPORTED',
          evidenceIds: ['ev-01'],
          createdAt: '',
          updatedAt: ''
        }
      ]
    });

    const draft = createBaseDraft(
      'A lead magnet typically asks users for contact information in return for valuable content.'
    );

    const result = auditor.audit(draft, brief);

    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.groundedExternalFacts, 1);
    assert.strictEqual(result.propositions[0].supportLevel, 'ENTAILED');
  });

  // =========================================================================
  // Test 4 — Original Analysis
  // =========================================================================
  test('Test 4 — Original Analysis: Analisis orisinal kerangka kerja NexaMOS diklasifikasikan ORIGINAL_ANALYSIS dan PASS', () => {
    const brief = createBaseBrief();
    const draft = createBaseDraft(
      'Untuk NexaMOS, implikasinya adalah lead magnet sebaiknya dipandang sebagai mekanisme identity transition.'
    );

    const result = auditor.audit(draft, brief);

    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.originalAnalysisCount, 1);
    assert.strictEqual(result.propositions[0].classification, 'ORIGINAL_ANALYSIS');
    assert.strictEqual(result.propositions[0].supportLevel, 'NOT_APPLICABLE');
  });

  // =========================================================================
  // Test 5 — Unsupported Number
  // =========================================================================
  test('Test 5 — Unsupported Number: Draf memuat angka statistik 73% tanpa ada dalam bukti ResearchBrief mutlak FAIL', () => {
    const brief = createBaseBrief();
    const draft = createBaseDraft(
      '73% of businesses use lead magnets to acquire audience contacts.'
    );

    const result = auditor.audit(draft, brief);

    assert.strictEqual(result.status, 'FAIL');
    assert.ok(result.issues.some((i) => i.code === 'UNSUPPORTED_NUMERIC_CLAIM'));
  });

  // =========================================================================
  // Test 6 — Supported Number
  // =========================================================================
  test('Test 6 — Supported Number: Angka 73% yang tercantum dalam klaim dan bukti resmi lolos verifikasi PASS', () => {
    const brief = createBaseBrief({
      supportedClaims: [
        {
          id: 'claim-01',
          researchProjectId: 'proj-test-001',
          statement: '73% of businesses use lead magnets to collect contact information.',
          claimType: 'EMPIRICAL',
          importance: 'CORE',
          status: 'SUPPORTED',
          evidenceIds: ['ev-01'],
          createdAt: '',
          updatedAt: ''
        }
      ],
      evidenceIndex: [
        {
          id: 'ev-01',
          evidenceId: 'ev-01',
          sourceId: 'src-01',
          quote: 'Survey confirms 73% of businesses deploy lead magnets.',
          textSnippet: 'Survey confirms 73% of businesses deploy lead magnets.',
          evidenceType: 'STATISTIC',
          evidenceLevel: 'E2'
        } as any
      ]
    });

    const draft = createBaseDraft(
      '73% of businesses use lead magnets to collect contact information.'
    );

    const result = auditor.audit(draft, brief);

    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.unsupportedNumericCount, 0);
  });

  // =========================================================================
  // Test 6B — Multi-locale Numeric Matching (Indonesian . vs English ,)
  // =========================================================================
  test('Test 6B — Multi-locale Numeric Matching: Angka 4.000 dalam draf bahasa Indonesia cocok dengan 4,000 di ResearchBrief', () => {
    const brief = createBaseBrief({
      supportedClaims: [
        {
          id: 'claim-01',
          researchProjectId: 'proj-test-001',
          statement: 'A study on 4,000 news posts from Facebook pages indicates that unusual punctuation increases reactions.',
          claimType: 'EMPIRICAL',
          importance: 'CORE',
          status: 'SUPPORTED',
          evidenceIds: ['ev-01'],
          createdAt: '',
          updatedAt: ''
        }
      ],
      evidenceIndex: [
        {
          id: 'ev-01',
          evidenceId: 'ev-01',
          sourceId: 'src-01',
          quote: 'We analyzed 4,000 news posts from 10 Facebook pages of US and UK media.',
          textSnippet: 'We analyzed 4,000 news posts from 10 Facebook pages of US and UK media.',
          evidenceType: 'STATISTIC',
          evidenceLevel: 'E2'
        } as any
      ]
    });

    const draft = createBaseDraft(
      'Berdasarkan evidence dari riset yang dilakukan pada 4.000 postingan berita dari Facebook media, penggunaan tanda baca tidak biasa di judul meningkatkan reaksi.'
    );

    const result = auditor.audit(draft, brief);

    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.unsupportedNumericCount, 0);
    assert.strictEqual(result.ungroundedExternalFacts, 0);
    assert.strictEqual(result.propositions[0].supportLevel, 'ENTAILED');
  });

  // =========================================================================
  // Test 6C — Multi-locale Decimal Percentage Matching (73,5% vs 73.5%)
  // =========================================================================
  test('Test 6C — Multi-locale Decimal Percentage Matching: Angka 73,5% cocok dengan 73.5% di ResearchBrief', () => {
    const brief = createBaseBrief({
      supportedClaims: [
        {
          id: 'claim-01',
          researchProjectId: 'proj-test-001',
          statement: '73.5% of surveyed publishers report higher initial clickthrough rates.',
          claimType: 'EMPIRICAL',
          importance: 'CORE',
          status: 'SUPPORTED',
          evidenceIds: ['ev-01'],
          createdAt: '',
          updatedAt: ''
        }
      ],
      evidenceIndex: [
        {
          id: 'ev-01',
          evidenceId: 'ev-01',
          sourceId: 'src-01',
          quote: 'Survey findings show that 73.5% of publishers observed elevated engagement.',
          textSnippet: 'Survey findings show that 73.5% of publishers observed elevated engagement.',
          evidenceType: 'STATISTIC',
          evidenceLevel: 'E2'
        } as any
      ]
    });

    const draft = createBaseDraft(
      'Sebanyak 73,5% dari penerbit yang disurvei melaporkan lonjakan rasio klik.'
    );

    const result = auditor.audit(draft, brief);

    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.unsupportedNumericCount, 0);
    assert.strictEqual(result.ungroundedExternalFacts, 0);
  });

  // =========================================================================
  // Test 6D — Fallback Matching via evidenceIndex Quote
  // =========================================================================
  test('Test 6D — Fallback Matching via evidenceIndex: Fakta angka dalam kutipan bukti evidenceIndex terverifikasi walau klaim berlainan redaksi', () => {
    const brief = createBaseBrief({
      supportedClaims: [
        {
          id: 'claim-01',
          researchProjectId: 'proj-test-001',
          statement: 'Sensational headlines significantly amplify user engagement across social networks.',
          claimType: 'EMPIRICAL',
          importance: 'CORE',
          status: 'SUPPORTED',
          evidenceIds: ['ev-01'],
          createdAt: '',
          updatedAt: ''
        }
      ],
      evidenceIndex: [
        {
          id: 'ev-01',
          evidenceId: 'ev-01',
          sourceId: 'src-01',
          quote: 'A dataset of 4,000 news posts from media Facebook pages demonstrates increased reactions.',
          textSnippet: 'A dataset of 4,000 news posts from media Facebook pages demonstrates increased reactions.',
          evidenceType: 'STATISTIC',
          evidenceLevel: 'E2'
        } as any
      ]
    });

    const draft = createBaseDraft(
      'Riset pada 4.000 postingan berita di halaman Facebook media membuktikan peningkatan reaksi pembaca.'
    );

    const result = auditor.audit(draft, brief);

    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.unsupportedNumericCount, 0);
    assert.strictEqual(result.ungroundedExternalFacts, 0);
    assert.strictEqual(result.propositions[0].supportLevel, 'ENTAILED');
    assert.ok(result.propositions[0].evidenceIds.includes('ev-01'));
  });

  // =========================================================================
  // Test 7 — Invalid Citation ID
  // =========================================================================
  test('Test 7 — Invalid Citation ID: Penulis mencantumkan sourceId palsu, sistem menolak CITATION_INTEGRITY_FAILED (tanpa auto-repair)', () => {
    const brief = createBaseBrief();
    const draft = createBaseDraft('CRM systems store customer interaction data.', {
      citationMap: [
        {
          claimUsageId: 'cu-1',
          claimId: 'claim-01',
          sourceIds: ['src-unknown-fictitious'],
          evidenceIds: ['ev-01']
        }
      ]
    });

    const result = auditor.audit(draft, brief);

    assert.strictEqual(result.status, 'FAIL');
    assert.ok(
      result.issues.some(
        (i) => i.code === 'CITATION_INTEGRITY_FAILED' && i.message.includes('src-unknown-fictitious')
      )
    );
  });

  // =========================================================================
  // Test 8 — Empty Citation Auto-Repair Prevention
  // =========================================================================
  test('Test 8 — Empty Citation Auto-Repair Prevention: Sitasi kosong tidak otomatis diinjeksi dengan sumber pertama', () => {
    const brief = createBaseBrief();
    const draft = createBaseDraft('CRM systems store customer interaction data.', {
      citationMap: [
        {
          claimUsageId: 'cu-1',
          claimId: 'claim-01',
          sourceIds: [],
          evidenceIds: []
        }
      ]
    });

    // Periksa bahwa DraftClaimAuditor tidak otomatis menginjeksikan sumber
    assert.strictEqual(draft.citationMap[0].sourceIds.length, 0);
    assert.strictEqual(draft.citationMap[0].evidenceIds.length, 0);
  });

  // =========================================================================
  // Test 9 — Synthetic Source Prevention
  // =========================================================================
  test('Test 9 — Synthetic Source Prevention: RealAIEditorialProvider melempar EDITORIAL_NOT_READY dan menolak membuat publisher palsu NexaMOS Sovereign Knowledge Base', async () => {
    const mockFetch = createMockFetch(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] })
    }));

    const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
    const provider = new RealAIEditorialProvider(VALID_TEST_CONFIG, client);

    const emptyBrief: ResearchBrief = {
      id: 'brief-empty',
      topicId: 'top-empty',
      researchProjectId: 'proj-empty',
      objective: 'No research',
      answeredQuestions: [],
      openQuestions: [],
      supportedClaims: [],
      partiallySupportedClaims: [],
      disputedClaims: [],
      unverifiedClaims: [],
      keyFindings: [],
      limitations: [],
      evidenceIndex: [],
      sourceIndex: [],
      readiness: 'NOT_READY',
      builtAt: '',
      briefVersion: '1.0.0'
    };

    const request: EditorialGenerationRequest = {
      topic: { id: 'top-1', title: 'Topik', slug: 'topik', territory: 'TACTICAL', articleType: 'ANALYSIS', editorialRole: 'AUTHORITY', status: 'APPROVED', intent: {}, informationGain: { originalityType: [], expectedContribution: '', commodityRisk: 'LOW' }, evidencePlan: { requiredEvidenceLevel: 'E2', plannedSources: [], originalEvidenceRequired: false }, createdAt: '', updatedAt: '' },
      researchBrief: emptyBrief,
      articleType: 'ANALYSIS',
      editorialRole: 'AUTHORITY'
    };

    const plan: EditorialPlan = {
      workingTitle: 'Judul',
      thesis: 'Tesis',
      angle: 'Angle',
      readerPromise: 'Janji',
      sectionPlan: [],
      claimsToUse: [],
      findingsToUse: [],
      counterpoints: [],
      intendedTakeaway: ''
    };

    await assert.rejects(
      async () => {
        await provider.generateArticleDraft(request, plan);
      },
      (err: Error) => {
        assert.match(err.message, /EDITORIAL_NOT_READY/);
        return true;
      }
    );
  });

  // =========================================================================
  // Test 10 — GroundingGuard Failure Blocks Publish
  // =========================================================================
  test('Test 10 — GroundingGuard Failure Blocks Publish: Kegagalan guard mekanikal (kutipan langsung fiktif) menggagalkan gate dan memblokir publishArticle', async () => {
    const brief = createBaseBrief();
    const draft = createBaseDraft(
      'CRM systems store customer interaction data. Sesuai pernyataan ahli, "teknologi CRM mutlak menjamin profitabilitas 1000x lipat dalam semalam".'
    );

    const integrityResult = gate.evaluate(draft, brief);
    assert.strictEqual(integrityResult.status, 'FAIL');
    assert.strictEqual(integrityResult.groundingGuard.status, 'FAIL');

    // Uji pada TelegramEditorialBot publishArticle
    const bot = new TelegramEditorialBot();
    const draftsDir = path.join(process.cwd(), 'content', 'drafts');
    await fs.mkdir(draftsDir, { recursive: true });
    const tempSlug = `test-block-guard-${Date.now()}`;
    await fs.writeFile(
      path.join(draftsDir, `${tempSlug}-draft.json`),
      JSON.stringify({ draft, brief, topic: { id: 'top-1', title: 'Test', slug: tempSlug } }, null, 2),
      'utf-8'
    );

    try {
      await assert.rejects(
        async () => {
          await bot.publishArticle(tempSlug);
        },
        (err: Error) => {
          assert.match(err.message, /EDITORIAL_INTEGRITY_BLOCKED/);
          return true;
        }
      );
    } finally {
      await fs.unlink(path.join(draftsDir, `${tempSlug}-draft.json`)).catch(() => {});
    }
  });

  // =========================================================================
  // Test 11 — DraftClaimAuditor Failure Blocks Publish
  // =========================================================================
  test('Test 11 — DraftClaimAuditor Failure Blocks Publish: Kegagalan audit semantik memblokir publishArticle melempar error', async () => {
    const brief = createBaseBrief();
    const draft = createBaseDraft(
      'Kompetitor global meluncurkan 50 fitur baru yang belum pernah tercatat di riset mana pun.'
    );

    const integrityResult = gate.evaluate(draft, brief);
    assert.strictEqual(integrityResult.status, 'FAIL');
    assert.strictEqual(integrityResult.draftClaimAudit.status, 'FAIL');

    const bot = new TelegramEditorialBot();
    const draftsDir = path.join(process.cwd(), 'content', 'drafts');
    await fs.mkdir(draftsDir, { recursive: true });
    const tempSlug = `test-block-audit-${Date.now()}`;
    await fs.writeFile(
      path.join(draftsDir, `${tempSlug}-draft.json`),
      JSON.stringify({ draft, brief, topic: { id: 'top-1', title: 'Test', slug: tempSlug } }, null, 2),
      'utf-8'
    );

    try {
      await assert.rejects(
        async () => {
          await bot.publishArticle(tempSlug);
        },
        (err: Error) => {
          assert.match(err.message, /EDITORIAL_INTEGRITY_BLOCKED/);
          return true;
        }
      );
    } finally {
      await fs.unlink(path.join(draftsDir, `${tempSlug}-draft.json`)).catch(() => {});
    }
  });

  // =========================================================================
  // Test 12 — Full Valid Flow
  // =========================================================================
  test('Test 12 — Full Valid Flow: ResearchBrief valid -> Draft valid -> DraftClaimAuditor PASS -> GroundingGuard PASS -> Gate PASS', () => {
    const brief = createBaseBrief();
    const draft = createBaseDraft(
      'CRM systems store customer interaction data.',
      {
        sections: [
          {
            id: 'sec-1',
            heading: 'Seksi Bukti',
            content: 'CRM systems store customer interaction data.',
            order: 1,
            purpose: 'ARGUMENT',
            claimUsageIds: ['cu-1']
          },
          {
            id: 'sec-2',
            heading: 'Kerangka Kerja Otoritas',
            content: 'Untuk NexaMOS, implikasinya adalah sistem ini berfungsi sebagai fondasi arsitektur retensi.',
            order: 2,
            purpose: 'FRAMEWORK',
            claimUsageIds: []
          }
        ]
      }
    );

    const integrityResult = gate.evaluate(draft, brief);

    assert.strictEqual(integrityResult.status, 'PASS');
    assert.strictEqual(integrityResult.draftClaimAudit.status, 'PASS');
    assert.strictEqual(integrityResult.groundingGuard.status, 'PASS');
    assert.strictEqual(integrityResult.groundedExternalFacts, 1);
    assert.strictEqual(integrityResult.originalAnalysisCount, 1);
    assert.strictEqual(integrityResult.issues.length, 0);
  });

  // =========================================================================
  // Test 13 — Adversarial Live Lead Magnet Fixture
  // =========================================================================
  test('Test 13 — Adversarial Scenario: Prosa artikel Lead Magnet aktual dengan perluasan semantik ("mempercepat monetisasi", "hierarki partisipasi digital") wajib FAIL', () => {
    // Brief hanya menyatakan pertukaran nilai dasar
    const brief = createBaseBrief({
      supportedClaims: [
        {
          id: 'claim-lead-magnet',
          researchProjectId: 'proj-telegram',
          statement: 'Lead magnet adalah aset digital yang mengumpulkan informasi kontak melalui pertukaran konten bernilai tambah.',
          claimType: 'FACTUAL',
          importance: 'CORE',
          status: 'SUPPORTED',
          evidenceIds: ['ev-01'],
          createdAt: '',
          updatedAt: ''
        }
      ]
    });

    // Prosa dari draf nyata Lead Magnet sebelumnya (content/drafts/lead-magnet-alat-konversi-known-audience-ke-lead-draft.json)
    const adversarialProse =
      'Lead magnet mempercepat monetisasi perhatian audiens dengan mengonversi engagement menjadi aset data. Oleh karena itu, Lead Magnet bukan hanya alat konversi pasif, tetapi juga mesin seleksi yang membentuk hierarki partisipasi digital.';

    const draft = createBaseDraft(adversarialProse, {
      title: 'Lead Magnet: Antara Senjata Konversi dan Batas Otoritas Konten',
      slug: 'lead-magnet-alat-konversi-known-audience-ke-lead'
    });

    const result = auditor.audit(draft, brief);

    // Wajib gagal karena melakukan perluasan semantik yang tidak didukung bukti brief
    assert.strictEqual(result.status, 'FAIL');
    assert.ok(
      result.issues.some((i) => i.code === 'PARTIALLY_SUPPORTED_CLAIM' || i.code === 'UNGROUNDED_EXTERNAL_FACT'),
      'Perluasan semantik pada prosa artikel lead magnet wajib terdeteksi sebagai isu kritis'
    );
  });
});
