/**
 * NexaMOS Research Brief Builder
 *
 * Sourced from NexaMOS Blog Phase 2D specifications
 * Bertanggung jawab menyusun ResearchBrief resmi dengan:
 * 1. Menjaga Integritas Sitasi (memverifikasi bahwa setiap sourceId, evidenceId,
 *    dan claimId benar-benar terdaftar di repository).
 * 2. Menentukan status kesiapan ResearchBriefReadiness secara deterministik
 *    (hanya READY_FOR_EDITORIAL jika Phase 2A sufficiency policy mengizinkan).
 */

import type {
  ResearchBrief,
  ResearchBriefReadiness,
  ResearchBriefSourceEntry,
  ResearchBriefEvidenceEntry
} from './research-brief.ts';
import type { ResearchProject } from '../domain/research-project.ts';
import type { ResearchSynthesis } from '../domain/research-synthesis.ts';
import type { ResearchSourceRepository } from '../repository/research-source-repository.ts';
import type { ResearchEvidenceRepository } from '../repository/research-evidence-repository.ts';
import type { ResearchClaimRepository } from '../repository/research-claim-repository.ts';
import type { ResearchFindingRepository } from '../repository/research-finding-repository.ts';
import type { EvidenceSufficiencyResult } from '../evidence-sufficiency.ts';
import type { Result, ResearchDomainError } from '../domain/research-result.ts';
import { ok, err, createResearchDomainError } from '../domain/research-result.ts';
import type { AISynthesisAssistance } from './ai-research-provider.ts';

export interface BuildResearchBriefInput {
  project: ResearchProject;
  synthesis: ResearchSynthesis;
  sufficiencyResult: EvidenceSufficiencyResult;
  aiAssistance?: AISynthesisAssistance | null;
  requiresHumanReview?: boolean;
}

export class ResearchBriefBuilder {
  private sourceRepo: ResearchSourceRepository;
  private evidenceRepo: ResearchEvidenceRepository;
  private claimRepo: ResearchClaimRepository;
  private findingRepo: ResearchFindingRepository;

  constructor(
    sourceRepo: ResearchSourceRepository,
    evidenceRepo: ResearchEvidenceRepository,
    claimRepo: ResearchClaimRepository,
    findingRepo: ResearchFindingRepository
  ) {
    this.sourceRepo = sourceRepo;
    this.evidenceRepo = evidenceRepo;
    this.claimRepo = claimRepo;
    this.findingRepo = findingRepo;
  }

