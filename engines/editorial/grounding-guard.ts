/**
 * NexaMOS Grounding Guard
 *
 * Sourced from NexaMOS Blog Master Reference & Phase 3A specifications
 * Memvalidasi integritas sitasi, klaim numerik, kutipan langsung, serta pelestarian
 * limitasi riset dan bukti tandingan (counter-evidence).
 */

import type { ArticleDraft } from './article-draft.ts';
import type { EditorialPlan } from './editorial-plan.ts';
import type { ResearchBrief } from '../research/orchestrator/research-brief.ts';
import type { GroundingGuardResult, GroundingIssue, GuardStatus } from './editorial-generation-result.ts';

export interface GroundingGuardOptions {
  strictNumericalCheck?: boolean;
  strictQuoteCheck?: boolean;
  strictLimitationCheck?: boolean;
}

export class GroundingGuard {
  private readonly options: GroundingGuardOptions;

  constructor(options: GroundingGuardOptions = {}) {
    this.options = {
      strictNumericalCheck: true,
      strictQuoteCheck: true,
      strictLimitationCheck: true,
      ...options
    };
  }

  /**
   * Mengevaluasi draf artikel terhadap ResearchBrief kanonikal
   */
  public evaluate(
    draft: ArticleDraft,
    brief: ResearchBrief,
    plan?: EditorialPlan | null
  ): GroundingGuardResult {
    const issues: GroundingIssue[] = [];

    // 1. Citation & Entity Integrity Guard
    this.checkCitationIntegrity(draft, brief, issues);

    // 2. Numerical Claim Guard
    if (this.options.strictNumericalCheck) {
      this.checkNumericalClaims(draft, brief, issues);
    }

    // 3. Quote Guard
    if (this.options.strictQuoteCheck) {
      this.checkDirectQuotes(draft, brief, issues);
    }

    // 4. Research Limitation Preservation Guard
    if (this.options.strictLimitationCheck) {
      this.checkLimitationPreservation(draft, brief, plan, issues);
    }

    // 5. Counter-Evidence & Disputed Claims Guard
    this.checkCounterEvidencePreservation(draft, brief, issues);

    // 6. Commodity Draft & Information Gain Check
    this.checkInformationGain(draft, issues);

    // Tentukan status akhir
    let status: GuardStatus = 'PASS';
    const hasCritical = issues.some((i) => i.severity === 'CRITICAL');
    const hasWarning = issues.some((i) => i.severity === 'WARNING');

    if (hasCritical) {
      status = 'FAIL';
    } else if (hasWarning) {
      status = 'REVIEW_REQUIRED';
    }

    const summary =
      status === 'PASS'
        ? 'Grounding Guard: Seluruh klaim, sitasi, angka, dan kutipan tervalidasi terhadap ResearchBrief.'
        : `Grounding Guard: Ditemukan ${issues.length} catatan grounding (${issues.filter((i) => i.severity === 'CRITICAL').length} kritis, ${issues.filter((i) => i.severity === 'WARNING').length} peringatan).`;

    return {
      status,
      issues,
      summary
    };
  }

  /**
   * 1. Memeriksa keberadaan Claim ID, Evidence ID, dan Source ID di ResearchBrief
   */
  private checkCitationIntegrity(
    draft: ArticleDraft,
    brief: ResearchBrief,
    issues: GroundingIssue[]
  ): void {
    const extractClaimId = (c: any): string | undefined => c.id || c.claimId;
    const validClaimIds = new Set<string>([
      ...(brief.supportedClaims || []).map(extractClaimId).filter((id): id is string => Boolean(id)),
      ...((brief as any).partiallySupportedClaims || []).map(extractClaimId).filter((id): id is string => Boolean(id)),
      ...((brief as any).disputedClaims || []).map(extractClaimId).filter((id): id is string => Boolean(id)),
      ...((brief as any).unsupportedClaims || []).map(extractClaimId).filter((id): id is string => Boolean(id)),
      ...((brief as any).keyFindings || []).map((f: any) => f.id || f.findingId).filter((id): id is string => Boolean(id))
    ]);

    const validSourceIds = new Set<string>(brief.sourceIndex.map((s) => s.sourceId));
    const validEvidenceIds = new Set<string>(brief.evidenceIndex.map((e) => e.evidenceId));

    // Periksa ClaimUsages
    for (const usage of draft.claimUsages) {
      if (!validClaimIds.has(usage.claimId)) {
        issues.push({
          code: 'UNKNOWN_CLAIM_REFERENCE',
          message: `ClaimUsage '${usage.id}' mereferensikan claimId fiktif '${usage.claimId}' yang tidak terdaftar di ResearchBrief.`,
          severity: 'CRITICAL',
          sectionId: usage.sectionId,
          claimId: usage.claimId,
          contextSnippet: usage.statement
        });
      }
    }

    // Periksa CitationMap
    for (const entry of draft.citationMap) {
      if (!validClaimIds.has(entry.claimId)) {
        issues.push({
          code: 'UNKNOWN_CLAIM_REFERENCE',
          message: `CitationMap mereferensikan claimId fiktif '${entry.claimId}'.`,
          severity: 'CRITICAL',
          claimId: entry.claimId
        });
      }

      for (const sourceId of entry.sourceIds) {
        if (!validSourceIds.has(sourceId)) {
          issues.push({
            code: 'UNKNOWN_SOURCE_REFERENCE',
            message: `CitationMap mereferensikan sourceId fiktif '${sourceId}' yang tidak terdaftar di ResearchBrief.`,
            severity: 'CRITICAL',
            claimId: entry.claimId
          });
        }
      }

      for (const evidenceId of entry.evidenceIds) {
        if (!validEvidenceIds.has(evidenceId)) {
          issues.push({
            code: 'UNKNOWN_EVIDENCE_REFERENCE',
            message: `CitationMap mereferensikan evidenceId fiktif '${evidenceId}' yang tidak terdaftar di ResearchBrief.`,
            severity: 'CRITICAL',
            claimId: entry.claimId
          });
        }
      }
    }
  }

