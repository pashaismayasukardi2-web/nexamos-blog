/**
 * NexaMOS HTML Parser Adapter
 *
 * Sourced from NexaMOS Blog Phase 2B specifications
 * Membersihkan script/style, mengekstrak heading, paragraf, list, blockquote,
 * dan mendeteksi tabel HTML ke NormalizedTable.
 */

import type { ContentParser } from './content-parser.ts';
import type {
  RawSourceInput,
  NormalizedSourceDocument,
  NormalizedSection,
  NormalizedTable
} from '../source-ingestion.ts';
import { computeContentHash } from '../content-hasher.ts';

export class HtmlParser implements ContentParser {
  canParse(format: string): boolean {
    return format === 'HTML';
  }

  async parse(input: RawSourceInput): Promise<NormalizedSourceDocument> {
    const raw = input.content || '';
    const hash = computeContentHash(raw);
    const sourceId = input.id || `src-${Date.now().toString(36)}`;

    // 1. Buang komentar, script, dan style tags secara global
    let cleaned = raw
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // 2. Deteksi title dari <title> jika belum ada
    let detectedTitle = input.title;
    const titleMatch = cleaned.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (!detectedTitle && titleMatch) {
      detectedTitle = this.decodeHtmlEntities(titleMatch[1].trim());
    }
    const title = detectedTitle || 'Untitled HTML Document';

    // 3. Isolasi kontainer semantik utama artikel (article -> main -> container class/id -> body)
    const contentScope = this.isolateMainContent(cleaned);

    // 4. Buang elemen boilerplate non-konten dari contentScope
    const sanitizedScope = this.stripBoilerplateElements(contentScope);

    // 5. Deteksi dan ekstrak tabel dari sanitizedScope
    const tables: NormalizedTable[] = [];
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch: RegExpExecArray | null;
    let tableIndex = 1;

    let contentWithoutTables = sanitizedScope;
    while ((tableMatch = tableRegex.exec(sanitizedScope)) !== null) {
      const tableHtml = tableMatch[1];
      const parsedTable = this.parseHtmlTable(tableHtml, tableIndex);
      if (parsedTable) {
        tables.push(parsedTable);
        tableIndex++;
      }
    }

    // Hapus table dari body agar teks tidak terduplikasi di sections
    contentWithoutTables = contentWithoutTables.replace(/<table[\s\S]*?<\/table>/gi, '\n');

    // 6. Ekstraksi blok struktur (h1-h6, p, li, blockquote)
    const blockRegex = /<(h[1-6]|p|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
    const sections: NormalizedSection[] = [];
    let currentHeading: string | null = null;
    let sectionOrder = 1;

    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(contentWithoutTables)) !== null) {
      const tag = match[1].toLowerCase();
      const rawText = match[2];
      const text = this.stripTagsAndDecode(rawText);

      // Abaikan blok kosong atau sangat pendek tanpa makna
      if (text.length === 0) continue;

      if (tag.startsWith('h')) {
        currentHeading = text;
      } else {
        sections.push({
          id: `sec-${sectionOrder}`,
          heading: currentHeading,
          text,
          order: sectionOrder,
          locator: {
            section: currentHeading || `Section ${sectionOrder}`
          }
        });
        sectionOrder++;
      }
    }

    // Jika tidak ada block tags standar dari kontainer terisolasi, fallback ke paragraph split
    if (sections.length === 0) {
      const plain = this.stripTagsAndDecode(contentWithoutTables);
      const paras = plain.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
      for (let i = 0; i < paras.length; i++) {
        sections.push({
          id: `sec-${i + 1}`,
          heading: null,
          text: paras[i].trim(),
          order: i + 1,
          locator: {
            paragraph: i + 1
          }
        });
      }
    }

