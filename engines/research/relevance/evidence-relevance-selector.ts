/**
 * NexaMOS Evidence Relevance Selector
 *
 * Menggantikan pemotongan buta berdasarkan posisi dokumen (slice(0, 20)).
 * Menilai relevansi setiap bukti empiris terhadap topik dan research questions
 * menggunakan semantic term overlap, pembobotan tipe bukti (STATISTIC, QUOTE, DEFINITION),
 * penalti boilerplate / fragmen pendek, dan diversitas tematik seksi dokumen.
 *
 * Epistemic Invariant:
 * EVIDENCE SELECTION MUST BE BASED ON EPISTEMIC RELEVANCE, NOT DOCUMENT POSITION
 */

import type { ResearchEvidence } from '../domain/research-evidence.ts';
import type { Topic } from '../../ideation/domain/topic.types.ts';
import type { ResearchQuestion } from '../domain/research-question.ts';

export interface EvidenceRelevanceOptions {
  maxItems?: number;
  maxPerSection?: number;
  minScore?: number;
}

export interface ScoredEvidence {
  evidence: ResearchEvidence;
  score: number;
  matchReasons: string[];
}

const STOP_WORDS = new Set([
  'yang', 'di', 'ke', 'dari', 'dan', 'atau', 'pada', 'adalah', 'itu', 'ini',
  'untuk', 'dengan', 'dalam', 'bisa', 'dapat', 'akan', 'telah', 'sudah',
  'oleh', 'karena', 'jika', 'maka', 'tentang', 'bagi', 'antara', 'melalui',
  'sebagai', 'serta', 'namun', 'tetapi', 'agar', 'supaya', 'juga', 'hanya',
  'the', 'is', 'at', 'which', 'on', 'and', 'or', 'in', 'to', 'for', 'of',
  'with', 'a', 'an', 'as', 'by', 'that', 'this', 'are', 'was', 'were',
  'it', 'its', 'from', 'be', 'has', 'have', 'had', 'not', 'but', 'how',
  'what', 'when', 'where', 'why', 'who', 'all', 'any', 'both', 'each'
]);

const BOILERPLATE_PATTERNS = [
  /read\s+more/i,
  /sign\s+up/i,
  /subscribe/i,
  /all\s+rights\s+reserved/i,
  /privacy\s+policy/i,
  /terms\s+of\s+service/i,
  /cookie\s+policy/i,
  /copyright/i,
  /follow\s+us/i,
  /share\s+this/i
];

export class EvidenceRelevanceSelector {
  /**
   * Menyeleksi bukti empiris paling relevan berdasarkan topik dan pertanyaan riset
   */
  public selectTopEvidence(
    evidenceList: ResearchEvidence[],
    topic: Topic | { title: string; territory?: string; targetAudience?: string; description?: string },
    questions: ResearchQuestion[] = [],
    options: EvidenceRelevanceOptions = {}
  ): ResearchEvidence[] {
    const maxItems = options.maxItems ?? 20;
    const maxPerSection = options.maxPerSection ?? 4;
    const minScore = options.minScore ?? 0.05;

    if (!evidenceList || evidenceList.length === 0) {
      return [];
    }

    if (evidenceList.length <= maxItems) {
      // Jika jumlah bukti lebih sedikit dari kapasitas, tetap urutkan berdasarkan relevansi
      return this.rankEvidence(evidenceList, topic, questions).map((s) => s.evidence);
    }

    const scored = this.rankEvidence(evidenceList, topic, questions);

    // Filter minimum score jika bukti memiliki kecocokan
    const eligible = scored.filter((s) => s.score >= minScore);
    const candidatePool = eligible.length > 0 ? eligible : scored;

    // Terapkan batas diversitas per section
    const selected: ResearchEvidence[] = [];
    const sectionCounts = new Map<string, number>();
    const deferred: ResearchEvidence[] = [];

    for (const item of candidatePool) {
      const sectionKey = item.evidence.locator?.section?.trim().toLowerCase() || '__no_section__';
      const count = sectionCounts.get(sectionKey) || 0;

      if (count < maxPerSection) {
        selected.push(item.evidence);
        sectionCounts.set(sectionKey, count + 1);
        if (selected.length >= maxItems) break;
      } else {
        deferred.push(item.evidence);
      }
    }

    // Jika kuota maxItems belum terpenuhi karena cap section, ambil sisa dari deferred
    if (selected.length < maxItems && deferred.length > 0) {
      for (const item of deferred) {
        selected.push(item);
        if (selected.length >= maxItems) break;
      }
    }

    return selected;
  }

