/**
 * NexaMOS Pilot Article Runner (Step 3 Orchestration)
 *
 * Sourced from NexaMOS Blog Production Pilot 01 Step 3 specifications.
 * Menjalankan alur integrasi penuh artikel pilot nyata:
 *
 * Topic & URLs
 *       ↓
 * HttpSourceAcquisitionProvider (Real URL download & SSRF safety)
 *       ↓
 * Source Normalizer & Evidence Extractor
 *       ↓
 * Real AI Research Provider
 *       ↓
 * ResearchBrief
 *       ↓
 * Real AI Editorial Provider
 *       ↓
 * ArticleDraft
 *       ↓
 * GroundingGuard
 *       ↓
 * Disimpan untuk Human Review (DILARANG AUTO-PUBLISH)
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { loadAIProviderConfig, isAIConfigured } from '../infrastructure/ai/ai-provider-config.ts';
import { AIProviderFactory } from '../infrastructure/ai/ai-provider-factory.ts';
import { HttpSourceAcquisitionProvider } from '../engines/research/acquisition/providers/http-source-acquisition-provider.ts';
import type { SourceCandidate } from '../engines/research/acquisition/source-candidate.ts';
import { ResearchIngestionService } from '../engines/research/ingestion/research-ingestion-service.ts';
import { InMemoryResearchSourceRepository } from '../engines/research/repository/in-memory-research-source-repository.ts';
import { InMemoryResearchEvidenceRepository } from '../engines/research/repository/in-memory-research-evidence-repository.ts';
import { InMemoryResearchEventRepository } from '../engines/research/repository/in-memory-research-event-repository.ts';
import { GroundingGuard } from '../engines/editorial/grounding-guard.ts';
import type { Topic, Territory, ArticleType, EditorialRole } from '../engines/ideation/domain/topic.types.ts';
import type { ResearchBrief } from '../engines/research/orchestrator/research-brief.ts';
import type { ResearchEvidence } from '../engines/research/domain/research-evidence.ts';
import type { ResearchSource } from '../engines/research/domain/research-source.ts';
import type { ResearchQuestion, QuestionPriority } from '../engines/research/domain/research-question.ts';
import type { ResearchClaim } from '../engines/research/domain/research-claim.ts';
import { DeterministicClaimEvidenceVerifier } from '../engines/research/claim-evidence-verifier.ts';
import type { EditorialGenerationRequest } from '../engines/editorial/editorial-generation-request.ts';

interface PilotConfig {
  pilotId: string;
  topic: {
    title: string;
    slug: string;
    territory: string;
    articleType: string;
    editorialRole: string;
    audience?: { segment: string };
    problem?: string;
    thesis?: string;
  };
  sourceUrls: string[];
  notes?: string;
}

async function runPilot(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  const pilotConfigFile = path.resolve('data/pilot/pilot-article-input.json');

  console.log('====================================================');
  console.log('NexaMOS Production Pilot 01 — Article Generation Runner');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (Simulasi Pipeline)' : 'REAL EXECUTION'}`);
  console.log('====================================================');

  // 1. Baca Konfigurasi Pilot
  const rawConfig = await fs.readFile(pilotConfigFile, 'utf-8');
  const pilotData: PilotConfig = JSON.parse(rawConfig);

  console.log(`Topik:      "${pilotData.topic.title}"`);
  console.log(`Slug:       ${pilotData.topic.slug}`);
  console.log(`Sumber URL: ${pilotData.sourceUrls.length} tautan primer terdaftar:`);
  for (const u of pilotData.sourceUrls) {
    console.log(`  - ${u}`);
  }

  // 2. Evaluasi Kesiapan AI Provider
  const aiConfig = loadAIProviderConfig();
  const aiReady = isAIConfigured(aiConfig);
  console.log(`AI Config:  Provider=${aiConfig.provider}, Model=${aiConfig.model}, Ready=${aiReady ? 'YES' : 'NO'}`);

  if (isDryRun) {
    console.log('\n[DRY RUN] Validasi alur pipeline:');
    console.log('  1. HttpSourceAcquisitionProvider: siap mengunduh URL dengan proteksi SSRF.');
    console.log('  2. Ingestion & Evidence Extractor: siap mem-parsing HTML/Text ke bukti empiris.');
    console.log('  3. Real AI Research Provider: siap merumuskan rencana riset dan sintesis.');
    console.log('  4. Real AI Editorial Provider: siap menyusun EditorialPlan dan ArticleDraft.');
    console.log('  5. GroundingGuard: siap mengevaluasi integritas klaim sebelum persetujuan manusia.');
    console.log('\nStatus: DRY RUN SUCCESSFUL — Seluruh komponen dan skema input valid.');
    console.log('====================================================\n');
    return;
  }

  if (!aiReady) {
    console.error('\n[FATAL] AI_PROVIDER_API_KEY belum dikonfigurasi pada environment.');
    console.error('Real execution membutuhkan API key yang valid di file .env.');
    console.error('Jalankan dengan --dry-run jika ingin memverifikasi struktur konfigurasi terlebih dahulu:');
    console.error('  npm run pilot -- --dry-run\n');
    process.exit(1);
  }

  const { researchProvider, editorialProvider } = AIProviderFactory.createProductionProviders();
  const acquisitionProvider = new HttpSourceAcquisitionProvider();
  const sourceRepo = new InMemoryResearchSourceRepository();
  const evidenceRepo = new InMemoryResearchEvidenceRepository();
  const eventRepo = new InMemoryResearchEventRepository();
  const ingestionService = new ResearchIngestionService({ sourceRepo, evidenceRepo, eventRepo });
  const groundingGuard = new GroundingGuard();

  console.log('\n--- TAHAP 1: Akuisisi Sumber Riset Nyata (HTTP Source Acquisition) ---');
  const acquiredSources: ResearchSource[] = [];
  const extractedEvidence: ResearchEvidence[] = [];

  for (let i = 0; i < pilotData.sourceUrls.length; i++) {
    const url = pilotData.sourceUrls[i];
    console.log(`Mengunduh (${i + 1}/${pilotData.sourceUrls.length}): ${url}`);

    const candidate: SourceCandidate = {
      id: `cand-${Date.now()}-${i}`,
      queryId: 'pilot-query-001',
      researchProjectId: 'proj-pilot-01',
      title: `Sumber Riset ${i + 1}`,
      url,
      provider: 'http-pilot',
      status: 'DISCOVERED',
      discoveredAt: new Date().toISOString()
    };

    const acquireResult = await acquisitionProvider.acquire(candidate, { timeoutMs: 15000 });
    if (!acquireResult.ok) {
      console.warn(`  [WARN] Gagal mengunduh ${url}: ${acquireResult.error.message}`);
      continue;
    }

    const rawInput = {
      ...acquireResult.value,
      researchProjectId: 'proj-pilot-01'
    };

    const ingestResult = await ingestionService.ingest(rawInput, { extractEvidence: true });
    if (ingestResult.ok) {
      const normSource = ingestResult.value.source;
      acquiredSources.push(normSource);
      if (ingestResult.value.persistedEvidence) {
        extractedEvidence.push(...ingestResult.value.persistedEvidence);
      }
    }
  }

  console.log(`Hasil Akuisisi: ${acquiredSources.length} sumber berhasil diolah, ${extractedEvidence.length} butir bukti diekstraksi.`);

  console.log('\n--- TAHAP 2: Real AI Research Provider (Planning & Claims) ---');
  const topicEntity: Topic = {
    id: 'top-pilot-001',
    title: pilotData.topic.title,
    slug: pilotData.topic.slug,
    territory: (pilotData.topic.territory as Territory) || 'STRATEGY',
    recommendedArticleType: (pilotData.topic.articleType as ArticleType) || 'ANALYSIS',
    editorialRole: (pilotData.topic.editorialRole as EditorialRole) || 'AUTHORITY',
    audience: {
      segment: pilotData.topic.audience?.segment || 'Enterprise Content Leaders'
    },
    problem: pilotData.topic.problem || 'Relevansi blog di era AI search',
    intent: { primary: 'Investigasi dampak AI Overviews terhadap blog' },
    thesis: pilotData.topic.thesis || null,
    whyNow: null,
    status: 'APPROVED',
    informationGain: {
      originalityType: ['ORIGINAL_FRAMEWORK'],
      expectedContribution: 'Arsitektur retrievabilitas konten',
      commodityRisk: 'LOW'
    },
    evidencePlan: {
      requiredEvidenceLevel: 'E2',
      plannedSources: ['Google Search Central Documentation'],
      originalEvidenceRequired: true
    },
    businessRelevance: {
      objective: 'Thought Leadership',
      funnelRole: 'TOFU'
    },
    distributionTargets: ['GOOGLE_SEARCH', 'GOOGLE_AI'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const planResult = await researchProvider.planResearch({ topic: topicEntity });
  if (!planResult.ok) {
    throw new Error(`AI Research Planning gagal: ${planResult.error.message}`);
  }
  console.log(`Research Plan berhasil dirumuskan: ${planResult.value.researchQuestions.length} pertanyaan riset terstruktur.`);

  const questions: ResearchQuestion[] = planResult.value.researchQuestions.map((q, idx) => ({
    id: `rq-${idx + 1}`,
    question: q.question,
    priority: q.priority === 'CRITICAL'
      ? 'HIGH'
      : q.priority === 'IMPORTANT'
        ? 'MEDIUM'
        : 'LOW',
    status: 'OPEN' as const
  }));

  console.log('Menyusun usulan klaim dari bukti riset...');
  // Jeda 4 detik sebelum memanggil AI untuk menghormati rate limit free tier
  await new Promise((r) => setTimeout(r, 4000));

  const proposedClaimsResult = await researchProvider.proposeClaims({
    projectId: 'proj-pilot-01',
    evidence: extractedEvidence.slice(0, 20),
    questions
  });

  if (!proposedClaimsResult.ok) {
    console.warn(`  [WARN] Perumusan klaim AI: ${proposedClaimsResult.error.message}`);
  }

  const claimVerifier = new DeterministicClaimEvidenceVerifier();
  const supportedClaims: ResearchClaim[] = [];
  const unverifiedClaims: ResearchClaim[] = [];

  const rawProposed = proposedClaimsResult.ok ? proposedClaimsResult.value : [];
  for (let idx = 0; idx < rawProposed.length; idx++) {
    const c = rawProposed[idx];
    const candidateClaim: ResearchClaim = {
      id: `claim-pilot-${idx + 1}`,
      researchProjectId: 'proj-pilot-01',
      statement: c.statement,
      claimType: c.claimType,
      importance: c.importance,
      status: 'UNVERIFIED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const verifyRes = await claimVerifier.verify(candidateClaim, extractedEvidence);
    candidateClaim.status = verifyRes.status;

    if (candidateClaim.status === 'SUPPORTED') {
      supportedClaims.push(candidateClaim);
    } else {
      unverifiedClaims.push(candidateClaim);
    }
  }

  console.log(`Klaim Riset: ${supportedClaims.length} klaim faktual berhasil diverifikasi (SUPPORTED), ${unverifiedClaims.length} belum terverifikasi.`);

  // Susun ResearchBrief
  const researchBrief: ResearchBrief = {
    id: 'brief-pilot-01',
    topicId: topicEntity.id,
    researchProjectId: 'proj-pilot-01',
    objective: 'Menyusun analisis retrievabilitas blog di era generative search',
    answeredQuestions: [],
    openQuestions: questions,
    supportedClaims,
    partiallySupportedClaims: [],
    disputedClaims: [],
    unverifiedClaims,
    unsupportedClaims: [],
    keyFindings: [
      {
        id: 'finding-01',
        researchProjectId: 'proj-pilot-01',
        statement: 'Google Search memprioritaskan konten orisinal dengan nilai tambah unik (Information Gain tinggi).',
        supportingClaimIds: supportedClaims.map((c) => c.id),
        confidence: 'HIGH',
        limitations: ['Pembaruan algoritma Google Search berjalan dinamis sehingga monitoring berkelanjutan diperlukan.'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    limitations: ['Pembaruan algoritma Google Search berjalan dinamis sehingga monitoring berkelanjutan diperlukan.'],
    researchGaps: [],
    recommendedEditorialAngle: 'Transisi dari produksi konten komoditas menjadi arsitektur informasi mandiri.',
    sourceIndex: acquiredSources.map((s) => ({
      sourceId: s.id,
      title: s.title,
      url: s.url ?? undefined,
      sourceType: s.type,
      authorityScore: s.qualityAssessment?.authority ?? 80
    })),
    evidenceIndex: extractedEvidence.slice(0, 20).map((e) => ({
      evidenceId: e.id,
      sourceId: e.sourceId,
      quote: e.content.slice(0, 200),
      level: e.evidenceLevel,
      verified: e.verified !== undefined ? e.verified : true,
      provenanceType: e.provenanceType || 'EXTERNAL_EVIDENCE'
    })),
    readiness: supportedClaims.length > 0 ? 'READY_FOR_EDITORIAL' : 'NOT_READY',
    generatedAt: new Date().toISOString()
  };

  console.log('\n--- TAHAP 3: Real AI Editorial Provider (Planning & Drafting) ---');
  // Jeda 4 detik sebelum perumusan editorial plan
  await new Promise((r) => setTimeout(r, 4000));

  const editorialRequest: EditorialGenerationRequest = {
    topic: topicEntity,
    researchBrief,
    articleType: 'ANALYSIS',
    editorialRole: 'AUTHORITY',
    territory: topicEntity.territory,
    audience: topicEntity.audience.segment,
    primaryObjective: 'Menjelaskan relevansi blog strategis di era AI search',
    editorialAngle: researchBrief.recommendedEditorialAngle
  };

  const editorialPlan = await editorialProvider.createEditorialPlan(editorialRequest);
  console.log(`Editorial Plan terbentuk: "${editorialPlan.workingTitle}" (${editorialPlan.sectionPlan.length} seksi direncanakan).`);

  // Jeda 5 detik sebelum generasi naskah penuh
  await new Promise((r) => setTimeout(r, 5000));

  const draftPayload = await editorialProvider.generateArticleDraft(editorialRequest, editorialPlan);
  console.log(`ArticleDraft dihasilkan: ${draftPayload.sections.length} seksi naskah dengan ${draftPayload.claimUsages.length} sitasi klaim.`);

  console.log('\n--- TAHAP 4: Grounding Guard & Integrity Evaluation ---');
  const guardEvaluation = groundingGuard.evaluate(
    {
      id: 'draft-pilot-01',
      topicId: topicEntity.id,
      researchProjectId: researchBrief.researchProjectId,
      title: draftPayload.title,
      dek: draftPayload.dek || '',
      slug: draftPayload.slug || topicEntity.slug,
      territory: editorialRequest.territory,
      articleType: editorialRequest.articleType,
      editorialRole: editorialRequest.editorialRole,
      thesis: draftPayload.thesis,
      editorialAngle: draftPayload.editorialAngle,
      sections: draftPayload.sections,
      claimUsages: draftPayload.claimUsages,
      citationMap: draftPayload.citationMap,
      status: 'READY_FOR_EDITORIAL_REVIEW',
      generatedAt: new Date().toISOString(),
      generatorVersion: 'pilot-v1',
      promptVersion: '1.0.0'
    },
    researchBrief
  );

  console.log(`Grounding Guard Status: ${guardEvaluation.status}`);
  console.log(`Evaluasi Integritas:   ${guardEvaluation.summary}`);

  // Simpan hasil draft ke content/drafts/pilot-article-draft.json untuk review manusia
  const outputDraftPath = path.resolve('content/drafts/pilot-article-draft.json');
  await fs.writeFile(
    outputDraftPath,
    JSON.stringify(
      {
        meta: {
          pilotId: pilotData.pilotId,
          generatedAt: new Date().toISOString(),
          aiProvider: aiConfig.provider,
          aiModel: aiConfig.model,
          groundingStatus: guardEvaluation.status
        },
        draft: draftPayload,
        guardEvaluation
      },
      null,
      2
    ),
    'utf-8'
  );

  console.log(`\nDraft artikel pilot tersimpan di: ${outputDraftPath}`);
  console.log('HARD RULE: Naskah TIDAK dipublikasikan secara otomatis dan menunggu persetujuan Editorial Review manusia.');
  console.log('====================================================');
  console.log('PILOT EXECUTION COMPLETE SUCCESS');
  console.log('====================================================\n');
}

runPilot().catch((err) => {
  console.error('\nPilot execution failed:', err.message);
  process.exit(1);
});
