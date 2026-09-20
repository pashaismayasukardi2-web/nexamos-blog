/**
 * NexaMOS Real AI Research Provider
 *
 * Sourced from NexaMOS Blog Production Pilot 01 Step 3 specifications.
 * Menghubungkan Research Orchestrator ke model LLM nyata dengan batas otoritas ketat:
 * - AI HANYA mengusulkan (proposes)
 * - Klaim baru yang diusulkan selalu berstatus awal UNVERIFIED di domain
 * - AI tidak dapat memanipulasi bukti, level bukti, atau status grounding secara sepihak
 * - Menolak keras respon non-JSON atau halusinasi yang melanggar skema
 */

import type {
  AIResearchProvider,
  AIProviderMetadata,
  PlanResearchInput,
  AnalyzeGapsInput,
  AIGapAnalysisProposal,
  ProposeClaimsInput,
  ProposedClaim,
  AssistSynthesisInput,
  AISynthesisAssistance
} from '../../engines/research/orchestrator/ai-research-provider.ts';
import type { ResearchPlanProposal } from '../../engines/research/orchestrator/research-plan.ts';
import type { Result, ResearchDomainError } from '../../engines/research/domain/research-result.ts';
import { ok, err, createResearchDomainError } from '../../engines/research/domain/research-result.ts';
import { AIHttpClient } from './ai-http-client.ts';
import { StructuredOutputValidator } from './structured-output-validator.ts';
import type { AIProviderConfig } from './ai-provider-config.ts';

const SYSTEM_HARD_RULE = `Anda adalah AI Research Assistant untuk NexaMOS Blog Engineering.
ATURAN UTAMA (MUTLAK):
1. DILARANG MENGARANG FAKTA: Anda dilarang menciptakan data, angka, atau temuan palsu.
2. DILARANG MENGARANG SUMBER / SITASI: Hanya gunakan data yang disediakan dalam konteks.
3. FORMAT OUTPUT: Seluruh respon WAJIB berupa JSON terstruktur tanpa teks pembuka atau penutup.`;

export class RealAIResearchProvider implements AIResearchProvider {
  private readonly client: AIHttpClient;
  private readonly config: AIProviderConfig;
  private readonly promptVersion = '1.0.0';

  constructor(config: AIProviderConfig, client?: AIHttpClient) {
    this.config = config;
    this.client = client || new AIHttpClient(config);
  }

  public getClient(): AIHttpClient {
    return this.client;
  }

  public getMetadata(): AIProviderMetadata {
    return {
      providerName: this.config.provider,
      modelName: this.config.model,
      promptVersion: this.promptVersion
    };
  }

  public async planResearch(input: PlanResearchInput): Promise<Result<ResearchPlanProposal, ResearchDomainError>> {
    const prompt = `${SYSTEM_HARD_RULE}

TUGAS: Rumuskan Research Plan Proposal untuk topik berikut:
Topik: "${input.topic.title}"
Deskripsi Masalah: ${input.topic.problem || '-'}
Target Segmen: ${input.topic.audience?.segment || '-'}
Why Now: ${input.topic.whyNow || '-'}
Tesis yang diharapkan: ${input.topic.thesis || '-'}
Level Bukti Minimal: ${input.topic.evidencePlan?.requiredEvidenceLevel || 'E2'}

FORMAT JSON YANG WAJIB DIHASILKAN:
{
  "objective": "Tujuan riset objektif",
  "researchQuestions": [
    {
      "question": "Pertanyaan terukur spesifik",
      "targetEvidenceLevel": "E1 | E2 | E3 | E4",
      "priority": "CRITICAL | IMPORTANT | EXPLORATORY"
    }
  ],
  "requiredEvidenceLevel": "E2",
  "counterEvidenceRequired": true,
  "rationale": "Alasan metodologis"
}`;

    try {
      const response = await this.client.complete({
        messages: [
          { role: 'system', content: SYSTEM_HARD_RULE },
          { role: 'user', content: prompt }
        ],
        responseFormat: 'json_object',
        temperature: 0.2
      });

      const parsed = StructuredOutputValidator.parseJson(response.content);
      const validated = StructuredOutputValidator.validateResearchPlan(parsed);
      return ok(validated);
    } catch (error: any) {
      return err(createResearchDomainError('AI_OUTPUT_INVALID', error.message || String(error)));
    }
  }

  public async analyzeResearchGaps(input: AnalyzeGapsInput): Promise<Result<AIGapAnalysisProposal, ResearchDomainError>> {
    const prompt = `${SYSTEM_HARD_RULE}

TUGAS: Analisis kesenjangan bukti riset (Gap Analysis) berdasarkan data yang tersedia saat ini:
Klaim Saat Ini: ${JSON.stringify(input.claims.map((c) => ({ id: c.id, statement: c.statement, status: c.status })))}
Evaluasi Grounding: ${JSON.stringify(input.groundingResults.map((g) => ({ claimId: g.claimId, status: g.claimStatus })))}
Gaps yang sudah terdeteksi: ${JSON.stringify(input.currentGaps.map((g) => ({ type: g.type, description: g.description })))}

FORMAT JSON YANG WAJIB DIHASILKAN:
{
  "gapSummary": "Ringkasan status kecukupan bukti dan area yang masih belum terbukti",
  "priorityGaps": [
    {
      "type": "EVIDENCE_ABSENT | EVIDENCE_INSUFFICIENT | CONTRADICTION_UNRESOLVED | FRESHNESS_FAILED",
      "description": "Penjelasan gap spesifik",
      "claimId": "ID klaim terkait (jika ada)"
    }
  ],
  "suggestedActions": [
    {
      "actionType": "ACQUIRE_ADDITIONAL_SOURCES | REFINE_SEARCH_QUERY | REQUEST_HUMAN_REVIEW",
      "description": "Tindakan yang direkomendasikan",
      "targetGapType": "Tipe gap yang disasar",
      "priority": "CRITICAL | IMPORTANT | EXPLORATORY"
    }
  ]
}`;

    try {
      const response = await this.client.complete({
        messages: [
          { role: 'system', content: SYSTEM_HARD_RULE },
          { role: 'user', content: prompt }
        ],
        responseFormat: 'json_object',
        temperature: 0.2
      });

      const parsed = StructuredOutputValidator.parseJson(response.content);
      const validated = StructuredOutputValidator.validateGapAnalysis(parsed);
      return ok(validated);
    } catch (error: any) {
      return err(createResearchDomainError('AI_OUTPUT_INVALID', error.message || String(error)));
    }
  }

