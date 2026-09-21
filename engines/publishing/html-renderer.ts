/**
 * NexaMOS Static-First HTML Renderer & Sanitizer
 *
 * Sourced from NexaMOS Blog Master Reference & Phase 6 specifications.
 * Menghasilkan markup HTML bersih untuk /blog (Index) dan /blog/[slug] (Article)
 * dengan prinsip:
 * 1. Static-First: Teks primer hadir di HTML tanpa membutuhkan JavaScript.
 * 2. Clean Semantic: <article>, <h1>, <h2>, <p>, <blockquote>, <figure>, <cite>.
 * 3. Security: Sanitasi tag <script> berbahaya dan sanitasi URL eksternal.
 * 4. Multi-Channel Meta: SEO, Discover max-image-preview, dan Structured Data.
 */

import type { PublicationPackage } from './publication.ts';

export interface HtmlRenderOptions {
  siteUrl?: string;
  googleSiteVerification?: string;
  gaMeasurementId?: string;
}

export class PublicationHtmlRenderer {
  public static readonly ICONS = {
    whatsapp: `<svg class="share-icon icon-whatsapp" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.04 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.34C9.33 7.34 9 7.42 8.72 7.73C8.44 8.04 7.65 8.78 7.65 10.28C7.65 11.78 8.74 13.22 8.9 13.43C9.05 13.64 11.05 16.71 14.1 18.03C14.83 18.34 15.39 18.53 15.84 18.67C16.57 18.9 17.24 18.87 17.76 18.79C18.34 18.7 19.55 18.06 19.81 17.34C20.06 16.63 20.06 16.02 19.98 15.89C19.91 15.76 19.71 15.69 19.41 15.54C19.11 15.39 17.63 14.66 17.35 14.56C17.08 14.46 16.88 14.41 16.68 14.71C16.48 15.02 15.9 15.69 15.72 15.89C15.55 16.1 15.37 16.12 15.07 15.97C14.77 15.82 13.8 15.5 12.65 14.48C11.76 13.69 11.16 12.71 10.99 12.41C10.81 12.11 10.97 11.95 11.12 11.8C11.26 11.66 11.43 11.43 11.58 11.26C11.73 11.08 11.78 10.96 11.88 10.75C11.98 10.55 11.93 10.37 11.86 10.22C11.78 10.07 11.18 8.6 10.93 8C10.69 7.42 10.44 7.5 10.26 7.49C10.08 7.49 9.88 7.49 9.68 7.49L9.53 7.34Z"/></svg>`,
    facebook: `<svg class="share-icon icon-facebook" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/></svg>`,
    instagram: `<svg class="share-icon icon-instagram" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
    copy: `<svg class="share-icon icon-copy" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
  };

