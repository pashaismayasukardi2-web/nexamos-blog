/**
 * NexaMOS Claim Grounding Evaluator
 *
 * Sourced from NexaMOS Blog Phase 2A specifications
 * Evaluasi deterministik tanpa AI: menganalisis relasi bukti, kekuatan sumber,
 * dan kontradiksi untuk menetapkan status grounding claim secara auditable.
 */

import type { ResearchClaim } from './domain/research-claim.ts';
import type { ClaimStatus } from './domain/claim-status.ts';
import type { ResearchEvidence } from './domain/research-evidence.ts';
import type { ResearchSource } from './domain/research-source.ts';
import type { ClaimEvidenceRelation } from './domain/evidence-relation.ts';
import type { EvidenceLevel } from '../ideation/domain/evidence-level.ts';

export interface ClaimGroundingInput {
  claim: ResearchClaim;
  relations: ClaimEvidenceRelation[];
  evidence: ResearchEvidence[];
  sources: ResearchSource[];
}

export interface ClaimGroundingResult {
  claimId: string;
  claimStatus: ClaimStatus;
  supportingEvidenceCount: number;
  contradictingEvidenceCount: number;
  qualifyingEvidenceCount: number;
  highestEvidenceLevel: EvidenceLevel;
  groundingSummary: string;
  hasContradiction: boolean;
  isDisputed: boolean;
}

const EVIDENCE_RANK: Record<EvidenceLevel, number> = {
  E0: 0,
  E1: 1,
  E2: 2,
  E3: 3,
  E4: 4
};

export function evaluateClaimGrounding(input: ClaimGroundingInput): ClaimGroundingResult {
  const { claim, relations, evidence, sources } = input;

  // Filter relasi hanya untuk claim ini
  const claimRelations = relations.filter((r) => r.claimId === claim.id);

  if (claimRelations.length === 0) {
    return {
      claimId: claim.id,
      claimStatus: 'INSUFFICIENT_EVIDENCE',
      supportingEvidenceCount: 0,
      contradictingEvidenceCount: 0,
      qualifyingEvidenceCount: 0,
      highestEvidenceLevel: 'E0',
      groundingSummary: 'Belum ada bukti yang dihubungkan ke klaim ini.',
      hasContradiction: false,
      isDisputed: false
    };
  }

  // Buat lookup maps
  const evidenceMap = new Map<string, ResearchEvidence>();
  for (const ev of evidence) {
    evidenceMap.set(ev.id, ev);
  }

  const sourceMap = new Map<string, ResearchSource>();
  for (const src of sources) {
    sourceMap.set(src.id, src);
  }

  let supportingCount = 0;
  let contradictingCount = 0;
  let qualifyingCount = 0;

  let hasStrongSupport = false;
  let hasModerateOrStrongSupport = false;
  let hasStrongContradiction = false;
  let hasModerateContradiction = false;

  let highestRank = 0;
  let highestLevel: EvidenceLevel = 'E0';

  for (const rel of claimRelations) {
    const ev = evidenceMap.get(rel.evidenceId);
    if (!ev) continue;

    // Doktrin integritas: Bukti yang tidak terverifikasi tidak boleh memperkuat klaim
    if (ev.verified === false) continue;

    // Track highest evidence level
    const rank = EVIDENCE_RANK[ev.evidenceLevel] ?? 0;
    if (rank > highestRank) {
      highestRank = rank;
      highestLevel = ev.evidenceLevel;
    }

    const src = sourceMap.get(ev.sourceId);
    const authorityScore = src?.qualityAssessment?.authority ?? 50;

    if (rel.relation === 'SUPPORTS') {
      supportingCount++;
      if (rel.strength === 'STRONG' && authorityScore >= 60) {
        hasStrongSupport = true;
        hasModerateOrStrongSupport = true;
      } else if (rel.strength === 'MODERATE' || rel.strength === 'STRONG') {
        hasModerateOrStrongSupport = true;
      }
    } else if (rel.relation === 'CONTRADICTS') {
      contradictingCount++;
      if (rel.strength === 'STRONG' && authorityScore >= 60) {
        hasStrongContradiction = true;
      } else if (rel.strength === 'MODERATE') {
        hasModerateContradiction = true;
      }
    } else if (rel.relation === 'QUALIFIES' || rel.relation === 'CONTEXTUALIZES') {
      qualifyingCount++;
    }
  }

  // Aturan evaluasi deterministik
  let calculatedStatus: ClaimStatus = 'INSUFFICIENT_EVIDENCE';
  let summary = '';

  const isDisputed = hasStrongSupport && hasStrongContradiction;
  const hasContradiction = contradictingCount > 0;

  if (isDisputed) {
    calculatedStatus = 'DISPUTED';
    summary = `Terdapat pertentangan bukti kuat (Disputed): ${supportingCount} bukti pendukung vs ${contradictingCount} bukti penyangkal.`;
  } else if (hasStrongContradiction && !hasModerateOrStrongSupport) {
    calculatedStatus = 'CONTRADICTED';
    summary = `Klaim disangkal oleh bukti kuat (Contradicted) dari ${contradictingCount} sumber.`;
  } else if (hasStrongContradiction && hasModerateOrStrongSupport) {
    // Ada sanggahan kuat namun bukti pendukung sedang/moderat
    calculatedStatus = 'DISPUTED';
    summary = `Klaim dipersengketakan (Disputed) antara bukti pendukung moderat dan penyangkal kuat.`;
  } else if (hasModerateOrStrongSupport) {
    if (hasModerateContradiction || qualifyingCount > 0) {
      calculatedStatus = 'PARTIALLY_SUPPORTED';
      summary = `Klaim didukung sebagian (Partially Supported) dengan catatan kualifikasi atau sanggahan moderat.`;
    } else if (highestRank >= 2) {
      // Minimal E2 (Secondary) dengan support memadai
      calculatedStatus = 'SUPPORTED';
      summary = `Klaim didukung secara kredibel (Supported) oleh ${supportingCount} bukti (level tertinggi: ${highestLevel}).`;
    } else {
      // Hanya E1 (Common knowledge)
      calculatedStatus = 'PARTIALLY_SUPPORTED';
      summary = `Klaim hanya memiliki dukungan tingkat dasar (Common Knowledge E1).`;
    }
  } else if (supportingCount > 0) {
    // Hanya weak support
    calculatedStatus = 'PARTIALLY_SUPPORTED';
    summary = `Klaim didukung lemah (${supportingCount} bukti lemah). Memerlukan bukti otoritatif tambahan.`;
  } else if (contradictingCount > 0) {
    calculatedStatus = 'CONTRADICTED';
    summary = `Klaim disangkal oleh bukti penyangkal yang ada.`;
  } else {
    calculatedStatus = 'INSUFFICIENT_EVIDENCE';
    summary = `Bukti yang terhubung belum memadai untuk mendukung klaim ini.`;
  }

  return {
    claimId: claim.id,
    claimStatus: calculatedStatus,
    supportingEvidenceCount: supportingCount,
    contradictingEvidenceCount: contradictingCount,
    qualifyingEvidenceCount: qualifyingCount,
    highestEvidenceLevel: highestLevel,
    groundingSummary: summary,
    hasContradiction,
    isDisputed
  };
}
