/**
 * Live Acceptance Test: CMI Direct URL Research & Editorial Grounding v2
 *
 * Topic: Teknik pemasaran konten di era AI
 * Direct URL: https://contentmarketinginstitute.com/ai-content-creation-tools/how-to-work-ai-into-content-marketing-in-a-way-that-works-for-you
 */

import { CanonicalResearchPipeline } from '../engines/research/canonical-research-pipeline.ts';
import { RealAIResearchProvider } from '../infrastructure/ai/real-ai-research-provider.ts';
import { AIProviderFactory } from '../infrastructure/ai/ai-provider-factory.ts';
import { ensureEnvLoaded, isAIConfigured } from '../infrastructure/ai/ai-provider-config.ts';
import { EditorialGenerationService } from '../engines/editorial/editorial-generation-service.ts';
import { DraftClaimAuditor } from '../engines/editorial/draft-claim-auditor.ts';
import { EditorialIntegrityGate } from '../engines/editorial/editorial-integrity-gate.ts';
import type { Topic } from '../engines/ideation/domain/topic.types.ts';

async function main() {
  ensureEnvLoaded();
  console.log('================================================================');
  console.log('LIVE ACCEPTANCE TEST: CMI DIRECT URL RESEARCH & EDITORIAL GROUNDING V2');
  console.log('================================================================');

  if (!isAIConfigured()) {
    console.error('ERROR: AI provider tidak terkonfigurasi di lingkungan (.env).');
    process.exit(1);
  }

  const { researchProvider: aiResearchProvider, editorialProvider: aiEditorialProvider } =
    AIProviderFactory.createProductionProviders();

  const topic: Topic = {
    id: 'top-cmi-live',
    title: 'Teknik pemasaran konten di era AI',
    slug: 'teknik-pemasaran-konten-era-ai',
    territory: 'TACTICAL',
    targetAudience: 'Content Marketers and CMOs',
    differentiationAngle: 'Operasional ter-grounding berdasarkan bukti empiris',
    lifecycleState: 'APPROVED',
    status: 'APPROVED',
    scoring: { totalScore: 88, policyVersion: 'v1.0' } as any,
    estimatedEvidenceReadiness: 'HIGH',
    editorialFormat: 'HOW_TO',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const directUrl = 'https://contentmarketinginstitute.com/ai-content-creation-tools/how-to-work-ai-into-content-marketing-in-a-way-that-works-for-you';

  console.log(`1. Menjalankan CanonicalResearchPipeline...`);
  console.log(`   Topik: ${topic.title}`);
  console.log(`   Direct URL: ${directUrl}`);

  const pipeline = new CanonicalResearchPipeline({
    aiResearchProvider
  });

  const researchRes = await pipeline.execute({
    topic,
    directUrls: [directUrl]
  });

  if (!researchRes.ok) {
    console.error('❌ Pipeline Research Gagal:', researchRes.error);
    process.exit(1);
  }

  const { researchBrief, acquiredSources, verifiedEvidence, metrics } = researchRes.value;

  console.log('\n--- METRIK EKSEKUSI RISET ---');
  console.log(`Acquired Sources Count : ${metrics.acquiredSourcesCount}`);
  console.log(`Verified Evidence Count: ${metrics.verifiedEvidenceCount}`);
  console.log(`Proposed Claims Count  : ${metrics.proposedClaimsCount}`);
  console.log(`Supported Claims Count : ${metrics.supportedClaimsCount}`);
  console.log(`Unverified Claims Count: ${metrics.unverifiedClaimsCount}`);

  console.log('\n--- BUKTI EMPIRIS TERPILIH DI RESEARCH BRIEF (EVIDENCE INDEX) ---');
  researchBrief.evidenceIndex.forEach((e, idx) => {
    console.log(`[${idx + 1}] [${e.level}] ${e.quote.slice(0, 120)}...`);
    console.log(`    URL: ${e.sourceUrl}`);
  });

  console.log('\n--- DETAIL PROVENANCE TRACE DARI CLAIM VERIFIER ---');
  researchRes.value.provenanceTrace.forEach((pt, idx) => {
    console.log(`[Claim ${idx + 1}] Status: ${pt.status}`);
    console.log(`  Statement: "${pt.statement}"`);
    console.log(`  Supporting Evidence Count: ${pt.supportingEvidence.length}`);
  });

  if (researchBrief.unverifiedClaims.length > 0) {
    console.log('\n--- DETAIL UNVERIFIED CLAIMS ---');
    researchBrief.unverifiedClaims.forEach((c, idx) => {
      console.log(`[Unverified ${idx + 1}] "${c.statement}"`);
    });
  }

  researchBrief.supportedClaims.forEach((c, idx) => {
    console.log(`[${idx + 1}] Statement: "${c.statement}"`);
    console.log(`    Type: ${c.claimType} | Importance: ${c.importance}`);
    console.log(`    Supporting Evidence IDs: ${JSON.stringify(c.supportingEvidenceIds)}`);
  });

  // Verifikasi Invariant Provenance
  for (const sc of researchBrief.supportedClaims) {
    if (!sc.supportingEvidenceIds || sc.supportingEvidenceIds.length === 0) {
      console.error(`❌ INVARIANT VIOLATION: Klaim SUPPORTED "${sc.id}" tidak memiliki supportingEvidenceIds!`);
      process.exit(1);
    }
    for (const evId of sc.supportingEvidenceIds) {
      const match = verifiedEvidence.find((e) => e.id === evId);
      if (!match) {
        console.error(`❌ INVARIANT VIOLATION: Evidence ID "${evId}" tidak ditemukan di verifiedEvidence!`);
        process.exit(1);
      }
      if (match.verified !== true) {
        console.error(`❌ INVARIANT VIOLATION: Evidence ID "${evId}" tidak berstatus verified!`);
        process.exit(1);
      }
    }
  }
  console.log('✅ SELURUH KLAIM SUPPORTED LOLOS INVARIANT PROVENANCE!');

  // =========================================================================
  // EDITORIAL GENERATION & INTEGRITY GATE
  // =========================================================================
  console.log('\n2. Menjalankan Editorial Generation (EditorialGenerationService)...');
  const editorialService = new EditorialGenerationService({
    aiProvider: aiEditorialProvider
  });

  const editorialRes = await editorialService.generateDraft({
    topic,
    researchBrief,
    territory: 'TACTICAL',
    articleType: 'HOW_TO',
    targetAudience: 'Content Marketers',
    requestedWordCount: 800
  });

  console.log(`   Editorial Success: ${editorialRes.success}`);
  console.log(`   Guard Status     : ${editorialRes.guardResult?.status}`);
  if (editorialRes.errors && editorialRes.errors.length > 0) {
    console.log(`   Errors           : ${JSON.stringify(editorialRes.errors)}`);
  }

  if (editorialRes.draft) {
    const draft = editorialRes.draft;
    console.log(`✅ Draft berhasil disusun: "${draft.title}" (${draft.wordCount} kata)`);

    console.log('\n3. Menjalankan DraftClaimAuditor...');
    const auditor = new DraftClaimAuditor();
    const auditRes = auditor.audit(draft, researchBrief);

    console.log(`   Audited Propositions Count   : ${auditRes.propositions.length}`);
    console.log(`   Grounded External Facts Count: ${auditRes.groundedExternalFacts}`);
    console.log(`   Ungrounded External Facts    : ${auditRes.ungroundedExternalFacts}`);
    console.log(`   Original Analysis Count      : ${auditRes.originalAnalysisCount}`);
    console.log(`   Issues Count                 : ${auditRes.issues.length}`);
    console.log(`   Audit Status                 : ${auditRes.status}`);
    console.log(`   Audit Summary                : ${auditRes.summary}`);
  }

  console.log('\n================================================================');
  console.log('LIVE ACCEPTANCE TEST SELESAI DENGAN SUKSES (ZERO HARD INVARIANT VIOLATION)');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Unhandled Exception in Live Acceptance:', err);
  process.exit(1);
});
