/**
 * NexaMOS Canonical Hardened Research Pipeline
 *
 * Sourced from NexaMOS Blog Research Architecture & Invariant Enforcement
 *
 * Doktrin Inti:
 * 1. NO SOURCE → NO EVIDENCE → NO SUPPORTED CLAIM
 * 2. SEARCH RESULT ≠ VERIFIED EVIDENCE
 * 3. Qwen TIDAK BOLEH memiliki otoritas final menetapkan status 'SUPPORTED'.
 * 4. Failure is a valid system state: Dilarang membuat sumber/bukti sintetis saat riset gagal.
 *
 * Rantai Epistemik Kanonikal:
 * USER TOPIC
 *    ↓
 * Qwen Research Planning
 *    ↓
 * Research Questions
 *    ↓
 * User supplied URL?
 *    ├── YES → Direct Source Acquisition (HttpSourceAcquisitionProvider)
 *    └── NO  → Autonomous Discovery via ResearchSearchProviderFactory (Tavily)
 *    ↓
 * Source Acquisition
 *    ↓
 * Evidence Extraction
 *    ↓
 * EvidenceIntegrityValidator
 *    ↓
 * Proposed Claims (Qwen)
 *    ↓
 * DeterministicClaimEvidenceVerifier
 *    ↓
 * Hardened ResearchBrief (Pemisahan kontainer tegas)
 */

import type { Topic } from '../ideation/domain/topic.types.ts';
import type { ResearchBrief } from './orchestrator/research-brief.ts';
import type { ResearchQuestion } from './domain/research-question.ts';
import type { ResearchClaim } from './domain/research-claim.ts';
import type { ResearchEvidence } from './domain/research-evidence.ts';
import type { ResearchSource } from './domain/research-source.ts';
import type { AIResearchProvider } from './orchestrator/ai-research-provider.ts';
import type { SourceCandidate } from './acquisition/source-candidate.ts';
import type { SourceAcquisitionProvider } from './acquisition/providers/source-acquisition-provider.ts';
import type { ResearchSearchProvider } from './acquisition/providers/research-search-provider.ts';
import { HttpSourceAcquisitionProvider } from './acquisition/providers/http-source-acquisition-provider.ts';
import { ResearchSearchProviderFactory, type SupportedSearchProvider } from './acquisition/providers/research-search-provider-factory.ts';
import { ResearchIngestionService } from './ingestion/research-ingestion-service.ts';
import { InMemoryResearchSourceRepository } from './repository/in-memory-research-source-repository.ts';
import { InMemoryResearchEvidenceRepository } from './repository/in-memory-research-evidence-repository.ts';
import { InMemoryResearchEventRepository } from './repository/in-memory-research-event-repository.ts';
import { EvidenceIntegrityValidator } from './evidence-integrity-validator.ts';
import { DeterministicClaimEvidenceVerifier } from './claim-evidence-verifier.ts';
import { EvidenceRelevanceSelector } from './relevance/evidence-relevance-selector.ts';
import { DeterministicCrossLanguageNormalizer } from './grounding/cross-language-grounding.ts';
import { ok, err, createResearchDomainError, type Result, type ResearchDomainError } from './domain/research-result.ts';

export interface CanonicalResearchPipelineDependencies {
  aiResearchProvider?: AIResearchProvider;
  acquisitionProvider?: SourceAcquisitionProvider;
  searchProvider?: ResearchSearchProvider;
  searchProviderType?: SupportedSearchProvider;
  integrityValidator?: EvidenceIntegrityValidator;
  claimVerifier?: DeterministicClaimEvidenceVerifier;
  evidenceRelevanceSelector?: EvidenceRelevanceSelector;
}

export interface CanonicalResearchInput {
  topic: Topic;
  directUrls?: string[];
  actor?: string;
  maxDiscoveryResults?: number;
  projectId?: string;
}

export interface SupportingEvidenceTrace {
  evidenceId: string;
  content: string;
  sourceUrl?: string | null;
  publisher?: string | null;
}

export interface ClaimProvenanceTrace {
  claimId: string;
  statement: string;
  status: string;
  supportingEvidence: SupportingEvidenceTrace[];
}

