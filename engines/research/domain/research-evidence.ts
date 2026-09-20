/**
 * NexaMOS Canonical Research Evidence Entity
 *
 * Sourced from NexaMOS Blog Master Reference & Phase 2A specifications
 * Definition: Informasi, kutipan, data numerik, atau temuan spesifik
 * dari suatu source yang dapat mendukung atau menolak suatu claim.
 */

import type { EvidenceLevel } from '../../ideation/domain/evidence-level.ts';

export interface EvidenceLocator {
  page?: number | string | null;
  section?: string | null;
  lineRange?: string | null;
  table?: string | null;
  figure?: string | null;
  paragraph?: number | string | null;
  timestamp?: string | null; // e.g. for audio/video/interviews
}

export type EvidenceProvenanceType =
  | 'EXTERNAL_EVIDENCE'
  | 'INTERNAL_KNOWLEDGE'
  | 'ORIGINAL_ANALYSIS';

export interface ResearchEvidence {
  id: string;
  sourceId: string;
  researchProjectId: string;
  content: string; // Kutipan teks, statistik, atau observasi spesifik
  locator?: EvidenceLocator | null;
  evidenceLevel: EvidenceLevel;
  capturedAt: string;
  publicationAllowed: boolean; // Menandai apakah data ini boleh dipublikasikan secara publik mentah (terutama E4 proprietary)
  notes?: string | null;
  provenanceType?: EvidenceProvenanceType; // Membedakan bukti eksternal, pengetahuan internal, dan analisis orisinal
  verified?: boolean; // Menandai status verifikasi integritas sumber riil
  sourceUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateResearchEvidenceInput = Omit<
  ResearchEvidence,
  'id' | 'researchProjectId' | 'evidenceLevel' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
  researchProjectId?: string;
  evidenceLevel?: EvidenceLevel;
};
export type UpdateResearchEvidenceInput = Partial<CreateResearchEvidenceInput>;
