/**
 * NexaMOS Structured Output Validator
 *
 * Sourced from NexaMOS Blog Production Pilot 01 Step 3 specifications.
 * Memvalidasi dan memastikan respon JSON terstruktur dari LLM memenuhi
 * kontrak domain dan menegakkan batas grounding (anti-halusinasi).
 */

import { AIClientError } from './ai-http-client.ts';
import type {
  ResearchPlanProposal
} from '../../engines/research/orchestrator/research-plan.ts';
import type {
  AIGapAnalysisProposal,
  ProposedClaim,
  AISynthesisAssistance
} from '../../engines/research/orchestrator/ai-research-provider.ts';
import type { EditorialPlan } from '../../engines/editorial/editorial-plan.ts';
import type { GeneratedDraftPayload } from '../../engines/editorial/ai-editorial-provider.ts';
import type { ArticleSection } from '../../engines/editorial/article-section.ts';

export class StructuredOutputValidator {
  /**
   * Mengurai string JSON dari teks mentah respon model (membersihkan markdown block jika ada)
   */
  public static parseJson<T = any>(rawText: string): T {
    if (!rawText || rawText.trim().length === 0) {
      throw new AIClientError('AI_RESPONSE_EMPTY', 'Respon model kosong.');
    }

    let cleaned = rawText.trim();

    // Hapus blok kode markdown ```json ... ``` atau ``` ... ```
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    try {
      return JSON.parse(cleaned) as T;
    } catch (err: any) {
      throw new AIClientError(
        'AI_OUTPUT_INVALID',
        `Respon model gagal diurai sebagai JSON terstruktur: ${err.message}. Raw output snippet: ${cleaned.slice(0, 150)}`
      );
    }
  }

  /**
   * Validasi struktur ResearchPlanProposal
   */
  public static validateResearchPlan(data: any): ResearchPlanProposal {
    if (!data || typeof data !== 'object') {
      throw new AIClientError('AI_OUTPUT_INVALID', 'ResearchPlan proposal bukan object.');
    }

    if (!data.objective || typeof data.objective !== 'string' || data.objective.trim().length === 0) {
      throw new AIClientError('AI_OUTPUT_INVALID', 'ResearchPlan proposal kehilangan field wajib "objective".');
    }

    if (!Array.isArray(data.researchQuestions) || data.researchQuestions.length === 0) {
      throw new AIClientError('AI_OUTPUT_INVALID', 'ResearchPlan proposal harus memiliki minimal satu "researchQuestions".');
    }

    const validLevels = new Set(['E1', 'E2', 'E3', 'E4']);
    const validPriorities = new Set(['CRITICAL', 'IMPORTANT', 'EXPLORATORY']);

    const questions = data.researchQuestions.map((q: any, idx: number) => {
      if (!q || typeof q.question !== 'string' || q.question.trim().length === 0) {
        throw new AIClientError('AI_OUTPUT_INVALID', `Pertanyaan riset pada index ${idx} tidak memiliki string "question" yang valid.`);
      }
      return {
        question: q.question.trim(),
        targetEvidenceLevel: validLevels.has(q.targetEvidenceLevel) ? q.targetEvidenceLevel : 'E2',
        priority: validPriorities.has(q.priority) ? q.priority : 'IMPORTANT'
      };
    });

    return {
      objective: data.objective.trim(),
      researchQuestions: questions,
      requiredEvidenceLevel: validLevels.has(data.requiredEvidenceLevel) ? data.requiredEvidenceLevel : undefined,
      preferredSourceTypes: Array.isArray(data.preferredSourceTypes) ? data.preferredSourceTypes : undefined,
      counterEvidenceRequired: typeof data.counterEvidenceRequired === 'boolean' ? data.counterEvidenceRequired : undefined,
      freshnessRequirement: ['HIGH', 'MEDIUM', 'LOW'].includes(data.freshnessRequirement) ? data.freshnessRequirement : undefined,
      suggestedIterations: typeof data.suggestedIterations === 'number' ? data.suggestedIterations : undefined,
      rationale: typeof data.rationale === 'string' ? data.rationale.trim() : undefined
    };
  }

  /**
   * Validasi struktur AIGapAnalysisProposal
   */
  public static validateGapAnalysis(data: any): AIGapAnalysisProposal {
    if (!data || typeof data !== 'object') {
      throw new AIClientError('AI_OUTPUT_INVALID', 'AIGapAnalysisProposal bukan object.');
    }

    if (typeof data.gapSummary !== 'string' || data.gapSummary.trim().length === 0) {
      throw new AIClientError('AI_OUTPUT_INVALID', 'AIGapAnalysisProposal kehilangan "gapSummary".');
    }

    const priorityGaps = Array.isArray(data.priorityGaps)
      ? data.priorityGaps.map((g: any) => ({
          type: g?.type || 'EVIDENCE_ABSENT',
          description: typeof g?.description === 'string' ? g.description : 'Gap deskripsi tidak tersedia',
          claimId: g?.claimId || null,
          questionId: g?.questionId || null
        }))
      : [];

    const suggestedActions = Array.isArray(data.suggestedActions)
      ? data.suggestedActions.map((a: any) => ({
          actionType: a?.actionType || 'ACQUIRE_ADDITIONAL_SOURCES',
          description: typeof a?.description === 'string' ? a.description : 'Tindakan usulan',
          targetGapType: a?.targetGapType || 'EVIDENCE_ABSENT',
          priority: a?.priority || 'IMPORTANT',
          rationale: a?.rationale
        }))
      : [];

    return {
      gapSummary: data.gapSummary.trim(),
      priorityGaps,
      suggestedActions
    };
  }

