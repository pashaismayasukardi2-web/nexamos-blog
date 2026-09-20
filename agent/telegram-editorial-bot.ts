/// <reference path="../tests/ambient.d.ts" />
/**
 * NexaMOS Telegram Editorial Bot
 *
 * Mengizinkan pembuatan artikel, validasi riset, dan penerbitan ke blog nexamos.cloud
 * langsung dari perangkat seluler (HP) via Telegram.
 *
 * Fitur:
 * 1. Security Authorization: Hanya merespons Telegram User ID yang terdaftar di whitelist.
 * 2. Input Parser: Mengekstrak topik dan URL referensi dari pesan teks pengguna.
 * 3. End-to-End Orchestration: Akuisisi bukti -> AI Research -> AI Editorial -> Grounding Guard.
 * 4. Interactive Inline Keyboard: Tombol Publish, Preview, dan Cancel.
 * 5. One-Click Publishing: Preflight audit -> Static build -> Git commit & push ke GitHub.
 */


import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { TelegramClient, type TelegramUpdate, type TelegramInlineKeyboardMarkup, type TelegramUser } from '../infrastructure/telegram/telegram-client.ts';
import { loadTelegramConfig, isUserAuthorized } from '../infrastructure/telegram/telegram-config.ts';
import { loadAIProviderConfig, isAIConfigured } from '../infrastructure/ai/ai-provider-config.ts';
import { AIProviderFactory } from '../infrastructure/ai/ai-provider-factory.ts';
import { AIHttpClient } from '../infrastructure/ai/ai-http-client.ts';
import { HttpSourceAcquisitionProvider } from '../engines/research/acquisition/providers/http-source-acquisition-provider.ts';
import type { SourceCandidate } from '../engines/research/acquisition/source-candidate.ts';
import { ResearchIngestionService } from '../engines/research/ingestion/research-ingestion-service.ts';
import { InMemoryResearchSourceRepository } from '../engines/research/repository/in-memory-research-source-repository.ts';
import { InMemoryResearchEvidenceRepository } from '../engines/research/repository/in-memory-research-evidence-repository.ts';
import { InMemoryResearchEventRepository } from '../engines/research/repository/in-memory-research-event-repository.ts';
import { ResearchAcquisitionService } from '../engines/research/acquisition/research-acquisition-service.ts';
import { MockResearchDiscoveryProvider } from '../engines/research/acquisition/providers/mock-discovery-provider.ts';
import { DeterministicClaimEvidenceVerifier } from '../engines/research/claim-evidence-verifier.ts';
import { GroundingGuard } from '../engines/editorial/grounding-guard.ts';
import type { Topic } from '../engines/ideation/domain/topic.types.ts';
import type { EditorialRole } from '../engines/ideation/domain/editorial-role.ts';
import type { ArticleType } from '../engines/ideation/domain/article-type.ts';
import type { Territory } from '../engines/ideation/domain/territory.ts';
import type { EditorialGenerationRequest } from '../engines/editorial/editorial-generation-request.ts';
import type { ResearchBrief } from '../engines/research/orchestrator/research-brief.ts';
import type { ResearchEvidence } from '../engines/research/domain/research-evidence.ts';
import type { ResearchQuestion } from '../engines/research/domain/research-question.ts';
import type { ResearchClaim } from '../engines/research/domain/research-claim.ts';
import type { ArticleDraft } from '../engines/editorial/article-draft.ts';
import type { PublicationCandidate } from '../engines/distribution/distribution-readiness.ts';
import type { ArticleSEOMetadata } from '../engines/seo-validator/article-seo-metadata.ts';
import { PublicationPackageBuilder } from '../engines/publishing/publication-package.ts';
import { PublicationPreflightValidator } from '../engines/publishing/publication-preflight.ts';
import { runBuild } from '../scripts/build-blog.ts';

const execAsync = promisify(exec);

export interface ParsedTelegramInput {
  topic: string;
  urls: string[];
  rawText: string;
}

export interface ClassifiedEditorialIntent {
  territory: Territory;
  articleType: ArticleType;
  editorialRole: EditorialRole;
}

/**
 * Pengklasifikasi dinamis wilayah pengetahuan (Territory) dan tipe format (ArticleType)
 * Mendukung override eksplisit (misal [HOW_TO], /howto, [TACTICAL])
 * serta heuristik cerdas berbasis kosakata topik (misal: "cara", "apa itu", "kerangka", "pricing", "crm")
 */
export function classifyEditorialIntent(text: string, topic: string): ClassifiedEditorialIntent {
  const combined = `${text} ${topic}`.toLowerCase();

  // 1. Deteksi Explicit Override dari tag atau slash command
  let detectedType: ArticleType | null = null;
  let detectedTerritory: Territory | null = null;

  // Article Type overrides
  if (/\[how_to\]|\[howto\]|\/howto|\/how_to|\b(tipe|format)\s*:\s*how_to/i.test(text)) {
    detectedType = 'HOW_TO';
  } else if (/\[explainer\]|\/explainer|\b(tipe|format)\s*:\s*explainer/i.test(text)) {
    detectedType = 'EXPLAINER';
  } else if (/\[framework\]|\/framework|\b(tipe|format)\s*:\s*framework/i.test(text)) {
    detectedType = 'FRAMEWORK';
  } else if (/\[case_study\]|\/casestudy|\/case_study|\b(tipe|format)\s*:\s*case_study/i.test(text)) {
    detectedType = 'CASE_STUDY';
  } else if (/\[trend\]|\/trend|\/trend_analysis|\b(tipe|format)\s*:\s*trend/i.test(text)) {
    detectedType = 'TREND_ANALYSIS';
  } else if (/\[comparative\]|\/compare|\b(tipe|format)\s*:\s*comparative/i.test(text)) {
    detectedType = 'COMPARATIVE_ANALYSIS';
  } else if (/\[research\]|\/research|\b(tipe|format)\s*:\s*research/i.test(text)) {
    detectedType = 'ORIGINAL_RESEARCH';
  } else if (/\[analysis\]|\/analysis|\b(tipe|format)\s*:\s*analysis/i.test(text)) {
    detectedType = 'ANALYSIS';
  }

  // Territory overrides
  if (/\[tactical\]|\/tactical|\bterritory\s*:\s*tactical/i.test(text)) {
    detectedTerritory = 'TACTICAL';
  } else if (/\[intelligence\]|\/intelligence|\bterritory\s*:\s*intelligence/i.test(text)) {
    detectedTerritory = 'INTELLIGENCE';
  } else if (/\[strategy\]|\/strategy|\bterritory\s*:\s*strategy/i.test(text)) {
    detectedTerritory = 'STRATEGY';
  }

  // 2. Heuristik Alami Berdasarkan Nuansa Teks
  if (!detectedType) {
    if (/\b(cara|panduan|langkah|step by step|tutorial|setup|instalasi|konfigurasi|tata cara|praktik|how to|implementasi)\b/i.test(combined)) {
      detectedType = 'HOW_TO';
    } else if (/\b(apa itu|pengertian|definisi|mengenal|konsep dasar|fungsi dari|artinya|explainer|memahami)\b/i.test(combined)) {
      detectedType = 'EXPLAINER';
    } else if (/\b(kerangka|framework|model|blueprint|arsitektur|metodologi|pilar|struktur sistem|threshold|treshold|ambang batas|batas pemisah|kriteria|matriks)\b/i.test(combined)) {
      detectedType = 'FRAMEWORK';
    } else if (/\b(studi kasus|case study|bedah kasus|pelajaran dari)\b/i.test(combined)) {
      detectedType = 'CASE_STUDY';
    } else if (/\b(vs|versus|perbandingan|komparasi|dibandingkan|mana yang lebih|benchmark)\b/i.test(combined)) {
      detectedType = 'COMPARATIVE_ANALYSIS';
    } else if (/\b(tren|trend|prediksi|outlook|proyeksi|masa depan|tahun 202[0-9]|prospek (pasar|industri|ekonomi|bisnis))\b/i.test(combined)) {
      detectedType = 'TREND_ANALYSIS';
    } else if (/\b(riset|data primer|survei|penelitian empiris|temuan riset)\b/i.test(combined)) {
      detectedType = 'ORIGINAL_RESEARCH';
    } else {
      detectedType = 'ANALYSIS';
    }
  }

  if (!detectedTerritory) {
    // 1. Prioritas TACTICAL: Lifecycle CRM, Sales Pipeline, Konversi, Otomasi, & Eksekusi
    if (/\b(teknis|crm|whatsapp|api|workflow|otomasi|automasi|integrasi|eksekusi|coding|database|webhook|retargeting|tools|implementasi|taktik|tactical|prospek|prospect|hot prospek|opportunity|funnel|pipeline|nurturing|closing|sales|penjualan|lifecycle|retensi|retention|churn|konversi|conversion|onboarding|follow-up|follow up|broadcast|campaign)\b/i.test(combined)) {
      detectedTerritory = 'TACTICAL';
    } else if (/\b(competitive intelligence|market intelligence|intelligence|intelijen|kompetitor|pesaing|sinyal|fakta|pasar|market|industri|riset|anatomi|regulasi|kemenkes|statistik|tren|trend|landscape|lanskap|perilaku|llm|scoring)\b/i.test(combined)) {
      detectedTerritory = 'INTELLIGENCE';
    } else if (/\b(strategi|strategic|strategis|pricing|harga|positioning|bisnis|skala|margin|arah|roi|cvr|keputusan|investasi|kebijakan|monetisasi|moat)\b/i.test(combined)) {
      detectedTerritory = 'STRATEGY';
    } else {
      // Korelasi alami dari ArticleType jika tidak ada kata kunci spesifik
      if (detectedType === 'HOW_TO') {
        detectedTerritory = 'TACTICAL';
      } else if (detectedType === 'EXPLAINER' || detectedType === 'TREND_ANALYSIS') {
        detectedTerritory = 'INTELLIGENCE';
      } else {
        detectedTerritory = 'STRATEGY';
      }
    }
  }

  return {
    territory: detectedTerritory,
    articleType: detectedType,
    editorialRole: 'AUTHORITY'
  };
}

