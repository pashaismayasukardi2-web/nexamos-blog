/**
 * NexaMOS Research Ingestion Service
 *
 * Sourced from NexaMOS Blog Phase 2B specifications
 * Deterministic Ingestion Pipeline:
 * RAW SOURCE -> PARSER -> NORMALIZER -> DEDUPLICATION -> PERSIST SOURCE -> EXTRACT EVIDENCE -> PERSIST EVIDENCE
 */

import type { SourceFormat, RawSourceInput, NormalizedSourceDocument } from './source-ingestion.ts';
import type { IngestionResult } from './ingestion-result.ts';
import type { EvidenceCandidate } from './evidence-extractor.ts';
import type { DuplicateStatus } from './source-deduplicator.ts';
import type { ResearchSource } from '../domain/research-source.ts';
import type { ResearchEvidence } from '../domain/research-evidence.ts';
import type { ResearchEvent, ResearchEventType } from '../domain/research-event.ts';
import type { SourceType } from '../domain/source-type.ts';
import type { EvidenceLevel } from '../../ideation/domain/evidence-level.ts';
import type { SourceQualityAssessment } from '../domain/source-quality.ts';
import type { Result, ResearchDomainError } from '../domain/research-result.ts';
import { ok, err, createResearchDomainError } from '../domain/research-result.ts';

import { ParserRegistry } from './parsers/parser-registry.ts';
import { SourceNormalizer } from './source-normalizer.ts';
import { SourceDeduplicator } from './source-deduplicator.ts';
import { EvidenceExtractor } from './evidence-extractor.ts';
import { EvidenceIntegrityValidator } from '../evidence-integrity-validator.ts';
import type { ResearchSourceRepository } from '../repository/research-source-repository.ts';
import type { ResearchEvidenceRepository } from '../repository/research-evidence-repository.ts';
import type { ResearchEventRepository } from '../repository/research-event-repository.ts';

export interface ResearchIngestionServiceDependencies {
  sourceRepo: ResearchSourceRepository;
  evidenceRepo: ResearchEvidenceRepository;
  eventRepo: ResearchEventRepository;
  parserRegistry?: ParserRegistry;
  normalizer?: SourceNormalizer;
  deduplicator?: SourceDeduplicator;
  extractor?: EvidenceExtractor;
  integrityValidator?: EvidenceIntegrityValidator;
}

export interface ResearchIngestionOptions {
  actor?: string;
  rejectDuplicates?: boolean;
  defaultEvidenceLevel?: EvidenceLevel;
  extractEvidence?: boolean;
}

export class ResearchIngestionService {
  private sourceRepo: ResearchSourceRepository;
  private evidenceRepo: ResearchEvidenceRepository;
  private eventRepo: ResearchEventRepository;
  private parserRegistry: ParserRegistry;
  private normalizer: SourceNormalizer;
  private deduplicator: SourceDeduplicator;
  private extractor: EvidenceExtractor;
  private integrityValidator: EvidenceIntegrityValidator;

  constructor(deps: ResearchIngestionServiceDependencies) {
    this.sourceRepo = deps.sourceRepo;
    this.evidenceRepo = deps.evidenceRepo;
    this.eventRepo = deps.eventRepo;
    this.parserRegistry = deps.parserRegistry || new ParserRegistry();
    this.normalizer = deps.normalizer || new SourceNormalizer();
    this.deduplicator = deps.deduplicator || new SourceDeduplicator();
    this.extractor = deps.extractor || new EvidenceExtractor();
    this.integrityValidator = deps.integrityValidator || new EvidenceIntegrityValidator();
  }

