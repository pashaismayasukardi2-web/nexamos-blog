/**
 * NexaMOS Research Management Service
 *
 * Sourced from NexaMOS Blog Phase 2A specifications
 * Application & domain orchestration layer untuk research engine:
 * Mengelola sumber, bukti, klaim, relasi N:N, evaluasi kecukupan bukti,
 * dan sintesis kesiapan editorial secara deterministik dan auditable.
 */

import type {
  ResearchProject,
  CreateResearchProjectInput,
  UpdateResearchProjectInput
} from './domain/research-project.ts';
import type {
  ResearchSource,
  CreateResearchSourceInput,
  UpdateResearchSourceInput
} from './domain/research-source.ts';
import type {
  ResearchClaim,
  CreateResearchClaimInput,
  UpdateResearchClaimInput
} from './domain/research-claim.ts';
import type {
  ResearchEvidence,
  CreateResearchEvidenceInput,
  UpdateResearchEvidenceInput
} from './domain/research-evidence.ts';
import type {
  ClaimEvidenceRelation,
  EvidenceRelationType,
  RelationStrength
} from './domain/evidence-relation.ts';
import type {
  ResearchFinding,
  CreateResearchFindingInput
} from './domain/research-finding.ts';
import type {
  ResearchEvent,
  ResearchEventType
} from './domain/research-event.ts';
import type {
  ResearchSynthesis,
  RecommendedTopicAction
} from './domain/research-synthesis.ts';
import type {
  Result,
  ResearchDomainError
} from './domain/research-result.ts';
import {
  ok,
  err,
  createResearchDomainError
} from './domain/research-result.ts';

import { validateResearchTransition } from './domain/research-status.ts';
import { evaluateClaimGrounding } from './claim-grounding-evaluator.ts';
import type { ClaimGroundingResult } from './claim-grounding-evaluator.ts';
import { evaluateEvidenceSufficiency } from './evidence-sufficiency.ts';
import type { EvidenceSufficiencyResult } from './evidence-sufficiency.ts';
import { synthesizeResearch } from './research-synthesizer.ts';

import type { ResearchProjectRepository } from './repository/research-project-repository.ts';
import type { ResearchSourceRepository } from './repository/research-source-repository.ts';
import type { ResearchClaimRepository } from './repository/research-claim-repository.ts';
import type { ResearchEvidenceRepository } from './repository/research-evidence-repository.ts';
import type { ClaimEvidenceRelationRepository } from './repository/claim-evidence-relation-repository.ts';
import type { ResearchFindingRepository } from './repository/research-finding-repository.ts';
import type { ResearchEventRepository } from './repository/research-event-repository.ts';

export interface ResearchManagementServiceDependencies {
  projectRepo: ResearchProjectRepository;
  sourceRepo: ResearchSourceRepository;
  claimRepo: ResearchClaimRepository;
  evidenceRepo: ResearchEvidenceRepository;
  relationRepo: ClaimEvidenceRelationRepository;
  findingRepo: ResearchFindingRepository;
  eventRepo: ResearchEventRepository;
}

export class ResearchManagementService {
  private projectRepo: ResearchProjectRepository;
  private sourceRepo: ResearchSourceRepository;
  private claimRepo: ResearchClaimRepository;
  private evidenceRepo: ResearchEvidenceRepository;
  private relationRepo: ClaimEvidenceRelationRepository;
  private findingRepo: ResearchFindingRepository;
  private eventRepo: ResearchEventRepository;

  constructor(deps: ResearchManagementServiceDependencies) {
    this.projectRepo = deps.projectRepo;
    this.sourceRepo = deps.sourceRepo;
    this.claimRepo = deps.claimRepo;
    this.evidenceRepo = deps.evidenceRepo;
    this.relationRepo = deps.relationRepo;
    this.findingRepo = deps.findingRepo;
    this.eventRepo = deps.eventRepo;
  }

  // ==========================================================================
  // 1. RESEARCH PROJECT LIFECYCLE
  // ==========================================================================