  /**
   * 2. Numerical Claim Guard: Memastikan klaim numerik faktual (e.g. 85%, Rp10 juta, 10.000 sampel)
   * didukung oleh bukti dan klaim ter-grounding.
   */
  private checkNumericalClaims(
    draft: ArticleDraft,
    brief: ResearchBrief,
    issues: GroundingIssue[]
  ): void {
    // Regex untuk angka faktual: persentase (\d+%), mata uang (Rp\s*\d+), angka besar berdesimal/pemisah ribuan
    const percentageRegex = /\b\d+(\.\d+)?%/g;
    const largeNumberRegex = /\b\d{1,3}([,.]\d{3})+\b/g;

    // Kumpulkan seluruh teks bukti yang ada di ResearchBrief
    const briefEvidenceTexts = (brief.evidenceIndex || []).map((e) => e.quote).join(' ');
    const briefClaimTexts = [
      ...(brief.supportedClaims || []).map((c) => c.statement),
      ...((brief as any).partiallySupportedClaims || []).map((c: any) => c.statement)
    ].join(' ');
    const allBriefFactualText = `${briefEvidenceTexts} ${briefClaimTexts}`;
    const normalizedBriefText = allBriefFactualText.replace(/,/g, '.');

    for (const section of draft.sections) {
      const content = section.content;

      // Cari persentase
      const percentages = content.match(percentageRegex) || [];
      for (const pct of percentages) {
        // Cek apakah angka persentase ini terdapat dalam bukti atau klaim ResearchBrief (dengan toleransi koma/titik)
        const normalizedPct = pct.replace(/,/g, '.');
        const foundInBrief = allBriefFactualText.includes(pct) || normalizedBriefText.includes(normalizedPct);
        const hasClaimUsage = (section.claimUsageIds && section.claimUsageIds.length > 0) ||
          (draft.claimUsages && draft.claimUsages.length > 0);

        if (!foundInBrief || !hasClaimUsage) {
          issues.push({
            code: 'UNSUPPORTED_NUMERICAL_CLAIM',
            message: `Seksi '${section.heading || section.id}' memuat persentase faktual '${pct}' tanpa dukungan bukti terverifikasi pada ResearchBrief.`,
            severity: 'CRITICAL',
            sectionId: section.id,
            contextSnippet: pct
          });
        }
      }

      // Cari angka besar / statistik
      const largeNumbers = content.match(largeNumberRegex) || [];
      for (const num of largeNumbers) {
        // Abaikan tahun seperti 2024, 2025, 2026 jika panjangnya 4 digit biasa
        const isYear = /^(19|20)\d{2}$/.test(num);
        if (isYear) continue;

        const normalizedNum = num.replace(/,/g, '.');
        const foundInBrief = allBriefFactualText.includes(num) || normalizedBriefText.includes(normalizedNum);
        const hasClaimUsage = (section.claimUsageIds && section.claimUsageIds.length > 0) ||
          (draft.claimUsages && draft.claimUsages.length > 0);

        if (!foundInBrief || !hasClaimUsage) {
          issues.push({
            code: 'UNSUPPORTED_NUMERICAL_CLAIM',
            message: `Seksi '${section.heading || section.id}' memuat angka statistik '${num}' yang tidak terdaftar dalam bukti ResearchBrief.`,
            severity: 'WARNING',
            sectionId: section.id,
            contextSnippet: num
          });
        }
      }
    }
  }