export interface CanonicalResearchExecutionResult {
  researchBrief: ResearchBrief;
  provenanceTrace: ClaimProvenanceTrace[];
  acquiredSources: ResearchSource[];
  verifiedEvidence: ResearchEvidence[];
  metrics: {
    researchQuestionsCount: number;
    searchRequestsCount: number;
    candidateSourcesCount: number;
    acquiredSourcesCount: number;
    evidenceCandidatesCount: number;
    verifiedEvidenceCount: number;
    proposedClaimsCount: number;
    supportedClaimsCount: number;
    unverifiedClaimsCount: number;
    unsupportedClaimsCount: number;
  };
}

export class CanonicalResearchPipeline {
  private aiResearchProvider?: AIResearchProvider;
  private acquisitionProvider: SourceAcquisitionProvider;
  private searchProvider?: ResearchSearchProvider;
  private searchProviderType?: SupportedSearchProvider;
  private integrityValidator: EvidenceIntegrityValidator;
  private claimVerifier: DeterministicClaimEvidenceVerifier;
  private evidenceRelevanceSelector: EvidenceRelevanceSelector;

  constructor(deps: CanonicalResearchPipelineDependencies = {}) {
    this.aiResearchProvider = deps.aiResearchProvider;
    this.acquisitionProvider = deps.acquisitionProvider || new HttpSourceAcquisitionProvider();
    this.searchProvider = deps.searchProvider;
    this.searchProviderType = deps.searchProviderType;
    this.integrityValidator = deps.integrityValidator || new EvidenceIntegrityValidator();

    const aiClient = (this.aiResearchProvider as any)?.getClient?.();
    this.claimVerifier =
      deps.claimVerifier ||
      new DeterministicClaimEvidenceVerifier({
        crossLanguageNormalizer: new DeterministicCrossLanguageNormalizer(aiClient)
      });

    this.evidenceRelevanceSelector = deps.evidenceRelevanceSelector || new EvidenceRelevanceSelector();
  }