  async createResearchProject(
    input: CreateResearchProjectInput,
    actor = 'research-lead'
  ): Promise<Result<ResearchProject, ResearchDomainError>> {
    if (!input.title || input.title.trim().length === 0) {
      return err(createResearchDomainError('VALIDATION_FAILED', 'Title proyek riset wajib diisi.'));
    }
    if (!input.topicId || input.topicId.trim().length === 0) {
      return err(createResearchDomainError('VALIDATION_FAILED', 'TopicId wajib dihubungkan ke proyek riset.'));
    }
    if (!input.objective || input.objective.trim().length === 0) {
      return err(createResearchDomainError('VALIDATION_FAILED', 'Objective riset wajib dirumuskan.'));
    }

    const now = new Date().toISOString();
    const id = input.id || `res-proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    if (await this.projectRepo.existsById(id)) {
      return err(createResearchDomainError('DUPLICATE_PROJECT_ID', `Proyek riset '${id}' sudah ada.`));
    }

    const project: ResearchProject = {
      ...input,
      id,
      status: input.status || 'PLANNED',
      researchQuestions: input.researchQuestions || [],
      createdAt: now,
      updatedAt: now
    };

    const saveRes = await this.projectRepo.create(project);
    if (!saveRes.ok) return saveRes;

    await this.recordEvent(
      project.id,
      'RESEARCH_PROJECT_CREATED',
      actor,
      `Proyek riset '${project.title}' dibuat untuk topik '${project.topicId}'.`
    );

    return ok(saveRes.value);
  }

  async startCollection(
    projectId: string,
    actor = 'researcher'
  ): Promise<Result<ResearchProject, ResearchDomainError>> {
    const project = await this.projectRepo.getById(projectId);
    if (!project) {
      return err(createResearchDomainError('PROJECT_NOT_FOUND', `Proyek riset '${projectId}' tidak ditemukan.`));
    }

    const trans = validateResearchTransition(project.status, 'COLLECTING');
    if (!trans.allowed) {
      return err(createResearchDomainError('INVALID_RESEARCH_TRANSITION', trans.reason || 'Transisi ditolak.'));
    }

    project.status = 'COLLECTING';
    project.updatedAt = new Date().toISOString();

    const updateRes = await this.projectRepo.update(project);
    if (!updateRes.ok) return updateRes;

    await this.recordEvent(
      projectId,
      'RESEARCH_STARTED',
      actor,
      `Fase pengumpulan sumber dan bukti dimulai untuk proyek '${project.title}'.`
    );

    return ok(updateRes.value);
  }

  // ==========================================================================
  // 2. SOURCES MANAGEMENT
  // ==========================================================================

  async addSource(
    projectId: string,
    input: CreateResearchSourceInput,
    actor = 'researcher'
  ): Promise<Result<ResearchSource, ResearchDomainError>> {
    const project = await this.projectRepo.getById(projectId);
    if (!project) {
      return err(createResearchDomainError('PROJECT_NOT_FOUND', `Proyek riset '${projectId}' tidak ditemukan.`));
    }

    if (!input.title || input.title.trim().length === 0) {
      return err(createResearchDomainError('VALIDATION_FAILED', 'Title sumber wajib diisi.'));
    }

    const now = new Date().toISOString();
    const id = (input as { id?: string }).id || `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    if (await this.sourceRepo.existsById(id)) {
      return err(createResearchDomainError('DUPLICATE_SOURCE_ID', `Sumber '${id}' sudah ada.`));
    }

    const source: ResearchSource = {
      ...input,
      id,
      researchProjectId: projectId,
      createdAt: now,
      updatedAt: now
    };

    const saveRes = await this.sourceRepo.create(source);
    if (!saveRes.ok) return saveRes;

    await this.recordEvent(
      projectId,
      'SOURCE_ADDED',
      actor,
      `Sumber '${source.title}' (${source.type} - ${source.evidenceLevel}) ditambahkan ke riset.`
    );

    return ok(saveRes.value);
  }

  // ==========================================================================
  // 3. EVIDENCE CAPTURE
  // ==========================================================================