  public async proposeClaims(input: ProposeClaimsInput): Promise<Result<ProposedClaim[], ResearchDomainError>> {
    const evidenceList = input.evidence.slice(0, 30).map((e) => ({
      id: e.id,
      content: e.content.length > 400 ? e.content.slice(0, 400) + '...' : e.content,
      sourceId: e.sourceId,
      level: (e as any).evidenceLevel || (e as any).level
    }));

    const prompt = `${SYSTEM_HARD_RULE}

TUGAS: Berdasarkan BUKTI NYATA berikut, usulkan 3 hingga 6 klaim faktual/analitis yang ringkas dan padat untuk menjawab pertanyaan riset:
Bukti yang Disediakan:
${JSON.stringify(evidenceList, null, 2)}

Pertanyaan Riset yang Ingin Dijawab:
${JSON.stringify(input.questions.map((q) => q.question))}

PERINGATAN DAN PETUNJUK GROUNDING MUTLAK:
1. Jangan membuat klaim spekulatif tanpa dasar pada bukti di atas!
2. Setiap klaim WAJIB merupakan rangkuman langsung (grounded synthesis) dari salah satu bukti di atas.
3. Sebutkan persis ID bukti pendukung dalam array "proposedEvidenceIds" (misal: ["id-bukti-1"]).
4. Buatlah pernyataan klaim yang RINGKAS, FOKUS, dan PADAT (12 - 20 kata). Hindari kalimat majemuk bertingkat yang terlalu panjang.
5. Pertahankan angka, metrik, persentase, nama institusi, dan entitas spesifik persis sesuai bukti aslinya.
6. Jika membuat klaim dalam Bahasa Indonesia dari bukti Bahasa Inggris, pertahankan istilah teknis dan nama entitas agar grounding dapat diverifikasi.
7. Status klaim otomatis diinisialisasi sebagai UNVERIFIED di sistem.

FORMAT JSON YANG WAJIB DIHASILKAN:
{
  "claims": [
    {
      "statement": "Pernyataan klaim ringkas dan presisi yang didukung bukti di atas",
      "claimType": "FACTUAL | EMPIRICAL | ANALYTICAL | CAUSAL | PREDICTIVE",
      "importance": "CORE | SUPPORTING | PERIPHERAL",
      "rationale": "Mengapa bukti di atas mendukung klaim ini",
      "proposedEvidenceIds": ["id-bukti-1"]
    }
  ]
}`;

    try {
      const response = await this.client.complete({
        messages: [
          { role: 'system', content: SYSTEM_HARD_RULE },
          { role: 'user', content: prompt }
        ],
        responseFormat: 'json_object',
        temperature: 0.2
      });

      const parsed = StructuredOutputValidator.parseJson(response.content);
      const validated = StructuredOutputValidator.validateProposedClaims(parsed);
      return ok(validated);
    } catch (error: any) {
      return err(createResearchDomainError('AI_OUTPUT_INVALID', error.message || String(error)));
    }
  }

  public async assistSynthesis(input: AssistSynthesisInput): Promise<Result<AISynthesisAssistance, ResearchDomainError>> {
    const prompt = `${SYSTEM_HARD_RULE}

TUGAS: Berikan bantuan sintesis editorial berdasarkan temuan riset terverifikasi:
Topik: "${input.topic.title}"
Klaim yang Terbukti (Supported):
${JSON.stringify(input.supportedClaims.map((c) => c.statement))}
Klaim Bersengketa (Disputed):
${JSON.stringify(input.disputedClaims.map((c) => c.statement))}
Temuan Kunci:
${JSON.stringify(input.keyFindings.map((f) => f.statement))}
Keterbatasan:
${JSON.stringify(input.limitations)}

FORMAT JSON YANG WAJIB DIHASILKAN:
{
  "recommendedEditorialAngle": "Sudut pandang editorial otoritatif yang kuat dan berbasis data",
  "editorialNotes": [
    "Catatan penting untuk penulis artikel",
    "Bagaimana menangani keterbatasan atau data bersengketa"
  ],
  "confidenceSummary": "Ringkasan tingkat keyakinan terhadap bukti yang ada"
}`;

    try {
      const response = await this.client.complete({
        messages: [
          { role: 'system', content: SYSTEM_HARD_RULE },
          { role: 'user', content: prompt }
        ],
        responseFormat: 'json_object',
        temperature: 0.2
      });

      const parsed = StructuredOutputValidator.parseJson(response.content);
      const validated = StructuredOutputValidator.validateSynthesisAssistance(parsed);
      return ok(validated);
    } catch (error: any) {
      return err(createResearchDomainError('AI_OUTPUT_INVALID', error.message || String(error)));
    }
  }
}
