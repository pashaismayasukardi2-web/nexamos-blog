/**
 * NexaMOS Editorial Integrity Gate (Master Editorial Gate)
 *
 * Sourced from NexaMOS Blog Editorial Grounding & Draft Claim Integrity specifications.
 * Menyatukan dua lapis evaluasi independen:
 * 1. DraftClaimAuditor (Audit Semantik & Provenance Proposisi Aktual)
 * 2. GroundingGuard (Audit Mekanikal ID, Angka, Kutipan Langsung, dan Limitasi)
 *
 * INVARIANT MUTLAK:
 * Jika DraftClaimAuditor == FAIL ATAU GroundingGuard == FAIL
 * -> EditorialIntegrityResult == FAIL -> PUBLIKASI DIBLOKIR SECARA DETERMINISTIK.
 */

import type { ArticleDraft } from './article-draft.ts';
import type { EditorialPlan } from './editorial-plan.ts';
import type { ResearchBrief } from '../research/orchestrator/research-brief.ts';
import { DraftClaimAuditor, type DraftClaimAuditorOptions } from './draft-claim-auditor.ts';
import { GroundingGuard, type GroundingGuardOptions } from './grounding-guard.ts';
import type {
  EditorialIntegrityResult,
  EditorialIntegrityIssue
} from './draft-claim-auditor-types.ts';

export interface EditorialIntegrityGateOptions {
  auditorOptions?: DraftClaimAuditorOptions;
  guardOptions?: GroundingGuardOptions;
}

export class EditorialIntegrityGate {
  private readonly auditor: DraftClaimAuditor;
  private readonly guard: GroundingGuard;

  constructor(options: EditorialIntegrityGateOptions = {}) {
    this.auditor = new DraftClaimAuditor(options.auditorOptions);
    this.guard = new GroundingGuard(options.guardOptions);
  }

  /**
   * Mengevaluasi integritas naskah artikel secara menyeluruh sebelum publikasi
   */
  public evaluate(
    draft: ArticleDraft,
    brief: ResearchBrief,
    plan?: EditorialPlan | null
  ): EditorialIntegrityResult {
    const evaluatedAt = new Date().toISOString();

    // 1. Audit Semantik Prosa Aktual via DraftClaimAuditor
    const auditResult = this.auditor.audit(draft, brief);

    // 2. Audit Mekanikal via GroundingGuard
    const guardResult = this.guard.evaluate(draft, brief, plan);

    // 3. Gabungkan seluruh issue
    const allIssues: EditorialIntegrityIssue[] = [...auditResult.issues];

    for (const gi of guardResult.issues) {
      if (gi.severity === 'CRITICAL' || gi.severity === 'WARNING') {
        allIssues.push({
          code: gi.code as any,
          severity: gi.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
          message: gi.message,
          sectionId: gi.sectionId || undefined,
          claimId: gi.claimId || undefined,
          snippet: gi.contextSnippet || undefined
        });
      }
    }

    // 4. Penegakan Gerbang Keras (Hard Publication Gate)
    const isAuditPass = auditResult.status === 'PASS';
    const isGuardPass = guardResult.status === 'PASS' || guardResult.status === 'REVIEW_REQUIRED';
    const hasCriticalIssues = allIssues.some((i) => i.severity === 'CRITICAL');

    const overallStatus = isAuditPass && isGuardPass && !hasCriticalIssues ? 'PASS' : 'FAIL';

    const summary =
      overallStatus === 'PASS'
        ? `Editorial Integrity Gate: PASS. Seluruh ${auditResult.groundedExternalFacts} klaim eksternal terbukti, ${auditResult.originalAnalysisCount} analisis orisinal valid, dan guard mekanikal lolos.`
        : `Editorial Integrity Gate: FAIL. Ditemukan ${auditResult.ungroundedExternalFacts} klaim faktual tak ter-grounding dan ${allIssues.filter((i) => i.severity === 'CRITICAL').length} catatan kritis. Publikasi diblokir.`;

    return {
      status: overallStatus,
      draftClaimAudit: auditResult,
      groundingGuard: guardResult,
      propositions: auditResult.propositions,
      groundedExternalFacts: auditResult.groundedExternalFacts,
      ungroundedExternalFacts: auditResult.ungroundedExternalFacts,
      partialSupportCount: auditResult.partialSupportCount,
      originalAnalysisCount: auditResult.originalAnalysisCount,
      interpretationCount: auditResult.interpretationCount,
      internalKnowledgeCount: auditResult.internalKnowledgeCount,
      nonFactualCount: auditResult.nonFactualCount,
      numericClaimsTotal: auditResult.numericClaimsTotal,
      unsupportedNumericCount: auditResult.unsupportedNumericCount,
      citationFailuresCount: auditResult.citationFailuresCount,
      issues: allIssues,
      summary,
      evaluatedAt
    };
  }
}