  async addEvidence(
    projectId: string,
    input: CreateResearchEvidenceInput,
    actor = 'researcher'
  ): Promise<Result<ResearchEvidence, ResearchDomainError>> {
    const project = await this.projectRepo.getById(projectId);
    if (!project) {
      return err(createResearchDomainError('PROJECT_NOT_FOUND', `Proyek riset '${projectId}' tidak ditemukan.`));
    }

    const source = await this.sourceRepo.getById(input.sourceId);
    if (!source) {
      return err(createResearchDomainError('SOURCE_NOT_FOUND', `Sumber '${input.sourceId}' tidak ditemukan.`));
    }

    if (!input.content || input.content.trim().length === 0) {
      return err(createResearchDomainError('VALIDATION_FAILED', 'Konten evidence tidak boleh kosong.'));
    }

    const now = new Date().toISOString();
    const id = (input as { id?: string }).id || `evi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    if (await this.evidenceRepo.existsById(id)) {
      return err(createResearchDomainError('DUPLICATE_EVIDENCE_ID', `Bukti '${id}' sudah ada.`));
    }

    const evidence: ResearchEvidence = {
      ...input,
      id,
      researchProjectId: projectId,
      evidenceLevel: input.evidenceLevel || source.evidenceLevel,
      createdAt: now,
      updatedAt: now
    };

    const saveRes = await this.evidenceRepo.create(evidence);
    if (!saveRes.ok) return saveRes;

    await this.recordEvent(
      projectId,
      'EVIDENCE_CAPTURED',
      actor,
      `Evidence poin dari sumber '${source.title}' berhasil dicatat (Level: ${evidence.evidenceLevel}).`
    );

    return ok(saveRes.value);
  }

  // ==========================================================================
  // 4. CLAIMS & CLAIM-EVIDENCE RELATIONS (N:N)
  // ==========================================================================

  async addClaim(
    projectId: string,
    input: CreateResearchClaimInput,
    actor = 'researcher'
  ): Promise<Result<ResearchClaim, ResearchDomainError>> {
    const project = await this.projectRepo.getById(projectId);
    if (!project) {
      return err(createResearchDomainError('PROJECT_NOT_FOUND', `Proyek riset '${projectId}' tidak ditemukan.`));
    }

    if (!input.statement || input.statement.trim().length === 0) {
      return err(createResearchDomainError('VALIDATION_FAILED', 'Pernyataan klaim tidak boleh kosong.'));
    }

    const now = new Date().toISOString();
    const id = (input as { id?: string }).id || `clm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    if (await this.claimRepo.existsById(id)) {
      return err(createResearchDomainError('DUPLICATE_CLAIM_ID', `Klaim '${id}' sudah ada.`));
    }

    const claim: ResearchClaim = {
      ...input,
      id,
      researchProjectId: projectId,
      status: input.status || 'UNVERIFIED',
      createdAt: now,
      updatedAt: now
    };

    const saveRes = await this.claimRepo.create(claim);
    if (!saveRes.ok) return saveRes;

    await this.recordEvent(
      projectId,
      'CLAIM_CREATED',
      actor,
      `Klaim '${claim.statement.slice(0, 60)}...' dicatat dengan status UNVERIFIED.`
    );

    return ok(saveRes.value);
  }

  async linkClaimEvidence(
    projectId: string,
    claimId: string,
    evidenceId: string,
    relation: EvidenceRelationType = 'SUPPORTS',
    strength: RelationStrength = 'STRONG',
    notes?: string,
    actor = 'researcher'
  ): Promise<Result<ClaimEvidenceRelation, ResearchDomainError>> {
    const claim = await this.claimRepo.getById(claimId);
    if (!claim) {
      return err(createResearchDomainError('CLAIM_NOT_FOUND', `Klaim '${claimId}' tidak ditemukan.`));
    }

    const evidence = await this.evidenceRepo.getById(evidenceId);
    if (!evidence) {
      return err(createResearchDomainError('EVIDENCE_NOT_FOUND', `Bukti '${evidenceId}' tidak ditemukan.`));
    }

    const link: ClaimEvidenceRelation = {
      claimId,
      evidenceId,
      relation,
      strength,
      notes: notes || null,
      createdAt: new Date().toISOString()
    };

    const saved = await this.relationRepo.add(link);

    await this.recordEvent(
      projectId,
      'EVIDENCE_LINKED',
      actor,
      `Bukti '${evidenceId}' dihubungkan ke klaim '${claimId}' dengan relasi ${relation} (${strength}).`
    );

    // Otomatis jalankan re-evaluasi grounding klaim terkait
    await this.evaluateClaim(projectId, claimId, actor);

    return ok(saved);
  }

  // ==========================================================================
  // 5. EVALUATION & SUFFICIENCY
  // ==========================================================================

  async evaluateClaim(
    projectId: string,
    claimId: string,
    actor = 'grounding-evaluator'
  ): Promise<Result<ClaimGroundingResult, ResearchDomainError>> {
    const claim = await this.claimRepo.getById(claimId);
    if (!claim) {
      return err(createResearchDomainError('CLAIM_NOT_FOUND', `Klaim '${claimId}' tidak ditemukan.`));
    }

    const [relations, evidence, sources] = await Promise.all([
      this.relationRepo.listByClaimId(claimId),
      this.evidenceRepo.listByProjectId(projectId),
      this.sourceRepo.listByProjectId(projectId)
    ]);

    const result = evaluateClaimGrounding({
      claim,
      relations,
      evidence,
      sources
    });

    // Update status klaim di repository jika ada perubahan
    if (claim.status !== result.claimStatus) {
      claim.status = result.claimStatus;
      claim.updatedAt = new Date().toISOString();
      await this.claimRepo.update(claim);

      await this.recordEvent(
        projectId,
        'CLAIM_EVALUATED',
        actor,
        `Klaim '${claim.statement.slice(0, 50)}...' dievaluasi: status berubah menjadi ${result.claimStatus}.`
      );
    }

    return ok(result);
  }

