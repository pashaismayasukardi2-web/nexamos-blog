/**
 * NexaMOS Claim ↔ Evidence Verification Gate
 *
 * Sourced from NexaMOS Blog Research Integrity Hardening
 * Doktrin: NO SOURCE -> NO EVIDENCE -> NO SUPPORTED CLAIM
 *
 * Menegakkan aturan:
 * 1. AI (Qwen) hanya menghasilkan usulan klaim hipotesis (PROPOSED CLAIM)
 *    dan TIDAK memiliki otoritas menetapkan klaim buatannya sendiri sebagai SUPPORTED.
 * 2. Status klaim ditentukan melalui ClaimEvidenceVerifier yang eksplisit dan auditable.
 * 3. Invariant: claim.status === 'SUPPORTED' HANYA boleh terjadi jika:
 *    - supportingEvidenceIds.length > 0
 *    - Seluruh bukti yang dirujuk adalah bukti sah & terverifikasi (verified === true).
 * 4. Tanpa bukti terverifikasi, klaim wajib berstatus UNVERIFIED atau INSUFFICIENT_EVIDENCE.
 */

import type { ResearchClaim } from './domain/research-claim.ts';
import type { ClaimStatus } from './domain/claim-status.ts';
import type { ResearchEvidence } from './domain/research-evidence.ts';
import {
  type CrossLanguageNormalizer,
  DeterministicCrossLanguageNormalizer
} from './grounding/cross-language-grounding.ts';

export interface ClaimVerificationResult {
  claimId: string;
  status: ClaimStatus;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  qualifyingEvidenceIds: string[];
  reason: string;
  confidence: number; // 0.0 - 1.0
  evaluatedAt: string;
}

export interface ClaimEvidenceVerifierOptions {
  minimumOverlapRatio?: number;
  minimumSupportingCount?: number;
  crossLanguageNormalizer?: CrossLanguageNormalizer;
}

export interface ClaimEvidenceVerifier {
  verify(
    claim: ResearchClaim,
    evidence: ResearchEvidence[]
  ): Promise<ClaimVerificationResult>;
}

const STOP_WORDS = new Set([
  'yang', 'di', 'ke', 'dari', 'dan', 'atau', 'pada', 'adalah', 'itu', 'ini',
  'untuk', 'dengan', 'dalam', 'bisa', 'dapat', 'akan', 'telah', 'sudah',
  'the', 'is', 'at', 'which', 'on', 'and', 'or', 'in', 'to', 'for', 'of',
  'with', 'a', 'an', 'as', 'by', 'that', 'this', 'are', 'was', 'were'
]);

const CONTRADICTION_TRIGGERS = [
  'tidak benar', 'salah', 'keliru', 'menolak', 'membantah', 'debunked',
  'mitos', 'bukan', 'tidak terbukti', 'justru sebaliknya', 'menurun drastis',
  'kontradiktif', 'dispute'
];

/**
 * Deterministic Claim ↔ Evidence Verifier
 * Menganalisis keterkaitan faktual, entitas, dan leksikal antara klaim dan bukti.
 */
export class DeterministicClaimEvidenceVerifier implements ClaimEvidenceVerifier {
  private minimumOverlapRatio: number;
  private crossLanguageNormalizer: CrossLanguageNormalizer;

  constructor(options: ClaimEvidenceVerifierOptions = {}) {
    this.minimumOverlapRatio = options.minimumOverlapRatio ?? 0.25;
    this.crossLanguageNormalizer =
      options.crossLanguageNormalizer || new DeterministicCrossLanguageNormalizer();
  }

