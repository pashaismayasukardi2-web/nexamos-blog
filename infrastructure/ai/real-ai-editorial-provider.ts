/**
 * NexaMOS Real AI Editorial Provider
 *
 * Sourced from NexaMOS Blog Production Pilot 01 Step 3 specifications.
 * Menghubungkan Editorial Engine ke model LLM nyata dengan batas grounding yang ketat:
 * - DILARANG MENGARANG FAKTA: Faktualitas murni berasal dari ResearchBrief
 * - DILARANG MENGARANG ID: Klaim dan sitasi wajib merujuk ke IDs yang sah dari brief
 * - DILARANG MENGARANG ANGKA / KUTIPAN: Statistik numerik dan kutipan wajib verbatim/didukung bukti
 * - Model bebas mengekspresikan struktur naratif, sudut pandang, logika, dan analisis orisinal
 */

import type {
  AIEditorialProvider,
  GeneratedDraftPayload
} from '../../engines/editorial/ai-editorial-provider.ts';
import type { EditorialGenerationRequest } from '../../engines/editorial/editorial-generation-request.ts';
import type { EditorialPlan } from '../../engines/editorial/editorial-plan.ts';
import type { ArticleSection } from '../../engines/editorial/article-section.ts';
import { AIHttpClient, AIClientError } from './ai-http-client.ts';
import { StructuredOutputValidator } from './structured-output-validator.ts';
import type { AIProviderConfig } from './ai-provider-config.ts';

const EDITORIAL_SYSTEM_HARD_RULE = `Anda adalah Lead Content Architect & Engineering Editor untuk NexaMOS Blog.
ATURAN UTAMA (MUTLAK & TIDAK DAPAT DITAWAR):
1. GROUNDED RESEARCH ONLY: Seluruh klaim faktual eksternal WAJIB berakar langsung dari Supported Claims dan Evidence Index pada ResearchBrief yang disediakan.
2. ANTI-SCOPE DRIFT (FOKUS 100% PADA RISET): Naskah dan rencana editorial WAJIB fokus murni pada topik dan temuan riset yang disediakan. DILARANG KERAS mengalihkan atau memperluas naskah ke domain baru yang tidak dibahas dalam bukti riset (misalnya: dilarang tiba-tiba membahas privasi data, regulasi kepatuhan hukum/GDPR, enkripsi, keamanan siber, dll., jika bukti riset tidak membahas hal tersebut).
3. ZERO TOLERANCE FOR FABRICATION: Dilarang mengarang URL, nama institusi fiktif, angka statistik baru, kapabilitas teknis/algoritmik fiktif, atau ID sitasi fiktif.
4. KUTIPAN & ANGKA: Angka statistik atau persentase HANYA boleh ditulis jika persis tercantum dalam ResearchBrief. Dilarang mengarang persentase baru (misal 75%, 85%).
5. PEMBEDAAN KLAIM FAKTUAL VS ANALISIS ORISINAL:
   - Setiap proposisi tentang realitas industri, algoritma, atau kapabilitas pihak ketiga wajib merujuk ke claimId yang sah dan dicantumkan di claimUsages & citationMap.
   - Rekomendasi taktis, sintesis, atau alur kerja NexaMOS WAJIB diformulasikan sebagai analisis/rekomendasi orisinal (gunakan frasa seperti: "Dalam perspektif strategis NexaMOS...", "Rekomendasi taktis bagi tim editorial...", "Bagi praktisi, implikasinya...", "Oleh karena itu, langkah praktis...") dan ditempatkan pada seksi ber-purpose 'ANALYSIS', 'FRAMEWORK', 'IMPLICATION', atau 'PRACTICAL_APPLICATION'.
6. FORMAT OUTPUT: Seluruh respon WAJIB berupa JSON terstruktur tanpa markdown text pembuka atau penutup.`;

export class RealAIEditorialProvider implements AIEditorialProvider {
  private readonly client: AIHttpClient;
  private readonly config: AIProviderConfig;

