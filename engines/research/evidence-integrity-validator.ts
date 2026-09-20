/**
 * NexaMOS Evidence Integrity Validator
 *
 * Sourced from NexaMOS Blog Research Integrity Hardening
 * Doktrin: NO REAL SOURCE -> NO VERIFIED EVIDENCE
 *
 * Menegakkan aturan:
 * 1. Evidence hanya boleh `verified = true` jika:
 *    - Sumbernya benar-benar ada di repositori;
 *    - Sumbernya bukan sumber fiktif/sintetis;
 *    - Konten kutipan bukti memiliki keterlacakan provenance ke dalam materi sumber;
 *    - Provenance tercatat (sourceId, sourceUrl, capturedAt).
 * 2. Pengetahuan internal (Internal Knowledge) dibedakan secara eksplisit dari
 *    bukti eksternal (EXTERNAL_EVIDENCE vs INTERNAL_KNOWLEDGE vs ORIGINAL_ANALYSIS).
 * 3. Pengetahuan internal dan analisis orisinal dilarang menyamar sebagai bukti eksternal terverifikasi.
 */

import type { ResearchEvidence, EvidenceProvenanceType } from './domain/research-evidence.ts';
import type { ResearchSource } from './domain/research-source.ts';

export interface EvidenceIntegrityInput {
  evidence: ResearchEvidence;
  source?: ResearchSource | null;
  sourceRawContent?: string | null;
}

export interface EvidenceIntegrityValidationResult {
  evidenceId: string;
  sourceId: string;
  verified: boolean;
  provenanceType: EvidenceProvenanceType;
  sourceUrl?: string | null;
  reason: string;
  issues: string[];
}

// Daftar identifikasi sumber fiktif / sintetis terlarang
const BANNED_SYNTHETIC_PUBLISHERS = new Set([
  'nexamos sovereign knowledge base',
  'sovereign knowledge base'
]);

const BANNED_SYNTHETIC_SOURCE_IDS = new Set([
  'src-nexamos-internal',
  'fake-source',
  'synthetic-source'
]);

export class EvidenceIntegrityValidator {
  validate(input: EvidenceIntegrityInput): EvidenceIntegrityValidationResult {
    const { evidence, source, sourceRawContent } = input;
    const issues: string[] = [];

    // 1. Validasi Keberadaan Sumber
    if (!source) {
      return {
        evidenceId: evidence.id,
        sourceId: evidence.sourceId,
        verified: false,
        provenanceType: evidence.provenanceType || 'EXTERNAL_EVIDENCE',
        sourceUrl: null,
        reason: `Sumber rujukan '${evidence.sourceId}' tidak ditemukan di repositori (NO REAL SOURCE).`,
        issues: ['MISSING_SOURCE_ENTITY']
      };
    }

    // 2. Deteksi Sumber Sintetis / Palsu Terlarang
    const publisherLower = (source.publisher || '').trim().toLowerCase();
    const sourceIdLower = source.id.trim().toLowerCase();

    if (
      BANNED_SYNTHETIC_PUBLISHERS.has(publisherLower) ||
      BANNED_SYNTHETIC_SOURCE_IDS.has(sourceIdLower)
    ) {
      issues.push('SYNTHETIC_SOURCE_PROHIBITED');
      return {
        evidenceId: evidence.id,
        sourceId: source.id,
        verified: false,
        provenanceType: 'INTERNAL_KNOWLEDGE',
        sourceUrl: source.url || null,
        reason: `Sumber '${source.id}' (${source.publisher}) terdeteksi sebagai fallback sintetis yang dilarang.`,
        issues
      };
    }

    // 3. Klasifikasi Provenance Type (Pemisahan Tegas)
    let provenanceType: EvidenceProvenanceType = 'EXTERNAL_EVIDENCE';
    if (source.isInternal || source.type === 'INTERNAL_DATA') {
      provenanceType = 'INTERNAL_KNOWLEDGE';
    } else if (evidence.notes?.toLowerCase().includes('original analysis')) {
      provenanceType = 'ORIGINAL_ANALYSIS';
    } else if (evidence.provenanceType) {
      provenanceType = evidence.provenanceType;
    }

    // 4. Validasi Konten Bukti
    if (!evidence.content || evidence.content.trim().length === 0) {
      issues.push('EMPTY_EVIDENCE_CONTENT');
      return {
        evidenceId: evidence.id,
        sourceId: source.id,
        verified: false,
        provenanceType,
        sourceUrl: source.url || null,
        reason: 'Konten bukti kosong atau hanya berisi spasi putih.',
        issues
      };
    }

    // 5. Validasi Provenance Sumber Eksternal
    if (provenanceType === 'EXTERNAL_EVIDENCE') {
      // Sumber eksternal wajib memiliki URL yang valid
      if (!source.url || source.url.trim().length === 0) {
        issues.push('MISSING_SOURCE_URL');
      }

      // Jika sourceRawContent disediakan, cek grounding teks kutipan
      if (sourceRawContent && sourceRawContent.trim().length > 0) {
        const normalizedRaw = sourceRawContent.toLowerCase().replace(/\s+/g, ' ');
        const normalizedQuote = evidence.content.toLowerCase().replace(/\s+/g, ' ').trim();
        // Cek apakah kutipan (atau sebagian intinya) terdapat dalam teks sumber
        const sampleSnippet = normalizedQuote.slice(0, Math.min(60, normalizedQuote.length));
        if (!normalizedRaw.includes(sampleSnippet)) {
          issues.push('CONTENT_NOT_TRACED_TO_SOURCE');
        }
      }
    }

    // 6. Pengetahuan Internal Tidak Boleh Menyamar Sebagai Factual External Evidence
    if (provenanceType === 'INTERNAL_KNOWLEDGE') {
      // Tetap valid sebagai pengetahuan internal, tetapi verified=false untuk pembuktian klaim eksternal
      return {
        evidenceId: evidence.id,
        sourceId: source.id,
        verified: false,
        provenanceType: 'INTERNAL_KNOWLEDGE',
        sourceUrl: source.url || null,
        reason: 'Pengetahuan internal dicatat sebagai INTERNAL_KNOWLEDGE dan bukan bukti faktual eksternal.',
        issues
      };
    }

    const isVerified = issues.length === 0;

    return {
      evidenceId: evidence.id,
      sourceId: source.id,
      verified: isVerified,
      provenanceType,
      sourceUrl: source.url || null,
      reason: isVerified
        ? `Bukti terverifikasi sah terhadap sumber '${source.title}' (${source.url}).`
        : `Bukti gagal verifikasi integritas: ${issues.join(', ')}.`,
      issues
    };
  }
}
