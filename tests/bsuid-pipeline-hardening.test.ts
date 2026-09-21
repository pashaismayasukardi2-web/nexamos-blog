/// <reference path="./ambient.d.ts" />
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { DraftClaimAuditor } from '../engines/editorial/draft-claim-auditor.ts';
import { GroundingGuard } from '../engines/editorial/grounding-guard.ts';
import type { ArticleDraft } from '../engines/editorial/article-draft.ts';
import type { ResearchBrief } from '../engines/research/orchestrator/research-brief.ts';

describe('BSUID Pipeline Hardening & Root Cause Resolution Tests', () => {
  const mockBrief: ResearchBrief = {
    id: 'brief-bsuid',
    topicId: 'top-bsuid',
    researchProjectId: 'proj-bsuid',
    objective: 'Apa itu BSUID Meta?',
    answeredQuestions: [],
    openQuestions: [],
    supportedClaims: [
      {
        id: 'claim-1',
        researchProjectId: 'proj-bsuid',
        statement: 'WhatsApp mengenalkan Username sebagai alternatif nomor telepon dengan BSUID sebagai backend.',
        claimType: 'FACTUAL',
        importance: 'CRITICAL',
        status: 'SUPPORTED',
        supportingEvidenceIds: ['evi-1'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    partiallySupportedClaims: [],
    disputedClaims: [],
    keyFindings: [],
    limitations: [],
    researchGaps: [],
    recommendedEditorialAngle: 'Analisis Teknis BSUID',
    sourceIndex: [
      {
        sourceId: 'src-1',
        title: 'Meta Docs',
        url: 'https://developers.facebook.com',
        canonicalUrl: 'https://developers.facebook.com',
        publisher: 'Meta',
        sourceType: 'INDUSTRY_RESEARCH',
        authorityScore: 90,
        publicationAllowed: true
      }
    ],
    evidenceIndex: [
      {
        evidenceId: 'evi-1',
        sourceId: 'src-1',
        quote: 'WhatsApp is introducing Usernames and BSUID.',
        level: 'E2',
        verified: true
      }
    ],
    readiness: 'READY_FOR_EDITORIAL',
    generatedAt: new Date().toISOString()
  };

  test('1. DraftClaimAuditor: Kalimat deduksi "Dengan demikian..." tidak memicu UNGROUNDED_EXTERNAL_FACT', () => {
    const auditor = new DraftClaimAuditor();
    const draft: ArticleDraft = {
      id: 'draft-test-1',
      topicId: 'top-bsuid',
      researchProjectId: 'proj-bsuid',
      title: 'Mengenal BSUID Meta',
      slug: 'mengenal-bsuid-meta',
      territory: 'TACTICAL',
      articleType: 'EXPLAINER',
      editorialRole: 'AUTHORITY',
      thesis: 'Tesis',
      editorialAngle: 'Angle',
      sections: [
        {
          id: 'sec-1',
          heading: 'Implikasi Praktis',
          purpose: 'PRACTICAL_APPLICATION | CONCLUSION' as any,
          content: 'Dengan demikian, praktik administratif menjadi lebih hemat sumber daya dan efisien.',
          order: 1,
          claimUsageIds: []
        }
      ],
      claimUsages: [],
      citationMap: [],
      status: 'READY_FOR_EDITORIAL_REVIEW',
      generatedAt: new Date().toISOString(),
      generatorVersion: 'test-v1',
      promptVersion: '1.0.0'
    };

    const auditResult = auditor.audit(draft, mockBrief);
    const ungroundedIssue = auditResult.issues.find((i) => i.code === 'UNGROUNDED_EXTERNAL_FACT');
    assert.strictEqual(ungroundedIssue, undefined, 'Kalimat deduksi tidak boleh memicu UNGROUNDED_EXTERNAL_FACT');
    assert.strictEqual(auditResult.ungroundedExternalFacts, 0);
  });

  test('2. GroundingGuard: section.purpose komposit pipe tidak memicu COMMODITY_DRAFT_RISK', () => {
    const guard = new GroundingGuard();
    const draft: ArticleDraft = {
      id: 'draft-test-2',
      topicId: 'top-bsuid',
      researchProjectId: 'proj-bsuid',
      title: 'BSUID Meta',
      slug: 'bsuid-meta',
      territory: 'TACTICAL',
      articleType: 'EXPLAINER',
      editorialRole: 'AUTHORITY',
      thesis: 'Tesis',
      editorialAngle: 'Angle',
      sections: [
        {
          id: 'sec-1',
          heading: 'Framework Evaluasi',
          purpose: 'ARGUMENT | EVIDENCE | FRAMEWORK | ANALYSIS' as any,
          content: 'WhatsApp mengenalkan Username sebagai alternatif nomor telepon dengan BSUID sebagai backend.',
          order: 1,
          claimUsageIds: ['cu-1']
        }
      ],
      claimUsages: [
        {
          id: 'cu-1',
          claimId: 'claim-1',
          sectionId: 'sec-1',
          usageType: 'DIRECT',
          statement: 'WhatsApp mengenalkan Username sebagai alternatif nomor telepon dengan BSUID sebagai backend.'
        }
      ],
      citationMap: [
        {
          claimUsageId: 'cu-1',
          claimId: 'claim-1',
          sourceIds: ['src-1'],
          evidenceIds: ['evi-1']
        }
      ],
      status: 'READY_FOR_EDITORIAL_REVIEW',
      generatedAt: new Date().toISOString(),
      generatorVersion: 'test-v1',
      promptVersion: '1.0.0'
    };

    const guardResult = guard.evaluate(draft, mockBrief);
    const commodityIssue = guardResult.issues.find((i) => i.code === 'COMMODITY_DRAFT_RISK');
    assert.strictEqual(commodityIssue, undefined, 'section.purpose komposit yang memuat FRAMEWORK tidak boleh memicu COMMODITY_DRAFT_RISK');
  });
});
