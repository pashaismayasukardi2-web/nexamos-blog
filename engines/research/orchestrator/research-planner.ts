/**
 * NexaMOS Research Planner
 *
 * Sourced from NexaMOS Blog Phase 2D specifications
 * Menerima proposal rencana riset dari AI, memvalidasinya terhadap kebijakan kanonikal
 * Topic & EvidencePlan, dan menghasilkan ResearchPlan resmi jika memenuhi syarat.
 */

import type { Topic } from '../../ideation/domain/topic.types.ts';
import type { EvidenceLevel } from '../../ideation/domain/evidence-level.ts';
import type { ResearchPlan, ResearchPlanProposal } from './research-plan.ts';
import type { ResearchQuestion } from '../domain/research-question.ts';
import type { Result, ResearchDomainError } from '../domain/research-result.ts';
import { ok, err, createResearchDomainError } from '../domain/research-result.ts';
import type { AIResearchProvider } from './ai-research-provider.ts';
import type { ResearchEventRepository } from '../repository/research-event-repository.ts';

const EVIDENCE_LEVEL_RANK: Record<EvidenceLevel, number> = {
  E0: 0,
  E1: 1,
  E2: 2,
  E3: 3,
  E4: 4
};

export const MAX_ALLOWED_RESEARCH_ITERATIONS = 10;
export const DEFAULT_MAX_ITERATIONS = 4;

export interface ResearchPlannerOptions {
  actor?: string;
  maxIterationsLimit?: number;
}

export class ResearchPlanner {
  private aiProvider: AIResearchProvider;
  private eventRepo?: ResearchEventRepository;
  private maxIterationsLimit: number;

  constructor(
    aiProvider: AIResearchProvider,
    eventRepo?: ResearchEventRepository,
    options: ResearchPlannerOptions = {}
  ) {
    this.aiProvider = aiProvider;
    this.eventRepo = eventRepo;
    this.maxIterationsLimit = options.maxIterationsLimit || MAX_ALLOWED_RESEARCH_ITERATIONS;
  }

  /**
   * Mengajukan dan memvalidasi rencana riset deterministik untuk suatu topik.
   */
  async planTopicResearch(
    topic: Topic,
    options: { actor?: string; existingProject?: any } = {}
  ): Promise<Result<ResearchPlan, ResearchDomainError>> {
    const actor = options.actor || 'ai-research-planner';

    // 1. Dapatkan proposal dari AI provider
    const proposalRes = await this.aiProvider.planResearch({
      topic,
      existingProject: options.existingProject
    });

    if (!proposalRes.ok) {
      return err(proposalRes.error);
    }

    const proposal = proposalRes.value;

    // 2. Deterministic Validation Policy
    const validationRes = this.validateProposal(proposal, topic);
    if (!validationRes.ok) {
      return err(validationRes.error);
    }

    // 3. Bangun ResearchPlan kanonikal
    const planId = `rplan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const questions: ResearchQuestion[] = proposal.researchQuestions.map((q, idx) => {
      let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
      if (q.priority === 'CRITICAL') priority = 'HIGH';
      else if (q.priority === 'IMPORTANT') priority = 'MEDIUM';
      else if (q.priority === 'EXPLORATORY') priority = 'LOW';

      return {
        id: `rq-${planId}-${idx + 1}`,
        question: q.question.trim(),
        priority,
        status: 'OPEN'
      };
    });

    const maxIterations = Math.min(
      Math.max(1, proposal.suggestedIterations || DEFAULT_MAX_ITERATIONS),
      this.maxIterationsLimit
    );

    const plan: ResearchPlan = {
      id: planId,
      topicId: topic.id,
      objective: proposal.objective.trim(),
      researchQuestions: questions,
      requiredEvidenceLevel: proposal.requiredEvidenceLevel,
      preferredSourceTypes: proposal.preferredSourceTypes || ['INDUSTRY_RESEARCH'],
      counterEvidenceRequired: proposal.counterEvidenceRequired ?? true,
      freshnessRequirement: proposal.freshnessRequirement || 'MEDIUM',
      maxResearchIterations: maxIterations,
      createdAt: now
    };

    // 4. Catat event audit jika eventRepo tersedia
    if (this.eventRepo) {
      await this.eventRepo.append({
        id: `revt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        projectId: topic.id,
        type: 'RESEARCH_PLAN_CREATED',
        timestamp: now,
        actor,
        summary: `ResearchPlan '${plan.id}' berhasil dibuat dengan ${plan.researchQuestions.length} pertanyaan riset.`,
        metadata: {
          planId: plan.id,
          topicId: topic.id,
          maxIterations: plan.maxResearchIterations,
          provider: this.aiProvider.getMetadata()
        }
      });
    }

    return ok(plan);
  }

  /**
   * Kebijakan validasi proposal rencana:
   * Menolak jika:
   * - research questions kosong
   * - requiredEvidenceLevel lebih rendah dari canonical topic policy
   * - objective kosong atau tidak relevan
   * - batas iterasi tidak valid
   */
  validateProposal(
    proposal: ResearchPlanProposal,
    topic: Topic
  ): Result<true, ResearchDomainError> {
    if (!proposal.objective || proposal.objective.trim().length === 0) {
      return err(
        createResearchDomainError('RESEARCH_PLAN_REJECTED', 'Proposal rencana ditolak: objective riset kosong.')
      );
    }

    if (!Array.isArray(proposal.researchQuestions) || proposal.researchQuestions.length === 0) {
      return err(
        createResearchDomainError(
          'RESEARCH_PLAN_REJECTED',
          'Proposal rencana ditolak: daftar research questions kosong.'
        )
      );
    }

    // Validasi pertanyaan tidak boleh berupa whitespace
    const hasInvalidQuestion = proposal.researchQuestions.some(
      (q) => !q.question || q.question.trim().length === 0
    );
    if (hasInvalidQuestion) {
      return err(
        createResearchDomainError(
          'RESEARCH_PLAN_REJECTED',
          'Proposal rencana ditolak: terdapat pertanyaan riset yang kosong.'
        )
      );
    }

    // Validasi level bukti kanonikal tidak boleh diturunkan oleh AI
    const topicMinLevel = topic.evidencePlan.requiredEvidenceLevel;
    const proposalLevel = proposal.requiredEvidenceLevel;

    if (EVIDENCE_LEVEL_RANK[proposalLevel] < EVIDENCE_LEVEL_RANK[topicMinLevel]) {
      return err(
        createResearchDomainError(
          'RESEARCH_PLAN_REJECTED',
          `Proposal rencana ditolak: requiredEvidenceLevel '${proposalLevel}' lebih rendah dari kebijakan kanonikal topik '${topicMinLevel}'.`
        )
      );
    }

    // Validasi iterasi
    if (
      proposal.suggestedIterations !== undefined &&
      (proposal.suggestedIterations <= 0 || proposal.suggestedIterations > this.maxIterationsLimit)
    ) {
      return err(
        createResearchDomainError(
          'RESEARCH_PLAN_REJECTED',
          `Proposal rencana ditolak: suggestedIterations '${proposal.suggestedIterations}' tidak valid (harus 1 - ${this.maxIterationsLimit}).`
        )
      );
    }

    return ok(true);
  }
}