  async verify(
    claim: ResearchClaim,
    evidence: ResearchEvidence[]
  ): Promise<ClaimVerificationResult> {
    const now = new Date().toISOString();

    // 1. INVARIANT AWAL: Jika tidak ada bukti sama sekali -> UNVERIFIED
    if (!evidence || evidence.length === 0) {
      return {
        claimId: claim.id,
        status: 'UNVERIFIED',
        supportingEvidenceIds: [],
        contradictingEvidenceIds: [],
        qualifyingEvidenceIds: [],
        reason: 'Belum ada bukti yang tersedia untuk memverifikasi klaim ini (NO EVIDENCE).',
        confidence: 0,
        evaluatedAt: now
      };
    }

    // 2. Filter hanya bukti yang valid & terverifikasi riil
    // Bukti yang verified === false atau berasal dari fallback sintetis didiskualifikasi
    const verifiedEvidence = evidence.filter((ev) => ev.verified === true);

    if (verifiedEvidence.length === 0) {
      return {
        claimId: claim.id,
        status: 'UNVERIFIED',
        supportingEvidenceIds: [],
        contradictingEvidenceIds: [],
        qualifyingEvidenceIds: [],
        reason: 'Seluruh bukti yang ada belum terverifikasi integritasnya (NO VERIFIED EVIDENCE).',
        confidence: 0,
        evaluatedAt: now
      };
    }

    // 3. Analisis Semantik & Leksikal Pernyataan Klaim
    const claimWords = this.tokenize(claim.statement);
    const claimNumbers = this.extractNumbers(claim.statement);

    // Cache representasi normalisasi jika bahasa klaim berbeda dari bukti (evaluasi sekali per klaim)
    let normalizedClaimWords: Set<string> | null = null;
    let crossLanguageChecked = false;

    const supportingIds: string[] = [];
    const contradictingIds: string[] = [];
    const qualifyingIds: string[] = [];

    let totalScore = 0;

    for (const ev of verifiedEvidence) {
      const evWords = this.tokenize(ev.content);
      const evNumbers = this.extractNumbers(ev.content);

      // Hitung kata tumpang tindih langsung (Direct Lexical Overlap)
      let overlapCount = 0;
      for (const w of claimWords) {
        if (evWords.has(w)) overlapCount++;
      }

      let overlapRatio = claimWords.size > 0 ? overlapCount / claimWords.size : 0;

      // Cek konsistensi data numerik jika klaim memuat angka/persentase
      let numericMatch = true;
      if (claimNumbers.length > 0) {
        // Jika klaim memuat angka spesifik, bukti harus memuat setidaknya 1 angka yang sama
        numericMatch = claimNumbers.some((num) => evNumbers.includes(num));
      }

      // Jika overlap langsung belum mencapai threshold dan verifier memiliki crossLanguageNormalizer:
      // coba evaluasi via representasi ter-normalisasi (Bahasa Indonesia -> English)
      if (overlapRatio < this.minimumOverlapRatio && this.crossLanguageNormalizer) {
        if (!crossLanguageChecked) {
          crossLanguageChecked = true;
          try {
            const normRes = await this.crossLanguageNormalizer.normalizeProposition(claim.statement, 'en');
            if (normRes.isValid && !normRes.mutationDetected) {
              normalizedClaimWords = this.tokenize(normRes.normalizedStatement);
            }
          } catch {
            normalizedClaimWords = null;
          }
        }

        if (normalizedClaimWords && normalizedClaimWords.size > 0) {
          let normOverlapCount = 0;
          for (const w of normalizedClaimWords) {
            if (evWords.has(w)) normOverlapCount++;
          }
          const normOverlapRatio =
            normalizedClaimWords.size > 0 ? normOverlapCount / normalizedClaimWords.size : 0;

          if (normOverlapRatio > overlapRatio) {
            overlapRatio = normOverlapRatio;
          }
        }
      }

      // Deteksi sinyal kontradiksi
      const evContentLower = ev.content.toLowerCase();
      const hasContradictionSignal = CONTRADICTION_TRIGGERS.some((trig) =>
        evContentLower.includes(trig)
      );

      if (overlapRatio >= this.minimumOverlapRatio && numericMatch) {
        if (hasContradictionSignal) {
          contradictingIds.push(ev.id);
        } else if (overlapRatio >= 0.35) {
          supportingIds.push(ev.id);
          totalScore += overlapRatio;
        } else {
          qualifyingIds.push(ev.id);
        }
      }
    }

    // 4. Penentuan Status Verifikasi
    let calculatedStatus: ClaimStatus = 'UNVERIFIED';
    let reason = '';
    let confidence = 0;

    const hasSupport = supportingIds.length > 0;
    const hasContradiction = contradictingIds.length > 0;

    if (hasSupport && hasContradiction) {
      calculatedStatus = 'DISPUTED';
      reason = `Terdapat pertentangan bukti (${supportingIds.length} pendukung vs ${contradictingIds.length} penyangkal).`;
      confidence = 0.5;
    } else if (hasContradiction) {
      calculatedStatus = 'CONTRADICTED';
      reason = `Klaim disangkal oleh ${contradictingIds.length} bukti terverifikasi.`;
      confidence = 0.8;
    } else if (hasSupport) {
      calculatedStatus = 'SUPPORTED';
      confidence = Math.min(1.0, Math.round((totalScore / supportingIds.length) * 100) / 100);
      reason = `Klaim terbukti secara faktual oleh ${supportingIds.length} bukti terverifikasi (Kepercayaan: ${Math.round(confidence * 100)}%).`;
    } else if (qualifyingIds.length > 0) {
      calculatedStatus = 'PARTIALLY_SUPPORTED';
      confidence = 0.4;
      reason = `Klaim hanya memiliki dukungan parsial atau kontekstual dari ${qualifyingIds.length} bukti.`;
    } else {
      calculatedStatus = 'UNVERIFIED';
      reason = 'Tidak ditemukan bukti terverifikasi yang memuat substansi faktual klaim ini.';
      confidence = 0.1;
    }

    // 5. HARD INVARIANT POST-CONDITION ENFORCEMENT
    // Menjamin secara sistemik: SUPPORTED mutlak membutuhkan supportingEvidenceIds terverifikasi
    if (calculatedStatus === 'SUPPORTED') {
      if (supportingIds.length === 0) {
        calculatedStatus = 'UNVERIFIED';
        reason = 'Guardrail: status SUPPORTED dibatalkan karena tidak ada supportingEvidenceIds.';
      } else {
        const strictlyVerified = supportingIds.every((id) => {
          const matched = verifiedEvidence.find((e) => e.id === id);
          return matched && matched.verified === true;
        });
        if (!strictlyVerified) {
          calculatedStatus = 'UNVERIFIED';
          reason = 'Guardrail: status SUPPORTED dibatalkan karena bukti pendukung tidak berstatus verified.';
        }
      }
    }

    return {
      claimId: claim.id,
      status: calculatedStatus,
      supportingEvidenceIds: calculatedStatus === 'SUPPORTED' || calculatedStatus === 'PARTIALLY_SUPPORTED' ? supportingIds : [],
      contradictingEvidenceIds: contradictingIds,
      qualifyingEvidenceIds: qualifyingIds,
      reason,
      confidence,
      evaluatedAt: now
    };
  }

  private tokenize(text: string): Set<string> {
    const clean = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    return new Set(clean);
  }

  private extractNumbers(text: string): string[] {
    const matches = text.match(/\b\d+(?:[.,]\d+)?%?(?!\w)/g);
    return matches ? matches.map((m) => m.replace(',', '.')) : [];
  }
}