  /**
   * Melakukan scoring dan ranking bukti
   */
  public rankEvidence(
    evidenceList: ResearchEvidence[],
    topic: Topic | { title: string; territory?: string; targetAudience?: string; description?: string },
    questions: ResearchQuestion[] = []
  ): ScoredEvidence[] {
    const topicTokens = this.extractTokens(topic.title || '');
    const topicDescTokens = this.extractTokens((topic as any).description || (topic as any).targetAudience || '');
    const questionTokens = new Set<string>();

    for (const q of questions) {
      const qTokens = this.extractTokens(q.question || '');
      for (const t of qTokens) questionTokens.add(t);
    }

    return evidenceList
      .map((ev) => {
        const { score, matchReasons } = this.calculateScore(
          ev,
          topicTokens,
          topicDescTokens,
          questionTokens
        );
        return { evidence: ev, score, matchReasons };
      })
      .sort((a, b) => b.score - a.score);
  }

  private calculateScore(
    evidence: ResearchEvidence,
    topicTokens: Set<string>,
    topicDescTokens: Set<string>,
    questionTokens: Set<string>
  ): { score: number; matchReasons: string[] } {
    const text = evidence.content || '';
    const section = evidence.locator?.section || '';
    const contentTokens = this.extractTokens(text);
    const sectionTokens = this.extractTokens(section);

    let rawScore = 0;
    const matchReasons: string[] = [];

    // 1. Topic Title Overlap (Bobot 3.0 per token unik)
    let topicOverlap = 0;
    for (const t of topicTokens) {
      if (contentTokens.has(t) || sectionTokens.has(t)) {
        topicOverlap++;
      }
    }
    if (topicOverlap > 0) {
      rawScore += topicOverlap * 3.0;
      matchReasons.push(`Topic overlap: ${topicOverlap}`);
    }

    // 2. Question Overlap (Bobot 2.0 per token unik)
    let questionOverlap = 0;
    for (const q of questionTokens) {
      if (contentTokens.has(q) || sectionTokens.has(q)) {
        questionOverlap++;
      }
    }
    if (questionOverlap > 0) {
      rawScore += questionOverlap * 2.0;
      matchReasons.push(`Question overlap: ${questionOverlap}`);
    }

    // 3. Topic Description / Audience Overlap (Bobot 1.0)
    let descOverlap = 0;
    for (const d of topicDescTokens) {
      if (contentTokens.has(d)) {
        descOverlap++;
      }
    }
    if (descOverlap > 0) {
      rawScore += descOverlap * 1.0;
    }

    // Base baseline jika tidak ada token exact yang cocok (agar tetap terurut secara deterministik)
    if (rawScore === 0) {
      rawScore = 0.1;
    }

    // 4. Pembobotan Jenis Bukti
    // Statistik (mengandung angka persentase atau data numerik)
    const hasNumbers = /\b\d+(?:[.,]\d+)?%?\b/.test(text);
    if (hasNumbers) {
      rawScore *= 1.3;
      matchReasons.push('Statistic boost (+30%)');
    }

    // Kutipan atau pernyataan ahli
    const hasQuotes = /["'“‘]/.test(text) || (evidence.notes && /quote/i.test(evidence.notes));
    if (hasQuotes) {
      rawScore *= 1.2;
      matchReasons.push('Quote boost (+20%)');
    }

    // E1/E2 Level boost
    if (evidence.evidenceLevel === 'E1') {
      rawScore *= 1.2;
      matchReasons.push('E1 Peer-Reviewed Boost (+20%)');
    } else if (evidence.evidenceLevel === 'E2') {
      rawScore *= 1.1;
      matchReasons.push('E2 Industry Benchmark Boost (+10%)');
    }

    // 5. Penalti Boilerplate & Fragmen Pendek
    for (const bp of BOILERPLATE_PATTERNS) {
      if (bp.test(text)) {
        rawScore *= 0.1;
        matchReasons.push('Boilerplate penalty (-90%)');
        break;
      }
    }

    // Penalti teks sangat pendek tanpa struktur (< 30 karakter)
    if (text.length < 30) {
      rawScore *= 0.3;
      matchReasons.push('Short fragment penalty (-70%)');
    }

    return {
      score: Math.round(rawScore * 100) / 100,
      matchReasons
    };
  }

  private extractTokens(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
    return new Set(words);
  }
}