  /**
   * Menyusun ResearchBrief terverifikasi dengan pemeriksaan integritas sitasi repositori.
   */
  async buildBrief(input: BuildResearchBriefInput): Promise<Result<ResearchBrief, ResearchDomainError>> {
    const { project, synthesis, sufficiencyResult, aiAssistance, requiresHumanReview } = input;
    const now = new Date().toISOString();

    // 1. Verifikasi Integritas Sitasi Repositori
    // Pastikan semua klaim terdaftar di repository
    const allClaims = [
      ...synthesis.supportedClaims,
      ...synthesis.disputedClaims
    ];

    for (const c of allClaims) {
      const exists = await this.claimRepo.existsById(c.id);
      if (!exists) {
        return err(
          createResearchDomainError(
            'CITATION_REFERENCE_INVALID',
            `Integritas sitasi gagal: Claim '${c.id}' tidak terdaftar di repositori riset.`
          )
        );
      }
    }

    // Dapatkan semua sumber dan bukti proyek dari repository
    const projectSources = await this.sourceRepo.listByProjectId(project.id);
    const projectEvidence = await this.evidenceRepo.listByProjectId(project.id);

    // Ambil partially supported, unverified, dan unsupported claims dari repositori
    const allProjectClaims = await this.claimRepo.listByProjectId(project.id);
    const partiallySupportedClaims = allProjectClaims.filter((c) => c.status === 'PARTIALLY_SUPPORTED');
    const unverifiedClaims = allProjectClaims.filter((c) => c.status === 'UNVERIFIED');
    const unsupportedClaims = allProjectClaims.filter(
      (c) => c.status === 'INSUFFICIENT_EVIDENCE' || c.status === 'CONTRADICTED'
    );

    // 2. Bangun Indeks Sumber Terverifikasi
    const sourceIndex: ResearchBriefSourceEntry[] = projectSources.map((s) => ({
      sourceId: s.id,
      title: s.title,
      url: s.url || undefined,
      sourceType: s.type,
      authorityScore: s.qualityAssessment?.authority ?? 70,
      freshnessStatus: s.recencyRisk === 'HIGH' ? 'AGING' : 'FRESH'
    }));

    // 3. Bangun Indeks Bukti Terverifikasi (Hanya bukti sah)
    const evidenceIndex: ResearchBriefEvidenceEntry[] = [];
    for (const ev of projectEvidence) {
      // Verifikasi relasi integritas: pastikan sourceId dari evidence benar-benar ada
      const sourceExists = await this.sourceRepo.existsById(ev.sourceId);
      if (!sourceExists) {
        return err(
          createResearchDomainError(
            'CITATION_REFERENCE_INVALID',
            `Integritas sitasi gagal: Evidence '${ev.id}' merujuk pada Source '${ev.sourceId}' yang tidak terdaftar di repositori.`
          )
        );
      }

      // Bukti diverifikasi berdasarkan integritas faktual sumber riil, bukan semata publicationAllowed
      const isVerified = ev.verified !== undefined ? ev.verified : ev.publicationAllowed;

      evidenceIndex.push({
        evidenceId: ev.id,
        sourceId: ev.sourceId,
        quote: ev.content,
        level: ev.evidenceLevel,
        verified: isVerified,
        provenanceType: ev.provenanceType,
        sourceUrl: ev.sourceUrl || undefined
      });
    }

    // Pemisahan eksplisit: Pengetahuan internal dan analisis orisinal
    const internalKnowledge = projectEvidence
      .filter(
        (e) =>
          e.provenanceType === 'INTERNAL_KNOWLEDGE' ||
          projectSources.find((s) => s.id === e.sourceId)?.isInternal
      )
      .map((e) => ({
        id: e.id,
        content: e.content,
        source: projectSources.find((s) => s.id === e.sourceId)?.title || e.sourceId,
        notes: e.notes || undefined
      }));

    const originalAnalysis = projectEvidence
      .filter((e) => e.provenanceType === 'ORIGINAL_ANALYSIS')
      .map((e) => ({
        id: e.id,
        content: e.content,
        framework: e.notes || undefined
      }));

    // 4. Verifikasi Findings
    const keyFindings = await this.findingRepo.listByProjectId(project.id);

    // 5. Tentukan Status Kesiapan Brief Secara Deterministik
    // AI TIDAK DAPAT MENGUBAH READINESS MENJADI READY_FOR_EDITORIAL
    let readiness: ResearchBriefReadiness = 'NOT_READY';
    let readinessReason = 'Kecukupan bukti riset belum memadai.';

    if (requiresHumanReview || sufficiencyResult.status === 'REVIEW_REQUIRED') {
      readiness = 'HUMAN_REVIEW_REQUIRED';
      readinessReason = sufficiencyResult.summary || 'Dibutuhkan review manusia karena adanya kontradiksi atau bukti lemah.';
    } else if (sufficiencyResult.status === 'SUFFICIENT' && synthesis.readiness === 'READY_FOR_EDITORIAL') {
      readiness = 'READY_FOR_EDITORIAL';
      readinessReason = 'Seluruh kriteria kecukupan bukti dan validasi klaim telah terpenuhi secara kanonikal.';
    } else {
      readiness = 'NOT_READY';
      readinessReason = sufficiencyResult.summary || 'Bukti belum memenuhi ambang batas kecukupan.';
    }

    const briefId = `rbrief-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const brief: ResearchBrief = {
      id: briefId,
      topicId: project.topicId,
      researchProjectId: project.id,
      objective: project.objective,

      answeredQuestions: synthesis.answeredQuestions,
      openQuestions: synthesis.openQuestions,

      supportedClaims: synthesis.supportedClaims,
      partiallySupportedClaims,
      disputedClaims: synthesis.disputedClaims,
      unverifiedClaims,
      unsupportedClaims,

      internalKnowledge: internalKnowledge.length > 0 ? internalKnowledge : undefined,
      originalAnalysis: originalAnalysis.length > 0 ? originalAnalysis : undefined,

      keyFindings,
      limitations: synthesis.limitations,
      researchGaps: synthesis.gaps,

      recommendedEditorialAngle: aiAssistance?.recommendedEditorialAngle,

      sourceIndex,
      evidenceIndex,

      readiness,
      readinessReason,
      generatedAt: now
    };

    return ok(brief);
  }
}