    return {
      id: `norm-${sourceId}`,
      sourceId,
      researchProjectId: input.researchProjectId,
      title,
      format: 'HTML',
      language: input.language || null,
      sections,
      tables,
      metadata: {
        ...(input.metadata || {}),
        author: input.author || null,
        publisher: input.publisher || null,
        url: input.url || null,
        publicationDate: input.publicationDate || null
      },
      contentHash: hash,
      normalizedAt: new Date().toISOString()
    };
  }

  private isolateMainContent(html: string): string {
    // 1. Cari <article> tags
    const articleRegex = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
    let articleMatch: RegExpExecArray | null;
    let bestArticle: string | null = null;
    let maxArticleLen = 0;

    while ((articleMatch = articleRegex.exec(html)) !== null) {
      const stripped = this.stripTagsAndDecode(articleMatch[1]);
      if (stripped.length > 200 && stripped.length > maxArticleLen) {
        bestArticle = articleMatch[1];
        maxArticleLen = stripped.length;
      }
    }
    if (bestArticle) {
      return bestArticle;
    }

    // 2. data-template="article" atau role="article"
    const templateMatch = html.match(/<(?:div|section)\b[^>]*(?:data-template=["']article["']|role=["']article["'])[^>]*>([\s\S]*?)<\/(?:div|section)>/i);
    if (templateMatch && this.stripTagsAndDecode(templateMatch[1]).length > 200) {
      return templateMatch[1];
    }

    // 3. Container artikel spesifik berbasis class atau id standar (misal: entry-content, post-content, article-body, ArticleBase, dll)
    const containerRegex = /<(?:div|section)\b[^>]*(?:class|id)=["'][^"']*(?:entry-content|post-content|article-body|article-content|main-content|story-body|article__body|post__content|ArticleBase|article-container)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi;
    let containerMatch: RegExpExecArray | null;
    let bestContainer: string | null = null;
    let maxContainerLen = 0;

    while ((containerMatch = containerRegex.exec(html)) !== null) {
      const stripped = this.stripTagsAndDecode(containerMatch[1]);
      if (stripped.length > 200 && stripped.length > maxContainerLen) {
        bestContainer = containerMatch[1];
        maxContainerLen = stripped.length;
      }
    }
    if (bestContainer) {
      return bestContainer;
    }

    // 4. Cari <main> tag jika container artikel eksplisit tidak ditemukan
    const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      const stripped = this.stripTagsAndDecode(mainMatch[1]);
      if (stripped.length > 200) {
        return mainMatch[1];
      }
    }

    // 5. Fallback ke <body> tag jika ada
    const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      return bodyMatch[1];
    }

    return html;
  }

  private stripBoilerplateElements(content: string): string {
    let result = content;

    // Buang tag boilerplate standar
    result = result
      .replace(/<(nav|footer|aside|form|button|menu|noscript|svg|iframe|dialog)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '')
      .replace(/<header\b[^>]*(?:class|id)=["'][^"']*(?:masthead|site-header|site_header|global-header|top-header|navigation|navbar|banner)[^"']*["'][^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      .replace(/<header\b[^<]*<nav[\s\S]*?<\/header>/gi, '')
      .replace(/<(div|section|aside)\b[^>]*role=["'](?:navigation|banner|contentinfo|complementary)["'][^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '')
      .replace(/<(div|section|aside|ul|ol)\b[^>]*(?:class|id)=["'][^"']*(?:sidebar|widget|cookie-banner|cookie-consent|social-share|share-buttons|newsletter-signup|related-posts|breadcrumbs|breadcrumb)[^"']*["'][^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '')
      .replace(/<(ul|ol|div)\b[^>]*(?:class|id|data-testid)=["'][^"']*(?:article-topics|topics-list|tags-list|breadcrumb)[^"']*["'][^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '');

    return result;
  }

  private parseHtmlTable(html: string, index: number): NormalizedTable | null {
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const headers: string[] = [];
    const rows: string[][] = [];

    let rowMatch: RegExpExecArray | null;
    let isFirstRow = true;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowContent = rowMatch[1];
      const thMatches = Array.from(rowContent.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)).map((m) =>
        this.stripTagsAndDecode(m[1])
      );
      const tdMatches = Array.from(rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) =>
        this.stripTagsAndDecode(m[1])
      );

      if (thMatches.length > 0 && headers.length === 0) {
        headers.push(...thMatches);
      } else if (isFirstRow && tdMatches.length > 0 && headers.length === 0) {
        // First row with td might be headers
        headers.push(...tdMatches);
      } else if (tdMatches.length > 0) {
        rows.push(tdMatches);
      }
      isFirstRow = false;
    }

    if (headers.length === 0 && rows.length === 0) return null;

    return {
      id: `tbl-${index}`,
      title: `HTML Table ${index}`,
      headers,
      rows,
      locator: {
        table: `HTML Table ${index}`
      }
    };
  }

  private stripTagsAndDecode(html: string): string {
    const withoutTags = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return this.decodeHtmlEntities(withoutTags);
  }

  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }
}