  async evaluateResearchSufficiency(
    projectId: string
  ): Promise<Result<EvidenceSufficiencyResult, ResearchDomainError>> {
    const project = await this.projectRepo.getById(projectId);
    if (!project) {
      return err(createResearchDomainError('PROJECT_NOT_FOUND', `Proyek riset '${projectId}' tidak ditemukan.`));
    }

    const [claims, sources, allRelations, allEvidence] = await Promise.all([
      this.claimRepo.listByProjectId(projectId),
      this.sourceRepo.listByProjectId(projectId),
      this.relationRepo.listAll(),
      this.evidenceRepo.listByProjectId(projectId)
    ]);

    const claimGroundingResults: ClaimGroundingResult[] = [];
    for (const claim of claims) {
      const gRes = evaluateClaimGrounding({
        claim,
        relations: allRelations,
        evidence: allEvidence,
        sources
      });
      claimGroundingResults.push(gRes);
    }

    const sufficiency = evaluateEvidenceSufficiency({
      requiredEvidenceLevel: project.requiredEvidenceLevel,
      claims,
      claimGroundingResults,
      sources
    });

    return ok(sufficiency);
  }

  // ==========================================================================
  // 6. FINDINGS & SYNTHESIS
  // ==========================================================================

  async createFinding(
    projectId: string,
    input: CreateResearchFindingInput,
    actor = 'analyst'
  ): Promise<Result<ResearchFinding, ResearchDomainError>> {
    const project = await this.projectRepo.getById(projectId);
    if (!project) {
      return err(createResearchDomainError('PROJECT_NOT_FOUND', `Proyek riset '${projectId}' tidak ditemukan.`));
    }

    if (!input.statement || input.statement.trim().length === 0) {
      return err(createResearchDomainError('VALIDATION_FAILED', 'Pernyataan temuan tidak boleh kosong.'));
    }

    const now = new Date().toISOString();
    const id = (input as { id?: string }).id || `fnd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const finding: ResearchFinding = {
      ...input,
      id,
      researchProjectId: projectId,
      createdAt: now,
      updatedAt: now
    };

    const saveRes = await this.findingRepo.create(finding);
    if (!saveRes.ok) return saveRes;

    await this.recordEvent(
      projectId,
      'FINDING_CREATED',
      actor,
      `Temuan baru dirumuskan: '${finding.statement.slice(0, 60)}...' (Keyakinan: ${finding.confidence}).`
    );

    return ok(saveRes.value);
  }

  async synthesize(
    projectId: string,
    actor = 'research-synthesizer'
  ): Promise<Result<ResearchSynthesis, ResearchDomainError>> {
    const project = await this.projectRepo.getById(projectId);
    if (!project) {
      return err(createResearchDomainError('PROJECT_NOT_FOUND', `Proyek riset '${projectId}' tidak ditemukan.`));
    }

    // Transisi status jika masih COLLECTING
    if (project.status === 'COLLECTING') {
      project.status = 'EVALUATING';
      await this.projectRepo.update(project);
    }

    const [claims, findings, sources, allRelations, allEvidence] = await Promise.all([
      this.claimRepo.listByProjectId(projectId),
      this.findingRepo.listByProjectId(projectId),
      this.sourceRepo.listByProjectId(projectId),
      this.relationRepo.listAll(),
      this.evidenceRepo.listByProjectId(projectId)
    ]);

    // Evaluasi grounding tiap klaim
    const claimGroundingResults: ClaimGroundingResult[] = [];
    for (const c of claims) {
      const gRes = evaluateClaimGrounding({
        claim: c,
        relations: allRelations,
        evidence: allEvidence,
        sources
      });
      claimGroundingResults.push(gRes);
    }

    // Evaluasi sufficiency
    const sufficiency = evaluateEvidenceSufficiency({
      requiredEvidenceLevel: project.requiredEvidenceLevel,
      claims,
      claimGroundingResults,
      sources
    });

    // Jalankan sintesis deterministik
    const synthesis = synthesizeResearch({
      project,
      claims,
      findings,
      questions: project.researchQuestions,
      sufficiency
    });

    // Update status proyek riset berdasarkan kesiapan
    if (synthesis.readiness === 'READY_FOR_EDITORIAL') {
      project.status = 'READY';
      project.updatedAt = new Date().toISOString();
      await this.projectRepo.update(project);

      await this.recordEvent(
        projectId,
        'RESEARCH_READY',
        actor,
        `Proyek riset mencapai status READY_FOR_EDITORIAL. Rekomendasi aksi topik: ${synthesis.recommendedTopicAction}.`
      );
    } else {
      project.status = 'SYNTHESIZING';
      project.updatedAt = new Date().toISOString();
      await this.projectRepo.update(project);
    }

    await this.recordEvent(
      projectId,
      'SYNTHESIS_CREATED',
      actor,
      `Sintesis riset diperbarui. Kesiapan: ${synthesis.readiness}.`,
      { readiness: synthesis.readiness, gapsCount: synthesis.gaps.length }
    );

    return ok(synthesis);
  }

  async completeResearch(
    projectId: string,
    actor = 'research-lead'
  ): Promise<Result<ResearchProject, ResearchDomainError>> {
    const project = await this.projectRepo.getById(projectId);
    if (!project) {
      return err(createResearchDomainError('PROJECT_NOT_FOUND', `Proyek riset '${projectId}' tidak ditemukan.`));
    }

    const trans = validateResearchTransition(project.status, 'COMPLETED');
    if (!trans.allowed) {
      return err(createResearchDomainError('INVALID_RESEARCH_TRANSITION', trans.reason || 'Transisi ditolak.'));
    }

    const now = new Date().toISOString();
    project.status = 'COMPLETED';
    project.completedAt = now;
    project.updatedAt = now;

    const saveRes = await this.projectRepo.update(project);
    if (!saveRes.ok) return saveRes;

    await this.recordEvent(
      projectId,
      'RESEARCH_COMPLETED',
      actor,
      `Proyek riset '${project.title}' selesai pada ${now}.`
    );

    return ok(saveRes.value);
  }

  async blockResearch(
    projectId: string,
    reason: string,
    actor = 'research-lead'
  ): Promise<Result<ResearchProject, ResearchDomainError>> {
    const project = await this.projectRepo.getById(projectId);
    if (!project) {
      return err(createResearchDomainError('PROJECT_NOT_FOUND', `Proyek riset '${projectId}' tidak ditemukan.`));
    }

    const trans = validateResearchTransition(project.status, 'BLOCKED');
    if (!trans.allowed) {
      return err(createResearchDomainError('INVALID_RESEARCH_TRANSITION', trans.reason || 'Transisi ditolak.'));
    }

    project.status = 'BLOCKED';
    project.updatedAt = new Date().toISOString();

    const saveRes = await this.projectRepo.update(project);
    if (!saveRes.ok) return saveRes;

    await this.recordEvent(
      projectId,
      'RESEARCH_BLOCKED',
      actor,
      `Proyek riset tertahan (Blocked): ${reason}.`
    );

    return ok(saveRes.value);
  }

  // ==========================================================================
  // 7. READ & INTEGRATION HOOKS
  // ==========================================================================

  async getProject(projectId: string): Promise<ResearchProject | null> {
    return this.projectRepo.getById(projectId);
  }

  async listProjectsByTopicId(topicId: string): Promise<ResearchProject[]> {
    return this.projectRepo.listByTopicId(topicId);
  }

  async getProjectHistory(projectId: string): Promise<ResearchEvent[]> {
    return this.eventRepo.listByProjectId(projectId);
  }

  /**
   * Topic Integration Hook:
   * Mengembalikan rekomendasi keputusan untuk Topic Management Service
   * TANPA memutasi Topic secara sepihak.
   */
  async getTopicRequalificationRecommendation(
    projectId: string
  ): Promise<Result<{ topicId: string; recommendedAction: RecommendedTopicAction; reason: string }, ResearchDomainError>> {
    const synthRes = await this.synthesize(projectId);
    if (!synthRes.ok) return err(synthRes.error);

    const synth = synthRes.value;

    return ok({
      topicId: synth.topicId,
      recommendedAction: synth.recommendedTopicAction,
      reason: synth.evidenceSummary
    });
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private async recordEvent(
    projectId: string,
    type: ResearchEventType,
    actor: string,
    summary: string,
    metadata?: Record<string, unknown> | null
  ): Promise<ResearchEvent> {
    const event: ResearchEvent = {
      id: `revt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      type,
      timestamp: new Date().toISOString(),
      actor,
      summary,
      metadata
    };

    return this.eventRepo.append(event);
  }
}
