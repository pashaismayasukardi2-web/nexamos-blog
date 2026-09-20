/**
 * NexaMOS Research Gap Analyzer
 *
 * Sourced from NexaMOS Blog Phase 2D specifications
 * Menggabungkan penalaran AI dengan guardrail deterministik:
 * 1. Validasi tipe gap kanonikal (mencegah arbitrary gap type).
 * 2. Confirmation Bias Guardrail (memaksa SEARCH_COUNTER_EVIDENCE untuk klaim kausal/komparatif/kritis).
 * 3. Primary Source Preference (menyarankan SEARCH_PRIMARY_SOURCE untuk klaim kritis tanpa bukti primer).
 * 4. Freshness Guardrail (mencegah STOP / READY_FOR_EDITORIAL jika topik HIGH volatility memiliki bukti STALE).
 */

import type { ResearchSynthesis } from '../domain/research-synthesis.ts';
import type { ResearchGap, ResearchGapType } from '../domain/research-gap.ts';
import type { ResearchClaim } from '../domain/research-claim.ts';
import type { ResearchEvidence } from '../domain/research-evidence.ts';
import type { ResearchSource } from '../domain/research-source.ts';
import type { ClaimGroundingResult } from '../claim-grounding-evaluator.ts';
import type { SourceDiversityAssessment } from '../acquisition/source-diversity-checker.ts';
import type { TopicVolatility } from '../acquisition/freshness-evaluator.ts';
import type { AIResearchProvider, AIGapAnalysisProposal } from './ai-research-provider.ts';
import type { ResearchNextAction, NextActionProposal } from './research-next-action.ts';
import { isResearchNextAction } from './research-next-action.ts';
import type { Result, ResearchDomainError } from '../domain/research-result.ts';
import { ok, err, createResearchDomainError } from '../domain/research-result.ts';

const CANONICAL_GAP_TYPES: readonly ResearchGapType[] = [
  'MISSING_PRIMARY_SOURCE',
  'MISSING_CURRENT_DATA',
  'MISSING_COUNTER_EVIDENCE',
  'MISSING_LOCAL_CONTEXT',
  'MISSING_METHOD_DETAIL',
  'UNRESOLVED_CONTRADICTION',
  'INSUFFICIENT_SAMPLE',
  'OTHER'
];

export interface GapAnalysisInput {
  synthesis: ResearchSynthesis;
  currentGaps: ResearchGap[];
  claims: ResearchClaim[];
  evidenceList: ResearchEvidence[];
  sourcesList: ResearchSource[];
  groundingResults: ClaimGroundingResult[];
  diversity?: SourceDiversityAssessment | null;
  topicVolatility?: TopicVolatility;
  counterEvidenceReviewed?: boolean;
}

export interface ValidatedGapAnalysisResult {
  gapSummary: string;
  validatedGaps: ResearchGap[];
  nextAction: ResearchNextAction;
  actionReason: string;
  requiresHumanReview: boolean;
}

export class ResearchGapAnalyzer {
  private aiProvider: AIResearchProvider;

  constructor(aiProvider: AIResearchProvider) {
    this.aiProvider = aiProvider;
  }