  constructor(config: AIProviderConfig, client?: AIHttpClient) {
    this.config = config;
    this.client = client || new AIHttpClient(config);
  }

  public async createEditorialPlan(request: EditorialGenerationRequest): Promise<EditorialPlan> {
    const brief = request.researchBrief;
    const claims = brief.supportedClaims.map((c) => ({ id: c.id, statement: c.statement }));
    const findings = brief.keyFindings.map((f) => ({ id: f.id, statement: f.statement }));
    const limitations = brief.limitations || [];

    const prompt = `${EDITORIAL_SYSTEM_HARD_RULE}

TUGAS: Rumuskan EditorialPlan terstruktur untuk artikel berikut:
Topik: "${request.topic.title}"
Tipe Artikel: ${request.articleType}
Peran Editorial: ${request.editorialRole}
Sudut Pandang yang Disarankan: ${request.editorialAngle || brief.recommendedEditorialAngle || '-'}

KLAIM TERVERIFIKASI DARI RESEARCH BRIEF (HANYA GUNAKAN ID BERIKUT):
${JSON.stringify(claims, null, 2)}

TEMUAN KUNCI:
${JSON.stringify(findings, null, 2)}

LIMITASI & SENGKETA:
${JSON.stringify(limitations, null, 2)}

PANDUAN PENYUSUNAN RENCANA (ANTI-SCOPE DRIFT):
- workingTitle, thesis, dan angle WAJIB setia pada topik "${request.topic.title}" dan substansi klaim terverifikasi di atas. JANGAN melenceng ke ranah di luar bukti riset (misal: privasi data, kepatuhan hukum).
- sectionPlan:
  * Untuk seksi fakta/konteks industri: gunakan purpose HOOK, CONTEXT, ARGUMENT, atau EVIDENCE dan sebutkan plannedClaimIds dari daftar di atas.
  * Untuk seksi rekomendasi/taktik/analisis NexaMOS: gunakan purpose ANALYSIS, FRAMEWORK, IMPLICATION, atau PRACTICAL_APPLICATION.

FORMAT JSON YANG WAJIB DIHASILKAN:
{
  "workingTitle": "Judul kerja artikel yang tajam dan otoritatif",
  "thesis": "Pernyataan tesis utama yang kokoh dan dapat diuji",
  "angle": "Sudut pandang editorial unik yang menolak klise komoditas",
  "readerPromise": "Nilai pengetahuan konkret yang didapatkan pembaca",
  "sectionPlan": [
    {
      "heading": "Judul Seksi",
      "purpose": "HOOK | CONTEXT | ARGUMENT | EVIDENCE | FRAMEWORK | ANALYSIS | COUNTERPOINT | IMPLICATION | PRACTICAL_APPLICATION | CONCLUSION",
      "keyPoints": ["Poin 1", "Poin 2"],
      "plannedClaimIds": ["ID klaim dari daftar di atas"]
    }
  ],
  "claimsToUse": ["claim-id-1", "claim-id-2"],
  "findingsToUse": ["finding-id-1"],
  "counterpoints": ["Poin penyeimbang / limitasi"],
  "intendedTakeaway": "Pesan inti strategis yang dibekali pembaca"
}`;

    const response = await this.client.complete({
      messages: [
        { role: 'system', content: EDITORIAL_SYSTEM_HARD_RULE },
        { role: 'user', content: prompt }
      ],
      responseFormat: 'json_object',
      temperature: 0.2
    });

    const parsed = StructuredOutputValidator.parseJson(response.content);
    return StructuredOutputValidator.validateEditorialPlan(parsed);
  }

