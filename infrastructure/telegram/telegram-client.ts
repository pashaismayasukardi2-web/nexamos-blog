/// <reference path="../../tests/ambient.d.ts" />
/**
 * NexaMOS Telegram Client (Native Node.js Implementation)
 *
 * Mengimplementasikan komunikasi HTTP native dengan Telegram Bot API tanpa dependensi eksternal.
 * Mendukung pengiriman pesan, pembaruan pesan, aksi indikator mengetik, dan polling pembaruan.
 */

import { Buffer } from 'node:buffer';
import type { TelegramConfig } from './telegram-config.ts';
import { loadTelegramConfig } from './telegram-config.ts';

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface SendMessageOptions {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: TelegramInlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
}

export class TelegramClient {
  private readonly botToken: string;
  private readonly baseUrl: string;
  private readonly fileBaseUrl: string;

  constructor(config?: TelegramConfig) {
    const activeConfig = config || loadTelegramConfig();
    this.botToken = activeConfig.botToken;
    this.baseUrl = `${activeConfig.apiBaseUrl}/bot${this.botToken}`;
    this.fileBaseUrl = `${activeConfig.apiBaseUrl}/file/bot${this.botToken}`;
  }

  /**
   * Helper internal untuk memanggil endpoint Telegram API
   */
  private async callApi<T>(method: string, body?: Record<string, any>, signal?: AbortSignal): Promise<T> {
    if (!this.botToken) {
      throw new Error('TELEGRAM_CLIENT_ERROR: Bot token belum disetel.');
    }

    const url = `${this.baseUrl}/${method}`;
    const options: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const rawText = await response.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`TELEGRAM_HTTP_ERROR: [${response.status}] ${response.statusText || rawText.slice(0, 100) || 'Gagal memproses respons dari Telegram'}`);
    }

    if (!data.ok) {
      throw new Error(`TELEGRAM_API_ERROR: [${data.error_code || response.status}] ${data.description || response.statusText}`);
    }

    return data.result as T;
  }

  /**
   * Verifikasi token bot dan ambil data profil bot
   */
  public async getMe(): Promise<TelegramUser> {
    return this.callApi<TelegramUser>('getMe');
  }

  /**
   * Kirim pesan teks ke chat
   */
  public async sendMessage(chatId: string | number, text: string, options: SendMessageOptions = {}): Promise<TelegramMessage> {
    return this.callApi<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options.parse_mode,
      reply_markup: options.reply_markup,
      disable_web_page_preview: options.disable_web_page_preview
    });
  }

  /**
   * Edit pesan yang telah dikirim
   */
  public async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    options: SendMessageOptions = {}
  ): Promise<TelegramMessage | boolean> {
    return this.callApi<TelegramMessage | boolean>('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options.parse_mode,
      reply_markup: options.reply_markup,
      disable_web_page_preview: options.disable_web_page_preview
    });
  }

  /**
   * Tampilkan indikator status chat (typing...)
   */
  public async sendChatAction(chatId: string | number, action: 'typing' | 'upload_document' = 'typing'): Promise<boolean> {
    return this.callApi<boolean>('sendChatAction', {
      chat_id: chatId,
      action
    });
  }

  /**
   * Beri respon ke callback query dari inline button
   */
  public async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert: boolean = false): Promise<boolean> {
    return this.callApi<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert
    });
  }

  /**
   * Ambil info file dari Telegram (termasuk file_path untuk unduhan)
   */
  public async getFile(fileId: string): Promise<{ file_id: string; file_size?: number; file_path?: string }> {
    return this.callApi<{ file_id: string; file_size?: number; file_path?: string }>('getFile', {
      file_id: fileId
    });
  }

  /**
   * Unduh file biner dari server Telegram
   */
  public async downloadFile(filePath: string): Promise<Buffer> {
    if (!this.botToken) {
      throw new Error('TELEGRAM_CLIENT_ERROR: Bot token belum disetel.');
    }
    const fileUrl = `${this.fileBaseUrl}/${filePath}`;
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`TELEGRAM_DOWNLOAD_ERROR: [${response.status}] Gagal mengunduh file ${filePath}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Ambil pembaruan pesan (Long Polling)
   */
  public async getUpdates(offset?: number, timeout: number = 30, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    return this.callApi<TelegramUpdate[]>(
      'getUpdates',
      {
        offset,
        timeout,
        allowed_updates: ['message', 'callback_query']
      },
      signal
    );
  }

  /**
   * Hapus webhook agar mode long-polling getUpdates dapat berjalan tanpa conflict 409
   */
  public async deleteWebhook(dropPendingUpdates: boolean = false): Promise<boolean> {
    return this.callApi<boolean>('deleteWebhook', {
      drop_pending_updates: dropPendingUpdates
    });
  }

  /**
   * Ambil status konfigurasi webhook saat ini dari Telegram Bot API
   */
  public async getWebhookInfo(): Promise<any> {
    return this.callApi<any>('getWebhookInfo');
  }
}
