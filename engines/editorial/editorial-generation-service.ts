/**
 * NexaMOS Editorial Generation Service
 *
 * Sourced from NexaMOS Blog Phase 3A specifications
 * Control plane deterministik untuk mengubah ResearchBrief menjadi ArticleDraft yang ter-grounding.
 */

import type { EditorialGenerationRequest } from './editorial-generation-request.ts';
import type { EditorialPlan } from './editorial-plan.ts';
import { validateEditorialPlan } from './editorial-plan.ts';
import type { ArticleDraft, DraftStatus } from './article-draft.ts';
import type {
  EditorialGenerationResult,
  EditorialGenerationMetrics
} from './editorial-generation-result.ts';
import type { AIEditorialProvider } from './ai-editorial-provider.ts';
import { GroundingGuard } from './grounding-guard.ts';
import { EditorialIntegrityGate } from './editorial-integrity-gate.ts';

export interface EditorialGenerationServiceDependencies {
  aiProvider: AIEditorialProvider;
  groundingGuard?: GroundingGuard;
  integrityGate?: EditorialIntegrityGate;
}

export class EditorialGenerationService {
  private readonly aiProvider: AIEditorialProvider;
  private readonly groundingGuard: GroundingGuard;
  private readonly integrityGate: EditorialIntegrityGate;

  constructor(deps: EditorialGenerationServiceDependencies) {
    this.aiProvider = deps.aiProvider;
    this.groundingGuard = deps.groundingGuard || new GroundingGuard();
    this.integrityGate =
      deps.integrityGate ||
      new EditorialIntegrityGate({
        guardOptions: {
          strictNumericalCheck: true,
          strictQuoteCheck: true,
          strictLimitationCheck: true
        }
      });
  }

  /**
   * Eksekusi alur penuh pembuatan draft artikel
   */
  public async generateDraft(
    request: EditorialGenerationRequest
  ): Promise<EditorialGenerationResult> {
    const errors: string[] = [];

    // 1. Validasi ResearchBrief
    const brief = request.researchBrief;
    if (!brief) {
      return {
        success: false,
        guardResult: {
          status: 'FAIL',
          issues: [],
          summary: 'ResearchBrief tidak disediakan dalam request.'
        },
        errors: ['RESEARCH_BRIEF_MISSING: request.researchBrief wajib ada']
      };
    }

    if (brief.readiness === 'NOT_READY') {
      return {
        success: false,
        guardResult: {
          status: 'FAIL',
          issues: [],
          summary: 'ResearchBrief berstatus NOT_READY. Riset belum mencukupi untuk penulisan editorial.'
        },
        errors: [
          `RESEARCH_BRIEF_NOT_READY: Brief belum siap untuk editorial (${brief.readinessReason || 'Belum mencukupi'})`
        ]
      };
    }

    // 2. Pembuatan Editorial Plan
    let plan: EditorialPlan;
    try {
      plan = await this.aiProvider.createEditorialPlan(request);
    } catch (err: any) {
      return {
        success: false,
        guardResult: {
          status: 'FAIL',
          issues: [],
          summary: 'Gagal membuat EditorialPlan dari AI provider.'
        },
        errors: [`PLAN_GENERATION_FAILED: ${err.message}`]
      };
    }

    // 3. Validasi Editorial Plan (Thesis Rule, Structure Rule)
    const planValidation = validateEditorialPlan(plan, request.articleType);
    if (!planValidation.valid) {
      return {
        success: false,
        plan,
        guardResult: {
          status: 'FAIL',
          issues: [],
          summary: 'EditorialPlan tidak memenuhi syarat doktrin editorial.'
        },
        errors: planValidation.errors
      };
    }

    // 4. Pembuatan Draft Artikel
    let draftPayload;
    try {
      draftPayload = await this.aiProvider.generateArticleDraft(request, plan);
    } catch (err: any) {
      return {
        success: false,
        plan,
        guardResult: {
          status: 'FAIL',
          issues: [],
          summary: 'Gagal menghasilkan naskah artikel dari AI provider.'
        },
        errors: [`DRAFT_GENERATION_FAILED: ${err.message}`]
      };
    }

    // 5. Rakit entitas ArticleDraft
    const draftId = `draft-${request.topic.id}-${Date.now()}`;
    const generatedAt = new Date().toISOString();

    const draft: ArticleDraft = {
      id: draftId,
      topicId: request.topic.id,
      researchProjectId: brief.researchProjectId,
      title: draftPayload.title || plan.workingTitle,
      dek: draftPayload.dek || null,
      slug: draftPayload.slug || request.topic.slug || null,
      territory: request.territory,
      articleType: request.articleType,
      editorialRole: request.editorialRole,
      thesis: draftPayload.thesis || plan.thesis,
      editorialAngle: draftPayload.editorialAngle || plan.angle,
      sections: draftPayload.sections,
      claimUsages: draftPayload.claimUsages,
      citationMap: draftPayload.citationMap,
      status: 'GENERATED',
      generatedAt,
      generatorVersion: draftPayload.generatorVersion || 'nexamos-editorial-v1.0',
      promptVersion: draftPayload.promptVersion || 'article-generator-v1.0',
      reviewNotes: []
    };

    // 6. Jalankan Editorial Integrity Gate (DraftClaimAuditor + GroundingGuard)
    const integrityResult = this.integrityGate.evaluate(draft, brief, plan);
    const guardResult = integrityResult.groundingGuard;

    // 7. Tentukan Status Akhir Draft
    let finalStatus: DraftStatus = 'READY_FOR_EDITORIAL_REVIEW';

    if (integrityResult.status === 'FAIL' || guardResult.status === 'FAIL') {
      finalStatus = 'REJECTED';
    } else if (
      guardResult.status === 'REVIEW_REQUIRED' ||
      brief.readiness === 'HUMAN_REVIEW_REQUIRED'
    ) {
      finalStatus = 'GROUNDING_REVIEW_REQUIRED';
    }

    draft.status = finalStatus;
    const allNotes: string[] = [
      ...integrityResult.issues.map((i) => `[${i.severity}] ${i.code}: ${i.message}`)
    ];
    if (allNotes.length > 0) {
      draft.reviewNotes = allNotes;
    }

    // 8. Hitung Metrik Editorial
    const metrics = this.calculateMetrics(draft);

    return {
      success: finalStatus !== 'REJECTED',
      draft,
      plan,
      guardResult,
      integrityResult,
      metrics,
      errors: finalStatus === 'REJECTED' ? integrityResult.issues.map((i) => i.message) : undefined
    };
  }

  private calculateMetrics(draft: ArticleDraft): EditorialGenerationMetrics {
    const totalWords = draft.sections.reduce((acc, s) => {
      const words = s.content ? s.content.trim().split(/\s+/).length : 0;
      return acc + words;
    }, 0);

    const distinctSources = new Set<string>();
    for (const c of draft.citationMap) {
      for (const s of c.sourceIds) {
        distinctSources.add(s);
      }
    }

    return {
      totalWordCount: totalWords,
      sectionCount: draft.sections.length,
      claimUsageCount: draft.claimUsages.length,
      citationCount: draft.citationMap.length,
      distinctSourcesCited: distinctSources.size
    };
  }
}
