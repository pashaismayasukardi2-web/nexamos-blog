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

  test('2. DraftClaimAuditor: Klaim efisiensi/intervensi tanpa bukti di seksi CONTEXT wajib di-flag sebagai UNGROUNDED_EXTERNAL_FACT', () => {
    const auditor = new DraftClaimAuditor();
    const draft: ArticleDraft = {
      id: 'draft-test-prop10',
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
          heading: 'Mekanisme Mapping',
          purpose: 'CONTEXT',
          content: 'Proses otomatisasi ini meningkatkan efisiensi operasional dengan meminimalkan intervensi manusia, sehingga memastikan sinkronisasi mapping yang akurat dan menghindari hambatan teknis.',
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
    assert.ok(ungroundedIssue, 'Klaim efisiensi tanpa bukti empiris di seksi CONTEXT wajib ditolak sebagai UNGROUNDED_EXTERNAL_FACT');
    assert.strictEqual(auditResult.ungroundedExternalFacts, 1);
  });

  test('3. GroundingGuard: section.purpose komposit pipe tidak memicu COMMODITY_DRAFT_RISK', () => {
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

  test('4. DraftClaimAuditor: Kalimat kausal "Hal ini dikarenakan..." diklasifikasikan sebagai INTERPRETATION dan lolos audit', () => {
    const auditor = new DraftClaimAuditor();
    const draft: ArticleDraft = {
      id: 'draft-test-prop11',
      topicId: 'top-api',
      researchProjectId: 'proj-api',
      title: 'Centang Hijau Personal vs WhatsApp Business API: Apa Bedanya?',
      slug: 'centang-hijau-personal-vs-whatsapp-business-api-apa-bedanya',
      territory: 'TACTICAL',
      articleType: 'EXPLAINER',
      editorialRole: 'AUTHORITY',
      thesis: 'WhatsApp Business API memberikan skalabilitas pengiriman pesan transaksional.',
      editorialAngle: 'Perbedaan fitur dan arsitektur',
      sections: [
        {
          id: 'sec-1',
          heading: 'Perbedaan Arsitektur Pengiriman',
          purpose: 'ARGUMENT',
          content: 'Hal ini dikarenakan API mendukung pengiriman pesan transaksional dan promosi dengan volume besar tanpa kendala teknis.',
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
    assert.strictEqual(ungroundedIssue, undefined, 'Kalimat kausal "Hal ini dikarenakan..." tidak boleh memicu UNGROUNDED_EXTERNAL_FACT');
    assert.strictEqual(auditResult.interpretationCount, 1, 'Wajib terdeteksi sebagai 1 INTERPRETATION');
    assert.strictEqual(auditResult.status, 'PASS', 'Audit wajib berstatus PASS');
  });

  test('5. DraftClaimAuditor: Akronim domain 3 huruf (API, CRM, KPI) tidak dibuang oleh ekstraksi kata kunci', () => {
    const auditor = new DraftClaimAuditor();
    const briefWithApi: ResearchBrief = {
      ...mockBrief,
      supportedClaims: [
        {
          id: 'claim-api-1',
          researchProjectId: 'proj-api',
          statement: 'WhatsApp API mendukung automasi integrasi CRM bisnis.',
          claimType: 'FACTUAL',
          importance: 'CRITICAL',
          status: 'SUPPORTED',
          supportingEvidenceIds: ['evi-1'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    };

    const draft: ArticleDraft = {
      id: 'draft-test-acronym',
      topicId: 'top-api',
      researchProjectId: 'proj-api',
      title: 'WhatsApp API Integration',
      slug: 'whatsapp-api-integration',
      territory: 'TACTICAL',
      articleType: 'EXPLAINER',
      editorialRole: 'AUTHORITY',
      thesis: 'Tesis',
      editorialAngle: 'Angle',
      sections: [
        {
          id: 'sec-1',
          heading: 'Fitur Utama',
          purpose: 'ARGUMENT',
          content: 'WhatsApp API mendukung integrasi.',
          order: 1,
          claimUsageIds: ['cu-1']
        }
      ],
      claimUsages: [
        {
          id: 'cu-1',
          claimId: 'claim-api-1',
          sectionId: 'sec-1',
          usageType: 'DIRECT',
          statement: 'WhatsApp API mendukung automasi integrasi CRM bisnis.'
        }
      ],
      citationMap: [
        {
          claimUsageId: 'cu-1',
          claimId: 'claim-api-1',
          sourceIds: ['src-1'],
          evidenceIds: ['evi-1']
        }
      ],
      status: 'READY_FOR_EDITORIAL_REVIEW',
      generatedAt: new Date().toISOString(),
      generatorVersion: 'test-v1',
      promptVersion: '1.0.0'
    };

    const auditResult = auditor.audit(draft, briefWithApi);
    const ungroundedIssue = auditResult.issues.find((i) => i.code === 'UNGROUNDED_EXTERNAL_FACT');
    assert.strictEqual(ungroundedIssue, undefined, 'Akronim API harus cocok secara semantik');
    assert.strictEqual(auditResult.groundedExternalFacts, 1, 'Klaim API harus ter-grounding (ENTAILED)');
    assert.strictEqual(auditResult.status, 'PASS');
  });
});
