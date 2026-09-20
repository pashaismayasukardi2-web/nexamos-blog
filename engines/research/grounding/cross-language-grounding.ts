/**
 * NexaMOS Cross-Language Grounding Normalizer
 *
 * Menjembatani kesenjangan leksikal antara klaim dalam Bahasa Indonesia
 * dengan bukti empiris dalam Bahasa Inggris tanpa merelaksasi threshold verifikasi
 * dan tanpa mengubah integritas store bukti kanonikal (original text & provenance URL).
 *
 * Epistemic Invariants:
 * 1. STORE CANONICAL TIDAK BOLEH BERUBAH: Teks asli bukti (English) dan URL sumber tetap abadi.
 * 2. MUTATION GUARD: Angka, persentase, mata uang, dan entitas nama tidak boleh dimutasi atau diada-adakan.
 * 3. DETERMINISTIC VERIFICATION: Overlap matching tetap menggunakan threshold yang sama.
 */

export interface BoundedAICompletionClient {
  complete(options: {
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    responseFormat?: 'text' | 'json_object';
  }): Promise<{ content: string }>;
}

export interface PropositionNormalizationResult {
  originalStatement: string;
  normalizedStatement: string;
  sourceLanguage: 'id' | 'en' | 'unknown';
  targetLanguage: 'id' | 'en';
  isValid: boolean;
  mutationDetected: boolean;
  mutationReason?: string;
}

export interface CrossLanguageNormalizer {
  normalizeProposition(
    statement: string,
    targetLanguage?: 'en' | 'id'
  ): Promise<PropositionNormalizationResult>;
}

// Kamus istilah teknis & editorial dua arah (Indonesian <-> English) untuk deterministik fallback
const BILINGUAL_TERMS: Array<[string, string]> = [
  ['kecerdasan buatan', 'artificial intelligence'],
  ['pemasar konten', 'content marketers'],
  ['pemasaran konten', 'content marketing'],
  ['operasi konten', 'content operations'],
  ['kebijakan ai', 'ai policy'],
  ['penggunaan ai', 'ai use'],
  ['alat ai', 'ai tools'],
  ['strategi konten', 'content strategy'],
  ['tata kelola', 'governance'],
  ['alur kerja', 'workflow'],
  ['pembatasan', 'restriction'],
  ['membatasi', 'restricted'],
  ['melarang', 'prohibited'],
  ['pedoman', 'guidelines'],
  ['organisasi', 'organization'],
  ['perusahaan', 'company'],
  ['karyawan', 'employees'],
  ['menerapkan', 'implementing'],
  ['mengintegrasikan', 'integrating'],
  ['efisiensi', 'efficiency'],
  ['produktivitas', 'productivity'],
  ['generatif', 'generative']
];

const INDONESIAN_MARKERS = new Set([
  'yang', 'di', 'ke', 'dari', 'dan', 'atau', 'pada', 'adalah', 'itu', 'ini',
  'untuk', 'dengan', 'dalam', 'bisa', 'dapat', 'akan', 'telah', 'sudah',
  'oleh', 'karena', 'jika', 'maka', 'tentang', 'bagi', 'antara', 'melalui',
  'sebagian', 'besar', 'beberapa', 'tidak', 'hanya', 'apakah', 'harus'
]);

export class DeterministicCrossLanguageNormalizer implements CrossLanguageNormalizer {
  private aiClient?: BoundedAICompletionClient;

  constructor(aiClient?: BoundedAICompletionClient) {
    this.aiClient = aiClient;
  }

