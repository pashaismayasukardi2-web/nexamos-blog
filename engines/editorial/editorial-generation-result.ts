/**
 * NexaMOS Editorial Generation Result & Guard Models
 *
 * Sourced from NexaMOS Blog Phase 3A specifications
 * Hasil generasi artikel beserta metrik dan audit grounding guard.
 */

import type { ArticleDraft } from './article-draft.ts';
import type { EditorialPlan } from './editorial-plan.ts';

export type GuardStatus = 'PASS' | 'REVIEW_REQUIRED' | 'FAIL';

export interface GroundingIssue {
  code:
    | 'UNSUPPORTED_NUMERICAL_CLAIM'
    | 'UNSUPPORTED_QUOTE'
    | 'UNKNOWN_CLAIM_REFERENCE'
    | 'UNKNOWN_EVIDENCE_REFERENCE'
    | 'UNKNOWN_SOURCE_REFERENCE'
    | 'MATERIAL_LIMITATION_OMITTED'
    | 'DISPUTED_CLAIM_UNBALANCED'
    | 'COMMODITY_DRAFT_RISK'
    | 'GROUNDING_EVALUATION_WARNING';
  message: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  sectionId?: string | null;
  claimId?: string | null;
  contextSnippet?: string | null;
}

export interface GroundingGuardResult {
  status: GuardStatus;
  issues: GroundingIssue[];
  summary: string;
}

export interface EditorialGenerationMetrics {
  totalWordCount: number;
  sectionCount: number;
  claimUsageCount: number;
  citationCount: number;
  distinctSourcesCited: number;
}

export interface EditorialGenerationResult {
  success: boolean;
  draft?: ArticleDraft | null;
  plan?: EditorialPlan | null;
  guardResult: GroundingGuardResult;
  integrityResult?: import('./draft-claim-auditor-types.ts').EditorialIntegrityResult;
  metrics?: EditorialGenerationMetrics | null;
  errors?: string[];
}
