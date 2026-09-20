/**
 * NexaMOS Research Orchestrator
 *
 * Sourced from NexaMOS Blog Phase 2D specifications
 * Control plane deterministik yang mengoordinasikan seluruh pipeline riset otonom:
 * Plan -> Discover (Phase 2C) -> Acquire (Phase 2C) -> Ingest (Phase 2B) -> Ground (Phase 2A)
 * -> Evaluate Sufficiency (Phase 2A) -> Analyze Gaps -> Next Action -> Repeat or Stop -> ResearchBrief.
 *
 * Doktrin: AI adalah advisor / reasoning layer; Engine deterministik adalah authority layer.
 */

import type { Topic } from '../../ideation/domain/topic.types.ts';
import type { ResearchProject } from '../domain/research-project.ts';
import type { ResearchPlan } from './research-plan.ts';
import type { ResearchIteration } from './research-iteration.ts';
import type { ResearchBrief } from './research-brief.ts';
import type { ResearchNextAction } from './research-next-action.ts';
import type { ResearchOrchestrationResult } from './research-orchestration-result.ts';
import type { AIResearchProvider } from './ai-research-provider.ts';
import type { ResearchPlanner } from './research-planner.ts';
import type { ResearchGapAnalyzer } from './research-gap-analyzer.ts';
import type { ResearchBriefBuilder } from './research-brief-builder.ts';
import type { ResearchManagementService } from '../research-management-service.ts';
import type { ResearchAcquisitionService } from '../acquisition/research-acquisition-service.ts';
import type { ResearchEventRepository } from '../repository/research-event-repository.ts';
import type { ResearchSourceRepository } from '../repository/research-source-repository.ts';
import type { ResearchClaimRepository } from '../repository/research-claim-repository.ts';
import type { ResearchEvidenceRepository } from '../repository/research-evidence-repository.ts';
import type { ResearchFindingRepository } from '../repository/research-finding-repository.ts';
import type { Result, ResearchDomainError } from '../domain/research-result.ts';
import { ok, err, createResearchDomainError } from '../domain/research-result.ts';
import type { ResearchBudgetPolicy } from '../acquisition/research-budget-policy.ts';
import type { TopicVolatility } from '../acquisition/freshness-evaluator.ts';
import type { ClaimType } from '../domain/claim-status.ts';
import type { EvidenceSufficiencyResult } from '../evidence-sufficiency.ts';
import type { ClaimEvidenceVerifier } from '../claim-evidence-verifier.ts';
import { DeterministicClaimEvidenceVerifier } from '../claim-evidence-verifier.ts';

export const ORCHESTRATOR_VERSION = '2.4.0';
export const RESEARCH_POLICY_VERSION = '2.4.0';

export interface ResearchOrchestratorDependencies {
  managementService: ResearchManagementService;
  acquisitionService: ResearchAcquisitionService;
  aiProvider: AIResearchProvider;
  planner: ResearchPlanner;
  gapAnalyzer: ResearchGapAnalyzer;
  briefBuilder: ResearchBriefBuilder;
  eventRepo: ResearchEventRepository;
  sourceRepo: ResearchSourceRepository;
  claimRepo: ResearchClaimRepository;
  evidenceRepo: ResearchEvidenceRepository;
  findingRepo: ResearchFindingRepository;
  claimVerifier?: ClaimEvidenceVerifier;
}

export interface OrchestrateResearchOptions {
  actor?: string;
  topicVolatility?: TopicVolatility;
  budget?: Partial<ResearchBudgetPolicy>;
  humanStop?: boolean;
  maxIterationsOverride?: number;
  currentDate?: string | Date;
}

export class ResearchOrchestrator {
  private managementService: ResearchManagementService;
  private acquisitionService: ResearchAcquisitionService;
  private aiProvider: AIResearchProvider;
  private planner: ResearchPlanner;
  private gapAnalyzer: ResearchGapAnalyzer;
  private briefBuilder: ResearchBriefBuilder;
  private eventRepo: ResearchEventRepository;
  private sourceRepo: ResearchSourceRepository;
  private claimRepo: ResearchClaimRepository;
  private evidenceRepo: ResearchEvidenceRepository;
  private findingRepo: ResearchFindingRepository;
  private claimVerifier: ClaimEvidenceVerifier;

