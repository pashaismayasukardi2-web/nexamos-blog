/// <reference path="./ambient.d.ts" />
/**
 * NexaMOS Publishing & Production Workflow - Comprehensive Test Suite
 *
 * Sourced from Phase 6 specifications.
 * Menguji seluruh alur produksi dan penerbitan artikel:
 * - Packaging dari PublicationCandidate
 * - Preflight Validator & Hard Safety Blocks (Anti-Fixture Leak)
 * - Metadata, Robots, & Structured Data Consistency
 * - Static-First HTML Rendering & Security Sanitization
 * - Public Routing Simulation (/blog & /blog/[slug]) & Root Landing Protection (/)
 * - Article Versioning, Content Hash, & Manifest Tracking
 * - Publication Lifecycle State Machine & Unpublish / Archive / Rollback
 * - Human Production Approval Enforcement
 * - Full Publishing Flow via MockPublishingProvider
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert';

import {
  PublishingService,
  PublicationPackageBuilder,
  PublicationPreflightValidator,
  PublicationHtmlRenderer,
  PublicationManifestBuilder,
  PublicationStatusManager,
  MockPublishingProvider,
  type PublicationPackage
} from '../engines/publishing/index.ts';

import type { PublicationCandidate, UnifiedDistributionReadinessResult } from '../engines/distribution/distribution-readiness.ts';
import type { ArticleDraft } from '../engines/editorial/article-draft.ts';
import type { Topic } from '../engines/ideation/domain/topic.types.ts';
import type { ArticleSEOMetadata } from '../engines/seo-validator/article-seo-metadata.ts';
import { VercelRoutingPlanBuilder } from '../infrastructure/publishing/vercel/vercel-routing.ts';

// =============================================================================
// MOCK FACTORIES
// =============================================================================

function createMockCandidate(overrides: Partial<PublicationCandidate> = {}): PublicationCandidate {
  return {
    candidateId: 'pub-cand-001',
    articleId: 'art-prod-001',
    slug: 'arsitektur-informasi-retrieval-generatif',
    title: 'Arsitektur Informasi untuk Retrieval dan Grounding Generatif',
    distributionReadinessId: 'dist-gate-001',
    approvedAt: '2026-09-15T00:00:00.000Z',
    overallStatus: 'READY_TO_PUBLISH',
    warnings: [],
    policyVersion: 'UNIFIED_DISTRIBUTION_POLICY_V1',
    ...overrides
  };
}

function createMockDraft(overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  return {
    id: 'draft-001',
    topicId: 'top-001',
    researchProjectId: 'proj-001',
    title: 'Arsitektur Informasi untuk Retrieval dan Grounding Generatif',
    dek: 'Panduan rekayasa struktur konten agar dapat disintesis secara presisi oleh model bahasa dan mesin penjawab.',
    slug: 'arsitektur-informasi-retrieval-generatif',
    territory: 'STRATEGY',
    articleType: 'ANALYSIS',
    editorialRole: 'AUTHORITY',
    thesis: 'Retrievabilitas bergantung pada batas klaim terikat dan keterlacakan sitasi eksplisit.',
    editorialAngle: 'Rekayasa konten versus trik manipulatif keyword.',
    sections: [
      {
        id: 'sec-1',
        heading: 'Pergeseran Mesin Pencari ke Sistem Penjawab',
        content: 'Transformasi Google Search dengan Google AI Overviews mengubah pola konsumsi informasi secara fundamental.',
        order: 1,
        purpose: 'CONTEXT',
        claimUsageIds: []
      },
      {
        id: 'sec-2',
        heading: 'Bukti Keterlacakan Data Primer',
        content: 'Eksperimen independen menunjukkan bahwa kutipan dengan locator paragraf eksplisit meningkatkan akurasi sitasi sebesar 40 persen.',
        order: 2,
        purpose: 'EVIDENCE',
        claimUsageIds: []
      }
    ],
    claimUsages: [],
    citationMap: [],
    status: 'READY_FOR_EDITORIAL_REVIEW',
    generatedAt: '2026-09-14T10:00:00.000Z',
    generatorVersion: 'v1',
    promptVersion: 'v1',
    ...overrides
  };
}

function createMockTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'top-001',
    title: 'Arsitektur Informasi untuk Retrieval dan Grounding Generatif',
    slug: 'arsitektur-informasi-retrieval-generatif',
    territory: 'STRATEGY',
    status: 'APPROVED',
    editorialRole: 'AUTHORITY',
    audience: { segment: 'Enterprise Content Leaders' },
    whyNow: 'Munculnya fitur AI Overviews di seluruh kueri utama.',
    problem: 'Bagaimana menstrukturkan konten agar dapat diretrieve secara presisi oleh LLM?',
    intent: { primary: 'Membangun arsitektur informasi untuk sistem AI retrieval' },
    thesis: 'Retrievabilitas bergantung pada batas klaim terikat dan keterlacakan sitasi eksplisit.',
    informationGain: {
      originalityType: ['ORIGINAL_FRAMEWORK'],
      expectedContribution: 'Kerangka kerja grounding epistemik NexaMOS.',
      commodityRisk: 'LOW'
    },
    evidencePlan: {
      requiredEvidenceLevel: 'E2',
      plannedSources: ['Google Search Central'],
      originalEvidenceRequired: true
    },
    businessRelevance: { objective: 'Thought Leadership', funnelRole: 'TOFU' },
    recommendedArticleType: 'ANALYSIS',
    distributionTargets: ['GOOGLE_SEARCH', 'GOOGLE_AI'],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    ...overrides
  };
}

function createMockSEOMetadata(overrides: Partial<ArticleSEOMetadata> = {}): ArticleSEOMetadata {
  return {
    title: 'Arsitektur Informasi untuk Retrieval dan Grounding Generatif | NexaMOS',
    description: 'Panduan rekayasa struktur konten agar dapat disintesis secara presisi oleh model bahasa dan mesin penjawab.',
    slug: 'arsitektur-informasi-retrieval-generatif',
    canonicalUrl: 'https://nexamos.cloud/blog/arsitektur-informasi-retrieval-generatif',
    robots: { index: true, follow: true },
    author: { name: 'Dr. Hendra Wijaya', role: 'Head of Information Architecture' },
    publisher: { name: 'NexaMOS Editorial Board', logoUrl: 'https://nexamos.cloud/brand/logo.png' },
    publishedAt: '2026-09-15T08:00:00.000Z',
    updatedAt: '2026-09-15T08:00:00.000Z',
    ...overrides
  };
}

// =============================================================================
// TEST SUITES: PHASE 6 PUBLISHING & PRODUCTION WORKFLOW
// =============================================================================

describe('Phase 6 Tests: Publishing & Production Workflow', () => {
  let publishingService: PublishingService;

  beforeEach(() => {
    publishingService = new PublishingService();
  });

  // ---------------------------------------------------------------------------
  // 1. Publication Candidate & Packaging
  // ---------------------------------------------------------------------------
  describe('1. Publication Candidate & Packaging', () => {
    test('Mengonversi PublicationCandidate menjadi PublicationPackage yang valid dan lengkap', () => {
      const candidate = createMockCandidate();
      const draft = createMockDraft();
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      const result = publishingService.createPackage(candidate, draft, topic, seoMeta, null, {
        heroImage: {
          url: 'https://nexamos.cloud/images/hero-retrieval.png',
          width: 1200,
          height: 675,
          alt: 'Diagram Arsitektur Informasi Retrieval'
        },
        internalLinks: [
          { slug: 'evaluasi-konten-ai', title: 'Evaluasi Konten AI', url: 'https://nexamos.cloud/blog/evaluasi-konten-ai' }
        ]
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.package.id.startsWith('pkg-'));
      assert.strictEqual(result.package.slug, 'arsitektur-informasi-retrieval-generatif');
      assert.strictEqual(result.package.canonicalPath, '/blog/arsitektur-informasi-retrieval-generatif');
      assert.strictEqual(result.package.canonicalUrl, 'https://nexamos.cloud/blog/arsitektur-informasi-retrieval-generatif');
      assert.strictEqual(result.package.articleContent.sections.length, 2);
      assert.strictEqual(result.package.internalLinks.length, 1);
      assert.strictEqual(result.package.heroImage?.width, 1200);
      assert.strictEqual(result.event.event, 'PUBLICATION_PACKAGE_CREATED');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Preflight Validator & Hard Safety Blocks
  // ---------------------------------------------------------------------------
  describe('2. Preflight Validator & Hard Safety Blocks', () => {
    test('Paket valid lolos preflight dengan status PASS atau PASS_WITH_WARNINGS', () => {
      const candidate = createMockCandidate();
      const draft = createMockDraft();
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      const { package: pkg } = publishingService.createPackage(candidate, draft, topic, seoMeta, null, {
        heroImage: {
          url: 'https://nexamos.cloud/images/hero.png',
          width: 1200,
          height: 675,
          alt: 'Hero Image'
        }
      });

      const preflight = publishingService.runPreflight(pkg.id);
      assert.strictEqual(preflight.status, 'PASS');
      assert.strictEqual(preflight.blockingErrors.length, 0);
      assert.strictEqual(publishingService.getStatus(pkg.id), 'READY_FOR_RELEASE');
    });

    test('HARD SAFETY: Data sintetis pengujian (fixtureOnly/isSyntheticTestData) mutlak DIBLOKIR', () => {
      const candidate = createMockCandidate();
      const draft = createMockDraft();
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      const { package: syntheticPkg } = publishingService.createPackage(candidate, draft, topic, seoMeta, null, {
        isSyntheticTestData: true,
        fixtureOnly: true
      });

      const preflight = publishingService.runPreflight(syntheticPkg.id);
      assert.strictEqual(preflight.status, 'FAIL');
      assert.ok(preflight.blockingErrors.some((e) => e.includes('PRODUCTION_SYNTHETIC_DATA_BLOCKED')));
      assert.strictEqual(publishingService.getStatus(syntheticPkg.id), 'PREFLIGHT_FAILED');
    });

    test('Preflight menolak paket tanpa tubuh konten artikel (ARTICLE_BODY_MISSING)', () => {
      const candidate = createMockCandidate();
      const emptyDraft = createMockDraft({ sections: [] });
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      const { package: emptyPkg } = publishingService.createPackage(candidate, emptyDraft, topic, seoMeta);
      const preflight = publishingService.runPreflight(emptyPkg.id);

      assert.strictEqual(preflight.status, 'FAIL');
      assert.ok(preflight.blockingErrors.some((e) => e.includes('ARTICLE_BODY_MISSING')));
    });

    test('Preflight mendeteksi kolisi slug jika telah dipakai artikel lain (SLUG_COLLISION_DETECTED)', () => {
      const candidate = createMockCandidate({ slug: 'artikel-pertama', articleId: 'art-001' });
      const draft = createMockDraft({ slug: 'artikel-pertama' });
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      const existingSlugs = new Map<string, string>([['artikel-pertama', 'art-Lain-Sudah-Terbit']]);

      const { package: pkg } = publishingService.createPackage(candidate, draft, topic, seoMeta);
      const preflight = publishingService.runPreflight(pkg.id, { existingPublishedSlugs: existingSlugs });

      assert.strictEqual(preflight.status, 'FAIL');
      assert.ok(preflight.blockingErrors.some((e) => e.includes('SLUG_COLLISION_DETECTED')));
    });

    test('Preflight menolak direktif noindex pada paket publikasi produksi', () => {
      const candidate = createMockCandidate();
      const draft = createMockDraft();
      const topic = createMockTopic();
      const noindexMeta = createMockSEOMetadata({ robots: { index: false, follow: true } });

      const { package: noindexPkg } = publishingService.createPackage(candidate, draft, topic, noindexMeta);
      const preflight = publishingService.runPreflight(noindexPkg.id);

      assert.strictEqual(preflight.status, 'FAIL');
      assert.ok(preflight.blockingErrors.some((e) => e.includes('NOINDEX_ON_PUBLISHED_ARTICLE')));
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Metadata, Canonical & Structured Data Consistency
  // ---------------------------------------------------------------------------
  describe('3. Metadata & Structured Data Consistency', () => {
    test('Structured data JSON-LD memuat BlogPosting dan BreadcrumbList yang selaras', () => {
      const candidate = createMockCandidate();
      const draft = createMockDraft();
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      const { package: pkg } = publishingService.createPackage(candidate, draft, topic, seoMeta);

      const graph = pkg.structuredData['@graph'];
      const blogPosting = graph.find((item) => item['@type'] === 'BlogPosting');
      const breadcrumbs = graph.find((item) => item['@type'] === 'BreadcrumbList');

      assert.ok(blogPosting);
      assert.strictEqual(blogPosting.headline, candidate.title);
      assert.strictEqual(blogPosting.mainEntityOfPage, pkg.canonicalUrl);
      assert.strictEqual(blogPosting.author.name, 'Dr. Hendra Wijaya');

      assert.ok(breadcrumbs);
      assert.strictEqual(breadcrumbs.itemListElement.length, 3);
      assert.strictEqual(breadcrumbs.itemListElement[1].name, 'Blog');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Static-First HTML Rendering & Security Sanitization
  // ---------------------------------------------------------------------------
  describe('4. Static-First HTML Rendering & Security', () => {
    test('Render HTML artikel menyertakan teks utama lengkap tanpa javascript wajib', () => {
      const candidate = createMockCandidate();
      const draft = createMockDraft();
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      (draft as any).references = [
        {
          title: 'Google Search Central Helpful Content',
          url: 'https://developers.google.com/search/docs',
          publisher: 'Google'
        }
      ];

      const { package: pkg } = publishingService.createPackage(candidate, draft, topic, seoMeta, null, {
        heroImage: {
          url: 'https://nexamos.cloud/images/hero.png',
          width: 1200,
          height: 675,
          alt: 'Hero Diagram',
          caption: 'Visualisasi alur grounding'
        }
      });

      const html = PublicationHtmlRenderer.renderArticlePage(pkg);

      // Verifikasi static-first: teks primer hadir di HTML
      assert.ok(html.includes('<h1 itemprop="headline">Arsitektur Informasi untuk Retrieval dan Grounding Generatif</h1>'));
      assert.ok(html.includes('Transformasi Google Search dengan Google AI Overviews'));
      assert.ok(html.includes('Eksperimen independen menunjukkan bahwa kutipan dengan locator paragraf'));

      // Verifikasi metadata head
      assert.ok(html.includes('<link rel="canonical" href="https://nexamos.cloud/blog/arsitektur-informasi-retrieval-generatif" />'));
      assert.ok(html.includes('max-image-preview:large'));
      assert.ok(html.includes('<script type="application/ld+json">'));

      // Verifikasi sitasi rujukan publik
      assert.ok(html.includes('Google Search Central Helpful Content'));
      assert.ok(html.includes('rel="noopener noreferrer"'));
    });

    test('Sanitasi keamanan: Membersihkan tag <script> berbahaya dan link javascript:', () => {
      const maliciousContent = 'Paragraf normal. <script>alert("hacked");</script> dan <a href="javascript:stealCookie()">klik</a>.';
      const sanitized = PublicationHtmlRenderer.sanitizeHtml(maliciousContent);

      assert.strictEqual(sanitized.includes('<script>'), false);
      assert.strictEqual(sanitized.includes('alert("hacked")'), false);
      assert.strictEqual(sanitized.includes('javascript:'), false);
      assert.ok(sanitized.includes('Paragraf normal.'));
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Blog Internal Routing & Public Canonical Contract
  // ---------------------------------------------------------------------------
  describe('5. Blog Internal Routing & Public Canonical Contract', () => {
    test('Blog deployment / merender Blog Index dengan daftar artikel publik tersortir publishedAt DESC', () => {
      const candidate1 = createMockCandidate({ slug: 'artikel-pertama', title: 'Artikel Pertama' });
      const candidate2 = createMockCandidate({ slug: 'artikel-kedua', title: 'Artikel Kedua' });

      const draft1 = createMockDraft({ slug: 'artikel-pertama', title: 'Artikel Pertama' });
      const draft2 = createMockDraft({ slug: 'artikel-kedua', title: 'Artikel Kedua' });

      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      const { package: pkg1 } = publishingService.createPackage(candidate1, draft1, topic, seoMeta, null, {
        publishedAt: '2026-09-10T00:00:00.000Z'
      });
      const { package: pkg2 } = publishingService.createPackage(candidate2, draft2, topic, seoMeta, null, {
        publishedAt: '2026-09-14T00:00:00.000Z'
      });

      const indexHtml = PublicationHtmlRenderer.renderBlogIndexPage([pkg1, pkg2]);

      assert.ok(indexHtml.includes('Artikel Kedua'));
      assert.ok(indexHtml.includes('Artikel Pertama'));
      // Artikel Kedua (14 Sept) harus muncul sebelum Artikel Pertama (10 Sept)
      const pos2 = indexHtml.indexOf('Artikel Kedua');
      const pos1 = indexHtml.indexOf('Artikel Pertama');
      assert.ok(pos2 < pos1);
    });

    test('Blog deployment /[slug] menyajikan artikel lengkap', () => {
      const candidate = createMockCandidate({ slug: 'analisis-deep-dive' });
      const draft = createMockDraft({ slug: 'analisis-deep-dive' });
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata({ slug: 'analisis-deep-dive' });

      const { package: pkg } = publishingService.createPackage(candidate, draft, topic, seoMeta);
      const articleHtml = PublicationHtmlRenderer.renderArticlePage(pkg);

      assert.ok(articleHtml.includes(candidate.title));
      assert.ok(articleHtml.includes(draft.sections[0].content));
    });

    test('internalRoute (/[slug]) berbeda dari publicCanonicalPath (/blog/[slug])', () => {
      const candidate = createMockCandidate({ slug: 'rekayasa-informasi' });
      const draft = createMockDraft({ slug: 'rekayasa-informasi' });
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata({ slug: 'rekayasa-informasi' });

      const { package: pkg } = publishingService.createPackage(candidate, draft, topic, seoMeta);

      // Route internal Blog deployment
      assert.strictEqual(pkg.internalRoute, '/rekayasa-informasi');
      // Public canonical path di mount /blog
      assert.strictEqual(pkg.publicCanonicalPath, '/blog/rekayasa-informasi');
      assert.notStrictEqual(pkg.internalRoute, pkg.publicCanonicalPath);
    });

    test('Canonical URL dan Sitemap menggunakan https://nexamos.cloud/blog/[slug] meskipun internalRoute adalah /[slug]', () => {
      const candidate = createMockCandidate({ slug: 'rekayasa-informasi' });
      const draft = createMockDraft({ slug: 'rekayasa-informasi' });
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata({ slug: 'rekayasa-informasi' });

      const { package: pkg } = publishingService.createPackage(candidate, draft, topic, seoMeta);

      assert.strictEqual(pkg.canonicalUrl, 'https://nexamos.cloud/blog/rekayasa-informasi');
      assert.strictEqual(pkg.sitemapEntry.loc, 'https://nexamos.cloud/blog/rekayasa-informasi');

      const articleHtml = PublicationHtmlRenderer.renderArticlePage(pkg);
      assert.ok(articleHtml.includes('<link rel="canonical" href="https://nexamos.cloud/blog/rekayasa-informasi" />'));
    });

    test('Workspace Blog tidak memiliki dependency terhadap file Landing workspace dan mengekspor kontrak integrasi', () => {
      // Menghasilkan kontrak integrasi eksternal untuk Workspace A tanpa memasang proxy di Blog
      const contract = VercelRoutingPlanBuilder.generateLandingIntegrationContract('https://nexamos-blog.vercel.app');

      assert.strictEqual(contract.targetDomain, 'nexamos.cloud');
      assert.strictEqual(contract.publicBlogBasePath, '/blog');
      assert.strictEqual(contract.requiredRewrites[0].source, '/blog');
      assert.strictEqual(contract.requiredRewrites[0].destination, 'https://nexamos-blog.vercel.app/');
      assert.strictEqual(contract.requiredRewrites[1].source, '/blog/:path*');
      assert.strictEqual(contract.requiredRewrites[1].destination, 'https://nexamos-blog.vercel.app/:path*');

      // Konfigurasi internal Blog deployment sendiri tidak memuat rewrite proxy ke landing
      const blogInternalRouting = VercelRoutingPlanBuilder.buildBlogDeploymentRouting();
      assert.strictEqual((blogInternalRouting as any).rewrites, undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Article Versioning, Content Hash & Manifest
  // ---------------------------------------------------------------------------
  describe('6. Versioning, Content Hash & Manifest', () => {
    test('Pembaruan artikel menghasilkan versi baru dengan contentHash yang berubah tetapi slug tetap', async () => {
      const candidate = createMockCandidate();
      const draft = createMockDraft();
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      const { package: pkg } = publishingService.createPackage(candidate, draft, topic, seoMeta, null, {
        heroImage: { url: 'https://nexamos.cloud/img.png', width: 1200, height: 675, alt: 'Alt' }
      });

      // Rilis Versi 1
      const pubResult1 = await publishingService.publish({
        publicationId: pkg.id,
        mode: 'PREVIEW'
      });
      assert.strictEqual(pubResult1.success, true);
      const hash1 = pubResult1.manifest?.contentHash;

      // Update konten naskah
      draft.sections[0].content = 'Pembaruan substansi konten revisi baru pada era retrieval modern.';
      const { package: updatedPkg } = publishingService.createPackage(candidate, draft, topic, seoMeta, null, {
        heroImage: { url: 'https://nexamos.cloud/img.png', width: 1200, height: 675, alt: 'Alt' }
      });

      // Rilis Versi 2
      const pubResult2 = await publishingService.publish({
        publicationId: updatedPkg.id,
        mode: 'PREVIEW'
      });
      assert.strictEqual(pubResult2.success, true);
      const hash2 = pubResult2.manifest?.contentHash;

      // Hash berubah karena konten diperbarui, namun slug tetap konsisten
      assert.notStrictEqual(hash1, hash2);
      assert.strictEqual(pubResult1.slug, pubResult2.slug);

      const versions = publishingService.getArticleVersions(candidate.articleId);
      assert.strictEqual(versions.length, 2);
      assert.strictEqual(versions[0].version, 1);
      assert.strictEqual(versions[1].version, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Human Production Approval & Deployment Execution
  // ---------------------------------------------------------------------------
  describe('7. Human Production Approval Enforcement', () => {
    test('Deployment ke mode PRODUCTION ditolak tanpa persetujuan manusia eksplisit', async () => {
      const candidate = createMockCandidate();
      const draft = createMockDraft();
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      const { package: pkg } = publishingService.createPackage(candidate, draft, topic, seoMeta, null, {
        heroImage: { url: 'https://nexamos.cloud/img.png', width: 1200, height: 675, alt: 'Alt' }
      });

      // Coba terbitkan ke PRODUCTION tanpa approval
      const result = await publishingService.publish({
        publicationId: pkg.id,
        mode: 'PRODUCTION'
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'PUBLISH_FAILED');
      assert.ok(result.error?.includes('Membutuhkan persetujuan eksplisit manusia'));
    });

    test('Deployment ke mode PRODUCTION berhasil jika persetujuan manusia telah diberikan', async () => {
      const candidate = createMockCandidate();
      const draft = createMockDraft();
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      const { package: pkg } = publishingService.createPackage(candidate, draft, topic, seoMeta, null, {
        heroImage: { url: 'https://nexamos.cloud/img.png', width: 1200, height: 675, alt: 'Alt' }
      });

      const result = await publishingService.publish({
        publicationId: pkg.id,
        mode: 'PRODUCTION',
        approval: {
          approvedForProduction: true,
          approvedBy: 'Budi Santoso (Lead Publisher)',
          approvedAt: '2026-09-15T09:00:00.000Z',
          notes: 'Disetujui untuk peluncuran resmi portal blog.'
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'PUBLISHED');
      assert.strictEqual(result.deploymentUrl, 'https://nexamos.cloud/blog');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Lifecycle Transitions: Unpublish, Archive, & Rollback
  // ---------------------------------------------------------------------------
  describe('8. Lifecycle: Unpublish, Archive, & Rollback', () => {
    test('Artikel dapat dicabut dari publikasi (unpublish) dan diarsipkan (archive)', async () => {
      const candidate = createMockCandidate();
      const draft = createMockDraft();
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      const { package: pkg } = publishingService.createPackage(candidate, draft, topic, seoMeta, null, {
        heroImage: { url: 'https://nexamos.cloud/img.png', width: 1200, height: 675, alt: 'Alt' }
      });

      await publishingService.publish({ publicationId: pkg.id, mode: 'PREVIEW' });
      assert.strictEqual(publishingService.getStatus(pkg.id), 'PUBLISHED');

      // Unpublish
      const unpubResult = publishingService.unpublish(pkg.id, 'Pembaruan embargo rilis');
      assert.strictEqual(unpubResult.success, true);
      assert.strictEqual(publishingService.getStatus(pkg.id), 'UNPUBLISHED');

      // Archive
      const archResult = publishingService.archive(pkg.id, 'Arsip permanen tahunan');
      assert.strictEqual(archResult.success, true);
      assert.strictEqual(publishingService.getStatus(pkg.id), 'ARCHIVED');
    });

    test('Rollback ke versi sebelumnya berhasil memulihkan content hash lama', async () => {
      const candidate = createMockCandidate();
      const draft = createMockDraft();
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata();

      const { package: pkg } = publishingService.createPackage(candidate, draft, topic, seoMeta, null, {
        heroImage: { url: 'https://nexamos.cloud/img.png', width: 1200, height: 675, alt: 'Alt' }
      });

      const res1 = await publishingService.publish({ publicationId: pkg.id, mode: 'PREVIEW' });
      const hash1 = res1.manifest!.contentHash;

      // Update
      draft.sections[0].content = 'Konten baru yang ingin di-rollback.';
      const { package: updatedPkg } = publishingService.createPackage(candidate, draft, topic, seoMeta, null, {
        heroImage: { url: 'https://nexamos.cloud/img.png', width: 1200, height: 675, alt: 'Alt' }
      });
      await publishingService.publish({ publicationId: updatedPkg.id, mode: 'PREVIEW' });

      // Rollback ke versi 1
      const rollbackRes = publishingService.rollback({
        publicationId: updatedPkg.id,
        targetPreviousVersion: 1,
        reason: 'Kesalahan substansi pada rilis versi 2',
        requestedBy: 'Senior Editor',
        requestedAt: '2026-09-15T10:00:00.000Z'
      });

      assert.strictEqual(rollbackRes.success, true);
      assert.strictEqual(rollbackRes.revertedToVersion, 1);
      assert.strictEqual(rollbackRes.newContentHash, hash1);
    });
  });

  // ===========================================================================
  // 6. BILINGUAL PUBLISHING & MULTI-LANGUAGE RENDERING
  // ===========================================================================
  describe('6. Bilingual Publishing & Dynamic Toggle Rendering', () => {
    test('PublicationHtmlRenderer me-render blok dwibahasa EN dan ID ketika translations tersedia', () => {
      const candidate = createMockCandidate({ slug: 'artikel-bilingual-test' });
      const draft = createMockDraft({ slug: 'artikel-bilingual-test' });
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata({ slug: 'artikel-bilingual-test' });

      const translations = {
        id: {
          title: 'Judul Bahasa Indonesia',
          description: 'Deskripsi Bahasa Indonesia',
          headline: 'Judul Bahasa Indonesia',
          dek: 'Dek Bahasa Indonesia',
          sections: [
            { id: 'sec-1', heading: 'Heading ID', content: 'Konten paragraf ID.', order: 1, purpose: 'CONTEXT' }
          ]
        },
        en: {
          title: 'English Title Test',
          description: 'English Description Test',
          headline: 'English Title Test',
          dek: 'English Dek Test',
          sections: [
            { id: 'sec-1', heading: 'Heading EN', content: 'Paragraph content EN.', order: 1, purpose: 'CONTEXT' }
          ]
        }
      };

      const pkg = PublicationPackageBuilder.build(candidate, draft, topic, seoMeta, null, {
        defaultLanguage: 'en',
        translations
      });

      assert.strictEqual(pkg.defaultLanguage, 'en');
      assert.strictEqual(pkg.title, 'English Title Test');
      assert.strictEqual(pkg.translations?.id?.title, 'Judul Bahasa Indonesia');

      const html = PublicationHtmlRenderer.renderArticlePage(pkg);

      // Verifikasi blok EN (default aktif)
      assert.ok(html.includes('<div class="article-lang-block" data-lang="en">'));
      assert.ok(html.includes('<h1 itemprop="headline">English Title Test</h1>'));
      assert.ok(html.includes('<h2>Heading EN</h2>'));
      assert.ok(html.includes('<p>Paragraph content EN.</p>'));

      // Verifikasi blok ID (tersembunyi secara default)
      assert.ok(html.includes('<div class="article-lang-block" data-lang="id" style="display:none;">'));
      assert.ok(html.includes('<h1 itemprop="headline">Judul Bahasa Indonesia</h1>'));
      assert.ok(html.includes('<h2>Heading ID</h2>'));
      assert.ok(html.includes('<p>Konten paragraf ID.</p>'));

      // Verifikasi script i18n & toggle switcher
      assert.ok(html.includes('setBlogLanguage'));
      assert.ok(html.includes('data-lang="id"'));
      assert.ok(html.includes('data-lang="en"'));
    });

    test('PublicationHtmlRenderer me-render kartu blog index dwibahasa', () => {
      const candidate = createMockCandidate({ slug: 'kartu-bilingual' });
      const draft = createMockDraft({ slug: 'kartu-bilingual' });
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata({ slug: 'kartu-bilingual' });

      const translations = {
        id: {
          title: 'Kartu Judul ID',
          description: 'Kartu Cuplikan ID',
          sections: []
        },
        en: {
          title: 'Card Title EN',
          description: 'Card Excerpt EN',
          sections: []
        }
      };

      const pkg = PublicationPackageBuilder.build(candidate, draft, topic, seoMeta, null, {
        translations
      });

      const indexHtml = PublicationHtmlRenderer.renderBlogIndexPage([pkg]);

      assert.ok(indexHtml.includes('<div class="card-lang-block" data-lang="en">'));
      assert.ok(indexHtml.includes('<h2>Card Title EN</h2>'));
      assert.ok(indexHtml.includes('<div class="card-lang-block" data-lang="id" style="display:none;">'));
      assert.ok(indexHtml.includes('<h2>Kartu Judul ID</h2>'));
    });

    test('PublicationHtmlRenderer.sanitizeSectionHeading membersihkan artifak klaim internal dari heading', () => {
      assert.strictEqual(
        PublicationHtmlRenderer.sanitizeSectionHeading('Definisi dan Karakteristik BSUID: Klaim 1 Terotentasi'),
        'Definisi dan Karakteristik BSUID'
      );
      assert.strictEqual(
        PublicationHtmlRenderer.sanitizeSectionHeading('Definition and Characteristics of BSUID: Claim 1 Authenticating'),
        'Definition and Characteristics of BSUID'
      );
      assert.strictEqual(
        PublicationHtmlRenderer.sanitizeSectionHeading('Timeline Peluncuran: Kapan BSUID Mulai Berlaku? Klaim 6 Terotentasi'),
        'Timeline Peluncuran: Kapan BSUID Mulai Berlaku?'
      );
      assert.strictEqual(
        PublicationHtmlRenderer.sanitizeSectionHeading('Rollout Timeline: When Does BSUID Take Effect? Claim 6 Authenticating'),
        'Rollout Timeline: When Does BSUID Take Effect?'
      );
      assert.strictEqual(
        PublicationHtmlRenderer.sanitizeSectionHeading('Aturan Teknis Pengiriman Pesan via BSUID (Klaim 3)'),
        'Aturan Teknis Pengiriman Pesan via BSUID'
      );
      assert.strictEqual(
        PublicationHtmlRenderer.sanitizeSectionHeading('Klaim 1: Pengantar Dasar'),
        'Pengantar Dasar'
      );
    });

    test('PublicationHtmlRenderer.renderArticlePage otomatis membersihkan heading tercemar label klaim', () => {
      const candidate = createMockCandidate({ slug: 'clean-heading-test' });
      const draft = createMockDraft({
        slug: 'clean-heading-test',
        sections: [
          {
            id: 'sec-1',
            heading: 'Definisi dan Karakteristik BSUID: Klaim 1 Terotentasi',
            content: 'Isi teks penjelasan mengenai BSUID.',
            order: 1,
            purpose: 'ARGUMENT',
            claimUsageIds: []
          }
        ]
      });
      const topic = createMockTopic();
      const seoMeta = createMockSEOMetadata({ slug: 'clean-heading-test' });

      const pkg = PublicationPackageBuilder.build(candidate, draft, topic, seoMeta, null);
      const html = PublicationHtmlRenderer.renderArticlePage(pkg);

      assert.ok(html.includes('<h2>Definisi dan Karakteristik BSUID</h2>'));
      assert.ok(!html.includes('Klaim 1 Terotentasi'));
      assert.ok(!html.includes('Claim 1 Authenticating'));
    });
  });
});