  /**
   * Menganalisis kesenjangan bukti dengan AI reasoning yang divalidasi oleh kebijakan deterministik.
   */
  async analyzeGaps(input: GapAnalysisInput): Promise<Result<ValidatedGapAnalysisResult, ResearchDomainError>> {
    // 1. Dapatkan proposal dari AI provider
    const aiProposalRes = await this.aiProvider.analyzeResearchGaps({
      synthesis: input.synthesis,
      currentGaps: input.currentGaps,
      claims: input.claims,
      groundingResults: input.groundingResults,
      diversity: input.diversity,
      topicVolatility: input.topicVolatility
    });

    if (!aiProposalRes.ok) {
      return err(aiProposalRes.error);
    }

    const aiProposal = aiProposalRes.value;

    // 2. Validasi tipe gap: AI tidak boleh membuat tipe gap arbitrer
    const validatedGaps: ResearchGap[] = [];
    for (const g of aiProposal.priorityGaps) {
      if (!CANONICAL_GAP_TYPES.includes(g.type)) {
        return err(
          createResearchDomainError(
            'AI_OUTPUT_INVALID',
            `AI mengusulkan tipe gap tidak kanonikal: '${String(g.type)}'. Hanya tipe kanonikal yang diizinkan.`
          )
        );
      }
      validatedGaps.push({
        type: g.type,
        description: g.description,
        claimId: g.claimId || null,
        questionId: g.questionId || null
      });
    }

    // Gabungkan dengan current gaps yang sudah ada
    for (const cg of input.currentGaps) {
      if (!validatedGaps.some((vg) => vg.type === cg.type && vg.claimId === cg.claimId)) {
        validatedGaps.push(cg);
      }
    }

    // 3. Evaluasi Guardrail Deterministik (Control Plane)
    // AI boleh mengusulkan next action, namun engine deterministik memverifikasi kepatuhan terhadap doktrin.

    let nextAction: ResearchNextAction = 'SEARCH_MORE';
    let actionReason = 'Melanjutkan penelusuran bukti untuk melengkapi pertanyaan riset.';
    let requiresHumanReview = false;

    // GUARDRAIL A: Human Review Conditions
    // Cek kontradiksi tajam yang belum terselesaikan
    const hasUnresolvedContradiction =
      validatedGaps.some((g) => g.type === 'UNRESOLVED_CONTRADICTION') ||
      input.groundingResults.some((gr) => gr.claimStatus === 'CONTRADICTED' || gr.claimStatus === 'DISPUTED');

    if (hasUnresolvedContradiction || input.synthesis.readiness === 'REVIEW_REQUIRED') {
      nextAction = 'REQUEST_HUMAN_REVIEW';
      actionReason = 'Ditemukan kontradiksi tajam atau bukti yang saling bertentangan yang memerlukan verifikasi editor.';
      requiresHumanReview = true;
      return ok({
        gapSummary: aiProposal.gapSummary,
        validatedGaps,
        nextAction,
        actionReason,
        requiresHumanReview
      });
    }

    // GUARDRAIL B: Confirmation Bias Guardrail
    // Jika klaim kausal / komparatif / forecast / critical claim memiliki bukti pendukung tetapi counter-evidence belum diperiksa
    const hasHighImpactClaim = input.claims.some(
      (c) =>
        c.importance === 'CRITICAL' ||
        c.claimType === 'CAUSAL' ||
        c.claimType === 'COMPARATIVE' ||
        c.claimType === 'FORECAST'
    );

    const counterReviewed = input.counterEvidenceReviewed ?? false;
    const hasCounterEvidence = input.evidenceList.some((e) => (e.content && e.content.toLowerCase().includes('tandingan')) || false);

    if (hasHighImpactClaim && !counterReviewed && !hasCounterEvidence) {
      // Pastikan ada gap MISSING_COUNTER_EVIDENCE
      if (!validatedGaps.some((g) => g.type === 'MISSING_COUNTER_EVIDENCE')) {
        const targetClaim = input.claims.find(
          (c) => c.claimType === 'CAUSAL' || c.claimType === 'COMPARATIVE' || c.importance === 'CRITICAL'
        );
        validatedGaps.push({
          type: 'MISSING_COUNTER_EVIDENCE',
          description: `Klaim penting '${targetClaim?.statement || 'Utama'}' memerlukan penelusuran bukti tandingan untuk mencegah bias konfirmasi.`,
          claimId: targetClaim?.id || null
        });
      }
      nextAction = 'SEARCH_COUNTER_EVIDENCE';
      actionReason = 'Confirmation Bias Guardrail: Klaim kausal/komparatif/kritis membutuhkan pemeriksaan bukti tandingan sebelum disintesis.';
      return ok({
        gapSummary: aiProposal.gapSummary,
        validatedGaps,
        nextAction,
        actionReason,
        requiresHumanReview
      });
    }

    // GUARDRAIL C: Freshness Guardrail
    // Jika topik HIGH volatility dan terdapat critical evidence yang AGING atau STALE
    if (input.topicVolatility === 'HIGH') {
      const hasStaleEvidence = input.evidenceList.some((e) => {
        // Cek apakah tanggal bukti atau sumber > 1 tahun lalu
        const dateStr = e.capturedAt || '';
        const year = new Date(dateStr).getFullYear();
        return year < 2025; // Sederhana: jika lebih lama dari siklus mutakhir
      });

      const hasMissingCurrentDataGap = validatedGaps.some((g) => g.type === 'MISSING_CURRENT_DATA');

      if (hasStaleEvidence || hasMissingCurrentDataGap) {
        if (!hasMissingCurrentDataGap) {
          validatedGaps.push({
            type: 'MISSING_CURRENT_DATA',
            description: 'Topik dengan volatilitas tinggi memerlukan data mutakhir (recent/fresh data).'
          });
        }
        nextAction = 'SEARCH_CURRENT_DATA';
        actionReason = 'Freshness Guardrail: Topik ber-volatilitas tinggi memerlukan penelusuran data mutakhir sebelum editorial handoff.';
        return ok({
          gapSummary: aiProposal.gapSummary,
          validatedGaps,
          nextAction,
          actionReason,
          requiresHumanReview
        });
      }
    }

    // GUARDRAIL D: Primary Source Preference
    // Jika critical claim hanya didukung sumber sekunder / agregator
    const criticalClaims = input.claims.filter((c) => c.importance === 'CRITICAL');
    for (const c of criticalClaims) {
      // Cek apakah ada bukti primer
      const hasPrimary = input.sourcesList.some(
        (s) => s.type === 'PRIMARY_RESEARCH' || s.type === 'DATASET' || s.type === 'ACADEMIC_PAPER'
      );
      if (!hasPrimary && input.sourcesList.length > 0) {
        if (!validatedGaps.some((g) => g.type === 'MISSING_PRIMARY_SOURCE' && g.claimId === c.id)) {
          validatedGaps.push({
            type: 'MISSING_PRIMARY_SOURCE',
            description: `Klaim kritis '${c.statement}' belum didukung oleh sumber primer (hanya sumber sekunder).`,
            claimId: c.id
          });
        }
        nextAction = 'SEARCH_PRIMARY_SOURCE';
        actionReason = 'Primary Source Preference: Klaim kritis sebaiknya diperkuat oleh sumber primer.';
        return ok({
          gapSummary: aiProposal.gapSummary,
          validatedGaps,
          nextAction,
          actionReason,
          requiresHumanReview
        });
      }
    }

    // GUARDRAIL E: Evaluasi Proposal AI untuk Next Action
    // Jika AI menyarankan aksi yang valid dan lulus semua guardrail di atas:
    if (aiProposal.suggestedActions.length > 0) {
      const topAction = aiProposal.suggestedActions[0];
      if (isResearchNextAction(topAction.action)) {
        // Jika AI menyarankan SYNTHESIZE atau STOP, pastikan kesiapan Phase 2A mengizinkan
        if (topAction.action === 'SYNTHESIZE' || topAction.action === 'STOP_RESEARCH') {
          if (input.synthesis.readiness === 'READY_FOR_EDITORIAL') {
            nextAction = topAction.action;
            actionReason = topAction.reason;
          } else {
            // Bukti belum cukup, paksa SEARCH_MORE
            nextAction = 'SEARCH_MORE';
            actionReason = 'AI menyarankan sintesis tetapi kecukupan bukti deterministik belum terpenuhi.';
          }
        } else {
          nextAction = topAction.action;
          actionReason = topAction.reason;
        }
      }
    } else {
      if (input.synthesis.readiness === 'READY_FOR_EDITORIAL') {
        nextAction = 'SYNTHESIZE';
        actionReason = 'Seluruh kecukupan bukti telah terpenuhi.';
      } else {
        nextAction = 'SEARCH_MORE';
        actionReason = 'Melanjutkan penelusuran bukti untuk memenuhi kriteria kecukupan.';
      }
    }

    return ok({
      gapSummary: aiProposal.gapSummary,
      validatedGaps,
      nextAction,
      actionReason,
      requiresHumanReview
    });
  }
}