  /**
   * Render Tombol & Baris Share Artikel (WhatsApp, Instagram, Facebook, Salin Tautan)
   */
  public static renderArticleShareBar(params: {
    url: string;
    title: string;
    isBottom?: boolean;
  }): string {
    const { url, title, isBottom = false } = params;
    const safeUrl = this.sanitizeHtml(url);
    const safeTitle = this.sanitizeHtml(title);
    const encodedWhatsappText = encodeURIComponent(`${safeTitle}\n${safeUrl}`);
    const encodedFacebookUrl = encodeURIComponent(safeUrl);
    const jsUrl = safeUrl.replace(/'/g, "\\'");
    const jsTitle = safeTitle.replace(/'/g, "\\'");

    if (isBottom) {
      return `
      <section class="article-share-cta" aria-label="Bagikan artikel ini">
        <div class="share-cta-header">
          <span class="share-cta-icon" aria-hidden="true">✦</span>
          <h3 data-i18n="share_cta_title">Menemukan wawasan berharga? Bagikan riset ini:</h3>
        </div>
        <div class="share-btn-group">
          <a href="https://api.whatsapp.com/send?text=${encodedWhatsappText}" target="_blank" rel="noopener noreferrer" class="share-btn share-whatsapp" aria-label="Share to WhatsApp" title="WhatsApp" data-share-url="${safeUrl}">
            ${this.ICONS.whatsapp}
            <span>WhatsApp</span>
          </a>
          <button type="button" class="share-btn share-instagram" onclick="shareToInstagram('${jsUrl}', '${jsTitle}')" aria-label="Share to Instagram" title="Instagram">
            ${this.ICONS.instagram}
            <span>Instagram</span>
          </button>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedFacebookUrl}" target="_blank" rel="noopener noreferrer" class="share-btn share-facebook" aria-label="Share to Facebook" title="Facebook">
            ${this.ICONS.facebook}
            <span>Facebook</span>
          </a>
          <button type="button" class="share-btn share-copy" onclick="copyArticleLink('${jsUrl}', this)" aria-label="Copy link" title="Copy Link">
            ${this.ICONS.copy}
            <span class="btn-text" data-i18n="share_copy">Salin Tautan</span>
          </button>
        </div>
      </section>`;
    }

    return `
      <div class="article-share-bar" aria-label="Bagikan artikel ini">
        <span class="share-bar-label" data-i18n="share_label">Bagikan:</span>
        <div class="share-btn-group">
          <a href="https://api.whatsapp.com/send?text=${encodedWhatsappText}" target="_blank" rel="noopener noreferrer" class="share-btn share-whatsapp" aria-label="Share to WhatsApp" title="WhatsApp" data-share-url="${safeUrl}">
            ${this.ICONS.whatsapp}
            <span>WhatsApp</span>
          </a>
          <button type="button" class="share-btn share-instagram" onclick="shareToInstagram('${jsUrl}', '${jsTitle}')" aria-label="Share to Instagram" title="Instagram">
            ${this.ICONS.instagram}
            <span>Instagram</span>
          </button>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedFacebookUrl}" target="_blank" rel="noopener noreferrer" class="share-btn share-facebook" aria-label="Share to Facebook" title="Facebook">
            ${this.ICONS.facebook}
            <span>Facebook</span>
          </a>
          <button type="button" class="share-btn share-copy" onclick="copyArticleLink('${jsUrl}', this)" aria-label="Copy link" title="Copy Link">
            ${this.ICONS.copy}
            <span class="btn-text" data-i18n="share_copy">Salin Tautan</span>
          </button>
        </div>
      </div>`;
  }

  /**
   * Render Tombol Quick-Share pada Kartu Indeks Blog
   */
  public static renderCardShareRow(params: {
    url: string;
    title: string;
  }): string {
    const { url, title } = params;
    const safeUrl = this.sanitizeHtml(url);
    const safeTitle = this.sanitizeHtml(title);
    const encodedWhatsappText = encodeURIComponent(`${safeTitle}\n${safeUrl}`);
    const encodedFacebookUrl = encodeURIComponent(safeUrl);
    const jsUrl = safeUrl.replace(/'/g, "\\'");
    const jsTitle = safeTitle.replace(/'/g, "\\'");

    return `
        <div class="card-share-bar" aria-label="Bagikan artikel ini">
          <span class="card-share-label" data-i18n="share_label">Bagikan:</span>
          <div class="card-share-icons">
            <a href="https://api.whatsapp.com/send?text=${encodedWhatsappText}" target="_blank" rel="noopener noreferrer" class="card-share-btn share-whatsapp" aria-label="Share to WhatsApp" title="WhatsApp" onclick="event.stopPropagation();" data-share-url="${safeUrl}">
              ${this.ICONS.whatsapp}
            </a>
            <button type="button" class="card-share-btn share-instagram" onclick="event.stopPropagation(); event.preventDefault(); shareToInstagram('${jsUrl}', '${jsTitle}');" aria-label="Share to Instagram" title="Instagram">
              ${this.ICONS.instagram}
            </button>
            <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedFacebookUrl}" target="_blank" rel="noopener noreferrer" class="card-share-btn share-facebook" aria-label="Share to Facebook" title="Facebook" onclick="event.stopPropagation();">
              ${this.ICONS.facebook}
            </a>
            <button type="button" class="card-share-btn share-copy" onclick="event.stopPropagation(); event.preventDefault(); copyArticleLink('${jsUrl}', this);" aria-label="Copy link" title="Copy Link">
              ${this.ICONS.copy}
            </button>
          </div>
        </div>`;
  }

  /**
   * Helper class CSS badge teritorial yang konsisten dengan sistem badge Landing Page
   */
  public static getTerritoryBadgeClass(territory: string): string {
    const t = (territory || '').toUpperCase();
    if (t === 'TACTICAL') return 'badge-tactical';
    if (t === 'INTELLIGENCE') return 'badge-intelligence';
    return 'badge-strategy';
  }

  /**
   * Helper label dwibahasa teritorial (ID / EN) konsisten dengan Landing Page
   */
  public static getTerritoryLabel(territory: string, lang: string = 'en'): string {
    const t = (territory || '').toUpperCase();
    const isId = lang === 'id';
    if (t === 'TACTICAL') return isId ? 'Taktikal' : 'Tactical';
    if (t === 'INTELLIGENCE') return isId ? 'Intelijen' : 'Intelligence';
    return isId ? 'Strategi' : 'Strategy';
  }

  /**
   * Helper label dwibahasa tipe format artikel konsisten dengan Landing Page
   */
  public static getArticleTypeLabel(articleType?: string, lang: string = 'en'): string {
    if (!articleType) return '';
    const isId = lang === 'id';
    const typeMapId: Record<string, string> = {
      HOW_TO: 'Panduan Praktis',
      ANALYSIS: 'Analisis',
      FRAMEWORK: 'Kerangka Kerja',
      CASE_STUDY: 'Studi Kasus',
      EXPLAINER: 'Penjelasan',
      ESSAY: 'Esai',
      DEEP_DIVE: 'Kajian Mendalam',
      BENCHMARK: 'Tolok Ukur',
      TEARDOWN: 'Bedah Kasus',
      PLAYBOOK: 'Buku Panduan',
      MANIFESTO: 'Manifesto'
    };
    const typeMapEn: Record<string, string> = {
      HOW_TO: 'How-To Guide',
      ANALYSIS: 'Analysis',
      FRAMEWORK: 'Framework',
      CASE_STUDY: 'Case Study',
      EXPLAINER: 'Explainer',
      ESSAY: 'Essay',
      DEEP_DIVE: 'Deep Dive',
      BENCHMARK: 'Benchmark',
      TEARDOWN: 'Teardown',
      PLAYBOOK: 'Playbook',
      MANIFESTO: 'Manifesto'
    };
    const cleanKey = articleType.toUpperCase();
    if (isId && typeMapId[cleanKey]) return typeMapId[cleanKey];
    if (!isId && typeMapEn[cleanKey]) return typeMapEn[cleanKey];
    return articleType.replace(/_/g, ' ');
  }

  /**
   * Render tag verifikasi Google Search Console dan Google Analytics 4 jika tersedia
   */
  public static renderAnalyticsAndVerification(options?: HtmlRenderOptions): string {
    if (!options) return '';
    const tags: string[] = [];

    if (options.googleSiteVerification) {
      tags.push(`  <meta name="google-site-verification" content="${this.sanitizeHtml(options.googleSiteVerification)}" />`);
    }

    if (options.gaMeasurementId && /^G-[A-Za-z0-9]+$/i.test(options.gaMeasurementId)) {
      const sanitizedId = this.sanitizeHtml(options.gaMeasurementId.toUpperCase());
      tags.push(`  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${sanitizedId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${sanitizedId}');
  </script>`);
    }

    return tags.length > 0 ? `${tags.join('\n')}\n` : '';
  }

  /**
   * Sanitasi konten editorial dari tag skrip berbahaya atau URL javascript:
   */
  public static sanitizeHtml(content: string): string {
    if (!content) return '';
    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:[^"'\s>]+/gi, '#')
      .replace(/onload\s*=\s*["'][^"']*["']/gi, '')
      .replace(/onerror\s*=\s*["'][^"']*["']/gi, '')
      .replace(/onclick\s*=\s*["'][^"']*["']/gi, '');
  }

  /**
   * Sanitasi judul seksi editorial dari artifak verifikasi klaim internal (misal: ": Klaim 1 Terotentasi", ": Claim 1 Authenticating")
   */
  public static sanitizeSectionHeading(heading: string): string {
    if (!heading) return '';
    return heading
      .replace(/\s*[:\-]\s*(?:Klaim|Claim)\s+\d+\s*(?:Terotent(?:ik)?asi|Authenticating)?/gi, '')
      .replace(/\s*[\(\[](?:Klaim|Claim)\s+\d+[\)\]]/gi, '')
      .replace(/\s+(?:Klaim|Claim)\s+\d+\s*(?:Terotent(?:ik)?asi|Authenticating)?/gi, '')
      .replace(/^(?:Klaim|Claim)\s+\d+\s*[:\-]?\s*/gi, '')
      .trim();
  }

  /**
   * Konversi inline markdown (bold, italic, inline code) menjadi elemen HTML semantis
   */
  public static renderInlineMarkdown(content: string): string {
    if (!content) return '';
    const sanitized = this.sanitizeHtml(content);
    return sanitized
      // Bold: **text**
      .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
      // Italic: *text* (dijalankan 2 pass untuk menangani token berdampingan e.g. (*a*) (*b*))
      .replace(/(^|[^*])\*([^*\n]+?)\*([^*]|$)/g, '$1<em>$2</em>$3')
      .replace(/(^|[^*])\*([^*\n]+?)\*([^*]|$)/g, '$1<em>$2</em>$3')
      // Inline code: `text`
      .replace(/`([^`\n]+?)`/g, '<code>$1</code>');
  }

  /**
   * Normalisasi path aset lokal agar kompatibel dengan reverse proxy /blog
   */
  public static normalizeAssetUrl(url: string, siteUrl: string = 'https://nexamos.cloud'): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('/blog/')) {
      return url;
    }
    if (url.startsWith('/')) {
      return `/blog${url}`;
    }
    return `/blog/${url}`;
  }

  /**
   * Mengubah aset URL menjadi absolut untuk meta tag OG / Twitter
   */
  public static toAbsoluteAssetUrl(url: string, siteUrl: string = 'https://nexamos.cloud'): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const normalized = this.normalizeAssetUrl(url, siteUrl);
    const cleanSiteUrl = siteUrl.replace(/\/+$/, '');
    return `${cleanSiteUrl}${normalized}`;
  }

  /**
   * Ekstraksi naskah artikel dwibahasa (EN & ID) dengan fallback aman
   */
  public static getBilingualContent(pkg: PublicationPackage): {
    en: { headline: string; dek: string; sections: Array<{ id: string; heading: string; content: string; order: number; purpose: string }> };
    id: { headline: string; dek: string; sections: Array<{ id: string; heading: string; content: string; order: number; purpose: string }> };
    hasTranslations: boolean;
  } {
    const hasTranslations = Boolean(pkg.translations && (pkg.translations.en || pkg.translations.id));

    // Base fallback dari properti utama paket
    const baseSections = (pkg.articleContent?.sections || []).map((s, idx) => ({
      id: s.id || `sec-${idx + 1}`,
      heading: this.sanitizeSectionHeading(s.heading ?? ''),
      content: s.content ?? '',
      order: s.order ?? idx + 1,
      purpose: s.purpose ?? 'ANALYSIS'
    }));

    const baseHeadline = pkg.articleContent?.headline || pkg.title || '';
    const baseDek = pkg.articleContent?.dek ?? pkg.description ?? '';

    // English content (prioritas: translations.en -> pkg jika defaultLanguage !== 'id')
    let enHeadline = baseHeadline;
    let enDek = baseDek;
    let enSections = baseSections;

    if (pkg.translations?.en) {
      enHeadline = pkg.translations.en.headline || pkg.translations.en.title || enHeadline;
      enDek = pkg.translations.en.dek ?? pkg.translations.en.description ?? enDek;
      if (pkg.translations.en.sections && pkg.translations.en.sections.length > 0) {
        enSections = pkg.translations.en.sections.map((s, idx) => ({
          id: s.id || `sec-${idx + 1}`,
          heading: this.sanitizeSectionHeading(s.heading ?? ''),
          content: s.content ?? '',
          order: s.order ?? idx + 1,
          purpose: s.purpose ?? 'ANALYSIS'
        }));
      }
    }

    // Indonesian content (prioritas: translations.id -> base)
    let idHeadline = baseHeadline;
    let idDek = baseDek;
    let idSections = baseSections;

    if (pkg.translations?.id) {
      idHeadline = pkg.translations.id.headline || pkg.translations.id.title || idHeadline;
      idDek = pkg.translations.id.dek ?? pkg.translations.id.description ?? idDek;
      if (pkg.translations.id.sections && pkg.translations.id.sections.length > 0) {
        idSections = pkg.translations.id.sections.map((s, idx) => ({
          id: s.id || `sec-${idx + 1}`,
          heading: this.sanitizeSectionHeading(s.heading ?? ''),
          content: s.content ?? '',
          order: s.order ?? idx + 1,
          purpose: s.purpose ?? 'ANALYSIS'
        }));
      }
    }

    return {
      en: { headline: enHeadline, dek: enDek, sections: enSections },
      id: { headline: idHeadline, dek: idDek, sections: idSections },
      hasTranslations
    };
  }

  /**
   * Render Halaman Penuh Artikel /blog/[slug]
   */
  public static renderArticlePage(pkg: PublicationPackage, options?: HtmlRenderOptions): string {
    const { en, id, hasTranslations } = this.getBilingualContent(pkg);
    const sanitizedHeadlineEn = this.sanitizeHtml(en.headline);
    const sanitizedDekEn = en.dek ? this.sanitizeHtml(en.dek) : '';
    const sanitizedHeadlineId = this.sanitizeHtml(id.headline);
    const sanitizedDekId = id.dek ? this.sanitizeHtml(id.dek) : '';

    const authorName = this.sanitizeHtml(pkg.author.name);
    const authorRole = pkg.author.role ? this.sanitizeHtml(pkg.author.role) : '';

    const renderSections = (sections: typeof en.sections) => {
      return sections
        .sort((a, b) => a.order - b.order)
        .map((s) => {
          const cleanHeading = this.sanitizeSectionHeading(s.heading);
          const headingHtml = cleanHeading ? `<h2>${this.renderInlineMarkdown(cleanHeading)}</h2>` : '';
          const bodyParagraphs = s.content
            .split('\n\n')
            .map((p) => p.trim())
            .filter((p) => p.length > 0)
            .map((p) => `<p>${this.renderInlineMarkdown(p)}</p>`)
            .join('\n');

          return `
      <section id="${s.id}" class="article-section" data-purpose="${s.purpose}">
        ${headingHtml}
        ${bodyParagraphs}
      </section>`;
        })
        .join('\n');
    };

    const renderedSectionsEn = renderSections(en.sections);
    const renderedSectionsId = renderSections(id.sections);

    // Render Hero Image jika tersedia
    let heroImageHtml = '';
    if (pkg.heroImage) {
      const heroUrl = this.normalizeAssetUrl(pkg.heroImage.url);
      const captionHtml = pkg.heroImage.caption
        ? `<figcaption>${this.sanitizeHtml(pkg.heroImage.caption)}</figcaption>`
        : '';
      heroImageHtml = `
    <figure class="article-hero-image">
      <img src="${heroUrl}" alt="${this.sanitizeHtml(pkg.heroImage.alt)}" width="${pkg.heroImage.width}" height="${pkg.heroImage.height}" loading="eager" fetchpriority="high" />
      ${captionHtml}
    </figure>`;
    }

    // Render Sitasi Eksternal (Hanya yang diizinkan publik)
    let citationsHtml = '';
    if (pkg.externalCitations.length > 0) {
      const citationItems = pkg.externalCitations
        .map((c) => {
          const title = this.sanitizeHtml(c.title);
          const publisher = c.publisher ? ` — <span class="publisher">${this.sanitizeHtml(c.publisher)}</span>` : '';
          const link = c.url
            ? `<a href="${c.url}" target="_blank" rel="noopener noreferrer">${title}</a>`
            : title;
          const locator = c.locator ? ` <span class="locator">(${this.sanitizeHtml(c.locator)})</span>` : '';
          return `<li id="${c.id}">${link}${publisher}${locator}</li>`;
        })
        .join('\n');

      citationsHtml = `
    <aside class="article-citations" aria-label="Referensi dan Sumber Data">
      <h3 data-i18n="citations_heading">Authoritative References &amp; Sources</h3>
      <ol>
        ${citationItems}
      </ol>
    </aside>`;
    }

    // Render Tautan Internal Terkait
    let relatedHtml = '';
    if (pkg.internalLinks.length > 0) {
      const linkItems = pkg.internalLinks
        .map((l) => `<li><a href="${l.url}">${this.sanitizeHtml(l.title)}</a></li>`)
        .join('\n');
      relatedHtml = `
    <nav class="article-related-links" aria-label="Artikel Terkait">
      <h3 data-i18n="related_heading">Further Exploration</h3>
      <ul>
        ${linkItems}
      </ul>
    </nav>`;
    }

    // JSON-LD Structured Data
    const jsonLdScript = JSON.stringify(pkg.structuredData, null, 2);

    const formattedDate = pkg.publishedAt
      ? new Date(pkg.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
${this.renderAnalyticsAndVerification(options)}  <title>${sanitizedHeadlineEn} | NexaMOS</title>
  <meta name="description" content="${sanitizedDekEn || this.sanitizeHtml(pkg.description)}" />
  <link rel="canonical" href="${pkg.canonicalUrl}" />
  <link rel="icon" type="image/png" href="/blog/brand/favicon.png" />
  <link rel="apple-touch-icon" href="/blog/brand/favicon.png" />
  <link rel="stylesheet" href="/blog/style.css" />
  <meta name="robots" content="${pkg.robots.index ? 'index' : 'noindex'}, ${pkg.robots.follow ? 'follow' : 'nofollow'}, max-image-preview:large, max-snippet:-1" />
  
  <!-- Open Graph -->
  <meta property="og:title" content="${sanitizedHeadlineEn}" />
  <meta property="og:description" content="${sanitizedDekEn || this.sanitizeHtml(pkg.description)}" />
  <meta property="og:url" content="${pkg.canonicalUrl}" />
  <meta property="og:type" content="article" />
  ${pkg.heroImage ? `<meta property="og:image" content="${this.toAbsoluteAssetUrl(pkg.heroImage.url)}" />` : ''}
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="${pkg.heroImage ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${sanitizedHeadlineEn}" />
  <meta name="twitter:description" content="${sanitizedDekEn || this.sanitizeHtml(pkg.description)}" />
  ${pkg.heroImage ? `<meta name="twitter:image" content="${this.toAbsoluteAssetUrl(pkg.heroImage.url)}" />` : ''}

  <!-- Structured Data JSON-LD -->
  <script type="application/ld+json">
${jsonLdScript}
  </script>
</head>
<body class="nexamos-article-view">
${this.renderSiteNav()}

  <main>
    <article class="primary-article" itemscope itemtype="https://schema.org/BlogPosting">
      <header class="article-header">
        <div class="article-meta-badge blog-dyn-badges">
          <span class="blog-dyn-badge ${this.getTerritoryBadgeClass(pkg.territory)} territory-tag" data-territory="${pkg.territory}">${this.getTerritoryLabel(pkg.territory, 'en')}</span>
          <span class="blog-dyn-badge badge-type article-type-tag" data-article-type="${pkg.articleType}">${this.getArticleTypeLabel(pkg.articleType, 'en')}</span>
        </div>
        <div class="article-lang-block" data-lang="en">
          <h1 itemprop="headline">${sanitizedHeadlineEn}</h1>
          ${sanitizedDekEn ? `<p class="article-dek" itemprop="description">${sanitizedDekEn}</p>` : ''}
        </div>
        ${hasTranslations ? `
        <div class="article-lang-block" data-lang="id" style="display:none;">
          <h1 itemprop="headline">${sanitizedHeadlineId}</h1>
          ${sanitizedDekId ? `<p class="article-dek">${sanitizedDekId}</p>` : ''}
        </div>` : ''}
        <div class="article-byline">
          <span class="author-name" itemprop="author">${authorName}</span>
          ${authorRole ? `<span class="author-role">${authorRole}</span>` : ''}
          ${pkg.publishedAt ? `<time itemprop="datePublished" datetime="${pkg.publishedAt}" data-pubdate="${pkg.publishedAt}">${formattedDate}</time>` : ''}
        </div>
        ${this.renderArticleShareBar({ url: pkg.canonicalUrl, title: sanitizedHeadlineEn, isBottom: false })}
      </header>

      ${heroImageHtml}

      <div class="article-body" itemprop="articleBody">
        <div class="article-lang-block" data-lang="en">
          ${renderedSectionsEn}
        </div>
        ${hasTranslations ? `
        <div class="article-lang-block" data-lang="id" style="display:none;">
          ${renderedSectionsId}
        </div>` : ''}
      </div>

      ${this.renderArticleShareBar({ url: pkg.canonicalUrl, title: sanitizedHeadlineEn, isBottom: true })}

      ${citationsHtml}
      ${relatedHtml}
    </article>
  </main>

  <footer class="site-footer">
    <p data-i18n="footer_copy">&copy; ${new Date().getFullYear()} NexaMOS. All rights reserved.</p>
  </footer>
${this.renderI18nScript()}
</body>
</html>`;
  }

  /**
   * Render Halaman Indeks Blog /blog
   */
  public static renderBlogIndexPage(
    publishedArticles: PublicationPackage[],
    siteUrlOrOptions: string | HtmlRenderOptions = 'https://nexamos.cloud'
  ): string {
    const opts: HtmlRenderOptions = typeof siteUrlOrOptions === 'string'
      ? { siteUrl: siteUrlOrOptions }
      : (siteUrlOrOptions || {});
    const cleanSiteUrl = (opts.siteUrl || 'https://nexamos.cloud').replace(/\/+$/, '');

    // Urutkan artikel terbit berdasarkan publishedAt DESC
    const sortedArticles = [...publishedArticles].sort((a, b) => {
      const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return timeB - timeA;
    });

    const totalCount = sortedArticles.length;
    const intelCount = sortedArticles.filter(a => (a.territory || '').toUpperCase() === 'INTELLIGENCE').length;
    const stratCount = sortedArticles.filter(a => (a.territory || '').toUpperCase() === 'STRATEGY').length;
    const tactCount = sortedArticles.filter(a => (a.territory || '').toUpperCase() === 'TACTICAL').length;

    const articleCards = sortedArticles
      .map((item) => {
        const { en, id, hasTranslations } = this.getBilingualContent(item);
        const titleEn = this.sanitizeHtml(en.headline);
        const excerptEn = this.sanitizeHtml(en.dek);
        const titleId = this.sanitizeHtml(id.headline);
        const excerptId = this.sanitizeHtml(id.dek);
        const searchableCorpus = this.sanitizeHtml(`${titleEn} ${excerptEn} ${titleId} ${excerptId}`.toLowerCase());

        const dateStr = item.publishedAt
          ? new Date(item.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : '';
        const heroUrl = item.heroImage ? this.normalizeAssetUrl(item.heroImage.url, cleanSiteUrl) : '';
        const heroThumb = heroUrl
          ? `<img src="${heroUrl}" alt="${this.sanitizeHtml(item.heroImage!.alt)}" width="400" height="225" loading="lazy" />`
          : '';

        const territoryClass = this.getTerritoryBadgeClass(item.territory);
        const territoryLabel = this.getTerritoryLabel(item.territory, 'en');
        const articleTypeLabel = this.getArticleTypeLabel(item.articleType, 'en');

        return `
      <article class="blog-card" data-card-territory="${item.territory}" data-search-text="${searchableCorpus}">
        <a href="${item.canonicalPath || item.publicCanonicalPath || `/blog/${item.slug}`}" class="card-link">
          ${heroThumb}
          <div class="card-content">
            <div class="card-meta">
              <div class="blog-dyn-badges">
                <span class="blog-dyn-badge ${territoryClass} territory" data-territory="${item.territory}">${territoryLabel}</span>
                ${articleTypeLabel ? `<span class="blog-dyn-badge badge-type" data-article-type="${item.articleType}">${articleTypeLabel}</span>` : ''}
              </div>
              <time datetime="${item.publishedAt || ''}" data-pubdate="${item.publishedAt || ''}">${dateStr}</time>
            </div>
            <div class="card-lang-block" data-lang="en">
              <h2>${titleEn}</h2>
              <p>${excerptEn}</p>
            </div>
            ${hasTranslations ? `
            <div class="card-lang-block" data-lang="id" style="display:none;">
              <h2>${titleId}</h2>
              <p>${excerptId}</p>
            </div>` : ''}
            <span class="read-more" data-i18n="read_more">Read Full Article &rarr;</span>
          </div>
        </a>
        ${this.renderCardShareRow({
          url: item.canonicalUrl || `${cleanSiteUrl}/blog/${item.slug}`,
          title: titleEn
        })}
      </article>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
${this.renderAnalyticsAndVerification(opts)}  <title>Blog Otoritas & Riset Rekayasa Informasi | NexaMOS</title>
  <meta name="description" content="Kumpulan pemikiran strategis, bukti riset primer, dan panduan taktis arsitektur informasi NexaMOS di era pencarian generatif." />
  <link rel="canonical" href="${cleanSiteUrl}/blog" />
  <link rel="icon" type="image/png" href="/blog/brand/favicon.png" />
  <link rel="apple-touch-icon" href="/blog/brand/favicon.png" />
  <link rel="stylesheet" href="/blog/style.css" />
  <meta name="robots" content="index, follow" />
</head>
<body class="nexamos-blog-index">
${this.renderSiteNav()}

  <main>
    <section class="blog-hero">
      <div class="hero-badge-pill">
        <span class="hero-pulse-dot"></span>
        <span data-i18n="hero_badge">NexaMOS Knowledge &amp; Research Journal</span>
      </div>
      <h1>NexaMOS Knowledge & Engineering Journal</h1>
      <p data-i18n="hero_sub">Authority publication, primary data insights, and sovereign information architecture.</p>
    </section>

    <!-- Interactive Editorial Territory Filter & Free Search -->
    <section class="blog-filter-section" aria-label="Filter Teritori dan Pencarian Artikel">
      <div class="filter-controls-container">
        <!-- 3 Teritori Utama + ALL Filter Buttons dengan Badge (4 baris pada mobile: 1 baris = 1 tombol & detail) -->
        <div class="territory-filter-bar" role="toolbar" aria-label="Filter Berdasarkan Teritori Editorial">
          <button type="button" class="filter-btn active" data-filter-territory="ALL" onclick="setTerritoryFilter('ALL')">
            <div class="filter-btn-content">
              <span class="filter-bullet bullet-all"></span>
              <div class="filter-btn-text-group">
                <span class="filter-btn-label" data-i18n="filter_all">All</span>
                <span class="filter-btn-detail" data-i18n="filter_all_detail">All publications &amp; engineering papers</span>
              </div>
            </div>
            <span class="filter-count-badge badge-all">${totalCount}</span>
          </button>
          <button type="button" class="filter-btn btn-intelligence" data-filter-territory="INTELLIGENCE" onclick="setTerritoryFilter('INTELLIGENCE')">
            <div class="filter-btn-content">
              <span class="filter-bullet bullet-intelligence"></span>
              <div class="filter-btn-text-group">
                <span class="filter-btn-label" data-i18n="filter_intelligence">Intelligence</span>
                <span class="filter-btn-detail" data-i18n="filter_intel_detail">Market signals, primary data &amp; AI insights</span>
              </div>
            </div>
            <span class="filter-count-badge badge-intelligence">${intelCount}</span>
          </button>
          <button type="button" class="filter-btn btn-strategy" data-filter-territory="STRATEGY" onclick="setTerritoryFilter('STRATEGY')">
            <div class="filter-btn-content">
              <span class="filter-bullet bullet-strategy"></span>
              <div class="filter-btn-text-group">
                <span class="filter-btn-label" data-i18n="filter_strategy">Strategy</span>
                <span class="filter-btn-detail" data-i18n="filter_strat_detail">Positioning, business model &amp; trade-offs</span>
              </div>
            </div>
            <span class="filter-count-badge badge-strategy">${stratCount}</span>
          </button>
          <button type="button" class="filter-btn btn-tactical" data-filter-territory="TACTICAL" onclick="setTerritoryFilter('TACTICAL')">
            <div class="filter-btn-content">
              <span class="filter-bullet bullet-tactical"></span>
              <div class="filter-btn-text-group">
                <span class="filter-btn-label" data-i18n="filter_tactical">Tactical</span>
                <span class="filter-btn-detail" data-i18n="filter_tact_detail">CRM, workflow automation &amp; conversion mechanics</span>
              </div>
            </div>
            <span class="filter-count-badge badge-tactical">${tactCount}</span>
          </button>
        </div>

        <!-- Kolom Pencarian Bebas Berdasarkan Judul & Sub Judul -->
        <div class="blog-search-bar-wrap">
          <div class="search-input-inner">
            <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              id="article-search-input"
              class="article-search-input"
              placeholder="Search articles by title or subtitle..."
              data-i18n-placeholder="search_placeholder"
              aria-label="Cari artikel berdasarkan judul atau sub judul"
              autocomplete="off"
              spellcheck="false"
              oninput="handleArticleSearch(this.value)"
            />
            <button type="button" id="search-clear-btn" class="search-clear-btn" aria-label="Hapus kueri pencarian" onclick="clearArticleSearch()" style="display: none;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="search-status-bar" id="search-status-bar" aria-live="polite">
            <span id="search-status-text" data-total="${totalCount}"></span>
          </div>
        </div>
      </div>
    </section>

    <section class="article-grid">
      ${articleCards.length > 0 ? articleCards : '<p class="no-articles" data-i18n="no_articles">No articles published yet.</p>'}
      <!-- Empty state saat filter/pencarian tidak menemukan hasil -->
      <div id="filter-empty-state" class="filter-empty-state" style="display: none;">
        <div class="empty-icon-wrap">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </div>
        <h3 data-i18n="empty_title">No matching articles found</h3>
        <p data-i18n="empty_desc">Try adjusting your search query or selecting a different editorial territory.</p>
        <button type="button" class="btn-reset-filter" onclick="resetArticleFilters()">
          <span data-i18n="empty_reset">Reset Filters</span>
        </button>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <p data-i18n="footer_copy">&copy; ${new Date().getFullYear()} NexaMOS. All rights reserved.</p>
  </footer>
${this.renderI18nScript()}
</body>
</html>`;
  }

  /**
   * Render Navigation Header Bersama dengan Toggle Switcher Bahasa
   */
  public static renderSiteNav(): string {
    return `  <header class="site-nav">
    <div class="site-nav-top">
      <div class="lang-switch-wrap" role="group" aria-label="Pilih Bahasa / Language Selection">
        <button type="button" class="lang-btn" data-lang="id" onclick="setBlogLanguage('id')">
          <span class="lang-flag">🇮🇩</span> ID
        </button>
        <button type="button" class="lang-btn active" data-lang="en" onclick="setBlogLanguage('en')">
          <span class="lang-flag">🇬🇧</span> EN
        </button>
      </div>
    </div>
    <div class="site-nav-main">
      <a href="/" class="brand-logo" aria-label="NexaMOS">
        <img src="/blog/brand/logoNexa.png" alt="NexaMOS" class="brand-logo-img" width="133" height="50" />
      </a>
      <nav>
        <a href="/" data-i18n="nav_home">Home</a>
        <a href="/blog" class="active" data-i18n="nav_blog">Authority Blog</a>
      </nav>
    </div>
  </header>`;
  }

  /**
   * Render Pop-up / Floating Banner Notifikasi Alih Bahasa (Opsi A - High-Contrast Light Surface)
   * Menavigasi pengguna lokal Indonesia untuk beralih bahasa ke ID secara instan
   */
  public static renderLanguageSuggestionBanner(): string {
    return `  <!-- Language Switch Suggestion Banner (High-Contrast Light Surface) -->
  <aside id="nexamos-lang-banner" class="nexamos-lang-banner" aria-label="Saran Alih Bahasa" style="display: none;">
    <div class="lang-banner-card">
      <div class="lang-banner-info">
        <span class="lang-banner-flag" aria-hidden="true">🇮🇩</span>
        <div class="lang-banner-text">
          <strong class="lang-banner-title">Baca Konten dalam Bahasa Indonesia</strong>
          <span class="lang-banner-sub">Read content in Indonesian</span>
        </div>
      </div>
      <div class="lang-banner-actions">
        <button type="button" class="lang-banner-btn-dismiss" onclick="dismissLanguageBanner()">Nanti</button>
        <button type="button" class="lang-banner-btn-switch" onclick="acceptLanguageSwitch()">Ubah Bahasa</button>
      </div>
    </div>
  </aside>`;
  }

  /**
   * Render Script i18n Ringan Sinkron dengan localStorage landing page
   */
  public static renderI18nScript(): string {
    const currentYear = new Date().getFullYear();
    return `${this.renderLanguageSuggestionBanner()}

  <!-- Interactive Toast Notification -->
  <div id="nexamos-toast" class="nexamos-toast" role="status" aria-live="polite" aria-atomic="true">
    <span class="toast-icon">✓</span>
    <span id="nexamos-toast-msg" class="toast-msg">Article link copied to clipboard!</span>
  </div>

  <script>
    (function() {
      const I18N_BLOG = {
        en: {
          nav_home: "Home",
          nav_blog: "Authority Blog",
          hero_badge: "NexaMOS Knowledge &amp; Research Journal",
          hero_sub: "Authority publication, primary data insights, and sovereign information architecture.",
          filter_all: "All",
          filter_all_detail: "All research &amp; engineering publications",
          filter_intelligence: "Intelligence",
          filter_intel_detail: "Market signals, primary data &amp; AI insights",
          filter_strategy: "Strategy",
          filter_strat_detail: "Positioning, business model &amp; trade-offs",
          filter_tactical: "Tactical",
          filter_tact_detail: "CRM, workflow automation &amp; conversion mechanics",
          search_placeholder: "Search articles by title or subtitle...",
          search_status_showing: "Showing {count} of {total} articles",
          search_status_all: "Showing all {total} articles",
          empty_title: "No matching articles found",
          empty_desc: "Try adjusting your search query or selecting a different editorial territory.",
          empty_reset: "Reset Filters",
          read_more: "Read Full Article &rarr;",
          no_articles: "No articles published yet.",
          citations_heading: "Authoritative References &amp; Sources",
          related_heading: "Further Exploration",
          footer_copy: "&copy; ${currentYear} NexaMOS. All rights reserved.",
          share_label: "Share:",
          share_cta_title: "Found this research insightful? Share it:",
          share_copy: "Copy Link",
          share_copied: "Copied!",
          toast_copied: "Article link copied to clipboard!",
          toast_instagram: "Link copied! Open Instagram to share in your Story or DM."
        },
        id: {
          nav_home: "Beranda",
          nav_blog: "Blog Otoritas",
          hero_badge: "Jurnal Riset &amp; Rekayasa Pengetahuan NexaMOS",
          hero_sub: "Publikasi otoritas pemikiran, analisis data primer, dan arsitektur informasi mandiri.",
          filter_all: "Semua",
          filter_all_detail: "Seluruh arsip riset &amp; rekayasa informasi",
          filter_intelligence: "Intelijen",
          filter_intel_detail: "Sinyal pasar, data primer &amp; diagnosis AI",
          filter_strategy: "Strategi",
          filter_strat_detail: "Positioning, model bisnis &amp; trade-offs",
          filter_tactical: "Taktikal",
          filter_tact_detail: "CRM, otomatisasi alur kerja &amp; mekanika konversi",
          search_placeholder: "Cari artikel berdasarkan judul atau sub-judul...",
          search_status_showing: "Menampilkan {count} dari {total} artikel",
          search_status_all: "Menampilkan semua {total} artikel",
          empty_title: "Tidak ada artikel yang cocok",
          empty_desc: "Coba sesuaikan kata kunci pencarian atau pilih teritori editorial yang berbeda.",
          empty_reset: "Reset Filter",
          read_more: "Baca Selengkapnya &rarr;",
          no_articles: "Belum ada artikel yang dipublikasikan.",
          citations_heading: "Sumber &amp; Rujukan Otoritatif",
          related_heading: "Eksplorasi Lanjutan",
          footer_copy: "&copy; ${currentYear} NexaMOS. Seluruh hak cipta dilindungi undang-undang.",
          share_label: "Bagikan:",
          share_cta_title: "Menemukan wawasan berharga? Bagikan riset ini:",
          share_copy: "Salin Tautan",
          share_copied: "Tersalin!",
          toast_copied: "Tautan artikel berhasil disalin ke clipboard!",
          toast_instagram: "Tautan disalin! Buka Instagram untuk membagikan di Story atau DM."
        }
      };

      let activeFilterTerritory = 'ALL';
      let currentSearchQuery = '';

      window.setTerritoryFilter = function(territory) {
        activeFilterTerritory = territory ? territory.toUpperCase() : 'ALL';
        document.querySelectorAll('.filter-btn').forEach(function(btn) {
          const t = btn.getAttribute('data-filter-territory');
          btn.classList.toggle('active', t === activeFilterTerritory);
        });
        window.applyArticleFilters();
      };

      window.handleArticleSearch = function(val) {
        currentSearchQuery = (val || '').trim().toLowerCase();
        const clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn) {
          clearBtn.style.display = currentSearchQuery.length > 0 ? 'inline-flex' : 'none';
        }
        window.applyArticleFilters();
      };

      window.clearArticleSearch = function() {
        const input = document.getElementById('article-search-input');
        if (input) {
          input.value = '';
          input.focus();
        }
        window.handleArticleSearch('');
      };

      window.resetArticleFilters = function() {
        window.clearArticleSearch();
        window.setTerritoryFilter('ALL');
      };

      window.applyArticleFilters = function() {
        const cards = document.querySelectorAll('.article-grid .blog-card');
        if (!cards.length) return;

        let visibleCount = 0;
        cards.forEach(function(card) {
          const cardTerritory = (card.getAttribute('data-card-territory') || card.getAttribute('data-territory') || '').toUpperCase();
          const territoryMatches = (activeFilterTerritory === 'ALL' || cardTerritory === activeFilterTerritory);

          let searchMatches = true;
          if (currentSearchQuery) {
            const searchText = (card.getAttribute('data-search-text') || card.textContent || '').toLowerCase();
            searchMatches = searchText.includes(currentSearchQuery);
          }

          if (territoryMatches && searchMatches) {
            card.style.display = '';
            visibleCount++;
          } else {
            card.style.display = 'none';
          }
        });

        const emptyState = document.getElementById('filter-empty-state');
        if (emptyState) {
          emptyState.style.display = (visibleCount === 0) ? 'flex' : 'none';
        }

        window.updateFilterStatus(visibleCount, cards.length);
      };

      window.updateFilterStatus = function(visibleCount, totalCount) {
        const statusEl = document.getElementById('search-status-text');
        if (!statusEl) return;
        const lang = document.documentElement.lang || 'en';
        const dict = I18N_BLOG[lang] || I18N_BLOG.en;

        if (activeFilterTerritory === 'ALL' && !currentSearchQuery) {
          statusEl.textContent = (dict.search_status_all || "Showing all {total} articles")
            .replace('{total}', totalCount);
        } else {
          statusEl.textContent = (dict.search_status_showing || "Showing {count} of {total} articles")
            .replace('{count}', visibleCount)
            .replace('{total}', totalCount);
        }
      };

      window.showToast = function(msg) {
        const toast = document.getElementById('nexamos-toast');
        const toastMsg = document.getElementById('nexamos-toast-msg');
        if (!toast || !toastMsg) return;
        toastMsg.textContent = msg;
        toast.classList.add('visible');
        if (window._toastTimer) clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(function() {
          toast.classList.remove('visible');
        }, 3500);
      };

      function fallbackCopy(text, cb) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
          document.execCommand('copy');
          if (cb) cb();
        } catch (e) {}
        document.body.removeChild(ta);
      }

      window.copyArticleLink = function(url, btnEl) {
        const lang = document.documentElement.lang || 'id';
        const dict = I18N_BLOG[lang] || I18N_BLOG.id;
        const targetUrl = url || window.location.href;

        function onSuccess() {
          window.showToast(dict.toast_copied || "Tautan artikel berhasil disalin!");
          if (btnEl) {
            const textSpan = btnEl.querySelector('.btn-text');
            if (textSpan) {
              const orig = textSpan.innerHTML;
              textSpan.innerHTML = dict.share_copied || "Tersalin!";
              setTimeout(function() { textSpan.innerHTML = orig; }, 2000);
            }
          }
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(targetUrl).then(onSuccess).catch(function() {
            fallbackCopy(targetUrl, onSuccess);
          });
        } else {
          fallbackCopy(targetUrl, onSuccess);
        }
      };

      window.shareToInstagram = function(url, title) {
        const lang = document.documentElement.lang || 'id';
        const dict = I18N_BLOG[lang] || I18N_BLOG.id;
        const targetUrl = url || window.location.href;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(targetUrl);
        } else {
          fallbackCopy(targetUrl, function(){});
        }

        window.showToast(dict.toast_instagram || "Tautan disalin! Buka Instagram untuk membagikan di Story atau DM.");
        setTimeout(function() {
          window.open('https://www.instagram.com', '_blank', 'noopener,noreferrer');
        }, 600);
      };

      window.setBlogLanguage = function(lang) {
        if (lang !== 'id' && lang !== 'en') lang = 'en';
        try {
          localStorage.setItem('nexamos_lang', lang);
        } catch(e) {}
        document.documentElement.lang = lang;

        const dict = I18N_BLOG[lang] || I18N_BLOG.en;
        document.querySelectorAll('[data-i18n]').forEach(function(el) {
          const key = el.getAttribute('data-i18n');
          if (dict[key]) el.innerHTML = dict[key];
        });

        // Update placeholder input pencarian
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
          const key = el.getAttribute('data-i18n-placeholder');
          if (dict[key]) el.setAttribute('placeholder', dict[key]);
        });

        // Toggle blok dwibahasa artikel & kartu index
        document.querySelectorAll('.article-lang-block, .card-lang-block').forEach(function(el) {
          const elLang = el.getAttribute('data-lang');
          if (elLang === lang) {
            el.style.display = '';
          } else {
            el.style.display = 'none';
          }
        });

        // Update label badge territory & articleType secara reaktif (Konsisten dengan Landing Page)
        document.querySelectorAll('.blog-dyn-badge[data-territory], .territory[data-territory], .territory-tag[data-territory]').forEach(function(el) {
          const t = el.getAttribute('data-territory');
          if (!t) return;
          const isId = lang === 'id';
          const u = t.toUpperCase();
          el.textContent = isId
            ? (u === 'TACTICAL' ? 'Taktikal' : u === 'INTELLIGENCE' ? 'Intelijen' : 'Strategi')
            : (u === 'TACTICAL' ? 'Tactical' : u === 'INTELLIGENCE' ? 'Intelligence' : 'Strategy');
        });

        document.querySelectorAll('[data-article-type]').forEach(function(el) {
          const at = el.getAttribute('data-article-type');
          if (!at) return;
          const isId = lang === 'id';
          const mapId = {
            HOW_TO: 'Panduan Praktis',
            ANALYSIS: 'Analisis',
            FRAMEWORK: 'Kerangka Kerja',
            CASE_STUDY: 'Studi Kasus',
            EXPLAINER: 'Penjelasan',
            ESSAY: 'Esai',
            DEEP_DIVE: 'Kajian Mendalam',
            BENCHMARK: 'Tolok Ukur',
            TEARDOWN: 'Bedah Kasus',
            PLAYBOOK: 'Buku Panduan',
            MANIFESTO: 'Manifesto'
          };
          const mapEn = {
            HOW_TO: 'How-To Guide',
            ANALYSIS: 'Analysis',
            FRAMEWORK: 'Framework',
            CASE_STUDY: 'Case Study',
            EXPLAINER: 'Explainer',
            ESSAY: 'Essay',
            DEEP_DIVE: 'Deep Dive',
            BENCHMARK: 'Benchmark',
            TEARDOWN: 'Teardown',
            PLAYBOOK: 'Playbook',
            MANIFESTO: 'Manifesto'
          };
          const key = at.toUpperCase();
          el.textContent = isId ? (mapId[key] || at.replace(/_/g, ' ')) : (mapEn[key] || at.replace(/_/g, ' '));
        });

        // Update tanggal lokal secara reaktif
        document.querySelectorAll('time[data-pubdate]').forEach(function(el) {
          const dtStr = el.getAttribute('data-pubdate');
          if (!dtStr) return;
          try {
            const d = new Date(dtStr);
            if (!isNaN(d.getTime())) {
              el.textContent = d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              });
            }
          } catch(e) {}
        });

        // Update document title jika ada headline aktif & perbarui link WhatsApp dinamis
        const activeHeadline = document.querySelector('.article-lang-block[data-lang="' + lang + '"] h1');
        if (activeHeadline && activeHeadline.textContent) {
          const currentTitle = activeHeadline.textContent.trim();
          document.title = currentTitle + ' | NexaMOS';

          document.querySelectorAll('.primary-article .share-whatsapp[data-share-url]').forEach(function(el) {
            const u = el.getAttribute('data-share-url');
            if (u) {
              el.href = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(currentTitle + '\\n' + u);
            }
          });
        }

        // Sinkronkan teks status filter pencarian jika di halaman index
        const totalCards = document.querySelectorAll('.article-grid .blog-card').length;
        const visibleCards = document.querySelectorAll('.article-grid .blog-card:not([style*="display: none"])').length;
        if (window.updateFilterStatus) {
          window.updateFilterStatus(visibleCards, totalCards);
        }

        document.querySelectorAll('.lang-btn').forEach(function(btn) {
          btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
        });

        if (window.checkLanguageBanner) {
          window.checkLanguageBanner();
        }
      };

      window.acceptLanguageSwitch = function() {
        try {
          localStorage.setItem('nexamos_lang_banner_dismissed', 'true');
        } catch(e) {}
        window.setBlogLanguage('id');
        const banner = document.getElementById('nexamos-lang-banner');
        if (banner) {
          banner.classList.remove('visible');
          banner.classList.add('dismissing');
          setTimeout(function() {
            banner.style.display = 'none';
          }, 350);
        }
      };

      window.dismissLanguageBanner = function() {
        try {
          localStorage.setItem('nexamos_lang_banner_dismissed', 'true');
        } catch(e) {}
        const banner = document.getElementById('nexamos-lang-banner');
        if (banner) {
          banner.classList.remove('visible');
          banner.classList.add('dismissing');
          setTimeout(function() {
            banner.style.display = 'none';
          }, 350);
        }
      };

      window.checkLanguageBanner = function() {
        const banner = document.getElementById('nexamos-lang-banner');
        if (!banner) return;
        let isDismissed = false;
        try {
          isDismissed = localStorage.getItem('nexamos_lang_banner_dismissed') === 'true';
        } catch(e) {}

        const currentLang = document.documentElement.lang || 'en';
        if (currentLang === 'en' && !isDismissed) {
          banner.style.display = 'block';
          requestAnimationFrame(function() {
            banner.classList.add('visible');
          });
        } else {
          banner.classList.remove('visible');
          banner.style.display = 'none';
        }
      };

      let initial = 'en';
      try {
        const saved = localStorage.getItem('nexamos_lang');
        if (saved === 'id' || saved === 'en') initial = saved;
      } catch(e) {}

      function initBlog() {
        setBlogLanguage(initial);
        if (window.applyArticleFilters) window.applyArticleFilters();
        if (window.checkLanguageBanner) window.checkLanguageBanner();
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBlog);
      } else {
        initBlog();
      }
    })();
  </script>`;
  }
}