  /**
   * Validasi struktur ProposedClaim[]
   */
  public static validateProposedClaims(data: any): ProposedClaim[] {
    const rawList = Array.isArray(data) ? data : Array.isArray(data?.claims) ? data.claims : null;

    if (!rawList) {
      throw new AIClientError('AI_OUTPUT_INVALID', 'ProposedClaims harus berupa array atau object dengan properti "claims".');
    }

    const validTypes = new Set(['FACTUAL', 'EMPIRICAL', 'ANALYTICAL', 'CAUSAL', 'PREDICTIVE', 'VALUE_JUDGMENT', 'DEFINITIONAL']);
    const validImportances = new Set(['CORE', 'SUPPORTING', 'PERIPHERAL']);

    return rawList.map((item: any, idx: number) => {
      if (!item || typeof item.statement !== 'string' || item.statement.trim().length === 0) {
        throw new AIClientError('AI_OUTPUT_INVALID', `Klaim usulan pada index ${idx} tidak memiliki "statement" yang valid.`);
      }

      const claimType = validTypes.has(item.claimType) ? item.claimType : 'ANALYTICAL';
      const importance = validImportances.has(item.importance) ? item.importance : 'SUPPORTING';

      return {
        statement: item.statement.trim(),
        claimType,
        importance,
        rationale: typeof item.rationale === 'string' ? item.rationale.trim() : undefined
      };
    });
  }

  /**
   * Validasi struktur AISynthesisAssistance
   */
  public static validateSynthesisAssistance(data: any): AISynthesisAssistance {
    if (!data || typeof data !== 'object') {
      throw new AIClientError('AI_OUTPUT_INVALID', 'AISynthesisAssistance bukan object.');
    }

    return {
      recommendedEditorialAngle: typeof data.recommendedEditorialAngle === 'string' && data.recommendedEditorialAngle.trim().length > 0
        ? data.recommendedEditorialAngle.trim()
        : 'Analisis berbasis bukti data primer dan sudut pandang orisinal.',
      editorialNotes: Array.isArray(data.editorialNotes) ? data.editorialNotes.map((n: any) => String(n)) : [],
      confidenceSummary: typeof data.confidenceSummary === 'string' ? data.confidenceSummary.trim() : 'Confidence memadai berbasis data yang tersedia.'
    };
  }

  /**
   * Validasi struktur EditorialPlan
   */
  public static validateEditorialPlan(data: any): EditorialPlan {
    if (!data || typeof data !== 'object') {
      throw new AIClientError('AI_OUTPUT_INVALID', 'EditorialPlan bukan object.');
    }

    if (!data.workingTitle || typeof data.workingTitle !== 'string' || data.workingTitle.trim().length === 0) {
      throw new AIClientError('AI_OUTPUT_INVALID', 'EditorialPlan kehilangan "workingTitle".');
    }

    if (!Array.isArray(data.sectionPlan) || data.sectionPlan.length === 0) {
      throw new AIClientError('AI_OUTPUT_INVALID', 'EditorialPlan harus memiliki minimal satu seksi dalam "sectionPlan".');
    }

    const sectionPlan = data.sectionPlan.map((s: any, idx: number) => {
      if (!s || typeof s.heading !== 'string' || s.heading.trim().length === 0) {
        throw new AIClientError('AI_OUTPUT_INVALID', `Seksi rencana pada index ${idx} kehilangan "heading".`);
      }
      return {
        heading: s.heading.trim(),
        purpose: s.purpose || 'CONTEXT',
        keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints.map((p: any) => String(p)) : [],
        plannedClaimIds: Array.isArray(s.plannedClaimIds) ? s.plannedClaimIds.map((id: any) => String(id)) : []
      };
    });

    return {
      workingTitle: data.workingTitle.trim(),
      thesis: typeof data.thesis === 'string' ? data.thesis.trim() : '',
      angle: typeof data.angle === 'string' ? data.angle.trim() : 'Perspektif mandiri',
      readerPromise: typeof data.readerPromise === 'string' ? data.readerPromise.trim() : 'Pemahaman mendalam',
      sectionPlan,
      claimsToUse: Array.isArray(data.claimsToUse) ? data.claimsToUse.map((id: any) => String(id)) : [],
      findingsToUse: Array.isArray(data.findingsToUse) ? data.findingsToUse.map((id: any) => String(id)) : [],
      counterpoints: Array.isArray(data.counterpoints) ? data.counterpoints.map((cp: any) => String(cp)) : [],
      intendedTakeaway: typeof data.intendedTakeaway === 'string' ? data.intendedTakeaway.trim() : ''
    };
  }