  async ingest(
    input: RawSourceInput,
    options?: ResearchIngestionOptions
  ): Promise<Result<IngestionResult, ResearchDomainError>> {
    const actor = options?.actor || 'ingestion-agent';

    // 1. Validasi Input Dasar
    if (!input.content || input.content.trim().length === 0) {
      return err(
        createResearchDomainError('INVALID_SOURCE_INPUT', 'Konten source raw wajib diisi dan tidak boleh kosong.')
      );
    }
    if (!input.researchProjectId || input.researchProjectId.trim().length === 0) {
      return err(
        createResearchDomainError('INVALID_SOURCE_INPUT', 'researchProjectId wajib diisi.')
      );
    }
    if (!input.format) {
      return err(
        createResearchDomainError('INVALID_SOURCE_INPUT', 'format source wajib ditentukan.')
      );
    }

    // 2. Cek ketersediaan parser untuk format ini
    const parser = this.parserRegistry.getParser(input.format);
    if (!parser) {
      return err(
        createResearchDomainError(
          'UNSUPPORTED_SOURCE_FORMAT',
          `Format sumber '${input.format}' tidak didukung oleh ingestion pipeline.`
        )
      );
    }

    // Rekam event: SOURCE_INGESTION_STARTED
    await this.recordEvent(
      input.researchProjectId,
      'SOURCE_INGESTION_STARTED',
      actor,
      `Memulai proses ingestion sumber format '${input.format}' untuk proyek '${input.researchProjectId}'.`,
      { format: input.format, sourceType: input.sourceType }
    );

    // 3. Eksekusi Parsing
    let parsedDoc: NormalizedSourceDocument;
    try {
      parsedDoc = await parser.parse(input);
    } catch (parseError) {
      return err(
        createResearchDomainError(
          'PARSER_FAILED',
          `Gagal mem-parsing sumber format '${input.format}': ${(parseError as Error).message}`
        )
      );
    }

    // Rekam event: SOURCE_PARSED
    await this.recordEvent(
      input.researchProjectId,
      'SOURCE_PARSED',
      actor,
      `Berhasil parsing konten menjadi ${parsedDoc.sections.length} section dan ${parsedDoc.tables.length} tabel.`,
      {
        sectionCount: parsedDoc.sections.length,
        tableCount: parsedDoc.tables.length,
        contentHash: parsedDoc.contentHash
      }
    );

    // 4. Eksekusi Normalisasi
    let normalizedDoc: NormalizedSourceDocument;
    try {
      normalizedDoc = this.normalizer.normalize(parsedDoc);
    } catch (normError) {
      return err(
        createResearchDomainError(
          'NORMALIZATION_FAILED',
          `Gagal normalisasi dokumen sumber: ${(normError as Error).message}`
        )
      );
    }

    // 5. Cek Duplikasi (Content Hash & Metadata Signature)
    const dupCheck = this.deduplicator.check(normalizedDoc, input.content);

    if (dupCheck.status !== 'UNIQUE') {
      await this.recordEvent(
        input.researchProjectId,
        'SOURCE_DUPLICATE_DETECTED',
        actor,
        `Duplikasi sumber terdeteksi: ${dupCheck.reason}`,
        {
          duplicateStatus: dupCheck.status,
          matchedSourceId: dupCheck.matchedSourceId
        }
      );

      if (options?.rejectDuplicates) {
        return err(
          createResearchDomainError(
            'DUPLICATE_SOURCE',
            dupCheck.reason || 'Sumber duplikat terdeteksi.',
            {
              duplicateStatus: dupCheck.status,
              matchedSourceId: dupCheck.matchedSourceId
            }
          )
        );
      }

      // Jika exact duplicate dan duplicate tidak ditolak, kembalikan sumber eksisting jika ditemukan
      if (dupCheck.status === 'EXACT_DUPLICATE' && dupCheck.matchedSourceId) {
        const existingSource = await this.sourceRepo.getById(dupCheck.matchedSourceId);
        if (existingSource) {
          return ok({
            source: existingSource,
            normalizedDocument: normalizedDoc,
            evidenceCandidates: [],
            persistedEvidence: [],
            duplicateStatus: 'EXACT_DUPLICATE',
            ingestedAt: new Date().toISOString()
          });
        }
      }
    }

    // 6. Bentuk dan Simpan ResearchSource
    const now = new Date().toISOString();
    const sourceId = input.id || `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const evidenceLevel = this.resolveEvidenceLevel(input.sourceType, options?.defaultEvidenceLevel);
    const isInternal = input.sourceType === 'INTERNAL_DATA' || input.format === 'INTERNAL_NOTE';
    const isPrimary = this.isPrimarySource(input.sourceType);

    const source: ResearchSource = {
      id: sourceId,
      researchProjectId: input.researchProjectId,
      type: input.sourceType,
      title: normalizedDoc.title,
      publisher: input.publisher || (normalizedDoc.metadata.publisher as string) || null,
      author: input.author || (normalizedDoc.metadata.author as string) || null,
      url: input.url || (normalizedDoc.metadata.url as string) || null,
      publicationDate: input.publicationDate || (normalizedDoc.metadata.publicationDate as string) || null,
      accessedAt: now,
      language: normalizedDoc.language || 'id',
      evidenceLevel,
      qualityAssessment: this.buildQualityAssessment(input.sourceType),
      isPrimarySource: isPrimary,
      isInternal,
      recencyRisk: 'LOW',
      notes: `Di-ingest via pipeline format ${input.format}. Hash: ${normalizedDoc.contentHash.slice(0, 10)}...`,
      createdAt: now,
      updatedAt: now
    };

    const saveSourceRes = await this.sourceRepo.create(source);
    if (!saveSourceRes.ok) {
      return err(
        createResearchDomainError(
          'SOURCE_PERSISTENCE_FAILED',
          `Gagal menyimpan ResearchSource ke repository: ${saveSourceRes.error.message}`
        )
      );
    }

    // Daftarkan ke deduplicator cache
    this.deduplicator.registerSource(source, input.content);

    // Rekam event: SOURCE_INGESTED
    await this.recordEvent(
      input.researchProjectId,
      'SOURCE_INGESTED',
      actor,
      `Sumber '${source.title}' (${source.type}) berhasil di-ingest dengan ID '${source.id}'.`,
      { sourceId: source.id, format: input.format }
    );

    // 7. Ekstraksi Evidence Candidates
    let evidenceCandidates: EvidenceCandidate[] = [];
    const persistedEvidence: ResearchEvidence[] = [];

    if (options?.extractEvidence !== false) {
      await this.recordEvent(
        input.researchProjectId,
        'EVIDENCE_EXTRACTION_STARTED',
        actor,
        `Memulai ekstraksi bukti otomatis untuk sumber '${source.id}'.`
      );

      try {
        evidenceCandidates = this.extractor.extractCandidates(normalizedDoc);
      } catch (extError) {
        return err(
          createResearchDomainError(
            'EVIDENCE_EXTRACTION_FAILED',
            `Gagal mengekstrak evidence candidates: ${(extError as Error).message}`
          )
        );
      }

      for (let i = 0; i < evidenceCandidates.length; i++) {
        const candidate = evidenceCandidates[i];
        const eviId = `evi-${source.id}-${i + 1}`;
        const baseEvidence: ResearchEvidence = {
          id: eviId,
          sourceId: source.id,
          researchProjectId: input.researchProjectId,
          content: candidate.content,
          locator: candidate.locator,
          evidenceLevel: source.evidenceLevel,
          capturedAt: now,
          publicationAllowed: !source.isInternal,
          notes: `Extracted candidate type: ${candidate.candidateType}`,
          provenanceType: source.isInternal ? 'INTERNAL_KNOWLEDGE' : 'EXTERNAL_EVIDENCE',
          sourceUrl: source.url || null,
          createdAt: now,
          updatedAt: now
        };

        const validation = this.integrityValidator.validate({
          evidence: baseEvidence,
          source,
          sourceRawContent: input.content
        });

        const evidence: ResearchEvidence = {
          ...baseEvidence,
          verified: validation.verified,
          provenanceType: validation.provenanceType
        };

        const saveEviRes = await this.evidenceRepo.create(evidence);
        if (saveEviRes.ok) {
          persistedEvidence.push(saveEviRes.value);
        }
      }

      await this.recordEvent(
        input.researchProjectId,
        'EVIDENCE_EXTRACTED',
        actor,
        `Berhasil mengekstrak ${evidenceCandidates.length} kandidat bukti (${persistedEvidence.length} tersimpan).`,
        {
          candidatesCount: evidenceCandidates.length,
          persistedCount: persistedEvidence.length
        }
      );
    }

    return ok({
      source,
      normalizedDocument: normalizedDoc,
      evidenceCandidates,
      persistedEvidence,
      duplicateStatus: dupCheck.status,
      ingestedAt: now
    });
  }

  private resolveEvidenceLevel(sourceType: SourceType, overrideLevel?: EvidenceLevel): EvidenceLevel {
    if (overrideLevel) return overrideLevel;
    switch (sourceType) {
      case 'INTERNAL_DATA':
      case 'INTERNAL_EXPERIMENT':
      case 'INTERNAL_OBSERVATION':
        return 'E4';
      case 'GOVERNMENT':
      case 'REGULATOR':
      case 'ACADEMIC_PAPER':
      case 'PRIMARY_RESEARCH':
        return 'E1';
      case 'INDUSTRY_RESEARCH':
      case 'OFFICIAL_DOCUMENTATION':
      case 'DATASET':
        return 'E2';
      case 'EXPERT_ANALYSIS':
      case 'BOOK':
      case 'INTERVIEW':
      case 'COMPANY_PUBLICATION':
      case 'NEWS':
      case 'COMMUNITY_DISCUSSION':
      default:
        return 'E3';
    }
  }

  private isPrimarySource(sourceType: SourceType): boolean {
    return (
      sourceType === 'INTERNAL_DATA' ||
      sourceType === 'INTERNAL_EXPERIMENT' ||
      sourceType === 'INTERNAL_OBSERVATION' ||
      sourceType === 'OFFICIAL_DOCUMENTATION' ||
      sourceType === 'GOVERNMENT' ||
      sourceType === 'REGULATOR' ||
      sourceType === 'PRIMARY_RESEARCH' ||
      sourceType === 'ACADEMIC_PAPER'
    );
  }

  private buildQualityAssessment(sourceType: SourceType): SourceQualityAssessment {
    let authority = 75;
    let relevance = 80;
    let recency = 85;
    let methodologicalTransparency = 70;
    let independence = 75;
    let verifiability = 80;

    if (sourceType === 'GOVERNMENT' || sourceType === 'REGULATOR') {
      authority = 95;
      independence = 90;
      verifiability = 95;
      methodologicalTransparency = 85;
    } else if (sourceType === 'ACADEMIC_PAPER' || sourceType === 'PRIMARY_RESEARCH') {
      authority = 90;
      methodologicalTransparency = 90;
      verifiability = 90;
    } else if (sourceType === 'INDUSTRY_RESEARCH') {
      authority = 85;
      methodologicalTransparency = 75;
      verifiability = 80;
    } else if (sourceType === 'INTERNAL_DATA') {
      authority = 85;
      independence = 60; // internal bias
      verifiability = 90;
      methodologicalTransparency = 85;
    }

    return {
      authority,
      relevance,
      recency,
      methodologicalTransparency,
      independence,
      verifiability,
      qualitySummary: `Penilaian kualitas default untuk sumber tipe ${sourceType}.`
    };
  }

  private async recordEvent(
    projectId: string,
    type: ResearchEventType,
    actor: string,
    summary: string,
    metadata?: Record<string, unknown> | null
  ): Promise<ResearchEvent> {
    const event: ResearchEvent = {
      id: `revt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      type,
      timestamp: new Date().toISOString(),
      actor,
      summary,
      metadata
    };

    return this.eventRepo.append(event);
  }
}
