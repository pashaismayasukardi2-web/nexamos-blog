/**
 * NexaMOS Research Evidence Retrieval & Cross-Language Grounding v2 Tests
 *
 * Menguji secara komprehensif:
 * - P0-A: HtmlParser Semantic Extraction & Boilerplate Sanitization (Scenarios 1-5)
 * - P0-B: EvidenceRelevanceSelector & Thematic Diversity (Scenarios 6-11)
 * - P1: CrossLanguageNormalizer & Strict Mutation Guard (Scenarios 12-15)
 * - Integration: DeterministicClaimEvidenceVerifier & CanonicalResearchPipeline (Scenarios 16-18)
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { HtmlParser } from '../engines/research/ingestion/parsers/html-parser.ts';
import { EvidenceRelevanceSelector } from '../engines/research/relevance/evidence-relevance-selector.ts';
import { DeterministicCrossLanguageNormalizer } from '../engines/research/grounding/cross-language-grounding.ts';
import { DeterministicClaimEvidenceVerifier } from '../engines/research/claim-evidence-verifier.ts';
import { CanonicalResearchPipeline } from '../engines/research/canonical-research-pipeline.ts';
import type { RawSourceInput } from '../engines/research/ingestion/source-ingestion.ts';
import type { ResearchEvidence } from '../engines/research/domain/research-evidence.ts';
import type { ResearchClaim } from '../engines/research/domain/research-claim.ts';
import type { Topic } from '../engines/ideation/domain/topic.types.ts';
import type { ResearchQuestion } from '../engines/research/domain/research-question.ts';
import type { SourceCandidate } from '../engines/research/acquisition/source-candidate.ts';
import type { SourceAcquisitionProvider } from '../engines/research/acquisition/providers/source-acquisition-provider.ts';
import { MockSourceAcquisitionProvider } from '../engines/research/acquisition/providers/mock-acquisition-provider.ts';
import { ok } from '../engines/research/domain/research-result.ts';

describe('Research Evidence Retrieval & Cross-Language Grounding v2 Test Suite', () => {

  // =========================================================================
  // P0-A: HtmlParser Tests (Scenarios 1 - 5)
  // =========================================================================
  describe('P0-A: HtmlParser Semantic Region Extraction & Boilerplate Sanitization', () => {
    const parser = new HtmlParser();

    test('1. HtmlParser: prioritizes <article> semantic container when present', async () => {
      const html = `
        <html>
          <body>
            <div id="site-header">Header Navigation with lots of words repeating everywhere</div>
            <article>
              <h1>Judul Artikel Utama</h1>
              <p>Ini adalah paragraf substansial dalam tag article yang memuat konten analisis mendalam mengenai adopsi kecerdasan buatan dalam perusahaan modern.</p>
              <p>Paragraf kedua menjelaskan metrik efisiensi operasional dan tata kelola konten.</p>
            </article>
            <div id="site-footer">Footer links and copyright information</div>
          </body>
        </html>
      `;

      const doc = await parser.parse({
        researchProjectId: 'p1',
        sourceType: 'OFFICIAL_DOCUMENTATION',
        format: 'HTML',
        title: 'Test Article',
        content: html
      });

      assert.strictEqual(doc.sections.length >= 2, true);
      assert.strictEqual(doc.sections.some((s) => s.text.includes('paragraf substansial')), true);
      assert.strictEqual(doc.sections.some((s) => s.text.includes('Header Navigation')), false);
      assert.strictEqual(doc.sections.some((s) => s.text.includes('Footer links')), false);
    });

    test('2. HtmlParser: isolates <main> container when <article> is absent', async () => {
      const html = `
        <html>
          <body>
            <div class="top-nav">Navigation bar links</div>
            <main>
              <h1>Pengenalan AI Content Ops</h1>
              <p>Konten utama di dalam main tag yang membahas strategi diversifikasi saluran pemasaran konten berbasis agen AI otonom.</p>
              <p>Organisasi perlu menetapkan guardrail operasional agar tidak terjadi halusinasi data.</p>
            </main>
          </body>
        </html>
      `;

      const doc = await parser.parse({
        researchProjectId: 'p1',
        sourceType: 'OFFICIAL_DOCUMENTATION',
        format: 'HTML',
        title: 'Test Main',
        content: html
      });

      assert.strictEqual(doc.sections.length >= 2, true);
      assert.strictEqual(doc.sections[0].heading, 'Pengenalan AI Content Ops');
      assert.strictEqual(doc.sections.some((s) => s.text.includes('Navigation bar links')), false);
    });

    test('3. HtmlParser: strips <nav>, <footer>, <aside>, <form>, <button>, and <dialog>', async () => {
      const html = `
        <html>
          <body>
            <main>
              <nav><a href="/home">Home</a><a href="/about">About</a></nav>
              <aside>Sidebar advertisement and newsletter</aside>
              <form><input type="text"><button type="submit">Subscribe</button></form>
              <h1>Substansi Riset</h1>
              <p>Data empiris menunjukkan kenaikan efisiensi editorial sebesar 34% setelah integrasi pipeline terotomatisasi.</p>
              <footer>Copyright 2026 NexaMOS. All rights reserved.</footer>
            </main>
          </body>
        </html>
      `;

      const doc = await parser.parse({
        researchProjectId: 'p1',
        sourceType: 'OFFICIAL_DOCUMENTATION',
        format: 'HTML',
        title: 'Test Boilerplate Stripping',
        content: html
      });

      for (const s of doc.sections) {
        assert.strictEqual(s.text.includes('Home'), false);
        assert.strictEqual(s.text.includes('Sidebar advertisement'), false);
        assert.strictEqual(s.text.includes('Subscribe'), false);
        assert.strictEqual(s.text.includes('All rights reserved'), false);
      }
      assert.strictEqual(doc.sections.some((s) => s.text.includes('kenaikan efisiensi editorial sebesar 34%')), true);
    });

    test('4. HtmlParser: strips topic lists and tag clouds (<ul class="ArticleBase-Topics">)', async () => {
      const html = `
        <html>
          <body>
            <div data-template="article" class="Article ArticleBase">
              <ul class="ArticleBase-Topics" data-testid="article-topics">
                <li class="ArticleBase-Topic"><a href="/tag1">Content Strategy</a></li>
                <li class="ArticleBase-Topic"><a href="/tag2">Demand Generation</a></li>
              </ul>
              <h1>How To Work AI Into Content Marketing</h1>
              <p>Does the company you work for have a policy on AI use? Several brands have established strict rules.</p>
            </div>
          </body>
        </html>
      `;

      const doc = await parser.parse({
        researchProjectId: 'p1',
        sourceType: 'OFFICIAL_DOCUMENTATION',
        format: 'HTML',
        title: 'Test Topics Stripping',
        content: html
      });

      assert.strictEqual(doc.sections.some((s) => s.text.includes('Content Strategy')), false);
      assert.strictEqual(doc.sections.some((s) => s.text.includes('Several brands have established strict rules')), true);
    });

    test('5. HtmlParser: preserves headings, blockquotes, and tables without corruption', async () => {
      const html = `
        <article>
          <h1>Judul H1</h1>
          <p>Paragraf pembuka artikel.</p>
          <blockquote>Kutipan penting dari pakar industri.</blockquote>
          <table>
            <tr><th>Metric</th><th>Benchmark</th></tr>
            <tr><td>Adoption Rate</td><td>48%</td></tr>
          </table>
          <h2>Subheading H2</h2>
          <p>Paragraf penutup analisis.</p>
        </article>
      `;

      const doc = await parser.parse({
        researchProjectId: 'p1',
        sourceType: 'OFFICIAL_DOCUMENTATION',
        format: 'HTML',
        title: 'Test Structure Integrity',
        content: html
      });

      assert.strictEqual(doc.sections.length >= 3, true);
      assert.strictEqual(doc.tables.length, 1);
      assert.deepStrictEqual(doc.tables[0].headers, ['Metric', 'Benchmark']);
      assert.strictEqual(doc.tables[0].rows[0][1], '48%');
      assert.strictEqual(doc.sections.some((s) => s.text.includes('Kutipan penting dari pakar industri')), true);
    });
  });

  // =========================================================================
  // P0-B: EvidenceRelevanceSelector Tests (Scenarios 6 - 11)
  // =========================================================================
  describe('P0-B: EvidenceRelevanceSelector Relevance Scoring & Diversity', () => {
    const selector = new EvidenceRelevanceSelector();
    const mockTopic: Topic = {
      id: 'top-1',
      title: 'Teknik pemasaran konten di era AI',
      slug: 'teknik-pemasaran-konten-era-ai',
      territory: 'TACTICAL',
      targetAudience: 'Content Marketers and CMOs',
      differentiationAngle: 'Operasional ter-grounding',
      lifecycleState: 'APPROVED',
      status: 'APPROVED',
      scoring: { totalScore: 85, policyVersion: 'v1.0' } as any,
      estimatedEvidenceReadiness: 'HIGH',
      editorialFormat: 'FRAMEWORK',
      version: 1,
      createdAt: '',
      updatedAt: ''
    };

    const mockQuestions: ResearchQuestion[] = [
      { id: 'q1', question: 'Bagaimana perusahaan menerapkan kebijakan tata kelola AI untuk pemasaran konten?' }
    ];

    test('6. EvidenceRelevanceSelector: scores higher for topic and research questions overlap', () => {
      const relevantEv: ResearchEvidence = {
        id: 'ev-rel',
        sourceId: 'src-1',
        researchProjectId: 'p1',
        content: 'Content marketing teams are developing AI governance policies to control generative content use.',
        locator: { section: 'AI Governance' },
        evidenceLevel: 'E2',
        capturedAt: '',
        publicationAllowed: true,
        createdAt: '',
        updatedAt: ''
      };

      const irrelevantEv: ResearchEvidence = {
        id: 'ev-irrel',
        sourceId: 'src-1',
        researchProjectId: 'p1',
        content: 'The culinary restaurant introduced a new seasonal dessert menu in downtown Manhattan.',
        locator: { section: 'Culinary' },
        evidenceLevel: 'E2',
        capturedAt: '',
        publicationAllowed: true,
        createdAt: '',
        updatedAt: ''
      };

      const ranked = selector.rankEvidence([irrelevantEv, relevantEv], mockTopic, mockQuestions);
      assert.strictEqual(ranked[0].evidence.id, 'ev-rel');
      assert.strictEqual(ranked[0].score > ranked[1].score, true);
    });

    test('7. EvidenceRelevanceSelector: applies STATISTIC boost (1.3x) for percentages and numbers', () => {
      const statEv: ResearchEvidence = {
        id: 'ev-stat',
        sourceId: 'src-1',
        researchProjectId: 'p1',
        content: 'Content marketing teams reported a 54% increase in workflow efficiency after adopting AI.',
        locator: { section: 'Efficiency' },
        evidenceLevel: 'E2',
        capturedAt: '',
        publicationAllowed: true,
        createdAt: '',
        updatedAt: ''
      };

      const noStatEv: ResearchEvidence = {
        id: 'ev-no-stat',
        sourceId: 'src-1',
        researchProjectId: 'p1',
        content: 'Content marketing teams reported an increase in workflow efficiency after adopting AI.',
        locator: { section: 'Efficiency' },
        evidenceLevel: 'E2',
        capturedAt: '',
        publicationAllowed: true,
        createdAt: '',
        updatedAt: ''
      };

      const ranked = selector.rankEvidence([noStatEv, statEv], mockTopic, mockQuestions);
      assert.strictEqual(ranked[0].evidence.id, 'ev-stat');
      assert.strictEqual(ranked[0].score > ranked[1].score, true);
      assert.strictEqual(ranked[0].matchReasons.some((r) => r.includes('Statistic boost')), true);
    });

    test('8. EvidenceRelevanceSelector: applies QUOTE boost (1.2x)', () => {
      const quoteEv: ResearchEvidence = {
        id: 'ev-quote',
        sourceId: 'src-1',
        researchProjectId: 'p1',
        content: '"Developing clear AI guidelines is the most important step for content marketers," says Katie Rob.',
        locator: { section: 'Expert Insights' },
        evidenceLevel: 'E2',
        capturedAt: '',
        publicationAllowed: true,
        createdAt: '',
        updatedAt: ''
      };

      const ranked = selector.rankEvidence([quoteEv], mockTopic, mockQuestions);
      assert.strictEqual(ranked[0].matchReasons.some((r) => r.includes('Quote boost')), true);
    });

    test('9. EvidenceRelevanceSelector: penalizes short isolated fragments (< 30 chars)', () => {
      const shortEv: ResearchEvidence = {
        id: 'ev-short',
        sourceId: 'src-1',
        researchProjectId: 'p1',
        content: 'Content AI tools.',
        locator: { section: 'Nav' },
        evidenceLevel: 'E2',
        capturedAt: '',
        publicationAllowed: true,
        createdAt: '',
        updatedAt: ''
      };

      const longEv: ResearchEvidence = {
        id: 'ev-long',
        sourceId: 'src-1',
        researchProjectId: 'p1',
        content: 'Content marketers leverage AI tools to accelerate market research and editorial discovery.',
        locator: { section: 'Overview' },
        evidenceLevel: 'E2',
        capturedAt: '',
        publicationAllowed: true,
        createdAt: '',
        updatedAt: ''
      };

      const ranked = selector.rankEvidence([shortEv, longEv], mockTopic, mockQuestions);
      assert.strictEqual(ranked[0].evidence.id, 'ev-long');
      const shortRanked = ranked.find((r) => r.evidence.id === 'ev-short');
      assert.strictEqual(shortRanked?.matchReasons.some((r) => r.includes('Short fragment penalty')), true);
    });

    test('10. EvidenceRelevanceSelector: penalizes boilerplate patterns (read more, privacy policy)', () => {
      const bpEv: ResearchEvidence = {
        id: 'ev-bp',
        sourceId: 'src-1',
        researchProjectId: 'p1',
        content: 'Read more about content marketing policies and subscribe to our newsletter for privacy updates.',
        locator: { section: 'Footer' },
        evidenceLevel: 'E2',
        capturedAt: '',
        publicationAllowed: true,
        createdAt: '',
        updatedAt: ''
      };

      const ranked = selector.rankEvidence([bpEv], mockTopic, mockQuestions);
      assert.strictEqual(ranked[0].matchReasons.some((r) => r.includes('Boilerplate penalty')), true);
    });

    test('11. EvidenceRelevanceSelector: enforces thematic diversity per section (maxPerSection)', () => {
      const evidenceList: ResearchEvidence[] = [];
      // 10 items from "Section A"
      for (let i = 1; i <= 10; i++) {
        evidenceList.push({
          id: `ev-a-${i}`,
          sourceId: 'src-1',
          researchProjectId: 'p1',
          content: `Content marketing strategy in AI era item ${i} with statistic ${10 + i}%.`,
          locator: { section: 'Section A' },
          evidenceLevel: 'E2',
          capturedAt: '',
          publicationAllowed: true,
          createdAt: '',
          updatedAt: ''
        });
      }
      // 5 items from "Section B"
      for (let i = 1; i <= 5; i++) {
        evidenceList.push({
          id: `ev-b-${i}`,
          sourceId: 'src-1',
          researchProjectId: 'p1',
          content: `Content operations governance and AI policy item ${i} with statistic ${20 + i}%.`,
          locator: { section: 'Section B' },
          evidenceLevel: 'E2',
          capturedAt: '',
          publicationAllowed: true,
          createdAt: '',
          updatedAt: ''
        });
      }

      const selected = selector.selectTopEvidence(evidenceList, mockTopic, mockQuestions, {
        maxItems: 6,
        maxPerSection: 3
      });

      assert.strictEqual(selected.length, 6);
      const sectionACount = selected.filter((e) => e.locator?.section === 'Section A').length;
      const sectionBCount = selected.filter((e) => e.locator?.section === 'Section B').length;
      assert.strictEqual(sectionACount, 3);
      assert.strictEqual(sectionBCount, 3);
    });
  });

  // =========================================================================
  // P1: CrossLanguageNormalizer & Mutation Guard Tests (Scenarios 12 - 15)
  // =========================================================================
  describe('P1: CrossLanguageNormalizer & Epistemic Mutation Guard', () => {
    const normalizer = new DeterministicCrossLanguageNormalizer();

    test('12. CrossLanguageNormalizer: detects source language correctly', () => {
      assert.strictEqual(
        normalizer.detectLanguage('Beberapa brand besar menerapkan kebijakan penggunaan AI'),
        'id'
      );
      assert.strictEqual(
        normalizer.detectLanguage('Several large brands have implemented AI usage policies'),
        'en'
      );
    });

    test('13. CrossLanguageNormalizer: normalizes Indonesian proposition to English via deterministic dictionary', async () => {
      const idStatement = 'Pemasar konten harus menyusun kebijakan AI dan tata kelola alur kerja.';
      const res = await normalizer.normalizeProposition(idStatement, 'en');

      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.mutationDetected, false);
      assert.strictEqual(res.normalizedStatement.toLowerCase().includes('content marketers'), true);
      assert.strictEqual(res.normalizedStatement.toLowerCase().includes('ai policy'), true);
      assert.strictEqual(res.normalizedStatement.toLowerCase().includes('workflow'), true);
    });

    test('14. Mutation Guard: detects and rejects altered numbers (e.g. 18% mutated to 81%)', () => {
      const orig = 'Tingkat adopsi AI di kalangan pemasar konten mencapai 18%.';
      const mutated = 'The AI adoption rate among content marketers reached 81%.';

      const check = normalizer.verifyNumericAndEntityIntegrity(orig, mutated);
      assert.strictEqual(check.hasMutation, true);
      assert.strictEqual(check.reason?.includes('18%'), true);
    });

    test('15. Mutation Guard: detects and rejects fabricated numbers not present in original claim', () => {
      const orig = 'Banyak organisasi menerapkan pembatasan AI generatif.';
      const fabricated = 'Many organizations (over 50%) implement restrictions on generative AI.';

      const check = normalizer.verifyNumericAndEntityIntegrity(orig, fabricated);
      assert.strictEqual(check.hasMutation, true);
      assert.strictEqual(check.reason?.includes('FABRICATION DETECTED'), true);
    });
  });

  // =========================================================================
  // Integration Tests: Verifier & Pipeline (Scenarios 16 - 18)
  // =========================================================================
  describe('Integration: Grounding Verifier & Pipeline End-to-End', () => {
    test('16. DeterministicClaimEvidenceVerifier: grounds Indonesian claim to English evidence without lowering threshold', async () => {
      const verifier = new DeterministicClaimEvidenceVerifier();

      const englishEvidence: ResearchEvidence = {
        id: 'ev-cmi-1',
        sourceId: 'src-cmi',
        researchProjectId: 'proj-test',
        content: 'Several brands (Amazon, Apple, Verizon, and Wells Fargo) have restricted employee use of generative AI technologies.',
        locator: { section: 'AI Policy' },
        evidenceLevel: 'E2',
        capturedAt: new Date().toISOString(),
        publicationAllowed: true,
        verified: true,
        sourceUrl: 'https://contentmarketinginstitute.com/ai-policy-article',
        createdAt: '',
        updatedAt: ''
      };

      const indonesianClaim: ResearchClaim = {
        id: 'claim-1',
        researchProjectId: 'proj-test',
        statement: 'Beberapa brand seperti Amazon, Apple, Verizon membatasi penggunaan generative AI oleh karyawan.',
        claimType: 'FACTUAL',
        importance: 'CRITICAL',
        status: 'UNVERIFIED',
        createdAt: '',
        updatedAt: ''
      };

      const result = await verifier.verify(indonesianClaim, [englishEvidence]);
      assert.strictEqual(result.status, 'SUPPORTED');
      assert.strictEqual(result.supportingEvidenceIds.length, 1);
      assert.strictEqual(result.supportingEvidenceIds[0], 'ev-cmi-1');
    });

    test('17. DeterministicClaimEvidenceVerifier: leaves canonical evidence text and URL completely immutable', async () => {
      const verifier = new DeterministicClaimEvidenceVerifier();

      const origContent = 'Several brands (Amazon, Apple, Verizon, and Wells Fargo) have restricted employee use of generative AI technologies.';
      const origUrl = 'https://contentmarketinginstitute.com/ai-policy-article';

      const englishEvidence: ResearchEvidence = {
        id: 'ev-cmi-1',
        sourceId: 'src-cmi',
        researchProjectId: 'proj-test',
        content: origContent,
        locator: { section: 'AI Policy' },
        evidenceLevel: 'E2',
        capturedAt: new Date().toISOString(),
        publicationAllowed: true,
        verified: true,
        sourceUrl: origUrl,
        createdAt: '',
        updatedAt: ''
      };

      const claim: ResearchClaim = {
        id: 'claim-1',
        researchProjectId: 'proj-test',
        statement: 'Amazon, Apple, Verizon membatasi penggunaan generative AI.',
        claimType: 'FACTUAL',
        importance: 'CRITICAL',
        status: 'UNVERIFIED',
        createdAt: '',
        updatedAt: ''
      };

      await verifier.verify(claim, [englishEvidence]);

      // Verifikasi bukti kanonikal tidak termutasi
      assert.strictEqual(englishEvidence.content, origContent);
      assert.strictEqual(englishEvidence.sourceUrl, origUrl);
    });

    test('18. CanonicalResearchPipeline: selects evidence by relevance and passes through hardened gate', async () => {
      const directUrl = 'https://contentmarketinginstitute.com/ai-content-creation-tools/how-to-work-ai';
      const mockAcquisition = new MockSourceAcquisitionProvider();
      const html = `
        <html>
          <body>
            <nav>
              <a href="/nav1">Recent in Demand Gen</a>
              <a href="/nav2">Recent in Social Media</a>
            </nav>
            <article>
              <h1>How To Work AI Into Content Marketing</h1>
              <p>Several brands like Amazon, Apple, and Verizon have restricted generative AI use in content operations.</p>
              <p>Content marketers should establish formal AI policy guidelines and operations governance.</p>
            </article>
          </body>
        </html>
      `;
      mockAcquisition.registerMockContent(directUrl, {
        researchProjectId: 'proj-test',
        sourceType: 'INDUSTRY_RESEARCH',
        format: 'HTML',
        title: 'How To Work AI Into Content Marketing',
        url: directUrl,
        publisher: 'Content Marketing Institute',
        content: html
      });

      const pipeline = new CanonicalResearchPipeline({
        acquisitionProvider: mockAcquisition
      });

      const topic: Topic = {
        id: 'top-cmi',
        title: 'Teknik pemasaran konten di era AI',
        slug: 'teknik-pemasaran-konten-era-ai',
        territory: 'TACTICAL',
        targetAudience: 'Content Marketers',
        differentiationAngle: 'Operasional ter-grounding',
        lifecycleState: 'APPROVED',
        status: 'APPROVED',
        scoring: { totalScore: 85, policyVersion: 'v1.0' } as any,
        estimatedEvidenceReadiness: 'HIGH',
        editorialFormat: 'HOW_TO',
        version: 1,
        createdAt: '',
        updatedAt: ''
      };

      const res = await pipeline.execute({
        topic,
        directUrls: ['https://contentmarketinginstitute.com/ai-content-creation-tools/how-to-work-ai']
      });

      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const brief = res.value.researchBrief;
      assert.strictEqual(brief.supportedClaims.length > 0, true);
      assert.strictEqual(res.value.verifiedEvidence.length > 0, true);
      // Bukti yang dipilih relevan, bukan navigation boilerplate
      assert.strictEqual(brief.evidenceIndex.some((e) => e.quote.includes('Demand Gen')), false);
      assert.strictEqual(brief.evidenceIndex.some((e) => e.quote.includes('Amazon') || e.quote.includes('policy')), true);
    });
  });
});