  /**
   * Validasi struktur GeneratedDraftPayload dan penegakan Grounding Guard (Claim & Citation Traceability)
   */
  public static validateArticleDraft(
    data: any,
    context?: {
      allowedClaimIds?: Set<string>;
      allowedSourceIds?: Set<string>;
      allowedEvidenceIds?: Set<string>;
    }
  ): GeneratedDraftPayload {
    if (!data || typeof data !== 'object') {
      throw new AIClientError('AI_OUTPUT_INVALID', 'ArticleDraft payload bukan object.');
    }

    if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
      throw new AIClientError('AI_OUTPUT_INVALID', 'ArticleDraft kehilangan "title".');
    }

    if (!Array.isArray(data.sections) || data.sections.length === 0) {
      throw new AIClientError('AI_OUTPUT_INVALID', 'ArticleDraft harus memiliki minimal satu seksi.');
    }

    const sections: ArticleSection[] = data.sections.map((s: any, idx: number) => {
      if (!s || typeof s.content !== 'string' || s.content.trim().length === 0) {
        throw new AIClientError('AI_OUTPUT_INVALID', `Seksi artikel pada index ${idx} tidak memiliki konten teks.`);
      }
      return {
        id: s.id || `sec-${idx + 1}`,
        heading: typeof s.heading === 'string' ? s.heading.trim() : `Bagian ${idx + 1}`,
        content: s.content.trim(),
        order: typeof s.order === 'number' ? s.order : idx + 1,
        purpose: s.purpose || 'CONTEXT',
        claimUsageIds: Array.isArray(s.claimUsageIds) ? s.claimUsageIds.map((id: any) => String(id)) : []
      };
    });

    const claimUsages = Array.isArray(data.claimUsages) ? data.claimUsages : [];
    const citationMap = Array.isArray(data.citationMap) ? data.citationMap : [];

    // HARD GUARD: Verifikasi Keterlacakan Klaim (Claim Traceability)
    if (context?.allowedClaimIds) {
      for (const cu of claimUsages) {
        if (cu.claimId && !context.allowedClaimIds.has(cu.claimId)) {
          throw new AIClientError(
            'AI_OUTPUT_INVALID',
            `GROUNDING_VIOLATION: Terdeteksi klaim terindikasi fiktif/tidak terdaftar ('${cu.claimId}'). Model dilarang mengarang claimId.`
          );
        }
      }

      for (const cm of citationMap) {
        if (cm.claimId && !context.allowedClaimIds.has(cm.claimId)) {
          throw new AIClientError(
            'AI_OUTPUT_INVALID',
            `GROUNDING_VIOLATION: Terdeteksi sitasi dengan claimId fiktif ('${cm.claimId}').`
          );
        }

        if (context.allowedSourceIds && Array.isArray(cm.sourceIds)) {
          for (const sId of cm.sourceIds) {
            if (!context.allowedSourceIds.has(sId)) {
              throw new AIClientError(
                'AI_OUTPUT_INVALID',
                `GROUNDING_VIOLATION: Terdeteksi sitasi dengan sourceId fiktif ('${sId}'). Model dilarang mengarang sumber.`
              );
            }
          }
        }

        if (context.allowedEvidenceIds && Array.isArray(cm.evidenceIds)) {
          for (const eId of cm.evidenceIds) {
            if (!context.allowedEvidenceIds.has(eId)) {
              throw new AIClientError(
                'AI_OUTPUT_INVALID',
                `GROUNDING_VIOLATION: Terdeteksi sitasi dengan evidenceId fiktif ('${eId}'). Model dilarang mengarang bukti.`
              );
            }
          }
        }
      }
    }

    return {
      title: data.title.trim(),
      dek: typeof data.dek === 'string' ? data.dek.trim() : null,
      slug: typeof data.slug === 'string' ? data.slug.trim() : null,
      thesis: typeof data.thesis === 'string' ? data.thesis.trim() : '',
      editorialAngle: typeof data.editorialAngle === 'string' ? data.editorialAngle.trim() : '',
      sections,
      claimUsages,
      citationMap,
      generatorVersion: 'real-ai-v1',
      promptVersion: '1.0.0'
    };
  }

  /**
   * Validasi revisi satu seksi naskah
   */
  public static validateSection(data: any, fallbackId: string, fallbackOrder: number): ArticleSection {
    if (!data || typeof data !== 'object') {
      throw new AIClientError('AI_OUTPUT_INVALID', 'Revisi seksi bukan object.');
    }

    if (typeof data.content !== 'string' || data.content.trim().length === 0) {
      throw new AIClientError('AI_OUTPUT_INVALID', 'Revisi seksi tidak memuat teks konten.');
    }

    return {
      id: data.id || fallbackId,
      heading: typeof data.heading === 'string' ? data.heading.trim() : '',
      content: data.content.trim(),
      order: typeof data.order === 'number' ? data.order : fallbackOrder,
      purpose: data.purpose || 'ARGUMENT',
      claimUsageIds: Array.isArray(data.claimUsageIds) ? data.claimUsageIds.map((id: any) => String(id)) : []
    };
  }
}
