/**
 * NexaMOS AI Research Provider Contract (Provider-Agnostic)
 *
 * Sourced from NexaMOS Blog Phase 2D specifications
 * Mendefinisikan antarmuka provider AI untuk reasoning/planning layer.
 * Provider-agnostic: tidak terikat ke OpenAI, Anthropic, Gemini, DeepSeek, dll.
 */

import type { Topic } from '../../ideation/domain/topic.types.ts';
import type { ResearchProject } from '../domain/research-project.ts';
import type { ResearchQuestion } from '../domain/research-question.ts';
import type { ResearchEvidence } from '../domain/research-evidence.ts';
import type { ResearchClaim } from '../domain/research-claim.ts';
import type { ClaimType, ClaimImportance } from '../domain/claim-status.ts';
import type { ResearchFinding } from '../domain/research-finding.ts';
import type { ResearchGap, ResearchGapType } from '../domain/research-gap.ts';
import type { ResearchSynthesis } from '../domain/research-synthesis.ts';
import type { ClaimGroundingResult } from '../claim-grounding-evaluator.ts';
import type { SourceDiversityAssessment } from '../acquisition/source-diversity-checker.ts';
import type { TopicVolatility } from '../acquisition/freshness-evaluator.ts';
import type { ResearchPlanProposal } from './research-plan.ts';
import type { NextActionProposal } from './research-next-action.ts';
import type { Result, ResearchDomainError } from '../domain/research-result.ts';

export interface PlanResearchInput {
  topic: Topic;
  existingProject?: ResearchProject;
  availableEvidence?: ResearchEvidence[];
  contextNotes?: string;
}

export interface AnalyzeGapsInput {
  synthesis: ResearchSynthesis;
  currentGaps: ResearchGap[];
  claims: ResearchClaim[];
  groundingResults: ClaimGroundingResult[];
  diversity?: SourceDiversityAssessment | null;
  topicVolatility?: TopicVolatility;
}

export interface AIGapAnalysisProposal {
  gapSummary: string;
  priorityGaps: Array<{
    type: ResearchGapType;
    description: string;
    claimId?: string | null;
    questionId?: string | null;
  }>;
  suggestedActions: NextActionProposal[];
}

export interface ProposeClaimsInput {
  projectId: string;
  evidence: ResearchEvidence[];
  questions: ResearchQuestion[];
  existingClaims?: ResearchClaim[];
}

export interface ProposedClaim {
  statement: string;
  claimType: ClaimType;
  importance: ClaimImportance;
  rationale?: string;
  proposedEvidenceIds?: string[];
  // Catatan doktrin: AI TIDAK BOLEH menentukan status claim.
  // Status selalu diinisialisasi sebagai UNVERIFIED di domain model.
}

export interface AssistSynthesisInput {
  topic: Topic;
  project: ResearchProject;
  answeredQuestions: ResearchQuestion[];
  supportedClaims: ResearchClaim[];
  disputedClaims: ResearchClaim[];
  keyFindings: ResearchFinding[];
  limitations: string[];
}

export interface AISynthesisAssistance {
  recommendedEditorialAngle: string;
  editorialNotes: string[];
  confidenceSummary: string;
}

export interface AIProviderMetadata {
  providerName: string;
  modelName: string;
  promptVersion: string;
}

export interface AIResearchProvider {
  getMetadata(): AIProviderMetadata;
  planResearch(input: PlanResearchInput): Promise<Result<ResearchPlanProposal, ResearchDomainError>>;
  analyzeResearchGaps(input: AnalyzeGapsInput): Promise<Result<AIGapAnalysisProposal, ResearchDomainError>>;
  proposeClaims(input: ProposeClaimsInput): Promise<Result<ProposedClaim[], ResearchDomainError>>;
  assistSynthesis(input: AssistSynthesisInput): Promise<Result<AISynthesisAssistance, ResearchDomainError>>;
}