  /**
   * Menjalankan siklus kanonikal riset yang ter-hardening
   */
  async execute(
    input: CanonicalResearchInput
  ): Promise<Result<CanonicalResearchExecutionResult, ResearchDomainError>> {
    const actor = input.actor || 'canonical-research-pipeline';
    const projectId = input.projectId || `proj-${Date.now().toString(36)}`;
    const directUrls = (input.directUrls || []).map((u) => u.trim()).filter((u) => u.length > 0);
    const maxDiscoveryResults = input.maxDiscoveryResults || 5;

    // Repositori in-memory terisolasi per sesi riset
    const sourceRepo = new InMemoryResearchSourceRepository();
    const evidenceRepo = new InMemoryResearchEvidenceRepository();
    const eventRepo = new InMemoryResearchEventRepository();
    const ingestionService = new ResearchIngestionService({ sourceRepo, evidenceRepo, eventRepo });

    // =========================================================================
    // 1. RESEARCH PLANNING (Qwen Reasoning Layer)
    // =========================================================================
    let questions: ResearchQuestion[] = [];

    if (this.aiResearchProvider) {
      const planRes = await this.aiResearchProvider.planResearch({ topic: input.topic });
      if (planRes.ok && planRes.value.researchQuestions?.length > 0) {
        questions = planRes.value.researchQuestions.map((q: any, idx: number) => {
          let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
          if (q.priority === 'CRITICAL') priority = 'HIGH';
          else if (q.priority === 'IMPORTANT') priority = 'MEDIUM';
          else if (q.priority === 'EXPLORATORY') priority = 'LOW';

          return {
            id: `rq-${idx + 1}`,
            question: q.question.trim(),
            priority,
            status: 'OPEN' as const
          };
        });
      }
    }

    // Fallback pertanyaan jika AI tidak tersedia
    if (questions.length === 0) {
      questions = [
        {
          id: 'rq-1',
          question: `Data empiris, arsitektur sistem, dan dinamika pasar mengenai ${input.topic.title}`,
          priority: 'HIGH',
          status: 'OPEN'
        }
      ];
    }

    // =========================================================================
    // 2. SOURCING (Direct URL vs Autonomous Tavily Discovery)
    // =========================================================================
    const candidates: SourceCandidate[] = [];
    let searchRequestsCount = 0;

    if (directUrls.length > 0) {
      // 2a. Direct URL Bypass: User memberikan URL secara eksplisit -> TIDAK memanggil Tavily
      for (let i = 0; i < directUrls.length; i++) {
        const url = directUrls[i];
        candidates.push({
          id: `cand-direct-${i + 1}`,
          queryId: questions[0].id,
          researchProjectId: projectId,
          url,
          title: input.topic.title,
          provider: 'DIRECT_INPUT',
          discoveredAt: new Date().toISOString(),
          status: 'DISCOVERED'
        });
      }
    } else {
      // 2b. Autonomous Discovery via ResearchSearchProvider (Tavily)
      const searchProvider = this.searchProvider || ResearchSearchProviderFactory.getSearchProvider(this.searchProviderType);
      const queryText = questions[0].question;

      searchRequestsCount++;
      let searchResults;
      try {
        searchResults = await searchProvider.search(queryText, {
          maxResults: maxDiscoveryResults,
          timeoutMs: 20000
        });
      } catch (err: any) {
        return err(
          createResearchDomainError(
            'SOURCE_DISCOVERY_FAILED',
            `Pencarian sumber otonom gagal: ${err.message || String(err)}`
          )
        );
      }

      // Hard Invariant Check: Jika 0 hasil, GAGALKAN secara jujur (NO SOURCE FOUND)
      if (!searchResults || searchResults.length === 0) {
        return err(
          createResearchDomainError(
            'NO_SOURCE_FOUND',
            `Tidak ditemukan kandidat sumber di web untuk pertanyaan: "${queryText}". Dilarang membuat fallback sintetis.`
          )
        );
      }

      for (let i = 0; i < searchResults.length; i++) {
        const sr = searchResults[i];
        candidates.push({
          id: `cand-search-${i + 1}`,
          queryId: questions[0].id,
          researchProjectId: projectId,
          title: sr.title,
          url: sr.url,
          snippet: sr.snippet || null,
          publisher: sr.publisher || null,
          publicationDate: sr.publishedAt || null,
          provider: searchProvider.providerName,
          rank: i + 1,
          status: 'DISCOVERED',
          discoveredAt: sr.retrievedAt || new Date().toISOString()
        });
      }
    }

    // =========================================================================
    // 3. SOURCE ACQUISITION (Http Download & Integrity Validation)
    // =========================================================================
    const acquiredSources: ResearchSource[] = [];
    const rawAcquisitions: Array<{ candidate: SourceCandidate; rawInput: any }> = [];

    for (const cand of candidates) {
      try {
        const acqRes = await this.acquisitionProvider.acquire(cand, { timeoutMs: 15000 });
        if (acqRes.ok) {
          rawAcquisitions.push({
            candidate: cand,
            rawInput: {
              ...acqRes.value,
              researchProjectId: projectId
            }
          });
        }
      } catch {
        // Abaikan URL yang gagal diunduh / timeout, evaluasi kelayakan nanti
      }
    }

    // Hard Invariant Check: Jika seluruh akuisisi gagal, GAGALKAN pipeline
    if (rawAcquisitions.length === 0) {
      return err(
        createResearchDomainError(
          'SOURCE_ACQUISITION_FAILED',
          `Seluruh upaya akuisisi konten sumber (${candidates.length} kandidat) gagal diunduh atau diblokir.`
        )
      );
    }

    // =========================================================================
    // 4. INGESTION & EVIDENCE EXTRACTION + INTEGRITY CHECK
    // =========================================================================
    let totalEvidenceCandidates = 0;
    const verifiedEvidenceList: ResearchEvidence[] = [];

    for (const item of rawAcquisitions) {
      const ingestRes = await ingestionService.ingest(item.rawInput, { extractEvidence: true });
      if (ingestRes.ok) {
        const source = ingestRes.value.source;
        acquiredSources.push(source);

        const persistedEvidence = ingestRes.value.persistedEvidence || [];
        totalEvidenceCandidates += persistedEvidence.length;

        // Validasi integritas setiap butir bukti secara deterministik
        for (const ev of persistedEvidence) {
          const check = this.integrityValidator.validate({
            evidence: ev,
            source,
            sourceRawContent: item.rawInput.content
          });

          // Hard Rule: Bukti hanya diakui jika verified === true dan bukan publisher palsu
          if (check.verified) {
            verifiedEvidenceList.push({
              ...ev,
              verified: true,
              provenanceType: check.provenanceType,
              sourceUrl: source.url || null
            });
          }
        }
      }
    }

    // Hard Invariant Check: Jika tidak ada bukti terverifikasi yang berhasil diekstrak
    if (verifiedEvidenceList.length === 0) {
      return err(
        createResearchDomainError(
          'NO_VERIFIED_EVIDENCE',
          'Tidak ditemukan bukti empiris terverifikasi dari sumber yang diakuisisi (NO SOURCE -> NO EVIDENCE).'
        )
      );
    }

    // =========================================================================
    // 5. CLAIM PROPOSAL & DETERMINISTIC VERIFICATION GATE
    // =========================================================================
    const MAX_CLAIM_PROPOSAL_EVIDENCE = 20;
    const selectedEvidenceForClaims = this.evidenceRelevanceSelector.selectTopEvidence(
      verifiedEvidenceList,
      input.topic,
      questions,
      { maxItems: MAX_CLAIM_PROPOSAL_EVIDENCE }
    );

    let rawProposedClaims: any[] = [];

    if (this.aiResearchProvider) {
      const claimsProposalRes = await this.aiResearchProvider.proposeClaims({
        projectId,
        evidence: selectedEvidenceForClaims,
        questions
      });

      if (claimsProposalRes.ok) {
        rawProposedClaims = claimsProposalRes.value;
      }
    }

    // Fallback perumusan klaim langsung dari bukti relevan terverifikasi jika LLM proposal kosong
    if (rawProposedClaims.length === 0) {
      rawProposedClaims = selectedEvidenceForClaims.slice(0, 5).map((ev, idx) => ({
        statement: ev.content.slice(0, 150),
        claimType: 'FACTUAL',
        importance: idx === 0 ? 'CRITICAL' : 'SUPPORTING'
      }));
    }

    const supportedClaims: ResearchClaim[] = [];
    const unverifiedClaims: ResearchClaim[] = [];
    const unsupportedClaims: ResearchClaim[] = [];
    const provenanceTrace: ClaimProvenanceTrace[] = [];

    for (let idx = 0; idx < rawProposedClaims.length; idx++) {
      const pc = rawProposedClaims[idx];
      const claim: ResearchClaim = {
        id: `claim-${idx + 1}`,
        researchProjectId: projectId,
        statement: pc.statement.trim(),
        claimType: pc.claimType || 'FACTUAL',
        importance: pc.importance || 'CRITICAL',
        status: 'UNVERIFIED', // DOKTRIN KETAT: default status tidak boleh SUPPORTED
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Gerbang verifikasi deterministik
      const verifyRes = await this.claimVerifier.verify(claim, verifiedEvidenceList);
      claim.status = verifyRes.status;
      claim.supportingEvidenceIds = verifyRes.supportingEvidenceIds;

      // Kumpulkan provenance trace untuk observabilitas
      const supportingEvDocs: SupportingEvidenceTrace[] = [];
      for (const evId of verifyRes.supportingEvidenceIds) {
        const evMatch = verifiedEvidenceList.find((e) => e.id === evId);
        if (evMatch) {
          const srcMatch = acquiredSources.find((s) => s.id === evMatch.sourceId);
          supportingEvDocs.push({
            evidenceId: evMatch.id,
            content: evMatch.content,
            sourceUrl: evMatch.sourceUrl || srcMatch?.url || null,
            publisher: srcMatch?.publisher || null
          });
        }
      }

      provenanceTrace.push({
        claimId: claim.id,
        statement: claim.statement,
        status: claim.status,
        supportingEvidence: supportingEvDocs
      });

      if (claim.status === 'SUPPORTED') {
        // Hard Invariant: Wajib memiliki setidaknya 1 bukti terverifikasi
        if (supportingEvDocs.length > 0) {
          supportedClaims.push(claim);
        } else {
          claim.status = 'UNVERIFIED';
          unverifiedClaims.push(claim);
        }
      } else if (claim.status === 'PARTIALLY_SUPPORTED' || claim.status === 'UNVERIFIED') {
        unverifiedClaims.push(claim);
      } else {
        unsupportedClaims.push(claim);
      }
    }

    // =========================================================================
    // 6. BRIEF PACKAGING & READINESS EVALUATION
    // =========================================================================
    const isSufficient = supportedClaims.length > 0;

    const sourceIndex = acquiredSources.map((s, idx) => ({
      sourceId: s.id || `src-${idx + 1}`,
      title: s.title || input.topic.title,
      url: s.url || '',
      canonicalUrl: s.url || '',
      publisher: s.publisher || 'Referensi Web',
      sourceType: s.type || 'COMPANY_PUBLICATION',
      authorityScore: s.qualityAssessment?.authority ?? 80,
      publicationAllowed: true
    }));

    const evidenceIndex = selectedEvidenceForClaims.map((e) => ({
      evidenceId: e.id,
      sourceId: e.sourceId,
      quote: e.content.slice(0, 250),
      level: e.evidenceLevel || 'E2',
      verified: true, // Terkonfirmasi lolos validasi integritas
      provenanceType: e.provenanceType || 'EXTERNAL_EVIDENCE',
      sourceUrl: e.sourceUrl || undefined
    }));

    const researchBrief: ResearchBrief = {
      id: `brief-${Date.now().toString(36)}`,
      topicId: input.topic.id,
      researchProjectId: projectId,
      objective: input.topic.title,
      answeredQuestions: isSufficient ? questions : [],
      openQuestions: isSufficient ? [] : questions,
      supportedClaims,
      partiallySupportedClaims: [],
      disputedClaims: [],
      unverifiedClaims,
      unsupportedClaims,
      internalKnowledge: [],
      originalAnalysis: [],
      keyFindings: [
        {
          id: 'finding-01',
          researchProjectId: projectId,
          statement: supportedClaims[0]?.statement || `Temuan investigasi untuk ${input.topic.title}`,
          supportingClaimIds: supportedClaims.map((c) => c.id),
          confidence: isSufficient ? 'HIGH' : 'LOW',
          limitations: isSufficient ? [] : ['Klaim belum terverifikasi secara memadai.'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      limitations: isSufficient ? [] : ['Riset tidak menghasilkan klaim berstatus SUPPORTED.'],
      researchGaps: [],
      recommendedEditorialAngle: `Analisis strategis ter-grounding mengenai ${input.topic.title}`,
      sourceIndex,
      evidenceIndex,
      readiness: isSufficient ? 'READY_FOR_EDITORIAL' : 'NOT_READY',
      readinessReason: isSufficient
        ? `Kecukupan bukti riset terpenuhi: ${supportedClaims.length} klaim faktual berhasil diverifikasi.`
        : 'Tidak ada klaim berstatus SUPPORTED (NO SOURCE -> NO EVIDENCE -> NO SUPPORTED CLAIM).',
      generatedAt: new Date().toISOString()
    };

    return ok({
      researchBrief,
      provenanceTrace,
      acquiredSources,
      verifiedEvidence: verifiedEvidenceList,
      metrics: {
        researchQuestionsCount: questions.length,
        searchRequestsCount,
        candidateSourcesCount: candidates.length,
        acquiredSourcesCount: acquiredSources.length,
        evidenceCandidatesCount: totalEvidenceCandidates,
        verifiedEvidenceCount: verifiedEvidenceList.length,
        proposedClaimsCount: rawProposedClaims.length,
        supportedClaimsCount: supportedClaims.length,
        unverifiedClaimsCount: unverifiedClaims.length,
        unsupportedClaimsCount: unsupportedClaims.length
      }
    });
  }
}
