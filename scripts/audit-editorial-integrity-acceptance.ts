/**
 * Comprehensive Audit Script: Final Editorial Integrity & Publication Gate Acceptance Audit
 *
 * Runs real CMI research, traces cross-language normalization, generates editorial draft,
 * runs DraftClaimAuditor, GroundingGuard, EditorialIntegrityGate, PublicationPreflight,
 * and tests publication authorization.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CanonicalResearchPipeline } from '../engines/research/canonical-research-pipeline.ts';
import { AIProviderFactory } from '../infrastructure/ai/ai-provider-factory.ts';
import { ensureEnvLoaded, isAIConfigured } from '../infrastructure/ai/ai-provider-config.ts';
import { EditorialGenerationService } from '../engines/editorial/editorial-generation-service.ts';
import { DraftClaimAuditor } from '../engines/editorial/draft-claim-auditor.ts';
import { GroundingGuard } from '../engines/editorial/grounding-guard.ts';
import { EditorialIntegrityGate } from '../engines/editorial/editorial-integrity-gate.ts';
import { PublicationPreflightValidator } from '../engines/publishing/publication-preflight.ts';
import { PublicationPackageBuilder } from '../engines/publishing/publication-package.ts';
import type { Topic } from '../engines/ideation/domain/topic.types.ts';
import type { PublicationCandidate } from '../engines/distribution/distribution-readiness.ts';
import type { ArticleSEOMetadata } from '../engines/seo-validator/article-seo-metadata.ts';
import { DeterministicCrossLanguageNormalizer } from '../engines/research/grounding/cross-language-grounding.ts';
import { DeterministicClaimEvidenceVerifier } from '../engines/research/claim-evidence-verifier.ts';

async function runAudit() {
  ensureEnvLoaded();
  console.log('=== STARTING FINAL EDITORIAL INTEGRITY & PUBLICATION GATE AUDIT ===\n');

  if (!isAIConfigured()) {
    console.error('ERROR: AI provider not configured in .env');
    process.exit(1);
  }

  const { researchProvider: aiResearchProvider, editorialProvider: aiEditorialProvider } =
    AIProviderFactory.createProductionProviders();

  const topic: Topic = {
    id: 'top-cmi-audit',
    title: 'Teknik pemasaran konten di era AI',
    slug: 'teknik-pemasaran-konten-era-ai',
    territory: 'TACTICAL',
    targetAudience: 'Content Marketers and CMOs',
    differentiationAngle: 'Operasional ter-grounding berdasarkan bukti empiris',
    lifecycleState: 'APPROVED',
    status: 'APPROVED',
    scoring: { totalScore: 88, policyVersion: 'v1.0' } as any,
    estimatedEvidenceReadiness: 'HIGH',
    editorialFormat: 'ANALYSIS',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const directUrl =
    'https://contentmarketinginstitute.com/ai-content-creation-tools/how-to-work-ai-into-content-marketing-in-a-way-that-works-for-you';

  console.log('--- PHASE 2: RUN REAL CMI RESEARCH ---');
  const pipeline = new CanonicalResearchPipeline({ aiResearchProvider });
  const researchRes = await pipeline.execute({
    topic,
    directUrls: [directUrl]
  });

  if (!researchRes.ok) {
    console.error('Pipeline execution failed:', researchRes.error);
    process.exit(1);
  }

  const { researchBrief, acquiredSources, verifiedEvidence, metrics, provenanceTrace } = researchRes.value;

  console.log('RESEARCH METRICS:');
  console.log(JSON.stringify(metrics, null, 2));

  console.log('\nSUPPORTED CLAIMS:');
  for (const sc of researchBrief.supportedClaims) {
    console.log(`- ID: ${sc.id}`);
    console.log(`  Statement: "${sc.statement}"`);
    console.log(`  Supporting Evidence IDs: ${JSON.stringify(sc.supportingEvidenceIds)}`);
    for (const evId of sc.supportingEvidenceIds || []) {
      const ev = verifiedEvidence.find((e) => e.id === evId);
      if (ev) {
        console.log(`    Evidence [${ev.id}] Quote: "${(ev.content || (ev as any).quote || '').slice(0, 150)}..."`);
        console.log(`    Evidence SourceUrl: ${ev.sourceUrl}`);
      }
    }
  }

  console.log('\nUNVERIFIED CLAIMS:');
  for (const uc of researchBrief.unverifiedClaims) {
    console.log(`- Statement: "${uc.statement}" (Reason: ${uc.reason || 'Insufficient overlap'})`);
  }

  console.log('\n--- PHASE 3: CROSS-LANGUAGE NORMALIZER TRACE ---');
  // Re-run the exact verification for each proposed claim to capture the trace
  const normalizer = new DeterministicCrossLanguageNormalizer(aiResearchProvider);

  for (const pt of provenanceTrace) {
    console.log(`\nClaim: "${pt.statement}"`);
    console.log(`Status in Pipeline: ${pt.status}`);
    const normTrace = await normalizer.normalizeProposition(pt.statement, 'en');
    const strategy = normTrace.sourceLanguage === 'en'
      ? 'IDENTITY'
      : (aiResearchProvider ? 'LLM_LANGUAGE_NORMALIZATION' : 'BOUNDED_DICTIONARY');
    console.log(`Normalization Strategy: ${strategy}`);
    console.log(`Original Claim Language: ${normTrace.sourceLanguage}`);
    console.log(`Normalized Claim: "${normTrace.normalizedStatement}"`);
    console.log(`Mutation Guard Status: ${!normTrace.mutationDetected ? 'PASSED' : 'REJECTED'}`);
    if (normTrace.mutationReason) {
      console.log(`Mutation Reason: ${normTrace.mutationReason}`);
    }

    if (pt.supportingEvidence && pt.supportingEvidence.length > 0) {
      for (const se of pt.supportingEvidence) {
        console.log(`  Supporting Evidence ID: ${se.evidenceId}`);
        console.log(`  Evidence Content: "${(se.content || '').slice(0, 120)}..."`);
        console.log(`  Source URL: ${se.sourceUrl}`);
      }
    }
  }

  console.log('\n--- PHASE 5: GENERATE ACTUAL ARTICLE DRAFT ---');
  const editorialService = new EditorialGenerationService({
    aiProvider: aiEditorialProvider
  });

  const editorialRes = await editorialService.generateDraft({
    topic,
    researchBrief,
    territory: 'TACTICAL',
    articleType: 'ANALYSIS',
    targetAudience: 'Content Marketers and CMOs',
    requestedWordCount: 800
  });

  console.log(`Editorial Success: ${editorialRes.success}`);
  console.log(`Guard Status: ${editorialRes.guardResult?.status}`);
  if (!editorialRes.draft) {
    console.error('Draft generation failed!');
    process.exit(1);
  }

  const draft = editorialRes.draft;
  console.log(`Title: "${draft.title}"`);
  console.log(`Section Count: ${draft.sections.length}`);
  console.log(`Claim Usages Count: ${draft.claimUsages.length}`);
  console.log(`Citation Map Count: ${draft.citationMap.length}`);

  console.log('\n--- PHASE 6: DRAFT CLAIM AUDITOR FULL TRACE ---');
  const auditor = new DraftClaimAuditor();
  const auditResult = auditor.audit(draft, researchBrief);

  console.log(`Total Propositions: ${auditResult.propositions.length}`);
  console.log(`Grounded External Facts: ${auditResult.groundedExternalFacts}`);
  console.log(`Ungrounded External Facts: ${auditResult.ungroundedExternalFacts}`);
  console.log(`Partial Support Count: ${auditResult.partialSupportCount}`);
  console.log(`Original Analysis Count: ${auditResult.originalAnalysisCount}`);
  console.log(`Interpretation Count: ${auditResult.interpretationCount}`);
  console.log(`Internal Knowledge Count: ${auditResult.internalKnowledgeCount}`);
  console.log(`Non-Factual Editorial Count: ${auditResult.nonFactualCount}`);
  console.log(`Audit Status: ${auditResult.status}`);
  console.log(`Audit Summary: ${auditResult.summary}`);

  console.log('\nALL AUDITED PROPOSITIONS:');
  for (const p of auditResult.propositions) {
    console.log(`--------------------------------------------------`);
    console.log(`PROPOSITION ID: ${p.propositionId}`);
    console.log(`TEXT: "${p.text}"`);
    console.log(`CLASSIFICATION: ${p.classification}`);
    console.log(`SEMANTIC SUPPORT: ${p.supportLevel}`);
    console.log(`MATCHED RESEARCH CLAIM ID: ${JSON.stringify(p.claimIds)}`);
    console.log(`MATCHED EVIDENCE IDs: ${JSON.stringify(p.evidenceIds)}`);
    console.log(`NUMERIC CLAIMS: ${JSON.stringify(p.numericClaims)}`);
    console.log(`DIRECT QUOTE: ${p.hasDirectQuote}`);
    console.log(`REASON: ${p.reason}`);
  }

  console.log('\n--- PHASE 7: UNGROUNDED EXTERNAL FACTS ISOLATION ---');
  const ungrounded = auditResult.propositions.filter(
    (p) => p.classification === 'EXTERNAL_FACT' && p.supportLevel !== 'ENTAILED'
  );
  console.log(`Found ${ungrounded.length} ungrounded external facts:`);
  for (const u of ungrounded) {
    console.log(`- ID: ${u.propositionId}`);
    console.log(`  Text: "${u.text}"`);
    console.log(`  Support Level: ${u.supportLevel}`);
    console.log(`  Reason: ${u.reason}`);
    console.log(`  Numeric: ${JSON.stringify(u.numericClaims)}`);
  }

  console.log('\n--- PHASE 9: GROUNDING GUARD TRACE ---');
  const guard = new GroundingGuard();
  const guardResult = guard.evaluate(draft, researchBrief, editorialRes.plan);
  console.log(`Status: ${guardResult.status}`);
  console.log(`Summary: ${guardResult.summary}`);
  console.log(`Issues (${guardResult.issues.length}):`);
  for (const gi of guardResult.issues) {
    console.log(`- [${gi.severity}] [${gi.code}] ${gi.message}`);
  }

  console.log('\n--- PHASE 11: EDITORIAL INTEGRITY GATE TRACE ---');
  const gate = new EditorialIntegrityGate();
  const gateResult = gate.evaluate(draft, researchBrief, editorialRes.plan);
  console.log(`Gate Status: ${gateResult.status}`);
  console.log(`Gate Summary: ${gateResult.summary}`);
  console.log(`Gate Issues Count: ${gateResult.issues.length}`);
  for (const iss of gateResult.issues) {
    console.log(`- [${iss.severity}] [${iss.code}] ${iss.message}`);
  }

  console.log('\n--- PHASE 13: PUBLICATION PREFLIGHT TRACE ---');
  const candidate: PublicationCandidate = {
    candidateId: `cand-${draft.slug || 'cmi-audit'}`,
    articleId: `art-${draft.slug || 'cmi-audit'}`,
    slug: draft.slug || 'cmi-audit',
    title: draft.title,
    distributionReadinessId: `dist-${draft.slug || 'cmi-audit'}`,
    approvedAt: new Date().toISOString(),
    overallStatus: 'READY_TO_PUBLISH',
    warnings: [],
    policyVersion: 'EDITORIAL_INTEGRITY_VERIFIED'
  };

  const seoMeta: ArticleSEOMetadata = {
    title: `${draft.title} | NexaMOS`,
    description: draft.dek || draft.title,
    slug: draft.slug || 'cmi-audit',
    canonicalUrl: `https://nexamos.cloud/blog/${draft.slug || 'cmi-audit'}`,
    robots: { index: true, follow: true },
    author: { name: 'Tim Riset NexaMOS', role: 'Editorial AI' },
    publisher: { name: 'NexaMOS', logoUrl: 'https://nexamos.cloud/logo.png' },
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const pkg = PublicationPackageBuilder.build(candidate, draft, topic, seoMeta, researchBrief, {
    heroImage: {
      url: `/blog/images/hero-${draft.slug || 'cmi-audit'}.webp`,
      alt: draft.title,
      width: 1200,
      height: 630
    }
  });

  const preflight = new PublicationPreflightValidator();
  const preflightResult = preflight.validate(pkg);
  console.log(`Preflight Status: ${preflightResult.status}`);
  console.log(`Preflight Blocking Errors (${preflightResult.blockingErrors.length}):`);
  for (const be of preflightResult.blockingErrors) {
    console.log(`- ${be}`);
  }
  console.log(`Preflight Warnings (${preflightResult.warnings.length}):`);
  for (const pw of preflightResult.warnings) {
    console.log(`- ${pw}`);
  }

  console.log('\n--- PHASE 14: PUBLICATION AUTHORIZATION TEST ---');
  console.log('Testing whether publication authorization accepts or blocks this draft:');
  const wouldPublishPass = gateResult.status === 'PASS' && preflightResult.status !== 'FAIL';
  console.log(`Integrity Gate: ${gateResult.status}`);
  console.log(`Preflight: ${preflightResult.status}`);
  console.log(`Publication Authorized: ${wouldPublishPass ? 'ALLOWED' : 'BLOCKED'}`);

  // Save the full audit dump to a json file for precise reporting
  const auditDump = {
    researchMetrics: metrics,
    supportedClaims: researchBrief.supportedClaims,
    unverifiedClaims: researchBrief.unverifiedClaims,
    auditResult: {
      status: auditResult.status,
      summary: auditResult.summary,
      groundedExternalFacts: auditResult.groundedExternalFacts,
      ungroundedExternalFacts: auditResult.ungroundedExternalFacts,
      partialSupportCount: auditResult.partialSupportCount,
      originalAnalysisCount: auditResult.originalAnalysisCount,
      interpretationCount: auditResult.interpretationCount,
      internalKnowledgeCount: auditResult.internalKnowledgeCount,
      nonFactualCount: auditResult.nonFactualCount,
      issues: auditResult.issues,
      propositions: auditResult.propositions
    },
    guardResult: {
      status: guardResult.status,
      summary: guardResult.summary,
      issues: guardResult.issues
    },
    gateResult: {
      status: gateResult.status,
      summary: gateResult.summary,
      issues: gateResult.issues
    },
    preflightResult: {
      status: preflightResult.status,
      blockingErrors: preflightResult.blockingErrors,
      warnings: preflightResult.warnings
    },
    publicationAuthorized: wouldPublishPass
  };

  const dumpPath = path.join(process.cwd(), 'audit-dump-cmi.json');
  await fs.writeFile(dumpPath, JSON.stringify(auditDump, null, 2), 'utf-8');
  console.log(`\nAudit dump saved to ${dumpPath}`);
}

runAudit().catch((err) => {
  console.error('Fatal in audit runner:', err);
  process.exit(1);
});