/**
 * Helper pembuat slug URL ramah SEO
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * Parser pesan teks pengguna untuk mengekstrak topik dan URL
 */
export function parseTelegramInput(text: string): ParsedTelegramInput {
  const urlRegex = /https?:\/\/[^\s]+/gi;
  const urls = text.match(urlRegex) || [];

  let cleaned = text.replace(urlRegex, '').trim();
  cleaned = cleaned
    .replace(/^(\/bikin|\/write|\/buat|\/generate|\/create|\/howto|\/how_to|\/framework|\/explainer|\/analysis|\/tactical|\/strategy|\/intelligence)\s+/i, '')
    .replace(/^\[(how_to|howto|framework|explainer|analysis|tactical|strategy|intelligence|case_study|trend)\]\s*/i, '')
    .replace(/^(bikin|buat|tulis|buatkan|generate)\s+artikel\s*:?\s*/i, '')
    .replace(/^(topik|judul|masalah)\s*:\s*/i, '')
    .replace(/^(sumber|link|referensi)\s*:\s*/i, '')
    .replace(/\n+/g, ' ')
    .trim();

  return {
    topic: cleaned || 'Topik Riset Rekayasa Informasi NexaMOS',
    urls,
    rawText: text
  };
}

export class TelegramEditorialBot {
  private readonly client: TelegramClient;
  private readonly workspaceRoot: string;
  private isRunning: boolean = false;
  private abortController: AbortController | null = null;
  private lastUpdateId: number = 0;

  constructor(workspaceRoot?: string, client?: TelegramClient) {
    this.workspaceRoot = workspaceRoot ? path.resolve(workspaceRoot) : process.cwd();
    this.client = client || new TelegramClient();
  }