  public async generateArticleDraft(
    request: EditorialGenerationRequest,
    plan: EditorialPlan
  ): Promise<GeneratedDraftPayload> {
    const brief = request.researchBrief;

    // P0-A: Hard Grounding Invariant - Editorial Layer DILARANG membuat sumber/bukti sintetis sendiri
    if (
      !brief ||
      brief.readiness === 'NOT_READY' ||
      !Array.isArray(brief.sourceIndex) ||
      brief.sourceIndex.length === 0 ||
      !Array.isArray(brief.evidenceIndex) ||
      brief.evidenceIndex.length === 0 ||
      !Array.isArray(brief.supportedClaims) ||
      brief.supportedClaims.length === 0
    ) {
      throw new AIClientError(
        'EDITORIAL_NOT_READY',
        'ResearchBrief tidak memiliki sumber, bukti, atau klaim terverifikasi yang memadai (EDITORIAL_NOT_READY). Penulisan draf dihentikan.'
      );
    }

    const effectiveSourceIndex = brief.sourceIndex;
    const effectiveEvidenceIndex = brief.evidenceIndex;

    // Himpun ID yang sah untuk validasi ketat anti-halusinasi
    const allowedClaimIds = new Set([
      ...brief.supportedClaims.map((c) => c.id),
      ...(brief.partiallySupportedClaims || []).map((c) => c.id),
      ...(brief.keyFindings || []).map((f) => f.id)
    ]);
    const allowedSourceIds = new Set(effectiveSourceIndex.map((s) => (s as any).sourceId || (s as any).id));
    const allowedEvidenceIds = new Set(effectiveEvidenceIndex.map((e) => (e as any).evidenceId || (e as any).id));

    const prompt = `${EDITORIAL_SYSTEM_HARD_RULE}

TUGAS: Tulis naskah lengkap draft artikel (ArticleDraft) berdasarkan EditorialPlan yang telah disetujui.

TOPIK & METADATA:
Topik: "${request.topic.title}"
Tesis: "${plan.thesis}"
Angle: "${plan.angle}"
Rencana Seksi:
${JSON.stringify(plan.sectionPlan, null, 2)}

DATA RISET RESMI YANG WAJIB DIKUTIP:
Klaim Terbukti (Supported Claims):
${JSON.stringify(
  brief.supportedClaims.map((c) => ({
    id: c.id,
    statement: c.statement,
    supportingEvidenceIds: c.supportingEvidenceIds || (c as any).evidenceIds || []
  })),
  null,
  2
)}
Temuan Kunci (Key Findings):
${JSON.stringify((brief.keyFindings || []).map((f) => ({ id: f.id, statement: f.statement })), null, 2)}
Indeks Bukti:
${JSON.stringify(effectiveEvidenceIndex.slice(0, 10).map((e) => ({ id: (e as any).evidenceId || (e as any).id, sourceId: e.sourceId, text: ((e as any).quote || (e as any).textSnippet || '').slice(0, 200) })), null, 2)}
Indeks Sumber:
${JSON.stringify(effectiveSourceIndex.map((s) => ({ id: (s as any).sourceId || (s as any).id, title: s.title, url: s.url })), null, 2)}

INSTRUKSI INTEGRITAS & ANTI-HALUSINASI (SANGAT PENTING):
1. FOKUS TOPIK (ANTI-SCOPE DRIFT): Tulis naskah HANYA seputar topik "${request.topic.title}" dan bukti riset di atas. DILARANG menambahkan topik baru yang tidak ada di riset (seperti privasi data, kepatuhan legal, enkripsi, dll).
2. KLAIM FAKTUAL EKSTERNAL: Setiap kali Anda menulis fakta mengenai kondisi pasar, kapabilitas AI, kinerja tool, atau temuan industri, Anda WAJIB mengambil substansinya dari 'Klaim Terbukti' di atas dan mencatat claimId-nya di claimUsages dan citationMap. DILARANG membuat klaim fakta eksternal baru tanpa dasar bukti!
3. REKOMENDASI & TAKTIK NEXAMOS: Untuk bagian langkah praktis, kerangka kerja, atau alur kerja NexaMOS, letakkan dalam seksi dengan purpose 'ANALYSIS', 'FRAMEWORK', atau 'PRACTICAL_APPLICATION' dan gunakan frasa analisis orisinal (misal: "Rekomendasi taktis bagi tim editorial adalah...", "Bagi praktisi konten, implikasinya...", "Dalam perspektif strategis NexaMOS...", "Oleh karena itu, langkah praktis...").
4. INTEGRITAS ID SITASI: Dilarang membuat claimId, sourceId, atau evidenceId palsu! Seluruh ID dalam claimUsages dan citationMap WAJIB bersumber dari data di atas. Gunakan supportingEvidenceIds resmi dari Klaim Terbukti di atas saat mengisi evidenceIds pada citationMap.

FORMAT JSON YANG WAJIB DIHASILKAN:
{
  "title": "${plan.workingTitle}",
  "dek": "Subjudul penjelasan yang memancing pemikiran strategis pembaca",
  "slug": "${request.topic.slug || 'naskah-artikel'}",
  "thesis": "${plan.thesis}",
  "editorialAngle": "${plan.angle}",
  "sections": [
    {
      "id": "sec-1",
      "heading": "Judul Seksi",
      "purpose": "Pilih SALAH SATU: HOOK | CONTEXT | ARGUMENT | EVIDENCE | FRAMEWORK | ANALYSIS | COUNTERPOINT | IMPLICATION | PRACTICAL_APPLICATION | CONCLUSION (DILARANG menggabungkan dengan tanda '|', gunakan satu yang paling dominan)",
      "content": "Isi lengkap naskah artikel per seksi...",
      "order": 1,
      "claimUsageIds": ["cu-1"]
    }
  ],
  "claimUsages": [
    {
      "id": "cu-1",
      "claimId": "claim-id-resmi-dari-daftar-di-atas",
      "sectionId": "sec-1",
      "usageType": "DIRECT | PARAPHRASED | SYNTHESIZED | CONTEXTUAL",
      "statement": "Pernyataan klaim faktual yang digunakan dalam teks"
    }
  ],
  "citationMap": [
    {
      "claimUsageId": "cu-1",
      "claimId": "claim-id-resmi-dari-daftar-di-atas",
      "sourceIds": ["source-id-resmi"],
      "evidenceIds": ["evidence-id-resmi"]
    }
  ]
}`;

    const response = await this.client.complete({
      messages: [
        { role: 'system', content: EDITORIAL_SYSTEM_HARD_RULE },
        { role: 'user', content: prompt }
      ],
      responseFormat: 'json_object',
      temperature: 0.2
    });

    const parsed = StructuredOutputValidator.parseJson(response.content);

    // Normalisasi section.purpose jika LLM menghasilkan pipe '|' atau variasi format
    if (parsed && Array.isArray(parsed.sections)) {
      const priority = [
        'PRACTICAL_APPLICATION',
        'FRAMEWORK',
        'IMPLICATION',
        'ANALYSIS',
        'COUNTERPOINT',
        'EVIDENCE',
        'ARGUMENT',
        'CONTEXT',
        'HOOK',
        'CONCLUSION'
      ];

      for (const sec of parsed.sections) {
        if (sec && typeof sec.purpose === 'string' && sec.purpose.includes('|')) {
          const parts = sec.purpose.split('|').map((p: string) => p.trim().toUpperCase());
          const chosen = priority.find((p) => parts.includes(p)) || parts[0];
          sec.purpose = chosen;
        }
      }
    }

    // Normalisasi variasi minor casing/format claimId jika secara deterministik merujuk ID yang sama
    if (parsed && Array.isArray(parsed.claimUsages) && allowedClaimIds.size > 0) {
      for (const cu of parsed.claimUsages) {
        if (cu && cu.claimId && !allowedClaimIds.has(cu.claimId)) {
          const match = Array.from(allowedClaimIds).find(
            (id) => id.toLowerCase() === cu.claimId.toLowerCase() ||
                    id.replace(/-/g, '') === cu.claimId.replace(/-/g, '')
          );
          if (match) {
            cu.claimId = match;
          }
        }
      }
    }

    // P0-B: HAPUS CITATION AUTO-REPAIR (INVALID CITATION -> INVALID CITATION)
    if (parsed && Array.isArray(parsed.citationMap)) {
      const validSourceList = Array.from(allowedSourceIds);
      const validEvidenceList = Array.from(allowedEvidenceIds);

      for (const cm of parsed.citationMap) {
        if (!cm) continue;

        // 1. Normalisasi casing/hyphen claimId jika merujuk ID yang sama
        if (cm.claimId && !allowedClaimIds.has(cm.claimId)) {
          const match = Array.from(allowedClaimIds).find(
            (id) => id.toLowerCase() === cm.claimId.toLowerCase() ||
                    id.replace(/-/g, '') === cm.claimId.replace(/-/g, '')
          );
          if (match) {
            cm.claimId = match;
          }
        }

        // 2. Normalisasi format sourceIds HANYA jika merujuk ke ID yang sama persis (tanpa substitusi validSourceList[0])
        if (Array.isArray(cm.sourceIds)) {
          cm.sourceIds = cm.sourceIds.map((sId: string) => {
            if (allowedSourceIds.has(sId)) return sId;

            const match = validSourceList.find(
              (id) => id.toLowerCase() === sId.toLowerCase() ||
                      id.replace(/-/g, '') === sId.replace(/-/g, '')
            );
            if (match) return match;

            // Jangan gantikan ke validSourceList[0]! Biarkan ID apa adanya agar downstream validator mendeteksi kesalahan.
            return sId;
          });
          cm.sourceIds = Array.from(new Set(cm.sourceIds));
        }

        // 3. Normalisasi format evidenceIds: Coba match persis / variasi casing, atau fallback ke supportingEvidenceIds resmi dari claimId jika sah
        if (Array.isArray(cm.evidenceIds)) {
          cm.evidenceIds = cm.evidenceIds.map((eId: string) => {
            if (allowedEvidenceIds.has(eId)) return eId;

            const match = validEvidenceList.find(
              (id) => id.toLowerCase() === eId.toLowerCase() ||
                      id.replace(/-/g, '') === eId.replace(/-/g, '')
            );
            if (match) return match;

            // Jika evidenceId tidak terdaftar, tetapi claimId sah dan memiliki bukti resmi di brief:
            if (cm.claimId && allowedClaimIds.has(cm.claimId)) {
              const matchedClaim = brief.supportedClaims.find((c) => c.id === cm.claimId);
              const officialEvidence = matchedClaim?.supportingEvidenceIds || (matchedClaim as any)?.evidenceIds;
              if (Array.isArray(officialEvidence) && officialEvidence.length > 0) {
                const validOfficial = officialEvidence.find((oId: string) => allowedEvidenceIds.has(oId));
                if (validOfficial) {
                  return validOfficial;
                }
              }
            }

            // Jangan buat ID sintetis baru! Biarkan ID apa adanya agar downstream validator mendeteksi kesalahan jika memang klaim tidak berdasar.
            return eId;
          });
          cm.evidenceIds = Array.from(new Set(cm.evidenceIds));
        } else if (cm.claimId && allowedClaimIds.has(cm.claimId)) {
          // Jika LLM lupa menyertakan evidenceIds, tautkan ke bukti resmi klaim
          const matchedClaim = brief.supportedClaims.find((c) => c.id === cm.claimId);
          const officialEvidence = matchedClaim?.supportingEvidenceIds || (matchedClaim as any)?.evidenceIds;
          if (Array.isArray(officialEvidence) && officialEvidence.length > 0) {
            const validOfficial = officialEvidence.find((oId: string) => allowedEvidenceIds.has(oId));
            if (validOfficial) {
              cm.evidenceIds = [validOfficial];
            }
          }
        }
      }
    }

    return StructuredOutputValidator.validateArticleDraft(parsed, {
      allowedClaimIds,
      allowedSourceIds,
      allowedEvidenceIds
    });
  }

