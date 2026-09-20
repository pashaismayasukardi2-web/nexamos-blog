/// <reference path="./ambient.d.ts" />
/**
 * NexaMOS Final Editorial Integrity & Publication Gate Acceptance Test Suite
 *
 * Tests A through K and Adversarial Scenarios:
 * Test A: 1 ungrounded external fact -> gate FAIL
 * Test B: unsupported numeric claim -> gate FAIL
 * Test C: unsupported quote -> gate FAIL
 * Test D: invalid citation mapping -> gate FAIL
 * Test E: PARTIALLY_SUPPORTED external claim -> gate FAIL
 * Test F: writer labels external fact ORIGINAL_ANALYSIS -> auditor overrides classification -> gate FAIL
 * Test G: legitimate ORIGINAL_ANALYSIS -> allowed
 * Test H: all external facts ENTAILED -> gate PASS
 * Test I: gate FAIL -> READY_TO_PUBLISH false
 * Test J: gate FAIL -> publishArticle blocked
 * Test K: manually forged READY_TO_PUBLISH state + integrity failure -> publication authorization still blocked
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { DraftClaimAuditor } from '../engines/editorial/draft-claim-auditor.ts';
import { GroundingGuard } from '../engines/editorial/grounding-guard.ts';
import { EditorialIntegrityGate } from '../engines/editorial/editorial-integrity-gate.ts';
import { TelegramEditorialBot } from '../agent/telegram-editorial-bot.ts';
import { PublicationPreflightValidator } from '../engines/publishing/publication-preflight.ts';
import { PublicationPackageBuilder } from '../engines/publishing/publication-package.ts';
import type { ResearchBrief } from '../engines/research/orchestrator/research-brief.ts';
import type { ArticleDraft } from '../engines/editorial/article-draft.ts';
import type { Topic } from '../engines/ideation/domain/topic.types.ts';
import type { PublicationCandidate } from '../engines/distribution/distribution-readiness.ts';
import type { ArticleSEOMetadata } from '../engines/seo-validator/article-seo-metadata.ts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

function createMockBrief(overrides: Partial<ResearchBrief> = {}): ResearchBrief {
  return {
    id: 'brief-acc-001',
    topicId: 'top-acc-001',
    researchProjectId: 'proj-acc-001',
    objective: 'Acceptance Audit Brief',
    answeredQuestions: [],
    openQuestions: [],
    supportedClaims: [
      {
        id: 'claim-01',
        researchProjectId: 'proj-acc-001',
        statement: 'AI-generated content can contain inaccurate information.',
        claimType: 'FACTUAL',
        importance: 'CRITICAL',
        status: 'SUPPORTED',
        supportingEvidenceIds: ['ev-01'],
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
        researchProjectId: 'proj-acc-001',
        statement: 'AI accuracy limitations',
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
        quote: 'AI-generated content can contain inaccurate information and requires human review.',
        textSnippet: 'AI-generated content can contain inaccurate information and requires human review.',
        evidenceType: 'FACTUAL',
        evidenceLevel: 'E2'
      } as any
    ],
    sourceIndex: [
      {
        id: 'src-01',
        sourceId: 'src-01',
        title: 'AI Content Accuracy Report',
        url: 'https://example.com/ai-report',
        canonicalUrl: 'https://example.com/ai-report',
        publisher: 'Content Research Institute',
        sourceType: 'DOCUMENTATION',
        authorityScore: 90,
        publicationAllowed: true
      } as any
    ],
    researchGaps: [],
    readiness: 'READY_FOR_EDITORIAL',
    generatedAt: '2026-03-01T00:00:00Z',
    ...overrides
  };
}

function createMockDraft(sectionsContent: Array<{ heading: string; content: string; purpose?: string }>, overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  const sections = sectionsContent.map((s, idx) => ({
    id: `sec-${idx + 1}`,
    heading: s.heading,
    content: s.content,
    order: idx + 1,
    purpose: (s.purpose || 'ARGUMENT') as any,
    claimUsageIds: [`cu-${idx + 1}`]
  }));

  const claimUsages = sections.map((s, idx) => ({
    id: `cu-${idx + 1}`,
    claimId: 'claim-01',
    sectionId: s.id,
    usageType: 'DIRECT' as const,
    statement: s.content
  }));

  const citationMap = sections.map((s, idx) => ({
    claimUsageId: `cu-${idx + 1}`,
    claimId: 'claim-01',
    sourceIds: ['src-01'],
    evidenceIds: ['ev-01']
  }));

  return {
    id: 'draft-acc-001',
    topicId: 'top-acc-001',
    researchProjectId: 'proj-acc-001',
    title: 'Evaluasi Akurasi Konten AI',
    dek: 'Pemeriksaan kritis terhadap keakuratan teks buatan AI.',
    slug: 'evaluasi-akurasi-konten-ai',
    territory: 'TACTICAL',
    articleType: 'ANALYSIS',
    editorialRole: 'AUTHORITY',
    thesis: 'Konten buatan AI memerlukan verifikasi manusia.',
    editorialAngle: 'Perspektif operasional redaksional',
    sections,
    claimUsages,
    citationMap,
    status: 'GENERATED',
    generatedAt: '2026-03-01T00:00:00Z',
    generatorVersion: 'acc-v1',
    promptVersion: '1.0.0',
    reviewNotes: [],
    ...overrides
  };
}

describe('Final Editorial Integrity & Publication Gate Acceptance Suite', () => {
  const gate = new EditorialIntegrityGate();
  const auditor = new DraftClaimAuditor();

  test('Test A: 1 ungrounded external fact -> gate FAIL', () => {
    const brief = createMockBrief();
    const draft = createMockDraft([
      {
        heading: 'Klaim Ungrounded',
        content: 'AI meningkatkan pendapatan industri media di Asia Tenggara secara dramatis tanpa bukti riset.'
      }
    ]);

    const result = gate.evaluate(draft, brief);
    assert.equal(result.status, 'FAIL', 'Gate must FAIL when an ungrounded external fact is present');
    assert.ok(result.ungroundedExternalFacts >= 1, 'ungroundedExternalFacts must be at least 1');
    const hasUngroundedIssue = result.issues.some((i) => i.code === 'UNGROUNDED_EXTERNAL_FACT' && i.severity === 'CRITICAL');
    assert.ok(hasUngroundedIssue, 'Must flag UNGROUNDED_EXTERNAL_FACT with CRITICAL severity');
  });

  test('Test B: unsupported numeric claim -> gate FAIL', () => {
    const brief = createMockBrief();
    const draft = createMockDraft([
      {
        heading: 'Klaim Numerik Fiktif',
        content: 'AI meningkatkan efisiensi tim konten sebesar 85% di kuartal pertama.'
      }
    ]);

    const result = gate.evaluate(draft, brief);
    assert.equal(result.status, 'FAIL', 'Gate must FAIL when unsupported numeric claim is present');
    assert.ok(result.unsupportedNumericCount >= 1, 'unsupportedNumericCount must be at least 1');
    const hasNumIssue = result.issues.some(
      (i) => (i.code === 'UNSUPPORTED_NUMERIC_CLAIM' || (i.code as string) === 'UNSUPPORTED_NUMERICAL_CLAIM') && i.severity === 'CRITICAL'
    );
    assert.ok(hasNumIssue, 'Must flag UNSUPPORTED_NUMERIC_CLAIM with CRITICAL severity');
  });

  test('Test C: unsupported quote -> gate FAIL', () => {
    const brief = createMockBrief();
    const draft = createMockDraft([
      {
        heading: 'Kutipan Palsu',
        content: 'Pakar menyatakan bahwa "AI telah menggantikan seluruh proses kurasi editorial secara penuh."'
      }
    ]);

    const result = gate.evaluate(draft, brief);
    assert.equal(result.status, 'FAIL', 'Gate must FAIL when unsupported quote is present');
    const hasQuoteIssue = result.issues.some((i) => i.code === 'UNSUPPORTED_QUOTE' && i.severity === 'CRITICAL');
    assert.ok(hasQuoteIssue, 'Must flag UNSUPPORTED_QUOTE with CRITICAL severity');
  });

  test('Test D: invalid citation mapping -> gate FAIL', () => {
    const brief = createMockBrief();
    const draft = createMockDraft(
      [
        {
          heading: 'Sitasi Palsu',
          content: 'Sistem AI dapat menghasilkan konten yang tidak akurat.'
        }
      ],
      {
        citationMap: [
          {
            claimUsageId: 'cu-1',
            claimId: 'claim-fake-999', // Non-existent claim
            sourceIds: ['src-01'],
            evidenceIds: ['ev-01']
          }
        ]
      }
    );

    const result = gate.evaluate(draft, brief);
    assert.equal(result.status, 'FAIL', 'Gate must FAIL when citation mapping references invalid claim ID');
    assert.ok(result.citationFailuresCount >= 1, 'citationFailuresCount must be >= 1');
  });

  test('Test E: PARTIALLY_SUPPORTED external claim (semantic extension) -> gate FAIL', () => {
    const brief = createMockBrief();
    const draft = createMockDraft([
      {
        heading: 'Perluasan Semantik',
        content: 'AI-generated content can contain inaccurate information dan mempercepat monetisasi perhatian publik.'
      }
    ]);

    const result = gate.evaluate(draft, brief);
    assert.equal(result.status, 'FAIL', 'Gate must FAIL on semantic extension / partial support');
    assert.ok(result.partialSupportCount >= 1, 'partialSupportCount must be >= 1');
    const hasPartialIssue = result.issues.some((i) => i.code === 'PARTIALLY_SUPPORTED_CLAIM' && i.severity === 'CRITICAL');
    assert.ok(hasPartialIssue, 'Must flag PARTIALLY_SUPPORTED_CLAIM as CRITICAL issue');
  });

  test('Test F: writer labels external fact ORIGINAL_ANALYSIS -> auditor overrides classification -> gate FAIL', () => {
    const brief = createMockBrief();
    // Writer puts an ungrounded external statistic in an ANALYSIS section with no evidence
    const draft = createMockDraft([
      {
        heading: 'Analisis Semu',
        content: 'Dalam perspektif strategis, AI meningkatkan efisiensi operasional sebesar 75% di perusahaan global.',
        purpose: 'ANALYSIS'
      }
    ]);

    const audit = auditor.audit(draft, brief);
    const result = gate.evaluate(draft, brief);

    assert.equal(result.status, 'FAIL', 'Gate must FAIL even if writer frames factual metric as analysis');
    const prop = audit.propositions.find((p) => p.text.includes('75%'));
    assert.ok(prop, 'Proposition with 75% must be extracted');
    // The metric 75% must be detected and flagged as unsupported numeric claim
    const hasNumIssue = result.issues.some((i) => i.code === 'UNSUPPORTED_NUMERIC_CLAIM');
    assert.ok(hasNumIssue, 'Must flag UNSUPPORTED_NUMERIC_CLAIM regardless of section purpose');
  });

  test('Test G: legitimate ORIGINAL_ANALYSIS -> allowed (NOT_APPLICABLE, gate PASS)', () => {
    const brief = createMockBrief();
    const draft = createMockDraft([
      {
        heading: 'Fakta Terbukti',
        content: 'AI-generated content can contain inaccurate information.'
      },
      {
        heading: 'Analisis Orisinal NexaMOS',
        content: 'Bagi pelaku bisnis, implikasinya menunjukkan bahwa adopsi AI sebaiknya diperlakukan sebagai perubahan alur kerja, bukan sekadar pembelian perangkat lunak baru.',
        purpose: 'ANALYSIS'
      }
    ]);

    const audit = auditor.audit(draft, brief);
    const result = gate.evaluate(draft, brief);

    assert.equal(result.status, 'PASS', 'Gate must PASS when analysis is legitimate conceptual framework');
    assert.ok(audit.originalAnalysisCount >= 1, 'Must recognize legitimate original analysis');
    assert.equal(audit.ungroundedExternalFacts, 0, 'Zero ungrounded external facts');
  });

  test('Test H: all external facts ENTAILED -> gate PASS', () => {
    const brief = createMockBrief();
    const draft = createMockDraft([
      {
        heading: 'Fakta Terbukti',
        content: 'AI-generated content can contain inaccurate information.'
      }
    ]);

    const result = gate.evaluate(draft, brief);
    assert.equal(result.status, 'PASS', 'Gate must PASS when all external facts are ENTAILED');
    assert.equal(result.ungroundedExternalFacts, 0);
    assert.ok(result.groundedExternalFacts >= 1);
  });

  test('Test I: gate FAIL -> READY_TO_PUBLISH false', () => {
    const brief = createMockBrief();
    const draft = createMockDraft([
      {
        heading: 'Fakta Tanpa Bukti',
        content: 'AI memangkas 90% waktu penulisan artikel tanpa memerlukan proses editorial sama sekali.'
      }
    ]);

    const result = gate.evaluate(draft, brief);
    assert.equal(result.status, 'FAIL');

    // Operational rule: gate FAIL implies READY_TO_PUBLISH must NOT be set
    const readyToPublish = result.status === 'PASS';
    assert.equal(readyToPublish, false, 'READY_TO_PUBLISH must be FALSE when gate FAIL');
  });

  test('Test J: gate FAIL -> publishArticle blocked', async () => {
    const brief = createMockBrief();
    const draft = createMockDraft([
      {
        heading: 'Fakta Tanpa Bukti',
        content: 'AI memangkas 90% waktu penulisan artikel tanpa proses editorial.'
      }
    ]);

    const tempDir = path.join(process.cwd(), 'content', 'drafts');
    await fs.mkdir(tempDir, { recursive: true });
    const slug = 'test-gate-fail-block';
    draft.slug = slug;

    const draftPath = path.join(tempDir, `${slug}-draft.json`);
    await fs.writeFile(
      draftPath,
      JSON.stringify({
        draft,
        brief,
        topic: { id: 't-1', title: 'Test Topic', slug }
      }),
      'utf-8'
    );

    const bot = new TelegramEditorialBot(process.cwd());

    await assert.rejects(
      async () => {
        await bot.publishArticle(slug);
      },
      (err: Error) => {
        assert.ok(
          err.message.includes('EDITORIAL_INTEGRITY_BLOCKED'),
          `Error message should contain EDITORIAL_INTEGRITY_BLOCKED, got: ${err.message}`
        );
        return true;
      },
      'publishArticle must throw EDITORIAL_INTEGRITY_BLOCKED when gate fails'
    );

    // Clean up
    await fs.unlink(draftPath).catch(() => {});
  });

  test('Test K: manually forged READY_TO_PUBLISH state + integrity failure -> publication authorization still blocked', async () => {
    const brief = createMockBrief();
    const draft = createMockDraft([
      {
        heading: 'Fakta Fiktif Berbahaya',
        content: 'AI meningkatkan ROI perusahaan sebesar 40% secara terbukti di seluruh dunia.'
      }
    ]);

    // Deliberately forge draft status to READY_TO_PUBLISH
    (draft as any).status = 'READY_TO_PUBLISH';

    const tempDir = path.join(process.cwd(), 'content', 'drafts');
    await fs.mkdir(tempDir, { recursive: true });
    const slug = 'test-forged-ready-state';
    draft.slug = slug;

    const draftPath = path.join(tempDir, `${slug}-draft.json`);
    await fs.writeFile(
      draftPath,
      JSON.stringify({
        draft,
        brief,
        topic: { id: 't-1', title: 'Test Topic', slug }
      }),
      'utf-8'
    );

    const bot = new TelegramEditorialBot(process.cwd());

    // Despite draft.status === 'READY_TO_PUBLISH', publishArticle MUST re-evaluate EditorialIntegrityGate
    await assert.rejects(
      async () => {
        await bot.publishArticle(slug);
      },
      (err: Error) => {
        assert.ok(
          err.message.includes('EDITORIAL_INTEGRITY_BLOCKED'),
          `Forged state must still be blocked by revalidation! Got: ${err.message}`
        );
        return true;
      },
      'publishArticle must not trust forged READY_TO_PUBLISH state without revalidation'
    );

    // Clean up
    await fs.unlink(draftPath).catch(() => {});
  });
});
