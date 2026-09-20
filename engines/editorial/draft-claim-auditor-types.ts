/**
 * NexaMOS Draft Claim Auditor Types & Epistemic Contracts
 *
 * Sourced from NexaMOS Blog Editorial Grounding & Draft Claim Integrity specifications.
 * Menegakkan perbedaan epistemik antara klaim faktual eksternal, sintesis terbukti,
 * analisis orisinal NexaMOS, interpretasi, dan bahasa editorial non-faktual.
 */

import type { GroundingGuardResult } from './editorial-generation-result.ts';

export type EpistemicClassification =
  | 'EXTERNAL_FACT'
  | 'SUPPORTED_SYNTHESIS'
  | 'ORIGINAL_ANALYSIS'
  | 'INTERPRETATION'
  | 'INTERNAL_KNOWLEDGE'
  | 'NON_FACTUAL_EDITORIAL';

export type SupportLevel =
  | 'ENTAILED'
  | 'PARTIALLY_SUPPORTED'
  | 'UNSUPPORTED'
  | 'NOT_APPLICABLE';

export interface AuditedProposition {
  propositionId: string;
  sectionId: string;
  text: string;
  classification: EpistemicClassification;
  supportLevel: SupportLevel;
  claimIds: string[];
  evidenceIds: string[];
  sourceIds: string[];
  reason: string;
  numericClaims?: string[];
  hasDirectQuote?: boolean;
}

export interface CandidatePropositionAssessment {
  propositionId: string;
  classification: EpistemicClassification;
  candidateClaimIds?: string[];
  entailment: 'ENTAILED' | 'PARTIAL' | 'UNSUPPORTED' | 'NOT_APPLICABLE';
  reason: string;
}

export interface EditorialIntegrityIssue {
  code:
    | 'UNGROUNDED_EXTERNAL_FACT'
    | 'PARTIALLY_SUPPORTED_CLAIM'
    | 'UNSUPPORTED_NUMERIC_CLAIM'
    | 'UNSUPPORTED_QUOTE'
    | 'CITATION_INTEGRITY_FAILED'
    | 'SMUGGLED_EXTERNAL_FACT'
    | 'SYNTHETIC_DATA_BLOCKED';
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  propositionId?: string;
  sectionId?: string;
  claimId?: string;
  snippet?: string;
}

export interface DraftClaimAuditResult {
  status: 'PASS' | 'FAIL';
  propositions: AuditedProposition[];
  groundedExternalFacts: number;
  ungroundedExternalFacts: number;
  partialSupportCount: number;
  originalAnalysisCount: number;
  interpretationCount: number;
  internalKnowledgeCount: number;
  nonFactualCount: number;
  numericClaimsTotal: number;
  unsupportedNumericCount: number;
  citationFailuresCount: number;
  issues: EditorialIntegrityIssue[];
  summary: string;
  auditedAt: string;
}

export interface EditorialIntegrityResult {
  status: 'PASS' | 'FAIL';
  draftClaimAudit: DraftClaimAuditResult;
  groundingGuard: GroundingGuardResult;
  propositions: AuditedProposition[];
  groundedExternalFacts: number;
  ungroundedExternalFacts: number;
  partialSupportCount: number;
  originalAnalysisCount: number;
  interpretationCount: number;
  internalKnowledgeCount: number;
  nonFactualCount: number;
  numericClaimsTotal: number;
  unsupportedNumericCount: number;
  citationFailuresCount: number;
  issues: EditorialIntegrityIssue[];
  summary: string;
  evaluatedAt: string;
}
