/**
 * NexaMOS Canonical Research Claim Entity
 *
 * Sourced from NexaMOS Blog Master Reference & Phase 2A specifications
 * Definition: Pernyataan faktual, analitis, kausal, atau interpretatif
 * yang hendak digunakan dalam artikel atau luaran riset.
 */

import type { ClaimType, ClaimStatus, ClaimImportance } from './claim-status.ts';

export interface ResearchClaim {
  id: string;
  researchProjectId: string;
  statement: string;
  claimType: ClaimType;
  status: ClaimStatus;
  importance: ClaimImportance;
  supportingEvidenceIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export type CreateResearchClaimInput = Omit<
  ResearchClaim,
  'id' | 'researchProjectId' | 'status' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
  researchProjectId?: string;
  status?: ClaimStatus;
};
export type UpdateResearchClaimInput = Partial<CreateResearchClaimInput>;
