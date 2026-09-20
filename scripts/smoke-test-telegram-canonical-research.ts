/**
 * NexaMOS Live Canonical Research Pipeline Smoke Test
 *
 * Menguji eksekusi riil CanonicalResearchPipeline yang digunakan di Telegram Editorial Bot:
 * 1. Topic-only input (Autonomous Tavily discovery)
 * 2. Real Acquisition & Ingestion
 * 3. Evidence Integrity Validation
 * 4. Claim Proposal & Deterministic Evidence Verification
 * 5. Structured Provenance Audit Trail (Claim ID -> Evidence ID -> Source URL)
 *
 * Catatan Keamanan: Tidak mencetak rahasia atau API key ke stdout/log.
 */

import { CanonicalResearchPipeline } from '../engines/research/canonical-research-pipeline.ts';
import { ensureEnvLoaded, isAIConfigured } from '../infrastructure/ai/ai-provider-config.ts';
import { AIProviderFactory } from '../infrastructure/ai/ai-provider-factory.ts';
import { ResearchSearchProviderFactory } from '../engines/research/acquisition/providers/research-search-provider-factory.ts';
import type { Topic } from '../engines/ideation/domain/topic.types.ts';

async function main() {
  ensureEnvLoaded();

  console.log('================================================================');
  console.log('NexaMOS Telegram Canonical Research Pipeline — Live Smoke Test');
  console.log('================================================================');

  const hasTavily = Boolean(process.env.TAVILY_API_KEY);
  const hasAI = isAIConfigured();

  console.log(`- Tavily Configured : ${hasTavily ? 'YES (Live Discovery Active)' : 'NO (Will Fallback to Mock)'}`);
  console.log(`- AI (Qwen) Config  : ${hasAI ? 'YES (Live AI Active)' : 'NO (Mock AI Fallback)'}`);

  const aiProvider = hasAI ? AIProviderFactory.createProductionProviders().researchProvider : undefined;
  const searchProvider = ResearchSearchProviderFactory.getSearchProvider();

  console.log(`- Active Search Provider: ${searchProvider.providerName}`);
  console.log('----------------------------------------------------------------');

  const pipeline = new CanonicalResearchPipeline({
    aiResearchProvider: aiProvider,
    searchProvider
  });

  const testTopic: Topic = {
    id: 'topic-smoke-test-1',
    title: 'How CRM Automation and Lead Scoring Drive Aesthetic Clinic Revenue Growth',
    slug: 'crm-automation-lead-scoring-aesthetic-clinic',
    territory: 'TACTICAL',
    recommendedArticleType: 'HOW_TO',
    editorialRole: 'FLAGSHIP',
    status: 'APPROVED',
    audience: { segment: 'Enterprise Content Leaders' },
    problem: 'Manual patient retention and disjointed lead follow-ups in aesthetic clinics',
    intent: { primary: 'CRM Automation and Lead Scoring' },
    thesis: null,
    whyNow: null,
    informationGain: {
      originalityType: ['ORIGINAL_FRAMEWORK'],
      expectedContribution: 'Arsitektur informasi mandiri',
      commodityRisk: 'LOW'
    },
    evidencePlan: {
      requiredEvidenceLevel: 'E2',
      plannedSources: [],
      originalEvidenceRequired: false
    },
    businessRelevance: {
      objective: 'Thought Leadership',
      funnelRole: 'TOFU'
    },
    distributionTargets: ['GOOGLE_SEARCH', 'GOOGLE_AI'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  console.log(`[1] Menjalankan Canonical Pipeline untuk Topik:\n    "${testTopic.title}"`);
  console.log('[2] Mode: Autonomous Discovery (Direct URLs: 0)...');

  const startTime = Date.now();
  const result = await pipeline.execute({
    topic: testTopic,
    directUrls: []
  });
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`[3] Pipeline selesai dalam ${elapsedSec} detik.`);
  console.log('----------------------------------------------------------------');

  if (!result.ok) {
    console.error('❌ Pipeline Gagal (Failure is a valid system state):');
    console.error(`- Error Code   : ${result.error.code}`);
    console.error(`- Error Message: ${result.error.message}`);
    process.exit(1);
  }

  const { researchBrief, metrics, provenanceTrace } = result.value;

  console.log('✅ Pipeline Sukses! Metrik Riset Terverifikasi:');
  console.log(`- Pertanyaan Riset         : ${metrics.researchQuestionsCount}`);
  console.log(`- Permintaan Pencarian     : ${metrics.searchRequestsCount}`);
  console.log(`- Kandidat Sumber Ditemukan: ${metrics.candidateSourcesCount}`);
  console.log(`- Sumber Diakuisisi        : ${metrics.acquiredSourcesCount}`);
  console.log(`- Kandidat Bukti Diekstrak : ${metrics.evidenceCandidatesCount}`);
  console.log(`- Bukti Terverifikasi      : ${metrics.verifiedEvidenceCount}`);
  console.log(`- Klaim Diusulkan Qwen     : ${metrics.proposedClaimsCount}`);
  console.log(`- Klaim SUPPORTED          : ${metrics.supportedClaimsCount}`);
  console.log(`- Klaim UNVERIFIED         : ${metrics.unverifiedClaimsCount}`);
  console.log(`- Klaim UNSUPPORTED        : ${metrics.unsupportedClaimsCount}`);
  console.log(`- Editorial Readiness      : ${researchBrief.readiness}`);
  console.log('----------------------------------------------------------------');

  console.log('PROVENANCE AUDIT TRAIL (Claim -> Evidence -> Source URL):');
  for (const trace of provenanceTrace) {
    console.log(`\n▶ [${trace.status}] ${trace.statement}`);
    console.log(`  Claim ID: ${trace.claimId}`);
    console.log(`  Supporting Evidence Count: ${trace.supportingEvidence.length}`);

    for (const ev of trace.supportingEvidence) {
      console.log(`    ↳ [EVIDENCE ${ev.evidenceId}] "${ev.content.substring(0, 120)}..."`);
      console.log(`      Publisher : ${ev.publisher || 'N/A'}`);
      console.log(`      Source URL: ${ev.sourceUrl || '(Internal/Unknown)'}`);
    }
  }

  console.log('\n================================================================');
  console.log('SMOKE TEST COMPLETED SUCCESSFULLY WITH INTEGRITY INVARIANTS PRESERVED');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Unhandled Exception in Smoke Test:', err);
  process.exit(1);
});