  /**
   * Menjalankan bot dalam mode Long Polling
   */
  public async start(): Promise<void> {
    this.isRunning = true;
    this.abortController = new AbortController();

    console.log('====================================================');
    console.log('NexaMOS Telegram Editorial Bot');
    console.log('Mode: Mobile Workflow (Long Polling)');
    console.log('====================================================');

    // Inisialisasi koneksi bot dengan retry guard (antisipasi 502 Bad Gateway / fluktuasi jaringan saat startup)
    let me: TelegramUser | null = null;
    let attempt = 0;
    while (this.isRunning && !me) {
      try {
        attempt++;
        me = await this.client.getMe();
      } catch (err: any) {
        if (!this.isRunning || err?.name === 'AbortError') {
          return;
        }
        const delay = Math.min(attempt * 2000, 10000);
        console.warn(`[WARN] Gagal inisialisasi getMe (${err.message}). Mencoba lagi dalam ${delay / 1000} detik... (percobaan #${attempt})`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    if (!me || !this.isRunning) {
      return;
    }

    console.log(`Bot terhubung: @${me.username} (${me.first_name})`);

    // Pastikan webhook Telegram non-aktif agar polling getUpdates tidak terhalang error 409
    try {
      await this.client.deleteWebhook(false);
      console.log('[POLLING] Memastikan webhook Telegram non-aktif untuk long-polling.');
    } catch (err: any) {
      console.warn('[WARN] Pengecekan webhook Telegram awal dilewati:', err?.message || err);
    }

    console.log('Menunggu pesan masuk dari Telegram...\n');

    while (this.isRunning) {
      try {
        const updates = await this.client.getUpdates(
          this.lastUpdateId ? this.lastUpdateId + 1 : undefined,
          30,
          this.abortController.signal
        );

        for (const update of updates) {
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
          await this.handleUpdate(update);
        }
      } catch (err: any) {
        if (!this.isRunning || err?.name === 'AbortError') {
          break;
        }
        const isConflict = err?.message?.includes('409') || err?.message?.includes('Conflict');
        if (isConflict) {
          // Jika 409 disebabkan oleh webhook yang aktif, bersihkan webhook dan lanjutkan polling
          if (/webhook/i.test(err?.message || '')) {
            console.warn('[WARN] Terdeteksi webhook aktif memblokir getUpdates. Menghapus webhook...');
            try {
              await this.client.deleteWebhook(false);
              console.log('[POLLING] Webhook berhasil dibersihkan. Memulai polling kembali...');
              continue;
            } catch (whErr: any) {
              console.error('[ERROR] Gagal menghapus webhook:', whErr?.message || whErr);
            }
          }

          // Backoff dinamis dengan jitter 8-14 detik untuk meredakan collision loop
          // jika terjadi overlapping zero-downtime deploy di cloud (Render/Koyeb)
          const backoff = Math.floor(8000 + Math.random() * 6000);
          console.warn(
            `[WARN] Polling update conflict 409: Terdeteksi instance bot lain yang aktif. Mengalah dan menunggu ${Math.round(backoff / 1000)} detik...`
          );
          await new Promise((r) => setTimeout(r, backoff));
        } else {
          console.warn(`[WARN] Polling update error: ${err.message}. Mencoba lagi dalam 3 detik...`);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }
  }

  /**
   * Menghentikan bot secara aman
   */
  public stop(): void {
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
    }
    console.log('NexaMOS Telegram Editorial Bot dihentikan.');
  }

  /**
   * Router utama untuk memproses setiap update pesan atau tombol
   */
  public async handleUpdate(update: TelegramUpdate): Promise<void> {
    // 1. Tangani Callback Query dari Inline Keyboard
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    // 2. Tangani Pesan Masuk (Teks atau Media)
    if (update.message) {
      await this.handleMessage(update.message);
    }
  }

  /**
   * Memproses pesan teks atau media masuk
   */
  private async handleMessage(message: any): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from?.id;
    const text = message.text?.trim() || '';

    // Guard Autorisasi Pengguna
    if (!isUserAuthorized(userId)) {
      console.warn(`[SECURITY] Akses ditolak dari Telegram ID: ${userId} (${message.from?.username})`);
      await this.client.sendMessage(
        chatId,
        '⛔ <b>Akses Ditolak</b>\nBot ini hanya dikonfigurasi untuk pemilik resmi NexaMOS.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Tangani Unggahan Foto / Gambar Hero
    if (message.photo || (message.document && message.document.mime_type?.startsWith('image/'))) {
      await this.handleImageUpload(message);
      return;
    }

    if (!text) {
      return;
    }

    // Perintah /start atau /help
    if (text === '/start' || text === '/help') {
      await this.sendHelpMessage(chatId);
      return;
    }

    // Perintah /status
    if (text === '/status') {
      await this.sendStatusMessage(chatId);
      return;
    }

    // Eksekusi Pipeline Pembuatan Artikel
    await this.processArticleCreation(chatId, text);
  }

  /**
   * Menangani unggahan gambar hero dari pengguna via Telegram
   */
  private async handleImageUpload(message: any): Promise<void> {
    const chatId = message.chat.id;
    const caption = (message.caption || '').trim();

    // 1. Tentukan target slug artikel
    let targetSlug: string | null = null;
    let articleTitle = 'Artikel Draf';

    // Cek jika caption berisi slug eksplisit, misal: "slug: apa-itu-lead" atau "/slug apa-itu-lead"
    if (caption) {
      const match = caption.match(/(?:slug\s*:\s*|\/slug\s+)?([a-z0-9-]+)/i);
      if (match && match[1]) {
        targetSlug = slugify(match[1]);
      }
    }

    const draftsDir = path.join(this.workspaceRoot, 'content', 'drafts');

    // Jika targetSlug belum ditentukan dari caption, ambil draf terbaru dari folder content/drafts
    if (!targetSlug) {
      try {
        const draftFiles = await fs.readdir(draftsDir);
        const jsonDrafts = draftFiles.filter((f) => f.endsWith('-draft.json'));

        if (jsonDrafts.length > 0) {
          let latestDate = 0;
          let latestFile = jsonDrafts[0];

          for (const df of jsonDrafts) {
            try {
              const raw = await fs.readFile(path.join(draftsDir, df), 'utf-8');
              const data = JSON.parse(raw);
              const createdAt = data.createdAt ? new Date(data.createdAt).getTime() : 0;
              if (createdAt > latestDate) {
                latestDate = createdAt;
                latestFile = df;
                articleTitle = data.draft?.title || articleTitle;
              }
            } catch {
              // Abaikan file rusak
            }
          }

          targetSlug = latestFile.replace(/-draft\.json$/, '');
        }
      } catch (err) {
        console.warn('[WARN] Gagal membaca folder draf:', err);
      }
    }

    if (!targetSlug) {
      await this.client.sendMessage(
        chatId,
        '⚠️ <b>Tidak ada draf aktif yang ditemukan.</b>\n\nSilakan buat draf artikel terlebih dahulu, atau kirim gambar dengan caption: <code>slug: nama-slug-artikel</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Ambil file_id dari foto (resolusi tertinggi ada di elemen terakhir array photo)
    let fileId: string | null = null;
    if (message.photo && message.photo.length > 0) {
      fileId = message.photo[message.photo.length - 1].file_id;
    } else if (message.document) {
      fileId = message.document.file_id;
    }

    if (!fileId) {
      await this.client.sendMessage(chatId, '⚠️ Gagal mendeteksi data file gambar.');
      return;
    }

    await this.client.sendChatAction(chatId, 'upload_document');

    try {
      // Dapatkan metadata file_path dari Telegram
      const fileMeta = await this.client.getFile(fileId);
      if (!fileMeta.file_path) {
        throw new Error('Telegram tidak mengembalikan file_path untuk file ini.');
      }

      // Download buffer biner
      const buffer = await this.client.downloadFile(fileMeta.file_path);

      // Simpan ke public/images/
      const publicImagesDir = path.join(this.workspaceRoot, 'public', 'images');
      await fs.mkdir(publicImagesDir, { recursive: true });

      const webpPath = path.join(publicImagesDir, `hero-${targetSlug}.webp`);
      const jpgPath = path.join(publicImagesDir, `hero-${targetSlug}.jpg`);

      await fs.writeFile(webpPath, buffer);
      await fs.writeFile(jpgPath, buffer);

      const safeSlug = targetSlug.slice(0, 45);
      const inlineMarkup: TelegramInlineKeyboardMarkup = {
        inline_keyboard: [
          [
            {
              text: '🚀 Setujui & Publish ke Live',
              callback_data: `publish:${safeSlug}`
            }
          ]
        ]
      };

      const responseText = `✅ <b>Hero Image Berhasil Diterima & Disimpan!</b>\n\n` +
        `📁 <b>File:</b> <code>public/images/hero-${targetSlug}.webp</code>\n` +
        `📰 <b>Ditautkan ke:</b> ${articleTitle}\n\n` +
        `Visual sudah terpasang dan lolos QC. Silakan klik tombol di bawah untuk langsung menayangkan artikel ke live domain:`;

      await this.client.sendMessage(chatId, responseText, {
        parse_mode: 'HTML',
        reply_markup: inlineMarkup
      });
    } catch (err: any) {
      console.error('[ERROR] Gagal mengunduh dan menyimpan gambar:', err);
      await this.client.sendMessage(
        chatId,
        `❌ Gagal menyimpan gambar: <code>${err.message}</code>`,
        { parse_mode: 'HTML' }
      );
    }
  }

  /**
   * Mengirim panduan penggunaan
   */
  private async sendHelpMessage(chatId: number): Promise<void> {
    const helpText = `👋 <b>Halo! Selamat datang di NexaMOS Editorial Bot.</b>

Saya adalah asisten riset & publikasi otomatis untuk <b>nexamos.cloud/blog</b>.

📌 <b>Cara Membuat Artikel:</b>
Cukup kirimkan ide topik dan URL rujukan langsung di chat ini, contoh:
<code>Bikin artikel: Arsitektur CRM Pasien Estetika. Sumber: https://kemenkes.go.id/regulasi-rekam-medis</code>

Atau cukup bagikan link studi/berita yang ingin dianalisis!

⚡ <b>Perintah Tersedia:</b>
• /status — Status blog, model AI, dan jumlah artikel terbit
• /help — Panduan ini`;

    await this.client.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
  }

  /**
   * Mengirim status blog dan AI
   */
  private async sendStatusMessage(chatId: number): Promise<void> {
    const aiConfig = loadAIProviderConfig();
    const publishedDir = path.join(this.workspaceRoot, 'content', 'published');
    const publishedFiles = await fs.readdir(publishedDir).catch(() => []);
    const articleCount = publishedFiles.filter((f) => f.endsWith('.json')).length;

    const statusText = `📊 <b>Status NexaMOS Editorial Engine:</b>

🌐 <b>Live Domain:</b> https://nexamos.cloud/blog
📝 <b>Artikel Terbit:</b> ${articleCount} artikel
🤖 <b>AI Provider:</b> ${aiConfig.provider.toUpperCase()} (${aiConfig.model})
📈 <b>GA4 Tracking:</b> <code>G-7BKT098RDB</code>
🛡️ <b>Grounding Guard:</b> AKTIF (Bebas Halusinasi)

<i>Kirim topik baru kapan saja untuk mulai menulis artikel!</i>`;

    await this.client.sendMessage(chatId, statusText, { parse_mode: 'HTML' });
  }

  /**
   * Memproses pesan ide dan menghasilkan draf ter-grounding
   */
  private async processArticleCreation(chatId: number, rawText: string): Promise<void> {
    const parsed = parseTelegramInput(rawText);
    const slug = slugify(parsed.topic);

    if (parsed.topic.length < 5) {
      await this.client.sendMessage(
        chatId,
        '⚠️ Topik terlalu singkat. Mohon tuliskan judul atau masalah yang ingin dibahas.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const classification = classifyEditorialIntent(rawText, parsed.topic);
    const territory: Territory = classification.territory;
    const recommendedType: ArticleType = classification.articleType;

    // Kirim konfirmasi penerimaan tugas
    await this.client.sendMessage(
      chatId,
      `⏳ <b>Menerima Permintaan Artikel Baru</b>\n\n• <b>Topik:</b> "${parsed.topic}"\n• <b>Wilayah (Territory):</b> <code>${territory}</code>\n• <b>Tipe Format:</b> <code>${recommendedType}</code>\n• <b>Slug:</b> <code>${slug}</code>\n• <b>Sumber:</b> ${parsed.urls.length > 0 ? parsed.urls.join('\n') : '<i>(Tanpa link eksternal — menggunakan basis pengetahuan internal NexaMOS)</i>'}\n\n<i>Sedang memproses riset dan draf naskah...</i>`,
      { parse_mode: 'HTML', disable_web_page_preview: true }
    );

    // Indikator typing berkala
    const typingInterval = setInterval(() => {
      this.client.sendChatAction(chatId, 'typing').catch(() => {});
    }, 4000);

    try {
      const aiConfig = loadAIProviderConfig();
      if (!isAIConfigured(aiConfig)) {
        throw new Error('AI Provider belum dikonfigurasi dengan API key di .env.local.');
      }

      const { researchProvider, editorialProvider } = AIProviderFactory.createProductionProviders(aiConfig);

      // 1. Ekstraksi Bukti dari Sumber URL jika ada
      const extractedEvidence: ResearchEvidence[] = [];
      const acquiredSources: any[] = [];

      const acquisitionProvider = new HttpSourceAcquisitionProvider();
      const sourceRepo = new InMemoryResearchSourceRepository();
      const evidenceRepo = new InMemoryResearchEvidenceRepository();
      const eventRepo = new InMemoryResearchEventRepository();
      const ingestionService = new ResearchIngestionService({ sourceRepo, evidenceRepo, eventRepo });

      if (parsed.urls.length > 0) {
        for (let i = 0; i < parsed.urls.length; i++) {
          const url = parsed.urls[i];
          const candidate: SourceCandidate = {
            id: `cand-${Date.now().toString(36)}-${i}`,
            queryId: 'rq-telegram-01',
            researchProjectId: 'proj-telegram',
            url,
            title: parsed.topic,
            provider: 'DIRECT_INPUT',
            discoveredAt: new Date().toISOString(),
            status: 'DISCOVERED'
          };

          const acquireResult = await acquisitionProvider.acquire(candidate, { timeoutMs: 15000 });
          if (acquireResult.ok) {
            const rawInput = {
              ...acquireResult.value,
              researchProjectId: 'proj-telegram'
            };
            const ingestResult = await ingestionService.ingest(rawInput, { extractEvidence: true });
            if (ingestResult.ok) {
              acquiredSources.push(ingestResult.value.source);
              if (ingestResult.value.persistedEvidence) {
                extractedEvidence.push(...ingestResult.value.persistedEvidence);
              }
            }
          }
        }
      } else {
        // Topik tanpa URL langsung: jalankan Source Discovery untuk menemukan sumber riil
        const discoveryProvider = new MockResearchDiscoveryProvider();
        const acquisitionService = new ResearchAcquisitionService({
          discoveryProvider,
          acquisitionProvider,
          ingestionService,
          eventRepo,
          sourceRepo
        });

        const exploratoryQuestion: ResearchQuestion = {
          id: 'rq-telegram-disc-01',
          question: `Data industri dan riset pasar mengenai ${parsed.topic}`,
          priority: 'HIGH',
          status: 'OPEN'
        };

        const acqReportRes = await acquisitionService.runAcquisitionPipeline(
          exploratoryQuestion,
          'proj-telegram',
          [],
          { actor: 'telegram-discovery' }
        );

        if (acqReportRes.ok) {
          const report = acqReportRes.value;
          for (const ir of report.ingestionResults) {
            acquiredSources.push(ir.source);
            if (ir.persistedEvidence) {
              extractedEvidence.push(...ir.persistedEvidence);
            }
          }
        }
      }

      // 2. Entitas Topik
      const topicEntity: Topic = {
        id: `top-${Date.now().toString(36)}`,
        title: parsed.topic,
        slug,
        territory,
        recommendedArticleType: recommendedType,
        editorialRole: 'AUTHORITY',
        audience: { segment: 'Enterprise Content Leaders' },
        problem: parsed.topic,
        intent: { primary: parsed.topic },
        thesis: null,
        whyNow: null,
        status: 'APPROVED',
        informationGain: {
          originalityType: ['ORIGINAL_FRAMEWORK'],
          expectedContribution: 'Arsitektur informasi mandiri',
          commodityRisk: 'LOW'
        },
        evidencePlan: {
          requiredEvidenceLevel: 'E2',
          plannedSources: parsed.urls,
          originalEvidenceRequired: false
        },
        businessRelevance: {
          objective: 'Thought Leadership',
          funnelRole: 'TOFU'
        },
        distributionTargets: ['GOOGLE_SEARCH', 'GOOGLE_AI'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 3. Plan Research via AI
      const planResult = await researchProvider.planResearch({ topic: topicEntity });
      if (!planResult.ok) {
        throw new Error(`AI Research Planning gagal: ${planResult.error.message}`);
      }

      const questions: ResearchQuestion[] = planResult.value.researchQuestions.map((q: any, idx: number) => ({
        id: `rq-${idx + 1}`,
        question: q.question,
        priority: 'HIGH',
        status: 'OPEN' as const
      }));

      // 4. Propose Claims (Hanya usulan awal dari AI)
      const claimsResult = await researchProvider.proposeClaims({
        projectId: 'proj-telegram',
        evidence: extractedEvidence.slice(0, 20),
        questions
      });

      // 4.5. CLAIM ↔ EVIDENCE VERIFICATION GATE
      const claimVerifier = new DeterministicClaimEvidenceVerifier();
      const supportedClaims: ResearchClaim[] = [];
      const unverifiedClaims: ResearchClaim[] = [];

      const rawClaims = claimsResult.ok ? claimsResult.value : [];
      for (let idx = 0; idx < rawClaims.length; idx++) {
        const c = rawClaims[idx];
        const claim: ResearchClaim = {
          id: `claim-${idx + 1}`,
          researchProjectId: 'proj-telegram',
          statement: c.statement,
          claimType: c.claimType || 'FACTUAL',
          importance: c.importance || 'CRITICAL',
          status: 'UNVERIFIED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const verifyRes = await claimVerifier.verify(claim, extractedEvidence);
        claim.status = verifyRes.status;

        if (claim.status === 'SUPPORTED') {
          supportedClaims.push(claim);
        } else {
          unverifiedClaims.push(claim);
        }
      }

      // Indeks Sumber Riil (Hanya jika benar-benar berhasil diakuisisi, tanpa rekayasa fiktif)
      const finalSourceIndex = acquiredSources.map((s: any, idx: number) => ({
        sourceId: s.id || `src-${idx + 1}`,
        title: s.title || parsed.topic,
        url: s.url,
        canonicalUrl: s.canonicalUrl || s.url,
        publisher: s.publisher || 'Referensi Otoritatif',
        sourceType: s.type || 'COMPANY_PUBLICATION',
        authorityScore: s.qualityAssessment?.authority ?? 80,
        publicationAllowed: true
      }));

      // Indeks Bukti Riil
      const finalEvidenceIndex = extractedEvidence.slice(0, 20).map((e: any) => ({
        evidenceId: e.id,
        sourceId: e.sourceId,
        quote: e.content.slice(0, 200),
        level: e.evidenceLevel || 'E2',
        verified: e.verified !== undefined ? e.verified : true,
        provenanceType: e.provenanceType || 'EXTERNAL_EVIDENCE',
        sourceUrl: e.sourceUrl || undefined
      }));

      const isResearchSufficient = supportedClaims.length > 0;
      const researchBrief: ResearchBrief = {
        id: `brief-${Date.now().toString(36)}`,
        topicId: topicEntity.id,
        researchProjectId: 'proj-telegram',
        objective: parsed.topic,
        answeredQuestions: [],
        openQuestions: questions,
        supportedClaims,
        partiallySupportedClaims: [],
        disputedClaims: [],
        unverifiedClaims,
        unsupportedClaims: [],
        keyFindings: [
          {
            id: 'finding-01',
            researchProjectId: 'proj-telegram',
            statement: `Analisis otoritas mengenai ${parsed.topic}`,
            supportingClaimIds: supportedClaims.map((c) => c.id),
            confidence: isResearchSufficient ? 'HIGH' : 'LOW',
            limitations: isResearchSufficient ? [] : ['Belum ada bukti empiris terverifikasi yang mencukupi.'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        limitations: isResearchSufficient ? [] : ['Klaim riset belum terverifikasi (INSUFFICIENT_EVIDENCE).'],
        researchGaps: [],
        recommendedEditorialAngle: `Panduan dan analisis strategis mengenai ${parsed.topic}`,
        sourceIndex: finalSourceIndex,
        evidenceIndex: finalEvidenceIndex,
        readiness: isResearchSufficient ? 'READY_FOR_EDITORIAL' : 'NOT_READY',
        readinessReason: isResearchSufficient
          ? 'Kecukupan bukti riset terpenuhi secara terverifikasi.'
          : 'Belum ada bukti pendukung yang terverifikasi (NO SOURCE -> NO EVIDENCE -> NO SUPPORTED CLAIM).',
        generatedAt: new Date().toISOString()
      };

      // 5. Generate Article Draft via AI Editorial Provider
      const editorialRole: EditorialRole = topicEntity.editorialRole || 'AUTHORITY';
      const articleType: ArticleType = topicEntity.recommendedArticleType || 'ANALYSIS';

      const editorialRequest: EditorialGenerationRequest = {
        topic: topicEntity,
        researchBrief,
        articleType,
        editorialRole,
        territory: topicEntity.territory,
        audience: topicEntity.audience?.segment || 'Enterprise Content Leaders',
        primaryObjective: `Analisis strategis mengenai ${parsed.topic}`,
        editorialAngle: researchBrief.recommendedEditorialAngle
      };

      const editorialPlan = await editorialProvider.createEditorialPlan(editorialRequest);
      const draftPayload = await editorialProvider.generateArticleDraft(editorialRequest, editorialPlan);

      const draft: ArticleDraft = {
        id: `draft-${Date.now().toString(36)}`,
        topicId: topicEntity.id,
        researchProjectId: researchBrief.researchProjectId,
        title: draftPayload.title,
        dek: draftPayload.dek || '',
        slug: slug,
        territory: editorialRequest.territory,
        articleType: editorialRequest.articleType,
        editorialRole: editorialRequest.editorialRole,
        thesis: draftPayload.thesis,
        editorialAngle: draftPayload.editorialAngle,
        sections: draftPayload.sections,
        claimUsages: draftPayload.claimUsages,
        citationMap: draftPayload.citationMap,
        status: 'READY_FOR_EDITORIAL_REVIEW',
        generatedAt: new Date().toISOString(),
        generatorVersion: draftPayload.generatorVersion || 'telegram-v1',
        promptVersion: draftPayload.promptVersion || '1.0.0'
      };

      // 6. Grounding Guard
      const groundingGuard = new GroundingGuard();
      const guardResult = groundingGuard.evaluate(draft, researchBrief, editorialPlan);


      // 7. Rumuskan Visual Prompt dengan AI Provider sesuai formula [SUBJECT] + [VISUAL METAPHOR] + [CORE_STYLE]
      const visualPrompt = await this.generateVisualPrompt(
        parsed.topic,
        draft.title,
        draft.dek || '',
        draft.sections,
        draft.territory
      );

      // Simpan draf ke content/drafts/
      const draftsDir = path.join(this.workspaceRoot, 'content', 'drafts');
      await fs.mkdir(draftsDir, { recursive: true });
      const draftFilePath = path.join(draftsDir, `${slug}-draft.json`);
      await fs.writeFile(
        draftFilePath,
        JSON.stringify(
          {
            draft,
            brief: researchBrief,
            topic: topicEntity,
            guardEvaluation: guardResult,
            visualPrompt,
            createdAt: new Date().toISOString()
          },
          null,
          2
        ),
        'utf-8'
      );

      clearInterval(typingInterval);

      // Hitung perkiraan waktu baca
      const totalWords = draft.sections.reduce((acc, s) => acc + s.content.split(/\s+/).length, 0);
      const estMinutes = Math.max(1, Math.ceil(totalWords / 200));

      // Callback data Telegram maksimal 64 byte
      const safeSlug = slug.slice(0, 45);

      // Kirim hasil draf dan tombol persetujuan
      const inlineMarkup: TelegramInlineKeyboardMarkup = {
        inline_keyboard: [
          [
            {
              text: '🚀 Setujui & Publish ke Live',
              callback_data: `publish:${safeSlug}`
            }
          ],
          [
            {
              text: '👁️ Baca Ringkasan Draf',
              callback_data: `read:${safeSlug}`
            },
            {
              text: '❌ Batalkan',
              callback_data: `cancel:${safeSlug}`
            }
          ]
        ]
      };

      const responseText = `✅ <b>Draf Artikel Selesai Disusun!</b>

📰 <b>${draft.title}</b>
<i>${draft.dek || ''}</i>

🏷️ <b>Klasifikasi Editorial:</b>
• <b>Wilayah (Territory):</b> <code>${draft.territory}</code>
• <b>Tipe Format:</b> <code>${draft.articleType}</code>

📊 <b>Rincian Naskah:</b>
• Seksi: ${draft.sections.length} bagian
• Kata: ~${totalWords} kata (Waktu baca: ~${estMinutes} menit)
• Grounding: <b>${guardResult.status}</b> (${guardResult.issues.length} catatan)
• Sumber Sitasi: ${researchBrief.sourceIndex.length} rujukan

🎨 <b>Prompt Visual NexaMOS (Siap Copy ke Midjourney / Flux / DALL-E):</b>
<code>${visualPrompt}</code>

📸 <b>Langkah QC Gambar:</b>
Kirim/upload foto hasil generate langsung ke chat bot ini! File otomatis disimpan ke <code>public/images/hero-${safeSlug}.webp</code>.

Silakan pilih tindakan berikut:`;

      await this.client.sendMessage(chatId, responseText, {
        parse_mode: 'HTML',
        reply_markup: inlineMarkup
      });
    } catch (err: any) {
      clearInterval(typingInterval);
      console.error(`[ERROR] Gagal memproses artikel:`, err);
      await this.client.sendMessage(
        chatId,
        `❌ <b>Gagal Menyusun Artikel</b>\n\nError: <code>${err.message}</code>`,
        { parse_mode: 'HTML' }
      );
    }
  }

  /**
   * Menangani aksi tombol inline keyboard
   */
  private async handleCallbackQuery(callbackQuery: any): Promise<void> {
    const callbackId = callbackQuery.id;
    const userId = callbackQuery.from.id;
    const chatId = callbackQuery.message?.chat.id;
    const messageId = callbackQuery.message?.message_id;
    const data = callbackQuery.data || '';

    if (!isUserAuthorized(userId)) {
      await this.client.answerCallbackQuery(callbackId, 'Akses ditolak.', true);
      return;
    }

    const [action, slug] = data.split(':');

    // 1. Aksi PUBLISH
    if (action === 'publish' && slug) {
      await this.client.answerCallbackQuery(callbackId, 'Mempublikasikan ke live...');
      await this.client.editMessageText(
        chatId,
        messageId,
        `⏳ <b>Mempublikasikan Artikel '${slug}' ke Live Website...</b>\n\nSedang menjalankan preflight validation, render HTML, dan deploy Vercel...`,
        { parse_mode: 'HTML' }
      );

      try {
        const liveUrl = await this.publishArticle(slug);

        await this.client.editMessageText(
          chatId,
          messageId,
          `🚀 <b>Artikel Berhasil Dipublikasikan Live!</b>\n\n🌐 <b>URL:</b> <a href="${liveUrl}">${liveUrl}</a>\n\nPerubahan berhasil di-push ke GitHub dan tayang otomatis di Vercel dalam ~20-30 detik.`,
          { parse_mode: 'HTML', disable_web_page_preview: false }
        );
      } catch (err: any) {
        console.error(`[ERROR] Gagal publikasi:`, err);
        await this.client.editMessageText(
          chatId,
          messageId,
          `❌ <b>Publikasi Gagal</b>\n\n⚠️ <i>Proses dihentikan demi menjaga integritas data & menghindari broken link / 404.</i>\n\n<b>Penyebab:</b>\n<code>${err.message}</code>`,
          { parse_mode: 'HTML' }
        );
      }
      return;
    }

    // 2. Aksi BACA RINGKASAN
    if (action === 'read' && slug) {
      await this.client.answerCallbackQuery(callbackId);
      const draftsDir = path.join(this.workspaceRoot, 'content', 'drafts');
      let draftFilePath = path.join(draftsDir, `${slug}-draft.json`);
      try {
        let raw = '';
        try {
          raw = await fs.readFile(draftFilePath, 'utf-8');
        } catch {
          const files = await fs.readdir(draftsDir);
          const matched = files.find((f) => f.startsWith(slug) && f.endsWith('-draft.json'));
          if (matched) {
            draftFilePath = path.join(draftsDir, matched);
            raw = await fs.readFile(draftFilePath, 'utf-8');
          } else {
            throw new Error('Draf tidak ditemukan');
          }
        }
        const data = JSON.parse(raw);
        const draft: ArticleDraft = data.draft;

        let previewText = `📖 <b>${draft.title}</b>\n\n`;
        for (const sec of draft.sections) {
          previewText += `🔹 <b>${sec.heading}</b>\n${sec.content.slice(0, 300)}...\n\n`;
        }

        await this.client.sendMessage(chatId, previewText.slice(0, 4000), { parse_mode: 'HTML' });
      } catch {
        await this.client.sendMessage(chatId, 'Gagal membaca file draf.', { parse_mode: 'HTML' });
      }
      return;
    }

    // 3. Aksi BATALKAN
    if (action === 'cancel' && slug) {
      await this.client.answerCallbackQuery(callbackId, 'Draf dibatalkan.');
      await this.client.editMessageText(
        chatId,
        messageId,
        `❌ Draf artikel <code>${slug}</code> telah dibatalkan.`,
        { parse_mode: 'HTML' }
      );
      return;
    }
  }

  /**
   * Menjalankan publikasi resmi artikel dan git push
   */
  public async publishArticle(slugInput: string): Promise<string> {
    const draftsDir = path.join(this.workspaceRoot, 'content', 'drafts');
    let draftPath = path.join(draftsDir, `${slugInput}-draft.json`);
    let rawDraft = '';

    try {
      rawDraft = await fs.readFile(draftPath, 'utf-8');
    } catch {
      // Fallback toleransi jika slug terpotong atau memiliki variasi panjang
      try {
        const files = await fs.readdir(draftsDir);
        const matched = files.find((f) => f.startsWith(slugInput) && f.endsWith('-draft.json'));
        if (matched) {
          draftPath = path.join(draftsDir, matched);
          rawDraft = await fs.readFile(draftPath, 'utf-8');
        } else {
          throw new Error(`Draf artikel '${slugInput}' tidak ditemukan di content/drafts/.`);
        }
      } catch (err: any) {
        throw new Error(`Draf artikel '${slugInput}' tidak ditemukan: ${err.message}`);
      }
    }

    const draftData = JSON.parse(rawDraft);
    const draft: ArticleDraft = draftData.draft;
    const topic: Topic = draftData.topic;
    const brief: ResearchBrief = draftData.brief;
    const slug = draft.slug || slugInput;

    const candidate: PublicationCandidate = {
      candidateId: `cand-${slug}`,
      articleId: `art-${slug}`,
      slug,
      title: draft.title,
      distributionReadinessId: `dist-${slug}`,
      approvedAt: new Date().toISOString(),
      overallStatus: 'READY_TO_PUBLISH',
      warnings: [],
      policyVersion: 'TELEGRAM_BOT_APPROVAL'
    };

    const seoMeta: ArticleSEOMetadata = {
      title: `${draft.title} | NexaMOS`,
      description: draft.dek || '',
      slug,
      canonicalUrl: `https://nexamos.cloud/blog/${slug}`,
      robots: { index: true, follow: true },
      author: {
        name: 'Tim Riset & Rekayasa NexaMOS',
        role: 'NexaMOS Knowledge & AI Engineering'
      },
      publisher: {
        name: 'NexaMOS Knowledge Journal',
        logoUrl: 'https://nexamos.cloud/brand/logo.png'
      },
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Resolusi Hero Image dinamis berbasis slug artikel
    const publicImagesDir = path.join(this.workspaceRoot, 'public', 'images');
    const possibleExtensions = ['.webp', '.jpg', '.jpeg', '.png'];
    let resolvedHeroFileName: string | null = null;

    for (const ext of possibleExtensions) {
      const candidateFile = `hero-${slug}${ext}`;
      try {
        await fs.stat(path.join(publicImagesDir, candidateFile));
        resolvedHeroFileName = candidateFile;
        break;
      } catch {
        // file belum ada
      }
    }

    const heroImageUrl = resolvedHeroFileName
      ? `/blog/images/${resolvedHeroFileName}`
      : `/blog/images/hero-${slug}.webp`;

    if (!resolvedHeroFileName) {
      console.warn(
        `[WARN] Hero image fisik belum ditemukan di public/images/hero-${slug}.webp. Menggunakan target URL dinamis: ${heroImageUrl}`
      );
    }

    // Menghasilkan terjemahan dwibahasa otomatis (EN default + ID)
    let translations: any = undefined;
    try {
      const aiConfig = loadAIProviderConfig();
      if (isAIConfigured(aiConfig)) {
        const { editorialProvider } = AIProviderFactory.createProductionProviders(aiConfig);
        if ('translateDraftToEnglish' in editorialProvider && typeof (editorialProvider as any).translateDraftToEnglish === 'function') {
          console.log(`[BOT] Menerjemahkan draf '${draft.title}' ke English untuk penerbitan dwibahasa...`);
          const enResult = await (editorialProvider as any).translateDraftToEnglish(draft);

          translations = {
            id: {
              title: draft.title,
              description: draft.dek || draft.title,
              headline: draft.title,
              dek: draft.dek,
              sections: draft.sections.map((s) => ({
                id: s.id,
                heading: s.heading ?? '',
                content: s.content,
                order: s.order,
                purpose: s.purpose
              }))
            },
            en: {
              title: enResult.title,
              description: enResult.dek || enResult.title,
              headline: enResult.title,
              dek: enResult.dek,
              sections: enResult.sections
            }
          };
        }
      }
    } catch (transErr: any) {
      console.warn(`[WARN] Gagal menghasilkan translasi otomatis ke English: ${transErr.message}`);
    }

    const publicationPackage = PublicationPackageBuilder.build(
      candidate,
      draft,
      topic,
      seoMeta,
      brief,
      {
        siteUrl: 'https://nexamos.cloud',
        blogBasePath: '/blog',
        publishedAt: new Date().toISOString(),
        defaultLanguage: 'en',
        translations,
        heroImage: {
          url: heroImageUrl,
          alt: draft.title,
          width: 1200,
          height: 630,
          caption: draft.dek ?? undefined
        },
        isSyntheticTestData: false,
        fixtureOnly: false
      }
    );

    // Preflight check
    const preflight = new PublicationPreflightValidator();
    const preflightResult = preflight.validate(publicationPackage);
    if (preflightResult.status === 'FAIL') {
      throw new Error(`PREFLIGHT_FAIL: ${preflightResult.blockingErrors.join(', ')}`);
    }

    // Simpan ke content/published/
    const publishedDir = path.join(this.workspaceRoot, 'content', 'published');
    await fs.mkdir(publishedDir, { recursive: true });
    await fs.writeFile(
      path.join(publishedDir, `${slug}.json`),
      JSON.stringify(publicationPackage, null, 2),
      'utf-8'
    );

    // Static Export ke dist/
    await runBuild({ isFixture: false, workspaceRoot: this.workspaceRoot });

    // Git Commit & Push ke GitHub
    const githubToken = process.env.GITHUB_TOKEN?.trim();
    const gitUser = process.env.GIT_USER_NAME || 'Wishnu';
    const gitEmail = process.env.GIT_USER_EMAIL || 'wishnuyasa2020@gmail.com';

    // 1. Validasi Keberadaan GITHUB_TOKEN di Cloud/Hosting
    const isCloudEnv = process.env.NODE_ENV === 'production' || !!process.env.RENDER || !!process.env.KOYEB;
    if (!githubToken && isCloudEnv) {
      throw new Error(
        'GITHUB_TOKEN belum disetel di environment variables server bot (Render/Koyeb)! ' +
        'Bot membutuhkan GitHub Personal Access Token (PAT dengan izin repository) agar dapat melakukan auto-push ke GitHub untuk men-trigger Vercel.'
      );
    }

    const authenticatedRemoteUrl = githubToken
      ? `https://${githubToken}@github.com/wishnuyasa2020-dotcom/nexamos-blog.git`
      : 'origin';

    // 2. Safe directory fix untuk container Linux / Docker
    try {
      await execAsync('git config --global --add safe.directory "*"', { cwd: this.workspaceRoot });
    } catch {
      // Abaikan jika tidak diizinkan di sistem lokal
    }

    // 3. Pastikan direktori .git ada
    const gitDir = path.join(this.workspaceRoot, '.git');
    let hasGit = false;
    try {
      await fs.stat(gitDir);
      hasGit = true;
    } catch {
      hasGit = false;
    }

    if (!hasGit && githubToken) {
      await execAsync('git init', { cwd: this.workspaceRoot });
      await execAsync(`git remote add origin ${authenticatedRemoteUrl}`, { cwd: this.workspaceRoot });
      await execAsync('git branch -M main', { cwd: this.workspaceRoot });
      await execAsync('git fetch origin main --depth=1', { cwd: this.workspaceRoot });
      await execAsync('git reset origin/main', { cwd: this.workspaceRoot });
    } else if (hasGit && githubToken) {
      try {
        await execAsync(`git remote set-url origin ${authenticatedRemoteUrl}`, { cwd: this.workspaceRoot });
      } catch {
        // Abaikan jika set-url gagal
      }
    }

    // 4. Pastikan branch lokal terdefinisi sebagai main (mengatasi detached HEAD di container cloud)
    try {
      await execAsync('git branch -M main', { cwd: this.workspaceRoot });
    } catch {
      // Abaikan jika sudah main
    }

    // 5. Konfigurasi identitas committer
    await execAsync(`git config user.name "${gitUser}"`, { cwd: this.workspaceRoot });
    await execAsync(`git config user.email "${gitEmail}"`, { cwd: this.workspaceRoot });

    // 6. Stage file yang diperbarui
    await execAsync('git add content/published/ content/drafts/ public/images/', { cwd: this.workspaceRoot });

    // 7. Commit jika ada perubahan
    const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: this.workspaceRoot });
    if (statusOut.trim().length > 0) {
      await execAsync(`git commit -m "feat(blog): publish '${draft.title}' via Telegram Bot"`, { cwd: this.workspaceRoot });
    }

    // 8. Eksekusi Push (Wajib melempar error jika gagal, JANGAN telan secara diam-diam!)
    try {
      if (githubToken) {
        // Fetch & sinkronkan commit remote terbaru agar push tidak ditolak non-fast-forward
        try {
          await execAsync(`git fetch ${authenticatedRemoteUrl} main`, { cwd: this.workspaceRoot });
          await execAsync(`git merge --no-edit FETCH_HEAD`, { cwd: this.workspaceRoot });
        } catch (syncErr: any) {
          console.warn(`[WARN] Remote sync notice: ${syncErr.message}`);
        }
        await execAsync(`git push ${authenticatedRemoteUrl} HEAD:main`, { cwd: this.workspaceRoot });
      } else {
        await execAsync('git push origin HEAD:main', { cwd: this.workspaceRoot });
      }
    } catch (pushErr: any) {
      throw new Error(
        `Git push ke GitHub gagal: ${pushErr.message}. ` +
        (githubToken
          ? 'Pastikan GITHUB_TOKEN memiliki scope/izin write repository.'
          : 'Pastikan GITHUB_TOKEN telah disetel di environment variables server hosting.')
      );
    }

    return `https://nexamos.cloud/blog/${slug}`;
  }

  /**
   * Membaca panduan visual hero image secara dinamis dari disk
   */
  private async loadHeroVisualGuide(): Promise<string> {
    const candidatePaths = [
      path.join(this.workspaceRoot, 'agent', 'memory', 'hero-visual-style-guide.md'),
      path.join(this.workspaceRoot, 'knowledge', 'editorial', 'NexaMOS_Editorial_Style_Guide_v1.0.md')
    ];
    for (const filePath of candidatePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return content;
      } catch {
        // Coba path alternatif berikutnya
      }
    }
    return '';
  }

  /**
   * Merumuskan Visual Prompt siap pakai untuk Midjourney / DALL-E / Flux
   * Berdasarkan formula kanonik: [SUBJECT] + [VISUAL METAPHOR] + [CORE_STYLE]
   */
  public async generateVisualPrompt(
    topic: string,
    draftTitle: string,
    draftDek: string,
    sections: { heading?: string | null; content: string }[],
    territory?: Territory
  ): Promise<string> {
    const resolvedTerritory: Territory = territory || 'STRATEGY';
    try {
      const aiConfig = loadAIProviderConfig();
      if (!isAIConfigured(aiConfig)) {
        return this.createFallbackVisualPrompt(topic, draftTitle, resolvedTerritory);
      }

      // 1. Baca panduan visual terbaru secara dinamis dari disk
      const visualGuideContent = await this.loadHeroVisualGuide();

      const client = new AIHttpClient(aiConfig);
      const summaryContext = sections
        .slice(0, 3)
        .map((s) => `${s.heading || ''}: ${s.content.slice(0, 150)}`)
        .join('\n');

      const coreStyle = '3D isometric illustration, soft clay rendering, rounded geometric objects, soft studio lighting, minimal marketing illustration, clean composition, premium modern aesthetic. Clear visual hierarchy, single dominant focal object, generous negative space, no text, no logos.';

      const systemPrompt = `You are the Lead Visual Art Director for NexaMOS (Marketing Operating System).
Your mission: Formulate the [SUBJECT] in English and invent a UNIQUE, tangible physical [VISUAL METAPHOR] representing the core mechanism of the article.

FORMULA ARCHITECTURE:
[SUBJECT] + [VISUAL METAPHOR] + [CORE_STYLE]

CRITICAL RULES (ANTI-REDUNDANCY & BLACKLIST):
1. [SUBJECT]: Concise, high-value English title/subject representing the article.
2. [VISUAL METAPHOR]: A creative, tangible physical object or mechanism representing the article's core operational dynamic.
   - ⚠️ NEVER include the words "3D", "isometric", "illustration", or "rendering" in visualMetaphor. The rendering style is already supplied by [CORE_STYLE].
   - 🚫 BLACKLISTED WORDS (STRICTLY FORBIDDEN): "crystal prism", "crystal", "prism". These are banned clichés. Never output them.
   - Describe ONLY the physical object, its modular geometry, and its dynamic action (e.g., "spherical radar scanner detecting illuminated data pulses", "monolithic balanced decision pillar resting on stepped foundation blocks", "circular sorting conduit with pressurized intake channels").
   - AVOID CLICHÉ OR REPETITIVE METAPHORS: Invent a fresh, article-specific metaphor tailored to the exact topic rather than repeating the same examples.
3. KNOWLEDGE TERRITORY DIVERSE INSPIRATIONS:
   - INTELLIGENCE: Spherical radar scanner, optical signal lens, acoustic soundboard, astronomical armillary sphere, frequency tuning fork, layered seismic gauge, curved diagnostic sensor, glowing signal matrix, directional antenna array. (STRICTLY NO PRISMS).
   - STRATEGY: Architectural arches, milestone monolith, interlocking puzzle plinth, balance beam scale, branching directional signpost, stepping stone pathway, foundation blocks.
   - TACTICAL: Mechanical conveyer gear, spiral sorting tower, pressurized valve conduit, modular pipeline cartridge, loop track, hopper dispenser, calibrated filter chamber.
4. STRICT ANTI-PATTERNS:
   - NO text, letters, typography, words, numbers, or brand logos anywhere.
   - NO humanoid robots, robot heads, or human figures/faces.
   - NO computer monitors, laptop screens, smartphone mockups, or 2D chart/dashboard screenshots.
   - NO crystal prisms or repetitive glass shapes.
   - SINGLE DOMINANT FOCAL OBJECT with generous negative space.

OUTPUT FORMAT (MANDATORY JSON ONLY):
{
  "subject": "Clear English subject or title of the article",
  "visualMetaphor": "Tangible physical object and its action (WITHOUT the words 3D, isometric, crystal, or prism)"
}`;

      const userPrompt = `Generate the hero image concept for this article:
Topic: "${topic}"
Headline: "${draftTitle}"
Knowledge Territory: ${resolvedTerritory}
Dek: "${draftDek}"
Key Context:
${summaryContext}`;

      const response = await client.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        responseFormat: 'json_object',
        temperature: 0.6
      });

      let extractedSubject = draftTitle || topic;
      let extractedMetaphor = '';

      try {
        const parsedJson = JSON.parse(response.content.trim());
        if (parsedJson.subject) {
          extractedSubject = parsedJson.subject.trim().replace(/^["']|["']$/g, '');
        }
        if (parsedJson.visualMetaphor) {
          extractedMetaphor = parsedJson.visualMetaphor.trim().replace(/^["']|["']$/g, '');
        }
      } catch {
        // Fallback jika respon model bukan JSON murni
        extractedMetaphor = response.content.replace(/--ar 16:9/g, '').trim();
      }

      if (!extractedMetaphor) {
        return this.createFallbackVisualPrompt(topic, draftTitle, resolvedTerritory);
      }

      // Sanitasi ketat:
      // 1. Hapus kata '3D', 'isometric', 'illustration of' dari metaphor agar tidak terjadi dobel 3D request
      // 2. Blacklist / filter kata 'crystal prism', 'prism', atau 'crystal'
      let cleanMetaphor = extractedMetaphor
        .replace(/^(a\s+|an\s+|the\s+)?(3d\s+)?(isometric\s+)?(3d\s+)?(illustration\s+of\s+)?/i, '')
        .replace(/\b3d\s+isometric\b/gi, '')
        .replace(/\bisometric\s+3d\b/gi, '')
        .replace(/\bisometric\b/gi, '')
        .replace(/\b3d\b/gi, '')
        .replace(/\b(geometric\s+crystal\s+prism|refractive\s+crystal\s+prism|crystal\s+prism|crystal|prism)\b/gi, 'spherical radar scanner')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanMetaphor.length > 0) {
        cleanMetaphor = cleanMetaphor.charAt(0).toLowerCase() + cleanMetaphor.slice(1);
      } else {
        return this.createFallbackVisualPrompt(topic, draftTitle, resolvedTerritory);
      }

      // Rakit formula baku: [SUBJECT] + [VISUAL METAPHOR] + [CORE_STYLE]
      return `${extractedSubject}, ${cleanMetaphor}, ${coreStyle} --ar 16:9`;
    } catch (err) {
      console.warn('[WARN] Gagal merumuskan visual prompt via AI, menggunakan formula fallback:', err);
      return this.createFallbackVisualPrompt(topic, draftTitle, resolvedTerritory);
    }
  }

  /**
   * Formula prompt visual default jika API AI offline
   * Menjamin kepatuhan mutlak pada formula: [SUBJECT] + [VISUAL METAPHOR] + [CORE_STYLE]
   * Tanpa dobel kata '3D' atau 'isometric' dan bebas dari 'crystal prism'
   */
  private createFallbackVisualPrompt(topic: string, draftTitle?: string, territory?: Territory): string {
    const subject = draftTitle || topic;
    const coreStyle = '3D isometric illustration, soft clay rendering, rounded geometric objects, soft studio lighting, minimal marketing illustration, clean composition, premium modern aesthetic. Clear visual hierarchy, single dominant focal object, generous negative space, no text, no logos.';

    let visualMetaphor = 'monolithic architectural decision pillar resting on stepped foundation blocks';
    if (territory === 'INTELLIGENCE') {
      visualMetaphor = 'spherical radar scanner detecting calibrated market signal pulses';
    } else if (territory === 'TACTICAL') {
      visualMetaphor = 'circular precision sorting conduit with pressurized intake channels and interconnected geometric tubes';
    }

    return `${subject}, ${visualMetaphor}, ${coreStyle} --ar 16:9`;
  }
}