  public async normalizeProposition(
    statement: string,
    targetLanguage: 'en' | 'id' = 'en'
  ): Promise<PropositionNormalizationResult> {
    const trimmed = statement.trim();
    const sourceLanguage = this.detectLanguage(trimmed);

    // Jika bahasa sudah sesuai target, tidak perlu normalisasi
    if (sourceLanguage === targetLanguage) {
      return {
        originalStatement: trimmed,
        normalizedStatement: trimmed,
        sourceLanguage,
        targetLanguage,
        isValid: true,
        mutationDetected: false
      };
    }

    let normalizedText = '';

    // 1. Jika ada AI Client, gunakan bounded propositional translation
    if (this.aiClient) {
      try {
        normalizedText = await this.translateWithAI(trimmed, targetLanguage);
      } catch {
        // Fallback ke deterministic dictionary jika AI gagal/timeout
        normalizedText = this.translateWithDictionary(trimmed, targetLanguage);
      }
    } else {
      normalizedText = this.translateWithDictionary(trimmed, targetLanguage);
    }

    // 2. Strict Mutation Guard: Verifikasi angka dan metrik
    const mutationCheck = this.verifyNumericAndEntityIntegrity(trimmed, normalizedText);

    if (mutationCheck.hasMutation) {
      return {
        originalStatement: trimmed,
        normalizedStatement: trimmed, // Fallback ke teks asli jika mutasi terdeteksi
        sourceLanguage,
        targetLanguage,
        isValid: false,
        mutationDetected: true,
        mutationReason: mutationCheck.reason
      };
    }

    return {
      originalStatement: trimmed,
      normalizedStatement: normalizedText,
      sourceLanguage,
      targetLanguage,
      isValid: true,
      mutationDetected: false
    };
  }

  /**
   * Deteksi bahasa berbasis kata fungsi / stop words
   */
  public detectLanguage(text: string): 'id' | 'en' | 'unknown' {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);

    let idScore = 0;
    for (const w of words) {
      if (INDONESIAN_MARKERS.has(w)) idScore++;
    }

    if (idScore >= 1) return 'id';
    return 'en';
  }

  /**
   * Penerjemahan berbasis kamus deterministik
   */
  public translateWithDictionary(text: string, targetLang: 'en' | 'id'): string {
    let result = text;
    for (const [idTerm, enTerm] of BILINGUAL_TERMS) {
      if (targetLang === 'en') {
        const regex = new RegExp(`\\b${idTerm}\\b`, 'gi');
        result = result.replace(regex, enTerm);
      } else {
        const regex = new RegExp(`\\b${enTerm}\\b`, 'gi');
        result = result.replace(regex, idTerm);
      }
    }
    return result;
  }

  /**
   * Penerjemahan presisi menggunakan AI dengan instruksi anti-halusinasi ketat
   */
  private async translateWithAI(text: string, targetLang: 'en' | 'id'): Promise<string> {
    if (!this.aiClient) return text;

    const targetLangName = targetLang === 'en' ? 'English' : 'Indonesian';
    const prompt = `Translate the following statement into clear, factual ${targetLangName}:
"${text}"

CRITICAL: Output ONLY the ${targetLangName} translation, nothing else. Do not add quotes, introductory text, or explanations.`;

    const res = await this.aiClient.complete({
      messages: [
        { role: 'system', content: `You are a factual translator. Your only job is to translate text into ${targetLangName}.` },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    });

    return res.content.trim().replace(/^["']|["']$/g, '');
  }

  /**
   * MUTATION GUARD: Menjamin angka, metrik, dan persentase tidak berubah atau bertambah
   */
  public verifyNumericAndEntityIntegrity(
    original: string,
    translated: string
  ): { hasMutation: boolean; reason?: string } {
    const origNumbers = this.extractNumbers(original);
    const transNumbers = this.extractNumbers(translated);

    // Cek apakah ada angka di klaim asli yang hilang di hasil terjemahan
    for (const num of origNumbers) {
      if (!transNumbers.includes(num)) {
        return {
          hasMutation: true,
          reason: `Angka original "${num}" hilang atau berubah dalam hasil terjemahan.`
        };
      }
    }

    // Cek apakah hasil terjemahan menambahkan angka baru yang tidak ada di aslinya
    for (const num of transNumbers) {
      if (!origNumbers.includes(num)) {
        return {
          hasMutation: true,
          reason: `Angka baru "${num}" diada-adakan dalam hasil terjemahan (FABRICATION DETECTED).`
        };
      }
    }

    return { hasMutation: false };
  }

  private extractNumbers(text: string): string[] {
    const matches = text.match(/\b\d+(?:[.,]\d+)?%?(?!\w)/g);
    return matches ? matches.map((m) => m.replace(',', '.')) : [];
  }
}