  public async reviseSection(
    request: EditorialGenerationRequest,
    section: ArticleSection,
    instruction: string
  ): Promise<ArticleSection> {
    const prompt = `${EDITORIAL_SYSTEM_HARD_RULE}

TUGAS: Revisi seksi artikel berikut sesuai instruksi editorial:
Judul Seksi: "${section.heading}"
Isi Saat Ini:
${section.content}

Instruksi Revisi:
"${instruction}"

FORMAT JSON YANG WAJIB DIHASILKAN:
{
  "id": "${section.id}",
  "heading": "${section.heading}",
  "content": "Isi seksi hasil revisi...",
  "order": ${section.order},
  "purpose": "${section.purpose}",
  "claimUsageIds": ${JSON.stringify(section.claimUsageIds || [])}
}`;

    const response = await this.client.complete({
      messages: [
        { role: 'system', content: EDITORIAL_SYSTEM_HARD_RULE },
        { role: 'user', content: prompt }
      ],
      responseFormat: 'json_object',
      temperature: 0.2
    });

    const parsed = StructuredOutputValidator.parseJson(response.content);
    return StructuredOutputValidator.validateSection(parsed, section.id, section.order);
  }

  /**
   * Menerjemahkan naskah artikel ke Bahasa Inggris dengan integritas grounding
   */
  public async translateDraftToEnglish(draft: {
    title: string;
    dek?: string | null;
    sections: Array<{ id: string; heading?: string | null; content: string; order: number; purpose?: string }>;
  }): Promise<{
    title: string;
    dek: string;
    sections: Array<{ id: string; heading: string; content: string; order: number; purpose: string }>;
  }> {
    const payloadToTranslate = {
      title: draft.title,
      dek: draft.dek || '',
      sections: draft.sections.map((s) => ({
        id: s.id,
        heading: s.heading || '',
        content: s.content,
        order: s.order,
        purpose: s.purpose || 'ANALYSIS'
      }))
    };

    const systemPrompt = `You are the Principal Content Architect & Senior Editorial Director for NexaMOS (Marketing Operating System).
Translate this authoritative Indonesian marketing & technology analysis article into sophisticated, high-impact, fluent English for enterprise executives and search generative engines.
CRITICAL INSTRUCTIONS:
1. Maintain the exact same section IDs, ordering, and purposes.
2. Translate all headings and body paragraphs accurately, preserving any specific technical terminology, metrics, and claim tags (e.g. claim-1, claim-2, KPI names).
3. Do NOT add new claims or invent facts.
4. Output MUST be valid JSON only matching the schema.`;

    const userPrompt = `TRANSLATE THE FOLLOWING ARTICLE TO PROFESSIONAL ENGLISH:
${JSON.stringify(payloadToTranslate, null, 2)}

REQUIRED JSON OUTPUT FORMAT:
{
  "title": "Compelling English title",
  "dek": "Insightful English dek / subtitle",
  "sections": [
    {
      "id": "sec-1",
      "heading": "English heading",
      "content": "English content...",
      "order": 1,
      "purpose": "HOOK | CONTEXT | ..."
    }
  ]
}`;

    const response = await this.client.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      responseFormat: 'json_object',
      temperature: 0.2
    });

    const parsed = StructuredOutputValidator.parseJson(response.content);
    if (!parsed || !parsed.title || !Array.isArray(parsed.sections)) {
      throw new Error('AI Translation gagal menghasilkan struktur artikel yang valid.');
    }

    return {
      title: parsed.title,
      dek: parsed.dek || '',
      sections: parsed.sections.map((s: any, idx: number) => ({
        id: s.id || `sec-${idx + 1}`,
        heading: s.heading || '',
        content: s.content || '',
        order: s.order || idx + 1,
        purpose: s.purpose || 'ANALYSIS'
      }))
    };
  }
}
