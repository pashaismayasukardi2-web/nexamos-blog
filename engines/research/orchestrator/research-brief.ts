/**
 * NexaMOS Research Brief Model
 *
 * Sourced from NexaMOS Blog Phase 2D specifications
 * Kontrak handoff antara Research Engine dan Editorial Generator (Phase 3).
 * Menjamin integritas sitasi dan ketersediaan bukti terverifikasi.
 */

import type { ResearchQuestion } from '../domain/research-question.ts';
import type { ResearchClaim } from '../domain/research-claim.ts';
import type { ResearchFinding } from '../domain/research-finding.ts';
import type { ResearchGap } from '../domain/research-gap.ts';
import type { SourceType } from '../domain/source-type.ts';
import type { EvidenceLevel } from '../../ideation/domain/evidence-level.ts';

import type { EvidenceProvenanceType } from '../domain/research-evidence.ts';

export type ResearchBriefReadiness =
  | 'NOT_READY'
  | 'READY_FOR_EDITORIAL'
  | 'HUMAN_REVIEW_REQUIRED';

export interface ResearchBriefSourceEntry {
  sourceId: string;
  title: string;
  url?: string;
  canonicalUrl?: string;
  publisher?: string;
  publishedDate?: string;
  publicationAllowed?: boolean;
  sourceType: SourceType;
  authorityScore: number;
  freshnessStatus?: string;
}

export interface ResearchBriefEvidenceEntry {
  evidenceId: string;
  sourceId: string;
  quote: string;
  level: EvidenceLevel;
  verified: boolean;
  provenanceType?: EvidenceProvenanceType;
  sourceUrl?: string;
}

export interface InternalKnowledgeEntry {
  id: string;
  content: string;
  source: string;
  notes?: string;
}

export interface OriginalAnalysisEntry {
  id: string;
  content: string;
  framework?: string;
}

export interface ResearchBrief {
  id: string;
  topicId: string;
  researchProjectId: string;
  objective: string;

  answeredQuestions: ResearchQuestion[];
  openQuestions: ResearchQuestion[];

  // Kontrak Integritas Klaim Terpisah
  supportedClaims: ResearchClaim[];
  keyClaims?: ResearchClaim[]; // Alias opsional untuk backward compatibility
  partiallySupportedClaims: ResearchClaim[];
  disputedClaims: ResearchClaim[];
  unverifiedClaims?: ResearchClaim[];
  unsupportedClaims?: ResearchClaim[];

  // Pemisahan Pengetahuan Internal & Analisis Orisinal
  internalKnowledge?: InternalKnowledgeEntry[];
  originalAnalysis?: OriginalAnalysisEntry[];

  keyFindings: ResearchFinding[];
  limitations: string[];
  researchGaps: ResearchGap[];

  recommendedEditorialAngle?: string;

  sourceIndex: ResearchBriefSourceEntry[];
  evidenceIndex: ResearchBriefEvidenceEntry[];

  readiness: ResearchBriefReadiness;
  readinessReason?: string;
  generatedAt: string; // ISO 8601
}
