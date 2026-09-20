/**
 * NexaMOS Research Domain Result Pattern & Error Types
 *
 * Sourced from NexaMOS Blog Phase 2A specifications
 */

export type Result<T, E> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: E;
    };

export const ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value
});

export const err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error
});

export type ResearchDomainErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'DUPLICATE_PROJECT_ID'
  | 'SOURCE_NOT_FOUND'
  | 'DUPLICATE_SOURCE_ID'
  | 'CLAIM_NOT_FOUND'
  | 'DUPLICATE_CLAIM_ID'
  | 'EVIDENCE_NOT_FOUND'
  | 'DUPLICATE_EVIDENCE_ID'
  | 'FINDING_NOT_FOUND'
  | 'INVALID_RESEARCH_TRANSITION'
  | 'VALIDATION_FAILED'
  | 'RELATION_ALREADY_EXISTS'
  | 'UNSUPPORTED_SOURCE_FORMAT'
  | 'INVALID_SOURCE_INPUT'
  | 'PARSER_FAILED'
  | 'NORMALIZATION_FAILED'
  | 'DUPLICATE_SOURCE'
  | 'EVIDENCE_EXTRACTION_FAILED'
  | 'SOURCE_PERSISTENCE_FAILED'
  | 'DISCOVERY_FAILED'
  | 'DISCOVERY_QUERY_INVALID'
  | 'ACQUISITION_FAILED'
  | 'INVALID_ACQUISITION_TARGET'
  | 'BUDGET_EXHAUSTED'
  | 'SSRF_BLOCKED'
  | 'PDF_BINARY_UNSUPPORTED'
  | 'SOURCE_DIVERSITY_VIOLATION'
  | 'AI_OUTPUT_INVALID'
  | 'CITATION_REFERENCE_INVALID'
  | 'RESEARCH_PLAN_REJECTED'
  | 'MAX_ITERATIONS_EXCEEDED'
  | 'SOURCE_DISCOVERY_FAILED'
  | 'NO_SOURCE_FOUND'
  | 'SOURCE_ACQUISITION_FAILED'
  | 'NO_VERIFIED_EVIDENCE';

export interface ResearchDomainError {
  code: ResearchDomainErrorCode;
  message: string;
  details?: unknown;
}

export function createResearchDomainError(
  code: ResearchDomainErrorCode,
  message: string,
  details?: unknown
): ResearchDomainError {
  return {
    code,
    message,
    details
  };
}
