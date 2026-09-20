/// <reference path="./ambient.d.ts" />
/**
 * NexaMOS Real AI Adapter - Unit & Integration Test Suite
 *
 * Sourced from Production Pilot 01 Step 3 specifications.
 * Berjalan 100% offline tanpa membutuhkan API key nyata atau koneksi internet.
 * Menguji:
 * 1. AI Configuration Validation & Error Handling
 * 2. Shared AIHttpClient (Auth, Timeout, 429/5xx Retries, 401 Non-retry, Error Normalization)
 * 3. Structured Output Validator & Anti-Hallucination Grounding Guard
 * 4. Real AI Research Provider (Planning, Gaps, Claims, Synthesis)
 * 5. Real AI Editorial Provider (Editorial Plan, Draft Generation, Claim Traceability)
 * 6. AI Provider Factory & Anti-Silent-Mock Guard
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';

import {
  loadAIProviderConfig,
  validateAIProviderConfig,
  isAIConfigured,
  ensureEnvLoaded,
  type AIProviderConfig
} from '../infrastructure/ai/ai-provider-config.ts';
import {
  AIHttpClient,
  AIClientError
} from '../infrastructure/ai/ai-http-client.ts';
import { StructuredOutputValidator } from '../infrastructure/ai/structured-output-validator.ts';
import { RealAIResearchProvider } from '../infrastructure/ai/real-ai-research-provider.ts';
import { RealAIEditorialProvider } from '../infrastructure/ai/real-ai-editorial-provider.ts';
import { AIProviderFactory } from '../infrastructure/ai/ai-provider-factory.ts';
import type { Topic } from '../engines/ideation/domain/topic.types.ts';
import type { ResearchBrief } from '../engines/research/orchestrator/research-brief.ts';
import type { EditorialGenerationRequest } from '../engines/editorial/editorial-generation-request.ts';
import type { EditorialPlan } from '../engines/editorial/editorial-plan.ts';

const VALID_TEST_CONFIG: AIProviderConfig = {
  provider: 'openai',
  apiKey: 'sk-test-secret-key-12345678',
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.openai.com/v1',
  timeoutMs: 5000,
  maxRetries: 2
};

const VALID_GEMINI_CONFIG: AIProviderConfig = {
  provider: 'gemini',
  apiKey: 'gemini-test-secret-key-12345678',
  model: 'gemini-3.8-flash',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  timeoutMs: 5000,
  maxRetries: 2
};

const VALID_QWEN_CONFIG: AIProviderConfig = {
  provider: 'qwen',
  apiKey: 'sk-ws-test-secret-key-12345678',
  model: 'qwen3.8-flash',
  baseUrl: 'https://ws-123456.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
  timeoutMs: 5000,
  maxRetries: 2
};

function createMockFetch(handler: (url: string, init?: any) => Promise<{ status: number; ok: boolean; json: () => Promise<any>; text: () => Promise<string> }>): typeof fetch {
  return (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url, init);
  }) as any;
}

describe('Pilot 01 Step 3: Real AI Adapter Suite', () => {

  // ===========================================================================
  // 1. CONFIGURATION TESTS
  // ===========================================================================
  describe('1. AI Provider Configuration', () => {
    test('Memvalidasi konfigurasi produksi yang lengkap dan valid', () => {
      assert.doesNotThrow(() => {
        validateAIProviderConfig(VALID_TEST_CONFIG);
      });
    });

    test('Memvalidasi konfigurasi Gemini yang lengkap dan valid (AI_PROVIDER=gemini)', () => {
      assert.doesNotThrow(() => {
        validateAIProviderConfig(VALID_GEMINI_CONFIG);
      });
    });

    test('Memvalidasi konfigurasi Qwen yang lengkap dan valid (AI_PROVIDER=qwen, Region=Singapore)', () => {
      assert.doesNotThrow(() => {
        validateAIProviderConfig(VALID_QWEN_CONFIG);
      });
    });

    test('REGION SAFETY: Menolak konfigurasi Qwen jika baseUrl bukan region Singapore (.ap-southeast-1.maas.aliyuncs.com)', () => {
      assert.throws(
        () => {
          validateAIProviderConfig({
            ...VALID_QWEN_CONFIG,
            baseUrl: 'https://dashscope.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
          });
        },
        (err: Error) => {
          assert.match(err.message, /AI_PROVIDER_REGION_MISMATCH/);
          return true;
        }
      );
    });

    test('Menolak konfigurasi Qwen jika API key bernilai placeholder your_secret_qwen_api_key_here', () => {
      assert.throws(
        () => {
          validateAIProviderConfig({ ...VALID_QWEN_CONFIG, apiKey: 'your_secret_qwen_api_key_here' });
        },
        (err: Error) => {
          assert.match(err.message, /AI_PROVIDER_NOT_CONFIGURED/);
          return true;
        }
      );
    });

    test('loadAIProviderConfig secara default menggunakan provider gemini dan model gemini-3.8-flash', () => {
      ensureEnvLoaded();
      const prevModel = process.env.AI_PROVIDER_MODEL;
      const prevUrl = process.env.AI_PROVIDER_BASE_URL;
      delete process.env.AI_PROVIDER_MODEL;
      delete process.env.AI_PROVIDER_BASE_URL;
      try {
        const config = loadAIProviderConfig({ provider: 'gemini', apiKey: 'test-key' });
        assert.strictEqual(config.provider, 'gemini');
        assert.strictEqual(config.model, 'gemini-3.8-flash');
        assert.strictEqual(config.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
      } finally {
        if (prevModel !== undefined) process.env.AI_PROVIDER_MODEL = prevModel;
        if (prevUrl !== undefined) process.env.AI_PROVIDER_BASE_URL = prevUrl;
      }
    });

    test('loadAIProviderConfig secara default menggunakan provider qwen dan model qwen3.8-flash', () => {
      ensureEnvLoaded();
      const prevModel = process.env.AI_PROVIDER_MODEL;
      const prevUrl = process.env.AI_PROVIDER_BASE_URL;
      delete process.env.AI_PROVIDER_MODEL;
      delete process.env.AI_PROVIDER_BASE_URL;
      try {
        const config = loadAIProviderConfig({ provider: 'qwen', apiKey: 'test-key' });
        assert.strictEqual(config.provider, 'qwen');
        assert.strictEqual(config.model, 'qwen3.8-flash');
        assert.strictEqual(config.baseUrl, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1');
      } finally {
        if (prevModel !== undefined) process.env.AI_PROVIDER_MODEL = prevModel;
        if (prevUrl !== undefined) process.env.AI_PROVIDER_BASE_URL = prevUrl;
      }
    });

    test('Menolak konfigurasi Gemini jika API key bernilai placeholder your_secret_gemini_api_key_here', () => {
      assert.throws(
        () => {
          validateAIProviderConfig({ ...VALID_GEMINI_CONFIG, apiKey: 'your_secret_gemini_api_key_here' });
        },
        (err: Error) => {
          assert.match(err.message, /AI_PROVIDER_NOT_CONFIGURED/);
          return true;
        }
      );
    });

    test('Menolak konfigurasi jika API key kosong atau placeholder', () => {
      assert.throws(
        () => {
          validateAIProviderConfig({ ...VALID_TEST_CONFIG, apiKey: '' });
        },
        (err: Error) => {
          assert.match(err.message, /AI_PROVIDER_NOT_CONFIGURED/);
          return true;
        }
      );

      assert.throws(
        () => {
          validateAIProviderConfig({ ...VALID_TEST_CONFIG, apiKey: 'your_secret_api_key_here' });
        },
        (err: Error) => {
          assert.match(err.message, /AI_PROVIDER_NOT_CONFIGURED/);
          return true;
        }
      );
    });

    test('Menolak provider yang belum didukung', () => {
      assert.throws(
        () => {
          validateAIProviderConfig({ ...VALID_TEST_CONFIG, provider: 'unsupported-provider' });
        },
        (err: Error) => {
          assert.match(err.message, /AI_PROVIDER_NOT_CONFIGURED/);
          return true;
        }
      );
    });

    test('Menolak nilai timeout yang tidak valid (<= 0)', () => {
      assert.throws(
        () => {
          validateAIProviderConfig({ ...VALID_TEST_CONFIG, timeoutMs: 0 });
        },
        (err: Error) => {
          assert.match(err.message, /AI_CONFIG_INVALID/);
          return true;
        }
      );
    });

    test('isAIConfigured mengembalikan false jika API key tidak disetel', () => {
      assert.strictEqual(isAIConfigured({ apiKey: '' }), false);
      assert.strictEqual(isAIConfigured({ apiKey: 'your_secret_api_key_here' }), false);
      assert.strictEqual(isAIConfigured({ apiKey: 'real-key' }), true);
    });
  });

  // ===========================================================================
  // 2. SHARED AI HTTP CLIENT TESTS
  // ===========================================================================
  describe('2. Shared AIHttpClient', () => {
    test('Mengirimkan header Authorization Bearer yang benar dan menerima JSON', async () => {
      let capturedAuth = '';
      let capturedBody: any = null;

      const mockFetch = createMockFetch(async (_url, init) => {
        capturedAuth = init?.headers?.Authorization || '';
        capturedBody = JSON.parse(init?.body || '{}');
        return {
          status: 200,
          ok: true,
          json: async () => ({
            id: 'req-001',
            choices: [{ message: { content: '{"answer":"test"}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
          }),
          text: async () => ''
        };
      });

      const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
      const result = await client.complete({
        messages: [{ role: 'user', content: 'hello' }],
        responseFormat: 'json_object'
      });

      assert.strictEqual(capturedAuth, 'Bearer sk-test-secret-key-12345678');
      assert.strictEqual(capturedBody.model, 'gpt-4o-mini');
      assert.strictEqual(result.content, '{"answer":"test"}');
      assert.strictEqual(result.usage.totalTokens, 15);
      assert.strictEqual(result.usage.providerRequestId, 'req-001');
    });

    test('Mengirimkan request ke endpoint Gemini OpenAI-compatible (/chat/completions) dengan Bearer auth', async () => {
      let capturedUrl = '';
      let capturedAuth = '';
      let capturedBody: any = null;

      const mockFetch = createMockFetch(async (url, init) => {
        capturedUrl = url;
        capturedAuth = init?.headers?.Authorization || '';
        capturedBody = JSON.parse(init?.body || '{}');
        return {
          status: 200,
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"status":"ok"}' } }],
            usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 }
          }),
          text: async () => ''
        };
      });

      const client = new AIHttpClient(VALID_GEMINI_CONFIG, mockFetch);
      const result = await client.complete({
        messages: [{ role: 'user', content: 'test ping' }],
        responseFormat: 'json_object'
      });

      assert.strictEqual(capturedUrl, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
      assert.strictEqual(capturedAuth, 'Bearer gemini-test-secret-key-12345678');
      assert.strictEqual(capturedBody.model, 'gemini-3.8-flash');
      assert.strictEqual(result.provider, 'gemini');
    });

    test('Mengirimkan request ke endpoint Qwen OpenAI-compatible (/chat/completions) dengan Bearer auth', async () => {
      let capturedUrl = '';
      let capturedAuth = '';
      let capturedBody: any = null;

      const mockFetch = createMockFetch(async (url, init) => {
        capturedUrl = url;
        capturedAuth = init?.headers?.Authorization || '';
        capturedBody = JSON.parse(init?.body || '{}');
        return {
          status: 200,
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"status":"ok","message":"pong"}' } }],
            usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 }
          }),
          text: async () => ''
        };
      });

      const client = new AIHttpClient(VALID_QWEN_CONFIG, mockFetch);
      const result = await client.complete({
        messages: [{ role: 'user', content: 'ping' }],
        responseFormat: 'json_object'
      });

      assert.strictEqual(capturedUrl, 'https://ws-123456.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions');
      assert.strictEqual(capturedAuth, 'Bearer sk-ws-test-secret-key-12345678');
      assert.strictEqual(capturedBody.model, 'qwen3.8-flash');
      assert.strictEqual(result.provider, 'qwen');
    });

    test('QUOTA ERROR: Memetakan respon AccessDenied.Unpurchased dari Alibaba Cloud ke AI_FREE_QUOTA_EXHAUSTED', async () => {
      const mockFetch = createMockFetch(async () => {
        return {
          status: 403,
          ok: false,
          json: async () => ({}),
          text: async () => JSON.stringify({
            error: {
              code: 'AccessDenied.Unpurchased',
              message: 'Access to model denied. Please make sure you are eligible for using the model.'
            }
          })
        };
      });

      const client = new AIHttpClient(VALID_QWEN_CONFIG, mockFetch);
      await assert.rejects(
        async () => {
          await client.complete({ messages: [{ role: 'user', content: 'ping' }] });
        },
        (err: Error) => {
          assert.match(err.message, /AI_FREE_QUOTA_EXHAUSTED/);
          return true;
        }
      );
    });

    test('QUOTA ERROR: Memetakan respon AllocationQuota.FreeTierOnly dari Alibaba Cloud ke AI_FREE_QUOTA_EXHAUSTED', async () => {
      const mockFetch = createMockFetch(async () => {
        return {
          status: 403,
          ok: false,
          json: async () => ({}),
          text: async () => JSON.stringify({
            error: {
              code: 'AllocationQuota.FreeTierOnly',
              message: 'Free tier quota exhausted.'
            }
          })
        };
      });

      const client = new AIHttpClient(VALID_QWEN_CONFIG, mockFetch);
      await assert.rejects(
        async () => {
          await client.complete({ messages: [{ role: 'user', content: 'ping' }] });
        },
        (err: Error) => {
          assert.match(err.message, /AI_FREE_QUOTA_EXHAUSTED/);
          return true;
        }
      );
    });

    test('Memicu retry pada status HTTP 429 (Rate Limit) dan berhasil pada percobaan kedua', async () => {
      let callCount = 0;
      const mockFetch = createMockFetch(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            status: 429,
            ok: false,
            json: async () => ({}),
            text: async () => 'Rate limit exceeded'
          };
        }
        return {
          status: 200,
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"status":"recovered"}' } }]
          }),
          text: async () => ''
        };
      });

      const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
      const result = await client.complete({
        messages: [{ role: 'user', content: 'test' }],
        retryDelayMs: 5 // Delay cepat untuk test
      });

      assert.strictEqual(callCount, 2, 'Harus mencoba 2 kali karena 429');
      assert.match(result.content, /recovered/);
    });

    test('Memicu retry pada status HTTP 500 (Internal Server Error)', async () => {
      let callCount = 0;
      const mockFetch = createMockFetch(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            status: 500,
            ok: false,
            json: async () => ({}),
            text: async () => 'Internal Server Error'
          };
        }
        return {
          status: 200,
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"status":"ok_after_500"}' } }]
          }),
          text: async () => ''
        };
      });

      const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
      const result = await client.complete({
        messages: [{ role: 'user', content: 'test' }],
        retryDelayMs: 5
      });

      assert.strictEqual(callCount, 2);
      assert.match(result.content, /ok_after_500/);
    });

    test('TIDAK melakukan retry pada status HTTP 401 (Authentication Error)', async () => {
      let callCount = 0;
      const mockFetch = createMockFetch(async () => {
        callCount++;
        return {
          status: 401,
          ok: false,
          json: async () => ({}),
          text: async () => 'Unauthorized'
        };
      });

      const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
      await assert.rejects(
        async () => {
          await client.complete({ messages: [{ role: 'user', content: 'test' }] });
        },
        (err: Error) => {
          assert.match(err.message, /AI_AUTHENTICATION_FAILED/);
          return true;
        }
      );

      assert.strictEqual(callCount, 1, '401 tidak boleh di-retry');
    });

    test('Menolak respon kosong dengan error AI_RESPONSE_EMPTY', async () => {
      const mockFetch = createMockFetch(async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '   ' } }]
        }),
        text: async () => ''
      }));

      const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
      await assert.rejects(
        async () => {
          await client.complete({ messages: [{ role: 'user', content: 'test' }] });
        },
        (err: Error) => {
          assert.match(err.message, /AI_RESPONSE_EMPTY/);
          return true;
        }
      );
    });

    test('SECURITY: Tidak pernah mengekspos API key dalam pesan error', async () => {
      const mockFetch = createMockFetch(async () => {
        throw new Error(`Failed to contact https://api.openai.com with key ${VALID_TEST_CONFIG.apiKey}`);
      });

      const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
      await assert.rejects(
        async () => {
          await client.complete({ messages: [{ role: 'user', content: 'test' }], retryDelayMs: 1 });
        },
        (err: Error) => {
          assert.doesNotMatch(err.message, new RegExp(VALID_TEST_CONFIG.apiKey));
          assert.match(err.message, /\[REDACTED_API_KEY\]/);
          return true;
        }
      );
    });
  });

  // ===========================================================================
  // 3. STRUCTURED OUTPUT VALIDATOR
  // ===========================================================================
  describe('3. Structured Output Validator', () => {
    test('Membersihkan markdown code blocks (```json ... ```) secara bersih', () => {
      const rawWithMarkdown = '```json\n{"objective": "Investigasi AI"}\n```';
      const parsed = StructuredOutputValidator.parseJson(rawWithMarkdown);
      assert.strictEqual(parsed.objective, 'Investigasi AI');
    });

    test('Menolak JSON yang rusak / malformed dengan AI_OUTPUT_INVALID', () => {
      const brokenJson = '{"objective": "Investigasi AI", broken';
      assert.throws(
        () => {
          StructuredOutputValidator.parseJson(brokenJson);
        },
        (err: Error) => {
          assert.match(err.message, /AI_OUTPUT_INVALID/);
          return true;
        }
      );
    });

    test('Validasi ResearchPlan menolak proposal tanpa objective atau questions', () => {
      assert.throws(
        () => {
          StructuredOutputValidator.validateResearchPlan({ objective: '' });
        },
        (err: Error) => {
          assert.match(err.message, /kehilangan field wajib "objective"/);
          return true;
        }
      );

      assert.throws(
        () => {
          StructuredOutputValidator.validateResearchPlan({ objective: 'Obj', researchQuestions: [] });
        },
        (err: Error) => {
          assert.match(err.message, /minimal satu "researchQuestions"/);
          return true;
        }
      );
    });

    test('HARD GROUNDING GUARD: Menolak ArticleDraft jika mengandung claimId fiktif di luar brief', () => {
      const allowedClaimIds = new Set(['claim-001', 'claim-002']);
      const draftWithFakeClaim = {
        title: 'Draft Uji',
        sections: [{ id: 'sec-1', heading: 'H1', content: 'Konten...' }],
        claimUsages: [
          { id: 'cu-1', claimId: 'claim-001', statement: 'Valid' },
          { id: 'cu-2', claimId: 'claim-fake-999', statement: 'Klaim Halusinasi' }
        ],
        citationMap: []
      };

      assert.throws(
        () => {
          StructuredOutputValidator.validateArticleDraft(draftWithFakeClaim, { allowedClaimIds });
        },
        (err: Error) => {
          assert.match(err.message, /GROUNDING_VIOLATION/);
          assert.match(err.message, /claim-fake-999/);
          return true;
        }
      );
    });
  });

  // ===========================================================================
  // 4. REAL AI RESEARCH PROVIDER
  // ===========================================================================
  describe('4. Real AI Research Provider', () => {
    test('planResearch menghasilkan ResearchPlanProposal yang terstruktur', async () => {
      const mockFetch = createMockFetch(async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                objective: 'Menganalisis arsitektur retrievabilitas artikel blog di era AI.',
                researchQuestions: [
                  { question: 'Bagaimana AI Search mereferensikan sumber blog?', targetEvidenceLevel: 'E2', priority: 'CRITICAL' }
                ],
                requiredEvidenceLevel: 'E2',
                counterEvidenceRequired: true,
                rationale: 'Diperlukan bukti empiris keterlacakan klaim.'
              })
            }
          }]
        }),
        text: async () => ''
      }));

      const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
      const provider = new RealAIResearchProvider(VALID_TEST_CONFIG, client);

      const topic: Topic = {
        id: 'top-01',
        title: 'Arsitektur Retrievabilitas Blog',
        slug: 'arsitektur-retrievabilitas-blog',
        territory: 'STRATEGY',
        articleType: 'ANALYSIS',
        editorialRole: 'AUTHORITY',
        status: 'APPROVED',
        intent: { primary: 'Investigasi grounding AI' },
        informationGain: { originalityType: ['ORIGINAL_FRAMEWORK'], expectedContribution: 'Model', commodityRisk: 'LOW' },
        evidencePlan: { requiredEvidenceLevel: 'E2', plannedSources: ['Search Central'], originalEvidenceRequired: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = await provider.planResearch({ topic });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.objective, 'Menganalisis arsitektur retrievabilitas artikel blog di era AI.');
        assert.strictEqual(result.value.researchQuestions.length, 1);
        assert.strictEqual(result.value.requiredEvidenceLevel, 'E2');
      }
    });

    test('proposeClaims memetakan usulan klaim dari bukti dengan aman', async () => {
      const mockFetch = createMockFetch(async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                claims: [
                  {
                    statement: 'Dokumen dengan struktur klaim eksplisit memiliki peluang sitasi AI 40% lebih tinggi.',
                    claimType: 'EMPIRICAL',
                    importance: 'CORE',
                    rationale: 'Berdasarkan data uji eksperimen mandiri.'
                  }
                ]
              })
            }
          }]
        }),
        text: async () => ''
      }));

      const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
      const provider = new RealAIResearchProvider(VALID_TEST_CONFIG, client);

      const result = await provider.proposeClaims({
        projectId: 'proj-01',
        evidence: [
          {
            id: 'ev-01',
            sourceId: 'src-01',
            projectId: 'proj-01',
            type: 'STATISTIC',
            content: 'Uji independen: 40% peningkatan sitasi pada klaim terikat.',
            confidenceScore: 90,
            status: 'ACCEPTED',
            createdAt: new Date().toISOString()
          }
        ],
        questions: []
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.length, 1);
        assert.strictEqual(result.value[0].claimType, 'EMPIRICAL');
        assert.strictEqual(result.value[0].importance, 'CORE');
      }
    });
  });

  // ===========================================================================
  // 5. REAL AI EDITORIAL PROVIDER
  // ===========================================================================
  describe('5. Real AI Editorial Provider', () => {
    test('createEditorialPlan menghasilkan rencana editorial terstruktur dari brief', async () => {
      const mockFetch = createMockFetch(async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                workingTitle: 'Arsitektur Informasi di Era AI Overviews',
                thesis: 'Blog beralih dari agregator komoditas menjadi jurnal riset otoritatif.',
                angle: 'Rekayasa informasi versus volume spam kata kunci',
                readerPromise: 'Memahami prinsip retrievabilitas konten',
                sectionPlan: [
                  { heading: 'Pergeseran Lanskap', purpose: 'CONTEXT', keyPoints: ['AI Overviews merubah klik'], plannedClaimIds: ['claim-01'] }
                ],
                claimsToUse: ['claim-01'],
                findingsToUse: [],
                counterpoints: [],
                intendedTakeaway: 'Bangun aset pengetahuan mandiri.'
              })
            }
          }]
        }),
        text: async () => ''
      }));

      const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
      const provider = new RealAIEditorialProvider(VALID_TEST_CONFIG, client);

      const mockBrief: ResearchBrief = {
        projectId: 'proj-01',
        topicId: 'top-01',
        topicTitle: 'Arsitektur Blog',
        readiness: 'READY_FOR_EDITORIAL',
        supportedClaims: [{ id: 'claim-01', statement: 'Klaim terbukti', claimType: 'FACTUAL', importance: 'CORE', status: 'SUPPORTED', evidenceIds: ['ev-01'], projectId: 'proj-01', createdAt: new Date().toISOString() }],
        disputedClaims: [],
        unverifiedClaims: [],
        keyFindings: [],
        limitations: [],
        evidenceIndex: [],
        sourceIndex: [],
        builtAt: new Date().toISOString(),
        briefVersion: '1.0.0'
      };

      const request: EditorialGenerationRequest = {
        topic: { id: 'top-01', title: 'Topik Uji', slug: 'topik-uji', territory: 'STRATEGY', articleType: 'ANALYSIS', editorialRole: 'AUTHORITY', status: 'APPROVED', intent: {}, informationGain: { originalityType: [], expectedContribution: '', commodityRisk: 'LOW' }, evidencePlan: { requiredEvidenceLevel: 'E2', plannedSources: [], originalEvidenceRequired: true }, createdAt: '', updatedAt: '' },
        researchBrief: mockBrief,
        articleType: 'ANALYSIS',
        editorialRole: 'AUTHORITY'
      };

      const plan = await provider.createEditorialPlan(request);
      assert.strictEqual(plan.workingTitle, 'Arsitektur Informasi di Era AI Overviews');
      assert.strictEqual(plan.sectionPlan.length, 1);
      assert.strictEqual(plan.sectionPlan[0].purpose, 'CONTEXT');
    });

    test('generateArticleDraft menolak draft jika mencantumkan sitasi fiktif (Grounding Traceability)', async () => {
      // Mock respon model yang mengarang sourceId palsu yang tidak ada di brief
      const mockFetch = createMockFetch(async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                title: 'Draft Halusinasi',
                thesis: 'Tesis',
                editorialAngle: 'Angle',
                sections: [{ id: 'sec-1', heading: 'Seksi 1', content: 'Paragraf isi artikel...', order: 1 }],
                claimUsages: [{ id: 'cu-1', claimId: 'claim-01', statement: 'Klaim' }],
                citationMap: [
                  { claimUsageId: 'cu-1', claimId: 'claim-01', sourceIds: ['source-invented-999'], evidenceIds: ['ev-01'] }
                ]
              })
            }
          }]
        }),
        text: async () => ''
      }));

      const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
      const provider = new RealAIEditorialProvider(VALID_TEST_CONFIG, client);

      const mockBrief: ResearchBrief = {
        projectId: 'proj-01',
        topicId: 'top-01',
        topicTitle: 'Arsitektur Blog',
        readiness: 'READY_FOR_EDITORIAL',
        supportedClaims: [{ id: 'claim-01', statement: 'Klaim sah', claimType: 'FACTUAL', importance: 'CORE', status: 'SUPPORTED', evidenceIds: ['ev-01'], projectId: 'proj-01', createdAt: '' }],
        disputedClaims: [],
        unverifiedClaims: [],
        keyFindings: [],
        limitations: [],
        evidenceIndex: [{ id: 'ev-01', sourceId: 'source-real-01', textSnippet: '', evidenceType: 'STATISTIC', evidenceLevel: 'E2' }],
        sourceIndex: [{ id: 'source-real-01', title: 'Sumber Sah', url: 'https://example.com', sourceType: 'PRIMARY_RESEARCH' }],
        builtAt: '',
        briefVersion: '1.0.0'
      };

      const request: EditorialGenerationRequest = {
        topic: { id: 'top-01', title: 'Uji', slug: 'uji', territory: 'STRATEGY', articleType: 'ANALYSIS', editorialRole: 'AUTHORITY', status: 'APPROVED', intent: {}, informationGain: { originalityType: [], expectedContribution: '', commodityRisk: 'LOW' }, evidencePlan: { requiredEvidenceLevel: 'E2', plannedSources: [], originalEvidenceRequired: true }, createdAt: '', updatedAt: '' },
        researchBrief: mockBrief,
        articleType: 'ANALYSIS',
        editorialRole: 'AUTHORITY'
      };

      const plan: EditorialPlan = {
        workingTitle: 'Rencana',
        thesis: 'Tesis',
        angle: 'Angle',
        readerPromise: 'Janji',
        sectionPlan: [{ heading: 'Seksi 1', purpose: 'CONTEXT', keyPoints: [], plannedClaimIds: [] }],
        claimsToUse: [],
        findingsToUse: [],
        counterpoints: [],
        intendedTakeaway: ''
      };

      await assert.rejects(
        async () => {
          await provider.generateArticleDraft(request, plan);
        },
        (err: Error) => {
          assert.match(err.message, /GROUNDING_VIOLATION/);
          assert.match(err.message, /source-invented-999/);
          return true;
        }
      );
    });

    test('generateArticleDraft menolak keras sitasi fiktif jika LLM menempatkan finding-01 ke sourceIds (tanpa auto-repair)', async () => {
      const mockFetch = createMockFetch(async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                title: 'Draft Normalisasi',
                thesis: 'Tesis Otoritas',
                editorialAngle: 'Angle Strategis',
                sections: [{ id: 'sec-1', heading: 'Seksi 1', content: 'Paragraf isi artikel yang mendalam...', order: 1, claimUsageIds: ['cu-1'] }],
                claimUsages: [{ id: 'cu-1', claimId: 'claim-01', statement: 'Klaim terbukti' }],
                citationMap: [
                  { claimUsageId: 'cu-1', claimId: 'claim-01', sourceIds: ['finding-01'], evidenceIds: ['ev-01'] }
                ]
              })
            }
          }]
        }),
        text: async () => ''
      }));

      const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
      const provider = new RealAIEditorialProvider(VALID_TEST_CONFIG, client);

      const mockBrief: ResearchBrief = {
        projectId: 'proj-01',
        topicId: 'top-01',
        topicTitle: 'Spionase Marketing',
        readiness: 'READY_FOR_EDITORIAL',
        supportedClaims: [{ id: 'claim-01', statement: 'Klaim sah', claimType: 'FACTUAL', importance: 'CORE', status: 'SUPPORTED', evidenceIds: ['ev-01'], projectId: 'proj-01', createdAt: '' }],
        disputedClaims: [],
        unverifiedClaims: [],
        keyFindings: [{ id: 'finding-01', statement: 'Temuan spionase pasar', supportingClaimIds: ['claim-01'], confidence: 'HIGH' } as any],
        limitations: [],
        evidenceIndex: [{ id: 'ev-01', evidenceId: 'ev-01', sourceId: 'src-01', textSnippet: '', evidenceType: 'STATISTIC', evidenceLevel: 'E2' } as any],
        sourceIndex: [{ id: 'src-01', sourceId: 'src-01', title: 'Riset Primer', url: 'https://example.com', sourceType: 'PRIMARY_RESEARCH' } as any],
        builtAt: '',
        briefVersion: '1.0.0'
      };

      const request: EditorialGenerationRequest = {
        topic: { id: 'top-01', title: 'Spionase Marketing', slug: 'spionase-marketing', territory: 'INTELLIGENCE', articleType: 'ANALYSIS', editorialRole: 'AUTHORITY', status: 'APPROVED', intent: {}, informationGain: { originalityType: [], expectedContribution: '', commodityRisk: 'LOW' }, evidencePlan: { requiredEvidenceLevel: 'E2', plannedSources: [], originalEvidenceRequired: true }, createdAt: '', updatedAt: '' },
        researchBrief: mockBrief,
        articleType: 'ANALYSIS',
        editorialRole: 'AUTHORITY'
      };

      const plan: EditorialPlan = {
        workingTitle: 'Spionase Marketing',
        thesis: 'Tesis',
        angle: 'Angle',
        readerPromise: 'Janji',
        sectionPlan: [{ heading: 'Seksi 1', purpose: 'CONTEXT', keyPoints: [], plannedClaimIds: [] }],
        claimsToUse: [],
        findingsToUse: [],
        counterpoints: [],
        intendedTakeaway: ''
      };

      await assert.rejects(
        async () => {
          await provider.generateArticleDraft(request, plan);
        },
        (err: Error) => {
          assert.match(err.message, /GROUNDING_VIOLATION/);
          return true;
        }
      );
    });

    test('generateArticleDraft melempar EDITORIAL_NOT_READY jika brief.sourceIndex kosong (anti synthetic source fallback)', async () => {
      const mockFetch = createMockFetch(async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                title: 'Draft Mandiri',
                thesis: 'Tesis Sovereign',
                editorialAngle: 'Angle Intelijen',
                sections: [{ id: 'sec-1', heading: 'Seksi 1', content: 'Paragraf naskah...', order: 1, claimUsageIds: ['cu-1'] }],
                claimUsages: [{ id: 'cu-1', claimId: 'claim-01', statement: 'Klaim mandiri' }],
                citationMap: [
                  { claimUsageId: 'cu-1', claimId: 'claim-01', sourceIds: ['src-01'], evidenceIds: ['ev-01'] }
                ]
              })
            }
          }]
        }),
        text: async () => ''
      }));

      const client = new AIHttpClient(VALID_TEST_CONFIG, mockFetch);
      const provider = new RealAIEditorialProvider(VALID_TEST_CONFIG, client);

      const mockBrief: ResearchBrief = {
        projectId: 'proj-01',
        topicId: 'top-01',
        topicTitle: 'Riset Mandiri',
        readiness: 'READY_FOR_EDITORIAL',
        supportedClaims: [{ id: 'claim-01', statement: 'Klaim mandiri', claimType: 'FACTUAL', importance: 'CORE', status: 'SUPPORTED', evidenceIds: ['ev-01'], projectId: 'proj-01', createdAt: '' }],
        disputedClaims: [],
        unverifiedClaims: [],
        keyFindings: [{ id: 'finding-01', statement: 'Temuan', supportingClaimIds: ['claim-01'], confidence: 'HIGH' } as any],
        limitations: [],
        evidenceIndex: [],
        sourceIndex: [],
        builtAt: '',
        briefVersion: '1.0.0'
      };

      const request: EditorialGenerationRequest = {
        topic: { id: 'top-01', title: 'Riset Mandiri', slug: 'riset-mandiri', territory: 'INTELLIGENCE', articleType: 'ANALYSIS', editorialRole: 'AUTHORITY', status: 'APPROVED', intent: {}, informationGain: { originalityType: [], expectedContribution: '', commodityRisk: 'LOW' }, evidencePlan: { requiredEvidenceLevel: 'E2', plannedSources: [], originalEvidenceRequired: false }, createdAt: '', updatedAt: '' },
        researchBrief: mockBrief,
        articleType: 'ANALYSIS',
        editorialRole: 'AUTHORITY'
      };

      const plan: EditorialPlan = {
        workingTitle: 'Riset Mandiri',
        thesis: 'Tesis',
        angle: 'Angle',
        readerPromise: 'Janji',
        sectionPlan: [{ heading: 'Seksi 1', purpose: 'CONTEXT', keyPoints: [], plannedClaimIds: [] }],
        claimsToUse: [],
        findingsToUse: [],
        counterpoints: [],
        intendedTakeaway: ''
      };

      await assert.rejects(
        async () => {
          await provider.generateArticleDraft(request, plan);
        },
        (err: Error) => {
          assert.match(err.message, /EDITORIAL_NOT_READY/);
          return true;
        }
      );
    });
  });

  // ===========================================================================
  // 6. AI PROVIDER FACTORY & ANTI-SILENT-MOCK GUARD
  // ===========================================================================
  describe('6. AI Provider Factory & Production Safety', () => {
    test('Factory berhasil membuat pasangan provider jika konfigurasi valid', () => {
      const pair = AIProviderFactory.createProductionProviders(VALID_TEST_CONFIG);
      assert.ok(pair.researchProvider);
      assert.ok(pair.editorialProvider);
      assert.ok(pair.httpClient);
      assert.strictEqual(pair.config.model, 'gpt-4o-mini');
    });

    test('Factory berhasil membuat pasangan provider dengan konfigurasi Gemini', () => {
      const pair = AIProviderFactory.createProductionProviders(VALID_GEMINI_CONFIG);
      assert.ok(pair.researchProvider);
      assert.ok(pair.editorialProvider);
      assert.ok(pair.httpClient);
      assert.strictEqual(pair.config.provider, 'gemini');
      assert.strictEqual(pair.config.model, 'gemini-3.8-flash');
      assert.strictEqual(pair.config.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
    });

    test('Factory berhasil membuat pasangan provider dengan konfigurasi Qwen', () => {
      const pair = AIProviderFactory.createProductionProviders(VALID_QWEN_CONFIG);
      assert.ok(pair.researchProvider);
      assert.ok(pair.editorialProvider);
      assert.ok(pair.httpClient);
      assert.strictEqual(pair.config.provider, 'qwen');
      assert.strictEqual(pair.config.model, 'qwen3.8-flash');
      assert.strictEqual(pair.config.baseUrl, 'https://ws-123456.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1');
    });

    test('ANTI-FALLBACK: Kegagalan Qwen tidak pernah fallback ke Gemini atau Mock (throws explicit error)', async () => {
      const mockFetch = createMockFetch(async () => {
        return {
          status: 500,
          ok: false,
          json: async () => ({}),
          text: async () => 'Internal Server Error'
        };
      });

      const client = new AIHttpClient(VALID_QWEN_CONFIG, mockFetch);
      await assert.rejects(
        async () => {
          await client.complete({ messages: [{ role: 'user', content: 'test' }] });
        },
        (err: Error) => {
          assert.match(err.message, /AI_PROVIDER_UNAVAILABLE/);
          return true;
        }
      );
    });

    test('HARD SAFETY: Factory menolak dan melempar error jika API key tidak disetel (Anti-Silent Mock)', () => {
      assert.throws(
        () => {
          AIProviderFactory.createProductionProviders({ apiKey: '' });
        },
        (err: Error) => {
          assert.match(err.message, /AI_PROVIDER_NOT_CONFIGURED/);
          return true;
        }
      );
    });
  });
});