  constructor(deps: ResearchOrchestratorDependencies) {
    this.managementService = deps.managementService;
    this.acquisitionService = deps.acquisitionService;
    this.aiProvider = deps.aiProvider;
    this.planner = deps.planner;
    this.gapAnalyzer = deps.gapAnalyzer;
    this.briefBuilder = deps.briefBuilder;
    this.eventRepo = deps.eventRepo;
    this.sourceRepo = deps.sourceRepo;
    this.claimRepo = deps.claimRepo;
    this.evidenceRepo = deps.evidenceRepo;
    this.findingRepo = deps.findingRepo;
    this.claimVerifier = deps.claimVerifier || new DeterministicClaimEvidenceVerifier();
  }

  /**
   * Menjalankan siklus riset otonom terpandu penuh untuk suatu Topic.
   */
  async orchestrateResearch(
    topic: Topic,
    options: OrchestrateResearchOptions = {}
  ): Promise<Result<ResearchOrchestrationResult, ResearchDomainError>> {
    const actor = options.actor || 'ai-research-orchestrator';
    const topicVolatility = options.topicVolatility || 'MEDIUM';

    // 1. RUMUSKAN RESEARCH PLAN
    const planRes = await this.planner.planTopicResearch(topic, { actor });
    if (!planRes.ok) {
      return err(planRes.error);
    }
    const plan = planRes.value;

    const maxIterations = options.maxIterationsOverride || plan.maxResearchIterations;

    // 2. BUAT RESEARCH PROJECT KANONIKAL
    const projectRes = await this.managementService.createResearchProject(
      {
        topicId: topic.id,
        title: `Riset AI: ${topic.title}`,
        objective: plan.objective,
        researchQuestions: plan.researchQuestions,
        requiredEvidenceLevel: plan.requiredEvidenceLevel
      },
      actor
    );
    if (!projectRes.ok) {
      return err(projectRes.error);
    }
    const project = projectRes.value;

    // Catat event RESEARCH_PLAN_CREATED pada level proyek
    await this.recordEvent(
      project.id,
      'RESEARCH_PLAN_CREATED',
      actor,
      `ResearchPlan '${plan.id}' diadopsi untuk proyek riset '${project.id}'.`,
      { planId: plan.id, maxIterations: plan.maxResearchIterations }
    );

    // Inisialisasi status audit loop
    const iterations: ResearchIteration[] = [];
    let currentIterationNumber = 0;
    let stopReason = 'Kecukupan bukti tercapai.';
    let finalAction: ResearchNextAction = 'SYNTHESIZE';
    let requiresHumanReview = false;
    let counterEvidenceReviewed = false;

    // SIKLUS RISET OTONOM (Autonomous Research Loop)
    while (currentIterationNumber < maxIterations) {
      currentIterationNumber++;

      // Audit: Event iterasi dimulai
      await this.recordEvent(
        project.id,
        'RESEARCH_ITERATION_STARTED',
        actor,
        `Siklus riset iterasi ke-${currentIterationNumber} dimulai.`,
        { iterationNumber: currentIterationNumber, maxIterations }
      );

      // A. Ambil pertanyaan riset aktif untuk iterasi ini
      const activeQuestions = plan.researchQuestions.slice(
        currentIterationNumber - 1,
        currentIterationNumber
      );
      const questionToInvestigate = activeQuestions[0] || plan.researchQuestions[0];

      // B. DISCOVERY & ACQUISITION PIPELINE (Phase 2C + Phase 2B)
      const acqReportRes = await this.acquisitionService.runAcquisitionPipeline(
        questionToInvestigate,
        project.id,
        [],
        {
          actor,
          topicVolatility,
          budget: options.budget,
          currentDate: options.currentDate
        }
      );

      let queriesExecuted: string[] = [];
      let sourcesDiscoveredCount = 0;
      let sourcesAcceptedCount = 0;
      let evidenceCapturedCount = 0;
      let budgetExhausted = false;

      if (acqReportRes.ok) {
        const report = acqReportRes.value;
        queriesExecuted = report.queriesCreated.map((q) => q.query);
        sourcesDiscoveredCount = report.candidatesDiscovered.length;
        sourcesAcceptedCount = report.acceptedCandidates.length;
        evidenceCapturedCount = report.ingestionResults.reduce(
          (acc, ir) => acc + ir.persistedEvidence.length,
          0
        );
        budgetExhausted = report.budgetExhausted;
      }

      // C. PROPOSE CLAIMS (AI Proposal)
      // Dapatkan bukti terbaru yang tersimpan di repositori
      const projectEvidence = await this.evidenceRepo.listByProjectId(project.id);
      const projectClaimsBefore = await this.claimRepo.listByProjectId(project.id);

      const claimsProposalRes = await this.aiProvider.proposeClaims({
        projectId: project.id,
        evidence: projectEvidence,
        questions: plan.researchQuestions,
        existingClaims: projectClaimsBefore
      });

      if (claimsProposalRes.ok && claimsProposalRes.value.length > 0) {
        // Catat audit usulan proposal klaim dari AI
        await this.recordEvent(
          project.id,
          'AI_RESEARCH_PROPOSAL_CREATED',
          actor,
          `AI mengusulkan ${claimsProposalRes.value.length} klaim hipotesis.`,
          { claimsCount: claimsProposalRes.value.length, provider: this.aiProvider.getMetadata() }
        );

        // DAFTARKAN KLAIM DENGAN STATUS DEFAULT: UNVERIFIED
        // AI TIDAK BOLEH MEMUTUSKAN STATUS SUPPORTED
        for (const pc of claimsProposalRes.value) {
          const isExisting = projectClaimsBefore.some(
            (ec) => ec.statement.trim().toLowerCase() === pc.statement.trim().toLowerCase()
          );
          if (!isExisting) {
            const createClaimRes = await this.managementService.addClaim(
              project.id,
              {
                statement: pc.statement,
                claimType: pc.claimType,
                importance: pc.importance,
                status: 'UNVERIFIED' // DOKTRIN KETAT
              },
              actor
            );

            if (createClaimRes.ok) {
              const newClaim = createClaimRes.value;
              // Evaluasi kecocokan bukti melalui ClaimEvidenceVerifier (bukan penautan buta)
              const verifyRes = await this.claimVerifier.verify(newClaim, projectEvidence);

              for (const evId of verifyRes.supportingEvidenceIds) {
                await this.managementService.linkClaimEvidence(
                  project.id,
                  newClaim.id,
                  evId,
                  'SUPPORTS',
                  'STRONG',
                  verifyRes.reason,
                  actor
                );
              }

              for (const evId of verifyRes.contradictingEvidenceIds) {
                await this.managementService.linkClaimEvidence(
                  project.id,
                  newClaim.id,
                  evId,
                  'CONTRADICTS',
                  'STRONG',
                  verifyRes.reason,
                  actor
                );
              }

              for (const evId of verifyRes.qualifyingEvidenceIds) {
                await this.managementService.linkClaimEvidence(
                  project.id,
                  newClaim.id,
                  evId,
                  'QUALIFIES',
                  'MODERATE',
                  verifyRes.reason,
                  actor
                );
              }
            }
          }
        }
      }

      // D. GROUNDING & SUFFICIENCY EVALUATION (Phase 2A)
      const allCurrentClaims = await this.claimRepo.listByProjectId(project.id);
      const groundingResults: any[] = [];
      for (const clm of allCurrentClaims) {
        const eg = await this.managementService.evaluateClaim(project.id, clm.id, actor);
        if (eg.ok) groundingResults.push(eg.value);
      }

      const sufficiencyRes = await this.managementService.evaluateResearchSufficiency(project.id);
      const synthRes = await this.managementService.synthesize(project.id, actor);

      if (!synthRes.ok) {
        return err(synthRes.error);
      }
      const currentSynthesis = synthRes.value;

      // E. GAP ANALYSIS & NEXT ACTION (AI + Deterministic Guardrails)
      const currentClaims = await this.claimRepo.listByProjectId(project.id);
      const currentSources = await this.sourceRepo.listByProjectId(project.id);

      const gapAnalysisRes = await this.gapAnalyzer.analyzeGaps({
        synthesis: currentSynthesis,
        currentGaps: currentSynthesis.gaps,
        claims: currentClaims,
        evidenceList: projectEvidence,
        sourcesList: currentSources,
        groundingResults,
        topicVolatility,
        counterEvidenceReviewed
      });

      let nextAction: ResearchNextAction = 'SEARCH_MORE';
      let actionReason = 'Lanjutkan penelusuran.';
      let remainingGapsCount = currentSynthesis.gaps.length;

      if (gapAnalysisRes.ok) {
        const gapResult = gapAnalysisRes.value;
        nextAction = gapResult.nextAction;
        actionReason = gapResult.actionReason;
        requiresHumanReview = gapResult.requiresHumanReview;
        remainingGapsCount = gapResult.validatedGaps.length;

        if (nextAction === 'SEARCH_COUNTER_EVIDENCE') {
          counterEvidenceReviewed = true;
        }

        // Catat event audit evaluasi gap dan pemilihan next action
        await this.recordEvent(
          project.id,
          'RESEARCH_GAP_ANALYZED',
          actor,
          `Analisis kesenjangan selesai. Gaps tersisa: ${remainingGapsCount}.`,
          { gapsCount: remainingGapsCount, summary: gapResult.gapSummary }
        );

        await this.recordEvent(
          project.id,
          'RESEARCH_NEXT_ACTION_SELECTED',
          actor,
          `Aksi riset berikutnya dipilih: ${nextAction} (${actionReason}).`,
          { action: nextAction, reason: actionReason }
        );
      }

      // Catat record ResearchIteration
      iterations.push({
        iterationNumber: currentIterationNumber,
        researchQuestions: activeQuestions.map((q) => q.question),
        queriesExecuted,
        sourcesDiscovered: sourcesDiscoveredCount,
        sourcesAccepted: sourcesAcceptedCount,
        evidenceCaptured: evidenceCapturedCount,
        claimsEvaluated: currentClaims.length,
        gapsRemaining: remainingGapsCount,
        nextAction,
        actionReason,
        timestamp: new Date().toISOString()
      });

      // F. HARD STOP RULES (Evaluasi penghentian iterasi)
      // Rule 1: Kebutuhan Human Review
      if (requiresHumanReview) {
        stopReason = 'Memerlukan review manusia karena kontradiksi atau bukti tidak mencukupi.';
        finalAction = 'REQUEST_HUMAN_REVIEW';
        await this.recordEvent(
          project.id,
          'HUMAN_REVIEW_REQUESTED',
          actor,
          `Review manusia diwajibkan: ${actionReason}`
        );
        break;
      }

      // Rule 2: Explicit Human Stop
      if (options.humanStop) {
        stopReason = 'Dihentikan secara manual oleh editor (human stop).';
        finalAction = 'STOP_RESEARCH';
        await this.recordEvent(project.id, 'RESEARCH_STOPPED', actor, stopReason);
        break;
      }

      // Rule 3: Sufficiency Terpenuhi
      if (sufficiencyRes.ok && sufficiencyRes.value.status === 'SUFFICIENT' && nextAction === 'SYNTHESIZE') {
        stopReason = 'Kecukupan bukti riset tercapai secara memadai.';
        finalAction = 'SYNTHESIZE';
        break;
      }

      // Rule 4: Budget Habis
      if (budgetExhausted) {
        stopReason = 'Anggaran penelusuran riset telah habis.';
        finalAction = 'STOP_RESEARCH';
        await this.recordEvent(project.id, 'RESEARCH_STOPPED', actor, stopReason);
        break;
      }

      // Rule 5: Iterasi Maksimal Tercapai
      if (currentIterationNumber >= maxIterations) {
        stopReason = `Batas iterasi riset maksimal (${maxIterations}) tercapai.`;
        finalAction = 'STOP_RESEARCH';
        await this.recordEvent(project.id, 'RESEARCH_STOPPED', actor, stopReason);
        break;
      }
    }

    // 4. SINTESIS AKHIR & AI ASSISTANCE
    const finalSynthRes = await this.managementService.synthesize(project.id, actor);
    if (!finalSynthRes.ok) {
      return err(finalSynthRes.error);
    }
    const finalSynthesis = finalSynthRes.value;

    const finalSufficiencyRes = await this.managementService.evaluateResearchSufficiency(project.id);
    const finalSufficiency: EvidenceSufficiencyResult = finalSufficiencyRes.ok
      ? finalSufficiencyRes.value
      : {
          status: 'INSUFFICIENT',
          highestAchievedLevel: 'E0',
          requiredLevelMet: false,
          missingEvidence: ['Kecukupan bukti belum memadai.'],
          gaps: [],
          summary: 'Kecukupan bukti belum memadai.'
        };

    // Dapatkan bantuan sudut pandang editorial dari AI
    const keyFindings = await this.findingRepo.listByProjectId(project.id);
    const aiAssistanceRes = await this.aiProvider.assistSynthesis({
      topic,
      project,
      answeredQuestions: finalSynthesis.answeredQuestions,
      supportedClaims: finalSynthesis.supportedClaims,
      disputedClaims: finalSynthesis.disputedClaims,
      keyFindings,
      limitations: finalSynthesis.limitations
    });

    const aiAssistance = aiAssistanceRes.ok ? aiAssistanceRes.value : null;

    // 5. BANGUN RESEARCH BRIEF TERVERIFIKASI
    const briefRes = await this.briefBuilder.buildBrief({
      project,
      synthesis: finalSynthesis,
      sufficiencyResult: finalSufficiency,
      aiAssistance,
      requiresHumanReview
    });

    if (!briefRes.ok) {
      return err(briefRes.error);
    }
    const brief = briefRes.value;

    // Catat event audit brief
    await this.recordEvent(
      project.id,
      'RESEARCH_BRIEF_CREATED',
      actor,
      `ResearchBrief '${brief.id}' berhasil disusun. Kesiapan: ${brief.readiness}.`,
      { briefId: brief.id, readiness: brief.readiness, totalSources: brief.sourceIndex.length }
    );

    // Hitung ringkasan statistik
    const allClaims = await this.claimRepo.listByProjectId(project.id);
    const allSources = await this.sourceRepo.listByProjectId(project.id);
    const allEvidence = await this.evidenceRepo.listByProjectId(project.id);
    const totalQueries = iterations.reduce((acc, it) => acc + it.queriesExecuted.length, 0);

    return ok({
      projectId: project.id,
      topicId: topic.id,
      plan,
      iterations,
      brief,
      finalAction,
      stopReason,
      totalIterations: currentIterationNumber,
      totalQueriesExecuted: totalQueries,
      totalSourcesAcquired: allSources.length,
      totalEvidenceCaptured: allEvidence.length,
      totalClaimsEvaluated: allClaims.length,
      unresolvedGapsCount: brief.researchGaps.length
    });
  }

  private async recordEvent(
    projectId: string,
    type: any,
    actor: string,
    summary: string,
    metadata?: Record<string, unknown> | null
  ): Promise<void> {
    await this.eventRepo.append({
      id: `revt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      type,
      timestamp: new Date().toISOString(),
      actor,
      summary,
      metadata: {
        orchestratorVersion: ORCHESTRATOR_VERSION,
        researchPolicyVersion: RESEARCH_POLICY_VERSION,
        ...metadata
      }
    });
  }
}
