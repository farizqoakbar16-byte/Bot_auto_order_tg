// ╔══════════════════════════════════════════════════════════════╗
// ║              Zetsy UBot - PHOTO HELPER                       ║
// ║   Mengirim foto + caption blockquote+spoiler di semua cmd    ║
// ╚══════════════════════════════════════════════════════════════╝
'use strict';

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const config = require('../../config.json');

const CACHE_DIR = './downloads/photo_cache';
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// Zetsy: Download foto ke cache lokal
async function fetchPhoto(url) {
  const hash    = Buffer.from(url).toString('base64').replace(/[^a-z0-9]/gi,'').slice(0,20);
  const cached  = path.join(CACHE_DIR, `${hash}.jpg`);

  // Zetsy: Pakai cache kalau ada & belum 1 jam
  if (fs.existsSync(cached)) {
    const age = Date.now() - fs.statSync(cached).mtimeMs;
    if (age < 3600000) return cached;
  }

  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    fs.writeFileSync(cached, res.data);
    return cached;
  } catch (_) {
    // Zetsy: Fallback ke foto default kalau gagal download
    return null;
  }
}

// Zetsy: Kirim pesan dengan foto via BOT TELEGRAM
// ctx = Telegraf context
async function botSendPhoto(ctx, photoKey, caption) {
  const url = config.BOT_PHOTOS?.[photoKey] || config.BOT_PHOTOS?.main;

  try {
    if (url && !url.includes('placeholder')) {
      await ctx.replyWithPhoto(url, {
        caption,
        parse_mode: 'MarkdownV2',
      });
    } else {
      // Zetsy: Fallback teks saja kalau foto belum dikonfigurasi
      await ctx.replyWithMarkdownV2(caption);
    }
  } catch (_) {
    await ctx.replyWithMarkdownV2(caption).catch(() => {});
  }
}

// Zetsy: Kirim pesan dengan foto via USERBOT (gramjs)
// client = TelegramClient, msg = message object
async function ubotSendPhoto(client, msg, photoKey, caption) {
  const url = config.UBOT_PHOTOS?.[photoKey] || config.UBOT_PHOTOS?.main;

  try {
    if (url && !url.includes('placeholder')) {
      const localPath = await fetchPhoto(url);
      if (localPath) {
        await client.sendFile(msg.chatId, {
          file: localPath,
          caption,
          replyTo: msg.id,
        });
        return;
      }
    }
    // Zetsy: Fallback teks saja kalau foto belum dikonfigurasi
    await client.sendMessage(msg.chatId, {
      message: caption,
      replyTo: msg.id,
      parseMode: 'md',
    });
  } catch (_) {
    await client.sendMessage(msg.chatId, {
      message: caption,
      replyTo: msg.id,
      parseMode: 'md',
    }).catch(() => {});
  }
}

// Zetsy: Edit pesan jadi foto (untuk loading → hasil)
async function ubotEditToPhoto(client, msg, chatId, msgId, photoKey, caption) {
  const url = config.UBOT_PHOTOS?.[photoKey] || config.UBOT_PHOTOS?.main;

  // Zetsy: Hapus pesan loading, kirim foto baru
  try {
    await client.deleteMessages(chatId, [msgId], { revoke: true });
  } catch (_) {}

  try {
    if (url && !url.includes('placeholder')) {
      const localPath = await fetchPhoto(url);
      if (localPath) {
        await client.sendFile(chatId, {
          file: localPath,
          caption,
          replyTo: msg.id,
        });
        return;
      }
    }
    await client.sendMessage(chatId, { message: caption, replyTo: msg.id, parseMode: 'md' });
  } catch (_) {
    await client.sendMessage(chatId, { message: caption, replyTo: msg.id, parseMode: 'md' }).catch(() => {});
  }
}

module.exports = { botSendPhoto, ubotSendPhoto, ubotEditToPhoto, fetchPhoto };