  /**
   * 3. Quote Guard: Memastikan direct quote ("...") benar-benar ada di ResearchBrief evidence
   */
  private checkDirectQuotes(
    draft: ArticleDraft,
    brief: ResearchBrief,
    issues: GroundingIssue[]
  ): void {
    // Tangkap teks di dalam kutipan "..." atau “...”
    const quoteRegex = /["“]([^"”]{10,})["”]/g;

    const validQuotes = brief.evidenceIndex.map((e) => e.quote.trim().toLowerCase());

    for (const section of draft.sections) {
      let match: RegExpExecArray | null;
      while ((match = quoteRegex.exec(section.content)) !== null) {
        const quotedText = match[1].trim();
        const quotedLower = quotedText.toLowerCase();

        // Periksa apakah kutipan ada di salah satu bukti terdaftar
        const isMatched = validQuotes.some((vq) => vq.includes(quotedLower) || quotedLower.includes(vq));

        if (!isMatched) {
          issues.push({
            code: 'UNSUPPORTED_QUOTE',
            message: `Seksi '${section.heading || section.id}' menggunakan kutipan langsung "${quotedText}" yang tidak ditemukan pada ResearchEvidence mana pun.`,
            severity: 'CRITICAL',
            sectionId: section.id,
            contextSnippet: quotedText
          });
        }
      }
    }
  }

  /**
   * 4. Limitation Preservation Guard: Memastikan limitasi metodologis dipertimbangkan
   */
  private checkLimitationPreservation(
    draft: ArticleDraft,
    brief: ResearchBrief,
    plan: EditorialPlan | null | undefined,
    issues: GroundingIssue[]
  ): void {
    if (!brief.limitations || brief.limitations.length === 0) return;

    // Berlaku ketat untuk tipe analitis dan riset primer
    const analyticalTypes = ['ANALYSIS', 'ORIGINAL_RESEARCH', 'TREND_ANALYSIS', 'COMPARATIVE_ANALYSIS'];
    if (!analyticalTypes.includes(draft.articleType)) return;

    // Cek apakah draf atau rencana menyentuh keterbatasan/limitasi
    const entireContent = draft.sections.map((s) => s.content).join(' ').toLowerCase();
    const hasCounterpointSection = draft.sections.some(
      (s) => s.purpose === 'COUNTERPOINT' || s.purpose === 'CONCLUSION'
    );

    const limitationKeywords = [
      'limitasi',
      'keterbatasan',
      'bias',
      'sampel',
      'cakupan',
      'limitation',
      'caveat',
      'asumsi',
      'konteks'
    ];

    const mentionsLimitation = limitationKeywords.some((k) => entireContent.includes(k));

    if (!hasCounterpointSection || !mentionsLimitation) {
      issues.push({
        code: 'MATERIAL_LIMITATION_OMITTED',
        message: `ResearchBrief memiliki ${brief.limitations.length} keterbatasan material, namun draf ${draft.articleType} tidak menyediakan seksi atau pembahasan limitasi/counterpoint.`,
        severity: 'WARNING'
      });
    }
  }

  /**
   * 5. Counter-Evidence & Disputed Claims Guard: Mencegah klaim sengketa disajikan sebagai settled fact
   */
  private checkCounterEvidencePreservation(
    draft: ArticleDraft,
    brief: ResearchBrief,
    issues: GroundingIssue[]
  ): void {
    if (!brief.disputedClaims || brief.disputedClaims.length === 0) return;

    const hasCounterpointSection = draft.sections.some(
      (s) => s.purpose === 'COUNTERPOINT' || s.purpose === 'ANALYSIS'
    );

    const disputedClaimIds = new Set(brief.disputedClaims.map((c) => c.id));
    const usedDisputedClaims = draft.claimUsages.filter((u) => disputedClaimIds.has(u.claimId));

    if (usedDisputedClaims.length > 0 && !hasCounterpointSection) {
      issues.push({
        code: 'DISPUTED_CLAIM_UNBALANCED',
        message: `Artikel menggunakan klaim bersengketa (${usedDisputedClaims.map((u) => u.claimId).join(', ')}) tanpa seksi COUNTERPOINT atau ulasan dua sisi yang berimbang.`,
        severity: 'WARNING'
      });
    }
  }

  /**
   * 6. Information Gain / Commodity Risk Check: Memastikan artikel menyertakan nilai tambah orisinal NexaMOS
   */
  private checkInformationGain(draft: ArticleDraft, issues: GroundingIssue[]): void {
    // Artikel Flagship atau Authority wajib memiliki kerangka orisinal atau aplikasi praktis
    if (draft.editorialRole === 'FLAGSHIP' || draft.editorialRole === 'AUTHORITY') {
      const hasOriginalFrameworkOrApplication = draft.sections.some((s) => {
        const p = (s.purpose || '').toUpperCase();
        return p.includes('FRAMEWORK') || p.includes('PRACTICAL_APPLICATION') || p.includes('IMPLICATION');
      });

      if (!hasOriginalFrameworkOrApplication) {
        issues.push({
          code: 'COMMODITY_DRAFT_RISK',
          message: `Artikel peran '${draft.editorialRole}' berisiko menjadi komoditas generik karena tidak menyertakan seksi FRAMEWORK, IMPLICATION, atau PRACTICAL_APPLICATION orisinal NexaMOS.`,
          severity: 'WARNING'
        });
      }
    }
  }
}
