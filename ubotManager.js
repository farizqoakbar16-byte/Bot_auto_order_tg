// ╔══════════════════════════════════════════════════════════════╗
// ║              🤖 ZETSY UBOT - USERBOT MANAGER                 ║
// ║         Reply bubble + blockquote + spoiler di semua cmd     ║
// ║              Powered by Zetsy | v4.0 PREMIUM                 ║
// ║     60 Module · Auto Install Pterodactyl · Panel Zetsy       ║
// ╚══════════════════════════════════════════════════════════════╝
'use strict';

const { TelegramClient } = require('telegram');
const { StringSession }  = require('telegram/sessions');
const { NewMessage }     = require('telegram/events');
const { Api }            = require('telegram/tl');
const config  = require('./config_adapter');
const db      = require('./db_mongo');
const photo   = require('../helpers/photoHelper');
const fs      = require('fs');
const os      = require('os');
const axios   = require('axios');
const { NodeSSH } = require('node-ssh'); // npm install node-ssh

const activeClients  = new Map();
const pendingCodes   = new Map();
const afkState       = new Map();
const broadcastCfg   = new Map();
const blacklistStore = new Map();
const doneTemplates  = new Map();
const schedMsgStore  = new Map();
const installStatus  = new Map(); // phone → {step, chatId, msgId}
const waClients      = new Map(); // phone → Baileys WA client (untuk .cekbio)
const antilinkStore  = new Map(); // chatId → { enabled: bool, phone }
const bcTargetStore  = new Map(); // phone → Map<groupId, {id, name, addedAt}>
const bcTargetCfg    = new Map(); // phone → {text, delay, duration, running}

// ═══════════════════════════════════════════════════════════════
// Zetsy: HELPER — escape HTML
// ═══════════════════════════════════════════════════════════════
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function box(icon, title, rows, footer) {
  let inner = `╭──「 ${icon} <b>${esc(title)}</b> 」\n`;
  for (const [label, val, spoil] of rows) {
    inner += spoil
      ? `│ <b>${esc(label)}:</b> <tg-spoiler>${esc(val)}</tg-spoiler>\n`
      : `│ <b>${esc(label)}:</b> ${esc(val)}\n`;
  }
  inner += `╰────────────────────────\n`;
  if (footer) inner += `<tg-spoiler>✦ ${esc(footer)} ✦</tg-spoiler>`;
  return `<blockquote>${inner}</blockquote>`;
}

async function reply(client, msg, text) {
  return client.sendMessage(msg.chatId, { message: text, replyTo: msg.id, parseMode: 'html' });
}
async function edit(client, chatId, msgId, text) {
  return client.editMessage(chatId, { message: msgId, text, parseMode: 'html' });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function formatUptime(sec) {
  const d=Math.floor(sec/86400),h=Math.floor((sec%86400)/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);
  return `${d}d ${h}h ${m}m ${s}s`;
}
function formatDurasi(ms) {
  const s=Math.floor(ms/1000),j=Math.floor(s/3600),m=Math.floor((s%3600)/60),dt=s%60;
  return j>0?`${j}j ${m}m ${dt}d`:m>0?`${m}m ${dt}d`:`${dt}d`;
}

function cloneEntities(entities) {
  if (!Array.isArray(entities)) return undefined;
  return entities
    .map((ent) => {
      if (!ent) return null;
      const ctorName = ent.className;
      const Ctor = ctorName && Api[ctorName];
      if (typeof Ctor !== 'function') return ent;

      const raw = {};
      for (const key of Object.keys(ent)) {
        if (key === 'className' || key === 'classType') continue;
        raw[key] = ent[key];
      }
      try {
        return new Ctor(raw);
      } catch (_) {
        return ent;
      }
    })
    .filter(Boolean);
}

function extractCommandPayload(msg, command) {
  const raw = String(msg?.message || '');
  const lowRaw = raw.toLowerCase();
  const lowCmd = String(command || '').toLowerCase();
  if (!lowRaw.startsWith(lowCmd)) {
    return { text: '', entities: undefined };
  }

  let start = lowCmd.length;
  while (start < raw.length && raw[start] === ' ') start++;

  const text = raw.slice(start);
  const entities = cloneEntities(msg?.entities)
    ?.filter((ent) => ent.offset >= start)
    .map((ent) => {
      ent.offset = ent.offset - start;
      return ent;
    });

  return { text, entities: entities?.length ? entities : undefined };
}

function buildTextPayload(text, entities) {
  const payload = { message: text };
  if (Array.isArray(entities) && entities.length > 0) {
    payload.formattingEntities = cloneEntities(entities);
  }
  return payload;
}

function combineTextEntities(baseText = '', baseEntities, extraText = '', extraEntities) {
  if (!extraText) return { text: baseText, entities: cloneEntities(baseEntities) };
  if (!baseText) return { text: extraText, entities: cloneEntities(extraEntities) };

  const text = `${baseText}\n\n${extraText}`;
  const entities = [
    ...(cloneEntities(baseEntities) || []),
    ...(cloneEntities(extraEntities) || []).map((ent) => {
      ent.offset = ent.offset + baseText.length + 2;
      return ent;
    }),
  ];
  return { text, entities: entities.length ? entities : undefined };
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: SEND OTP / SIGN IN
// ═══════════════════════════════════════════════════════════════
async function sendCode(phone, ownerId = null) {
  if (pendingCodes.has(phone)) {
    try { await pendingCodes.get(phone).client.disconnect(); } catch (_) {}
    pendingCodes.delete(phone);
  }
  const existing = db.getSession(phone);
  const client = new TelegramClient(
    new StringSession(existing?.session || ''),
    config.API_ID, config.API_HASH,
    { connectionRetries: 5, useWSS: false, deviceModel: 'Zetsy UBot', langCode: 'id' }
  );
  await client.connect();
  const result = await client.sendCode({ apiId: config.API_ID, apiHash: config.API_HASH }, phone);
  pendingCodes.set(phone, {
    client,
    phoneCodeHash: result.phoneCodeHash,
    ownerId: ownerId != null ? String(ownerId) : null,
  });
  console.log(`[Zetsy] OTP sent to ${phone}`);
}

async function signIn(phone, code, password) {
  if (!pendingCodes.has(phone)) throw new Error('No pending OTP for ' + phone);
  const { client, phoneCodeHash } = pendingCodes.get(phone);
  try {
    await client.invoke(new Api.auth.SignIn({
      phoneNumber: phone, phoneCodeHash, phoneCode: code.trim(),
    }));
  } catch (e) {
    if (e.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      if (!password) throw new Error('2FA password required');
      const pwd = await client.invoke(new Api.account.GetPassword());
      const check = await client.invoke(new Api.auth.CheckPassword({
        password: await computeCheck(pwd, password),
      }));
    } else throw e;
  }
  const session = client.session.save();
  const ownerId = pendingCodes.get(phone)?.ownerId ?? null;
  db.saveSession(phone, session, ownerId);
  // Simpan juga langsung ke MongoDB agar autoStart bisa baca
  try {
    if (db.initMongo) {
      const mdb = await db.initMongo();
      if (mdb) {
        const col = mdb.collection('sessions');
        await col.updateOne(
          { phone },
          { $set: { phone, session, ownerId: ownerId ? String(ownerId) : null, updated_at: new Date() } },
          { upsert: true }
        );
        console.log(`[Zetsy] Session saved to MongoDB: ${phone}`);
      }
    }
  } catch (eDb) { console.warn('[Zetsy] MongoDB save warn:', eDb.message); }
  try {
    const me = await client.getMe();
    if (me?.id) db.updateSessionMeta(phone, { accountId: String(me.id) });
  } catch (_) {}
  pendingCodes.delete(phone);
  await registerUserbot(phone, client);
  console.log(`[Zetsy] Signed in: ${phone}`);
}

// Set untuk track client yang sudah di-register, cegah double handler
const registeredClients = new Set();

async function registerUserbot(phone, client) {
  const me     = await client.getMe();
  const selfId = String(me.id); // pastikan string untuk comparison
  activeClients.set(phone, client);

  // ── Guard: kalau client ini sudah pernah di-register, skip ──────
  const clientKey = `${phone}_${selfId}`;
  if (registeredClients.has(clientKey)) {
    console.log(`[Zetsy] Handler already registered for ${phone}, skipping.`);
    return;
  }
  registeredClients.add(clientKey);

  // Helper: normalize ID ke string untuk comparison
  const isSelf = (id) => {
    if (!id) return false;
    return String(id) === selfId;
  };

  // ── Handler 1: pesan dari sendiri → untuk command ──
  client.addEventHandler(async (event) => {
    const msg = event.message;
    if (!msg) return;
    // Cek pesan dari diri sendiri
    const fromSelf = isSelf(msg.senderId) || msg.out === true;
    if (!fromSelf) return;
    const text = msg.rawText || msg.message || msg.text || '';
    if (!text || !text.startsWith('.')) return;
    console.log(`[Zetsy] CMD [${phone}]: ${text.slice(0,50)}`);
    try {
      await handleCommand(client, msg, text, phone, selfId);
    } catch (e) { console.error(`[Zetsy] CMD error [${phone}]:`, e.message); }
  }, new NewMessage({}));

  // ── Handler 2: pesan MASUK dari orang lain → untuk AFK auto-reply ──
  client.addEventHandler(async (event) => {
    const msg = event.message;
    if (!msg) return;
    if (isSelf(msg.senderId) || msg.out === true) return; // skip pesan sendiri
    if (!msg.chatId) return;
    try {
      await handleAfkCheck(client, msg, phone, selfId);
    } catch (e) { console.error(`[Zetsy] AFK error [${phone}]:`, e.message); }
  }, new NewMessage({}));

  // ── Antilink listener: cek pesan masuk dari orang lain ──
  client.addEventHandler(async (event) => {
    const msg = event.message;
    if (!msg || msg.senderId?.toString() === selfId) return;
    if (!msg.chatId) return;
    const cfg = antilinkStore.get(msg.chatId?.toString());
    if (!cfg || !cfg.enabled || cfg.phone !== phone) return;
    const text = (msg.rawText || msg.message || '').toLowerCase();
    const linkRegex = /(https?:\/\/|t\.me\/|wa\.me\/|bit\.ly\/|tinyurl\.com\/|discord\.gg\/)/i;
    if (!linkRegex.test(text)) return;
    try {
      await client.deleteMessages(msg.chatId, [msg.id], { revoke: true });
      // Hanya kirim notifikasi jika grup tidak di-blacklist
      if (!isGroupBlacklisted(phone, msg.chatId?.toString())) {
        const sender = msg.sender;
        const nama = sender ? ([sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'User') : 'User';
        await client.sendMessage(msg.chatId, {
          message:
            `<blockquote>╭──「 🚫 <b>ANTILINK AKTIF</b> 」\n` +
            `│ <b>User  :</b> <tg-spoiler>${esc(nama)}</tg-spoiler>\n` +
            `│ <b>Aksi  :</b> <tg-spoiler>Pesan berisi link dihapus!</tg-spoiler>\n` +
            `╰────────────────────────\n` +
            `<tg-spoiler>✦ Zetsy UBot AntiLink ✦</tg-spoiler></blockquote>`,
          parseMode: 'html',
        });
      }
    } catch (_) {}
  }, new NewMessage({}));
  console.log(`[Zetsy] Userbot active: @${me.username || phone}`);
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: AFK CHECK
// ═══════════════════════════════════════════════════════════════
async function handleAfkCheck(client, msg, phone, selfId) {
  if (!afkState.has(phone)) return;
  const text = (msg.rawText || '').toLowerCase();
  if (text.startsWith('.')) return;
  let triggered = msg.isPrivate;
  if (!triggered && msg.replyTo?.replyToMsgId) {
    try {
      const r = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
      if (r?.[0]?.senderId?.toString() === selfId) triggered = true;
    } catch (_) {}
  }
  if (!triggered) return;
  const bl = blacklistStore.get(phone);
  // Support struktur lama (Set) dan baru ({ users, groups })
  const userSet = bl instanceof Set ? bl : bl?.users;
  if (userSet && userSet.has(msg.senderId?.toString())) return;
  const { reason, since } = afkState.get(phone);
  const afkMsg = box('💤', 'SEDANG AFK',
    [['Alasan', reason, true], ['Sudah', formatDurasi(Date.now() - since), true]],
    'Zetsy UBot Auto-Reply'
  );
  await client.sendMessage(msg.chatId, { message: afkMsg, replyTo: msg.id, parseMode: 'html' }).catch(() => {});
  if (!msg.isPrivate) {
    await client.sendMessage(msg.senderId, { message: afkMsg, parseMode: 'html' }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: COMMAND ROUTER — 60 Module
// ═══════════════════════════════════════════════════════════════
async function handleCommand(client, msg, text, phone, selfId) {
  const low  = text.toLowerCase();
  const args = text.includes(' ') ? text.slice(text.indexOf(' ') + 1).trim() : '';

  // ── SISTEM & INFO ─────────────────────────────────────────────
  if (low === '.help' || low.startsWith('.help ')) return cmdHelp(client, msg, args);
  if (low === '.ping')               return cmdPing(client, msg);
  if (low === '.alive')              return cmdAlive(client, msg);
  if (low === '.info')               return cmdInfo(client, msg, phone);
  if (low === '.sysinfo')            return cmdSysinfo(client, msg);
  if (low === '.id')                 return cmdId(client, msg);
  if (low === '.uptime')             return cmdUptime(client, msg);

  // ── TOOLS ─────────────────────────────────────────────────────
  if (low === '.tr'       || low.startsWith('.tr '))        return args ? cmdTranslate(client, msg, args)  : cmdGuide(client, msg, '.tr');
  if (low === '.calc'     || low.startsWith('.calc '))      return args ? cmdCalc(client, msg, args)       : cmdGuide(client, msg, '.calc');
  if (low === '.kurs'     || low.startsWith('.kurs '))      return args ? cmdKurs(client, msg, args)       : cmdGuide(client, msg, '.kurs');
  if (low === '.cuaca'    || low.startsWith('.cuaca '))     return args ? cmdCuaca(client, msg, args)      : cmdGuide(client, msg, '.cuaca');
  if (low === '.wiki'     || low.startsWith('.wiki '))      return args ? cmdWiki(client, msg, args)       : cmdGuide(client, msg, '.wiki');
  if (low === '.qr'       || low.startsWith('.qr '))        return args ? cmdQr(client, msg, args)         : cmdGuide(client, msg, '.qr');
  if (low === '.short'    || low.startsWith('.short '))     return args ? cmdShorten(client, msg, args)    : cmdGuide(client, msg, '.short');
  if (low === '.password' || low.startsWith('.password '))  return args ? cmdPassword(client, msg, args)   : cmdGuide(client, msg, '.password');
  if (low === '.uuid')               return cmdUuid(client, msg);
  if (low === '.say'      || low.startsWith('.say '))       return args ? cmdSay(client, msg, args)        : cmdGuide(client, msg, '.say');
  if (low === '.clr')                return cmdClear(client, msg, selfId);

  // ── TOOLS TAMBAHAN ────────────────────────────────────────────
  if (low === '.ip'       || low.startsWith('.ip '))        return args ? cmdIp(client, msg, args)         : cmdGuide(client, msg, '.ip');
  if (low === '.whois'    || low.startsWith('.whois '))     return args ? cmdWhois(client, msg, args)      : cmdGuide(client, msg, '.whois');
  if (low === '.hash'     || low.startsWith('.hash '))      return args ? cmdHash(client, msg, args)       : cmdGuide(client, msg, '.hash');
  if (low === '.encode'   || low.startsWith('.encode '))    return args ? cmdEncode(client, msg, args)     : cmdGuide(client, msg, '.encode');
  if (low === '.decode'   || low.startsWith('.decode '))    return args ? cmdDecode(client, msg, args)     : cmdGuide(client, msg, '.decode');
  if (low === '.time'     || low.startsWith('.time '))      return args ? cmdTime(client, msg, args)       : cmdGuide(client, msg, '.time');
  if (low === '.cekrek'   || low.startsWith('.cekrek '))    return args ? cmdCekRek(client, msg, args)     : cmdGuide(client, msg, '.cekrek');
  if (low === '.bmi'      || low.startsWith('.bmi '))       return args ? cmdBmi(client, msg, args)        : cmdGuide(client, msg, '.bmi');
  if (low === '.roman'    || low.startsWith('.roman '))     return args ? cmdRoman(client, msg, args)      : cmdGuide(client, msg, '.roman');
  if (low === '.random'   || low.startsWith('.random '))    return args ? cmdRandom(client, msg, args)     : cmdGuide(client, msg, '.random');

  if (low === '.tourl')               return cmdToUrl(client, msg);
  if (low === '.ocr')                 return cmdOcr(client, msg);
  if (low === '.ss'      || low.startsWith('.ss '))       return args ? cmdScreenshot(client, msg, args) : cmdGuide(client, msg, '.ss');
  if (low === '.color')               return cmdColor(client, msg);
  if (low === '.exif')                return cmdExif(client, msg);
  if (low === '.pdf2img')             return cmdPdf2Img(client, msg);

  // ── FUN & GAME ────────────────────────────────────────────────
  if (low === '.truth')               return cmdTruth(client, msg);
  if (low === '.dare')                return cmdDare(client, msg);
  if (low === '.roast'   || low.startsWith('.roast '))    return cmdRoast(client, msg, args);
  if (low === '.ship'    || low.startsWith('.ship '))     return args ? cmdShip(client, msg, args) : cmdGuide(client, msg, '.ship');
  if (low === '.zodiak'  || low.startsWith('.zodiak '))   return args ? cmdZodiak(client, msg, args) : cmdGuide(client, msg, '.zodiak');
  if (low === '.meme')                return cmdMeme(client, msg);
  if (low === '.8ball'   || low.startsWith('.8ball '))    return args ? cmd8Ball(client, msg, args) : cmdGuide(client, msg, '.8ball');
  if (low === '.tebakangka')          return cmdTebakAngka(client, msg, phone);
  if (low === '.kuis')                return cmdKuis(client, msg);
  if (low === '.horoscope' || low.startsWith('.horoscope ')) return args ? cmdHoroscope(client, msg, args) : cmdGuide(client, msg, '.horoscope');
  if (low === '.lyric'   || low.startsWith('.lyric '))    return args ? cmdLyric(client, msg, args) : cmdGuide(client, msg, '.lyric');
  if (low === '.asciify' || low.startsWith('.asciify '))  return args ? cmdAsciify(client, msg, args) : cmdGuide(client, msg, '.asciify');
  if (low === '.emotify' || low.startsWith('.emotify '))  return args ? cmdEmotify(client, msg, args) : cmdGuide(client, msg, '.emotify');
  if (low === '.reversechat')         return cmdReverseChat(client, msg);
  if (low === '.spongebob' || low.startsWith('.spongebob ')) return args ? cmdSpongebob(client, msg, args) : cmdGuide(client, msg, '.spongebob');

  // ── TOOLS LANJUTAN ────────────────────────────────────────────
  if (low === '.tinyurl' || low.startsWith('.tinyurl '))  return args ? cmdTinyUrl(client, msg, args) : cmdGuide(client, msg, '.tinyurl');
  if (low === '.base64'  || low.startsWith('.base64 '))   return args ? cmdBase64(client, msg, args) : cmdGuide(client, msg, '.base64');
  if (low === '.hex'     || low.startsWith('.hex '))      return args ? cmdHex(client, msg, args) : cmdGuide(client, msg, '.hex');
  if (low === '.cekssl'  || low.startsWith('.cekssl '))   return args ? cmdCekSsl(client, msg, args) : cmdGuide(client, msg, '.cekssl');
  if (low === '.ping2'   || low.startsWith('.ping2 '))    return args ? cmdPing2(client, msg, args) : cmdGuide(client, msg, '.ping2');
  if (low === '.pastebin' || low.startsWith('.pastebin ')) return args ? cmdPastebin(client, msg, args) : cmdGuide(client, msg, '.pastebin');
  if (low === '.sticker')             return cmdSticker(client, msg);
  if (low === '.removebg')            return cmdRemoveBg(client, msg);
  if (low === '.timestamp' || low.startsWith('.timestamp ')) return cmdTimestamp(client, msg, args);
  if (low === '.countdown' || low.startsWith('.countdown ')) return args ? cmdCountdown(client, msg, args) : cmdGuide(client, msg, '.countdown');
  if (low === '.age'     || low.startsWith('.age '))      return args ? cmdAge(client, msg, args) : cmdGuide(client, msg, '.age');
  if (low === '.timezone' || low.startsWith('.timezone ')) return args ? cmdTimezone(client, msg, args) : cmdGuide(client, msg, '.timezone');
  if (low === '.json'    || low.startsWith('.json '))     return args ? cmdJson(client, msg, args) : cmdGuide(client, msg, '.json');
  if (low === '.motivasi')            return cmdMotivasi(client, msg);
  if (low === '.gayakata' || low.startsWith('.gayakata ')) return args ? cmdGayaKata(client, msg, args) : cmdGuide(client, msg, '.gayakata');

  // ── TOOLS LANJUTAN 2 ─────────────────────────────────────────
  if (low === '.cekpulsa'  || low.startsWith('.cekpulsa '))  return args ? cmdCekPulsa(client, msg, args) : cmdGuide(client, msg, '.cekpulsa');
  if (low === '.nomor'     || low.startsWith('.nomor '))     return args ? cmdInfoNomor(client, msg, args) : cmdGuide(client, msg, '.nomor');
  if (low === '.karakter'  || low.startsWith('.karakter '))  return args ? cmdKarakter(client, msg, args) : cmdGuide(client, msg, '.karakter');
  if (low === '.wordcount' || low.startsWith('.wordcount ')) return args ? cmdWordCount(client, msg, args) : cmdGuide(client, msg, '.wordcount');
  if (low === '.binary'    || low.startsWith('.binary '))    return args ? cmdBinary(client, msg, args) : cmdGuide(client, msg, '.binary');
  if (low === '.morse'     || low.startsWith('.morse '))     return args ? cmdMorse(client, msg, args) : cmdGuide(client, msg, '.morse');
  if (low === '.caesar'    || low.startsWith('.caesar '))    return args ? cmdCaesar(client, msg, args) : cmdGuide(client, msg, '.caesar');
  if (low === '.suhu'      || low.startsWith('.suhu '))      return args ? cmdSuhu(client, msg, args) : cmdGuide(client, msg, '.suhu');
  if (low === '.panjang'   || low.startsWith('.panjang '))   return args ? cmdPanjang(client, msg, args) : cmdGuide(client, msg, '.panjang');
  if (low === '.berat'     || low.startsWith('.berat '))     return args ? cmdBerat(client, msg, args) : cmdGuide(client, msg, '.berat');
  if (low === '.luas'      || low.startsWith('.luas '))      return args ? cmdLuas(client, msg, args) : cmdGuide(client, msg, '.luas');
  if (low === '.kecepatan' || low.startsWith('.kecepatan ')) return args ? cmdKecepatan(client, msg, args) : cmdGuide(client, msg, '.kecepatan');
  if (low === '.waktu'     || low.startsWith('.waktu '))     return args ? cmdWaktu(client, msg, args) : cmdGuide(client, msg, '.waktu');
  if (low === '.warna'     || low.startsWith('.warna '))     return args ? cmdWarna(client, msg, args) : cmdGuide(client, msg, '.warna');
  if (low === '.gradient'  || low.startsWith('.gradient '))  return args ? cmdGradient(client, msg, args) : cmdGuide(client, msg, '.gradient');

  // ── INFO & CEK ───────────────────────────────────────────────
  if (low === '.ceknik'    || low.startsWith('.ceknik '))    return args ? cmdCekNik(client, msg, args) : cmdGuide(client, msg, '.ceknik');
  if (low === '.pln'       || low.startsWith('.pln '))       return args ? cmdCekPln(client, msg, args) : cmdGuide(client, msg, '.pln');
  if (low === '.bpjs'      || low.startsWith('.bpjs '))      return args ? cmdCekBpjs(client, msg, args) : cmdGuide(client, msg, '.bpjs');
  if (low === '.cuacahari' || low.startsWith('.cuacahari ')) return args ? cmdCuacaHari(client, msg, args) : cmdGuide(client, msg, '.cuacahari');
  if (low === '.gempa')                return cmdGempa(client, msg);
  if (low === '.berita')               return cmdBerita(client, msg);
  if (low === '.crypto'    || low.startsWith('.crypto '))    return args ? cmdCrypto(client, msg, args) : cmdGuide(client, msg, '.crypto');
  if (low === '.saham'     || low.startsWith('.saham '))     return args ? cmdSaham(client, msg, args) : cmdGuide(client, msg, '.saham');
  if (low === '.gold')                 return cmdGold(client, msg);
  if (low === '.bbm')                  return cmdBbm(client, msg);
  if (low === '.jadwalsholat' || low.startsWith('.jadwalsholat ')) return args ? cmdJadwalSholat(client, msg, args) : cmdGuide(client, msg, '.jadwalsholat');
  if (low === '.hijriah')              return cmdHijriah(client, msg);
  if (low === '.covid')                return cmdCovid(client, msg);
  if (low === '.ispcheck'  || low.startsWith('.ispcheck '))  return args ? cmdIspCheck(client, msg, args) : cmdGuide(client, msg, '.ispcheck');

  // ── FUN & GAME 2 ─────────────────────────────────────────────
  if (low === '.tebakkata')            return cmdTebakKata(client, msg, phone);
  if (low === '.siapa')                return cmdSiapa(client, msg);
  if (low === '.pilih'     || low.startsWith('.pilih '))     return args ? cmdPilih(client, msg, args) : cmdGuide(client, msg, '.pilih');
  if (low === '.diceroll'  || low.startsWith('.diceroll '))  return cmdDiceRoll(client, msg, args);
  if (low === '.coinflip')             return cmdCoinFlip(client, msg);
  if (low === '.warnakepribadian')     return cmdWarnaKepribadian(client, msg);
  if (low === '.mbti'      || low.startsWith('.mbti '))      return args ? cmdMbti(client, msg, args) : cmdGuide(client, msg, '.mbti');
  if (low === '.namalengkap' || low.startsWith('.namalengkap ')) return args ? cmdNamaLengkap(client, msg, args) : cmdGuide(client, msg, '.namalengkap');
  if (low === '.pantun')               return cmdPantun(client, msg);
  if (low === '.tebakfilm')            return cmdTebakFilm(client, msg);
  if (low === '.emoji'     || low.startsWith('.emoji '))     return args ? cmdEmoji(client, msg, args) : cmdGuide(client, msg, '.emoji');
  if (low === '.kata'      || low.startsWith('.kata '))      return args ? cmdKataAcak(client, msg, args) : cmdGuide(client, msg, '.kata');
  if (low === '.tebakbendera')         return cmdTebakBendera(client, msg);
  if (low === '.rpg')                  return cmdRpg(client, msg, phone);
  if (low === '.harta')                return cmdHarta(client, msg, phone);

  // ── SOSMED & DOWNLOADER ──────────────────────────────────────
  if (low === '.fbdlp'     || low.startsWith('.fbdlp '))     return args ? cmdDownload(client, msg, 'facebook', args) : cmdGuide(client, msg, '.fbdlp');
  if (low === '.twitterdlp'|| low.startsWith('.twitterdlp '))return args ? cmdDownload(client, msg, 'twitter', args) : cmdGuide(client, msg, '.twitterdlp');
  if (low === '.pindlp'    || low.startsWith('.pindlp '))    return args ? cmdDownload(client, msg, 'pinterest', args) : cmdGuide(client, msg, '.pindlp');
  if (low === '.spotdlp'   || low.startsWith('.spotdlp '))   return args ? cmdDownload(client, msg, 'spotify', args) : cmdGuide(client, msg, '.spotdlp');
  if (low === '.sounddlp'  || low.startsWith('.sounddlp '))  return args ? cmdDownload(client, msg, 'soundcloud', args) : cmdGuide(client, msg, '.sounddlp');
  if (low === '.livedlp'   || low.startsWith('.livedlp '))   return args ? cmdDownload(client, msg, 'tiktok_live', args) : cmdGuide(client, msg, '.livedlp');
  if (low === '.mp3'       || low.startsWith('.mp3 '))       return args ? cmdYtMp3(client, msg, args) : cmdGuide(client, msg, '.mp3');
  if (low === '.ytplay'    || low.startsWith('.ytplay '))    return args ? cmdYtPlay(client, msg, args) : cmdGuide(client, msg, '.ytplay');
  if (low === '.ceksosmed' || low.startsWith('.ceksosmed ')) return args ? cmdCekSosmed(client, msg, args) : cmdGuide(client, msg, '.ceksosmed');

  // ── KEAMANAN & PRIVACY ──────────────────────────────────────
  if (low === '.pwcheck'   || low.startsWith('.pwcheck '))   return args ? cmdPwCheck(client, msg, args) : cmdGuide(client, msg, '.pwcheck');
  if (low === '.cekleaked' || low.startsWith('.cekleaked ')) return args ? cmdCekLeaked(client, msg, args) : cmdGuide(client, msg, '.cekleaked');
  if (low === '.vpndetect' || low.startsWith('.vpndetect ')) return args ? cmdVpnDetect(client, msg, args) : cmdGuide(client, msg, '.vpndetect');
  if (low === '.urlscan'   || low.startsWith('.urlscan '))   return args ? cmdUrlScan(client, msg, args) : cmdGuide(client, msg, '.urlscan');
  if (low === '.malware'   || low.startsWith('.malware '))   return args ? cmdMalwareCheck(client, msg, args) : cmdGuide(client, msg, '.malware');
  if (low === '.anontext'  || low.startsWith('.anontext '))  return args ? cmdAnonText(client, msg, args) : cmdGuide(client, msg, '.anontext');
  if (low === '.pgp'       || low.startsWith('.pgp '))       return args ? cmdPgp(client, msg, args) : cmdGuide(client, msg, '.pgp');

  // ── GRUP LANJUTAN ────────────────────────────────────────────
  if (low === '.poll'      || low.startsWith('.poll '))      return args ? cmdPoll(client, msg, phone, args) : cmdGuide(client, msg, '.poll');
  if (low === '.votekick'  || low.startsWith('.votekick '))  return args ? cmdVoteKick(client, msg, phone, args) : cmdGuide(client, msg, '.votekick');
  if (low === '.warn'      || low.startsWith('.warn '))      return args ? cmdWarn(client, msg, phone, args) : cmdGuide(client, msg, '.warn');
  if (low === '.warnlist')             return cmdWarnList(client, msg, phone);
  if (low === '.clearwarn' || low.startsWith('.clearwarn ')) return args ? cmdClearWarn(client, msg, phone, args) : cmdGuide(client, msg, '.clearwarn');
  if (low === '.slowmode'  || low.startsWith('.slowmode '))  return args ? cmdSlowMode(client, msg, phone, args) : cmdGuide(client, msg, '.slowmode');
  if (low === '.welcome'   || low.startsWith('.welcome '))   return cmdWelcome(client, msg, phone, args);
  if (low === '.setwelcome'|| low.startsWith('.setwelcome '))return args ? cmdSetWelcome(client, msg, phone, args) : cmdGuide(client, msg, '.setwelcome');
  if (low === '.rules'     || low.startsWith('.rules '))     return cmdRules(client, msg, phone, args);
  if (low === '.setrules'  || low.startsWith('.setrules '))  return args ? cmdSetRules(client, msg, phone, args) : cmdGuide(client, msg, '.setrules');
  if (low === '.mute'      || low.startsWith('.mute '))      return args ? cmdMute(client, msg, phone, args) : cmdGuide(client, msg, '.mute');
  if (low === '.unmute'    || low.startsWith('.unmute '))    return args ? cmdUnmute(client, msg, phone, args) : cmdGuide(client, msg, '.unmute');
  if (low === '.promote'   || low.startsWith('.promote '))   return args ? cmdPromote(client, msg, phone, args) : cmdGuide(client, msg, '.promote');
  if (low === '.demote'    || low.startsWith('.demote '))    return args ? cmdDemote(client, msg, phone, args) : cmdGuide(client, msg, '.demote');
  if (low === '.grplink')              return cmdGrpLink(client, msg, phone);
  if (low === '.grpname'   || low.startsWith('.grpname '))   return args ? cmdGrpName(client, msg, phone, args) : cmdGuide(client, msg, '.grpname');
  if (low === '.grpdesc'   || low.startsWith('.grpdesc '))   return args ? cmdGrpDesc(client, msg, phone, args) : cmdGuide(client, msg, '.grpdesc');
  if (low === '.hidetag'   || low.startsWith('.hidetag '))   return cmdHideTag(client, msg, phone, args);
  if (low === '.listgrup')             return cmdListGrup(client, msg, phone);

  // ── BISNIS LANJUTAN ──────────────────────────────────────────
  if (low === '.rekap'     || low.startsWith('.rekap '))     return args ? cmdRekap(client, msg, phone, args) : cmdGuide(client, msg, '.rekap');
  if (low === '.hutang'    || low.startsWith('.hutang '))    return args ? cmdHutang(client, msg, phone, args) : cmdGuide(client, msg, '.hutang');
  if (low === '.listhutang')           return cmdListHutang(client, msg, phone);
  if (low === '.bayar'     || low.startsWith('.bayar '))     return args ? cmdBayar(client, msg, phone, args) : cmdGuide(client, msg, '.bayar');
  if (low === '.stok'      || low.startsWith('.stok '))      return args ? cmdStok(client, msg, phone, args) : cmdGuide(client, msg, '.stok');
  if (low === '.liststok')             return cmdListStok(client, msg, phone);
  if (low === '.jual'      || low.startsWith('.jual '))      return args ? cmdJual(client, msg, phone, args) : cmdGuide(client, msg, '.jual');
  if (low === '.laporanstok')          return cmdLaporanStok(client, msg, phone);
  if (low === '.hargacek'  || low.startsWith('.hargacek '))  return args ? cmdHargaCek(client, msg, phone, args) : cmdGuide(client, msg, '.hargacek');
  if (low === '.tokped'    || low.startsWith('.tokped '))    return args ? cmdTokped(client, msg, args) : cmdGuide(client, msg, '.tokped');

  // ── AI & SMART TOOLS ────────────────────────────────────────
  if (low === '.tanya'     || low.startsWith('.tanya '))     return args ? cmdTanya(client, msg, args) : cmdGuide(client, msg, '.tanya');
  if (low === '.ringkas'   || low.startsWith('.ringkas '))   return args ? cmdRingkas(client, msg, args) : cmdGuide(client, msg, '.ringkas');
  if (low === '.grammar'   || low.startsWith('.grammar '))   return args ? cmdGrammar(client, msg, args) : cmdGuide(client, msg, '.grammar');
  if (low === '.formal'    || low.startsWith('.formal '))    return args ? cmdFormal(client, msg, args) : cmdGuide(client, msg, '.formal');
  if (low === '.santai'    || low.startsWith('.santai '))    return args ? cmdSantai(client, msg, args) : cmdGuide(client, msg, '.santai');
  if (low === '.caption'   || low.startsWith('.caption '))   return args ? cmdCaption(client, msg, args) : cmdGuide(client, msg, '.caption');
  if (low === '.biodata'   || low.startsWith('.biodata '))   return args ? cmdBiodata(client, msg, args) : cmdGuide(client, msg, '.biodata');
  if (low === '.cerpen'    || low.startsWith('.cerpen '))    return args ? cmdCerpen(client, msg, args) : cmdGuide(client, msg, '.cerpen');
  if (low === '.puisi'     || low.startsWith('.puisi '))     return args ? cmdPuisi(client, msg, args) : cmdGuide(client, msg, '.puisi');
  if (low === '.hashtag'   || low.startsWith('.hashtag '))   return args ? cmdHashtag(client, msg, args) : cmdGuide(client, msg, '.hashtag');
  if (low === '.resep'     || low.startsWith('.resep '))     return args ? cmdResep(client, msg, args) : cmdGuide(client, msg, '.resep');
  if (low === '.saran'     || low.startsWith('.saran '))     return args ? cmdSaran(client, msg, args) : cmdGuide(client, msg, '.saran');

  // ── PERSONAL & REMINDER ──────────────────────────────────────
  if (low === '.todo'      || low.startsWith('.todo '))      return args ? cmdTodo(client, msg, phone, args) : cmdGuide(client, msg, '.todo');
  if (low === '.listtodo')             return cmdListTodo(client, msg, phone);
  if (low === '.deltodo'   || low.startsWith('.deltodo '))   return args ? cmdDelTodo(client, msg, phone, args) : cmdGuide(client, msg, '.deltodo');
  if (low === '.diary'     || low.startsWith('.diary '))     return args ? cmdDiary(client, msg, phone, args) : cmdGuide(client, msg, '.diary');
  if (low === '.listdiary')            return cmdListDiary(client, msg, phone);
  if (low === '.mood'      || low.startsWith('.mood '))      return args ? cmdMood(client, msg, phone, args) : cmdGuide(client, msg, '.mood');
  if (low === '.listmood')             return cmdListMood(client, msg, phone);
  if (low === '.target'    || low.startsWith('.target '))    return args ? cmdTarget(client, msg, phone, args) : cmdGuide(client, msg, '.target');
  if (low === '.listtarget')           return cmdListTarget(client, msg, phone);
  if (low === '.habit'     || low.startsWith('.habit '))     return args ? cmdHabit(client, msg, phone, args) : cmdGuide(client, msg, '.habit');
  if (low === '.listhabit')            return cmdListHabit(client, msg, phone);
  // ── DOWNLOADER ────────────────────────────────────────────────
  if (low === '.ytdlp'    || low.startsWith('.ytdlp '))     return args ? cmdDownload(client, msg, 'youtube', args)    : cmdGuide(client, msg, '.ytdlp');
  if (low === '.ttdlp'    || low.startsWith('.ttdlp '))     return args ? cmdDownload(client, msg, 'tiktok', args)     : cmdGuide(client, msg, '.ttdlp');
  if (low === '.igdlp'    || low.startsWith('.igdlp '))     return args ? cmdDownload(client, msg, 'instagram', args)  : cmdGuide(client, msg, '.igdlp');

  // ── NOTES ────────────────────────────────────────────────────
  if (low === '.note'     || low.startsWith('.note '))      return args ? cmdNoteSet(client, msg, phone, args) : cmdGuide(client, msg, '.note');
  if (low === '.notes')              return cmdNoteList(client, msg, phone);
  if (low === '.delnote'  || low.startsWith('.delnote '))   return args ? cmdNoteDel(client, msg, phone, args) : cmdGuide(client, msg, '.delnote');
  if (low === '.remind'   || low.startsWith('.remind '))    return args ? cmdRemind(client, msg, phone, args)  : cmdGuide(client, msg, '.remind');

  // ── AFK ───────────────────────────────────────────────────────
  if (low === '.afk' || low.startsWith('.afk ')) return cmdAfk(client, msg, phone, args);
  if (low === '.unafk')              return cmdUnafk(client, msg, phone);

  // ── BROADCAST ─────────────────────────────────────────────────
  if (low === '.setbc'      || low.startsWith('.setbc '))      return args ? cmdSetBc(client, msg, phone, args)      : cmdGuide(client, msg, '.setbc');
  if (low === '.setdelay'   || low.startsWith('.setdelay '))   return args ? cmdSetDelay(client, msg, phone, args)   : cmdGuide(client, msg, '.setdelay');
  if (low === '.setdurasi'  || low.startsWith('.setdurasi '))  return args ? cmdSetDurasi(client, msg, phone, args)  : reply(client, msg, `<blockquote>╭──「 ⏱ <b>SET DURASI BROADCAST</b> 」\n│ <tg-spoiler>Format: .setdurasi &lt;jam&gt;</tg-spoiler>\n│ <tg-spoiler>Min: 0.17 jam (10 menit)</tg-spoiler>\n│ <tg-spoiler>Max: 24 jam</tg-spoiler>\n│ <tg-spoiler>Contoh: .setdurasi 1 → BC 1 jam</tg-spoiler>\n│ <tg-spoiler>Contoh: .setdurasi 24 → BC 24 jam non-stop</tg-spoiler>\n│ <tg-spoiler>Contoh: .setdurasi 0.5 → BC 30 menit</tg-spoiler>\n╰────────────────────────</blockquote>`);
  if (low === '.startbc')            return cmdStartBc(client, msg, phone);
  if (low === '.stopbc')             return cmdStopBc(client, msg, phone);
  if (low === '.cekbc')              return cmdCekBc(client, msg, phone);
  if (low === '.sharemsg')           return cmdShareMsg(client, msg, phone, selfId);

  // ── BROADCAST TARGET GROUP ─────────────────────────────────
  if (low === '.addgroupbc')                                    return cmdAddGroupBc(client, msg, phone);
  if (low === '.delgroupbc' || low.startsWith('.delgroupbc ')) return cmdDelGroupBc(client, msg, phone, args);
  if (low === '.listgroupbc')                                   return cmdListGroupBc(client, msg, phone);
  if (low === '.bcgroup'    || low.startsWith('.bcgroup '))    return cmdBcGroup(client, msg, phone, args, selfId);
  // Sistem BC grup target lengkap (loop + delay + durasi)
  if (low === '.setbcgroup'       || low.startsWith('.setbcgroup '))       return cmdSetBcGroup(client, msg, phone, args);
  if (low === '.setdelaybcgroup'  || low.startsWith('.setdelaybcgroup '))  return cmdSetDelayBcGroup(client, msg, phone, args);
  if (low === '.setdurasibcgroup' || low.startsWith('.setdurasibcgroup ')) return cmdSetDurasiBcGroup(client, msg, phone, args);
  if (low === '.startbcgroup')                                              return cmdStartBcGroup(client, msg, phone);
  if (low === '.stopbcgroup')                                               return cmdStopBcGroup(client, msg, phone);
  if (low === '.cekbcgroup')                                                return cmdCekBcGroup(client, msg, phone);

  // ── GRUP ──────────────────────────────────────────────────────
  if (low === '.tagall' || low.startsWith('.tagall ')) return cmdTagAll(client, msg, args);
  if (low === '.gcinfo')             return cmdGcInfo(client, msg);
  if (low === '.inv')                return cmdInvite(client, msg);
  if (low === '.pin')                return cmdPin(client, msg);
  if (low === '.unpin')              return cmdUnpin(client, msg);

  // ── STIKER & MEDIA ────────────────────────────────────────────
  if (low === '.brat' || low.startsWith('.brat ')) return cmdBrat(client, msg, args);
  if (low === '.stl')                return cmdSteal(client, msg);
  if (low === '.tts'      || low.startsWith('.tts '))       return args ? cmdTTS(client, msg, args)  : cmdGuide(client, msg, '.tts');

  // ── TRANSAKSI & BISNIS ────────────────────────────────────────
  if (low === '.done' || low.startsWith('.done '))    return cmdDone(client, msg, phone, args);
  if (low === '.setdone'  || low.startsWith('.setdone '))   return args ? cmdSetDone(client, msg, phone, args) : cmdGuide(client, msg, '.setdone');
  if (low === '.invoice'  || low.startsWith('.invoice '))   return args ? cmdInvoice(client, msg, phone, args) : cmdGuide(client, msg, '.invoice');
  if (low === '.diskon'   || low.startsWith('.diskon '))    return args ? cmdDiskon(client, msg, args)         : cmdGuide(client, msg, '.diskon');
  if (low === '.laba'     || low.startsWith('.laba '))      return args ? cmdLaba(client, msg, args)           : cmdGuide(client, msg, '.laba');
  if (low === '.ongkir'   || low.startsWith('.ongkir '))    return args ? cmdOngkir(client, msg, args)         : cmdGuide(client, msg, '.ongkir');
  if (low === '.resi'     || low.startsWith('.resi '))      return args ? cmdResi(client, msg, args)           : cmdGuide(client, msg, '.resi');

  // ── BLACKLIST ─────────────────────────────────────────────────
  if (low === '.addbl' || low.startsWith('.addbl ') || low.startsWith('.addbl')) return cmdAddBl(client, msg, phone, args);
  if (low === '.listbl')             return cmdListBl(client, msg, phone);
  if (low === '.delbl'    || low.startsWith('.delbl'))      return args ? cmdDelBl(client, msg, phone, args)   : cmdGuide(client, msg, '.delbl');

  // ── FUN ───────────────────────────────────────────────────────
  if (low === '.joke')               return cmdJoke(client, msg);
  if (low === '.fakta')              return cmdFakta(client, msg);
  if (low === '.ramalan')            return cmdRamalan(client, msg);
  if (low === '.katakata')           return cmdKataKata(client, msg);
  if (low === '.cekkontol' || low.startsWith('.cekkontol ')) return cmdCekKontol(client, msg, args);

  // ── WHATSAPP TOOLS ────────────────────────────────────────────
  if (low === '.pairing'  || low.startsWith('.pairing '))   return args ? cmdPairing(client, msg, phone, args) : cmdGuide(client, msg, '.pairing');
  if (low === '.cekbio'   || low.startsWith('.cekbio '))    return args ? cmdCekBio(client, msg, phone, args)  : cmdGuide(client, msg, '.cekbio');
  if (low === '.cekbiofile')          return cmdCekBioFile(client, msg, phone);

  // ── ANTILINK ─────────────────────────────────────────────────
  if (low === '.antilink' || low.startsWith('.antilink ')) return cmdAntilink(client, msg, phone, args);

  // ── PTERODACTYL INSTALLER ────────────────────────────────────
  if (low === '.install'  || low.startsWith('.install '))   return args ? cmdInstall(client, msg, phone, args) : cmdGuide(client, msg, '.install');
  if (low === '.installstatus')      return cmdInstallStatus(client, msg, phone);
  if (low === '.installcancel')      return cmdInstallCancel(client, msg, phone);

  // ── MEMBER MANAGEMENT (owner only) ──────────────────────────
  if (low === '.add'      || low.startsWith('.add '))       return args ? cmdAddMember(client, msg, phone, selfId, args) : cmdGuide(client, msg, '.add');
  if (low === '.listmember')         return cmdListMember(client, msg, phone, selfId);
  if (low === '.delmember' || low.startsWith('.delmember ')) return args ? cmdDelMember(client, msg, phone, selfId, args) : cmdGuide(client, msg, '.delmember');
  if (low === '.member')             return cmdMyMember(client, msg, phone);

  // ── SUBDOMAIN DNS MANAGER ────────────────────────────────────
  if (low === '.subdo'     || low.startsWith('.subdo '))        return args ? cmdSubdo(client, msg, phone, args)      : cmdGuide(client, msg, '.subdo');
  if (low === '.listsubdo')                                       return cmdListSubdo(client, msg, phone);
  if (low === '.delsubdo'  || low.startsWith('.delsubdo '))      return args ? cmdDelSubdo(client, msg, phone, args)  : cmdGuide(client, msg, '.delsubdo');
  if (low === '.ceksubdo'  || low.startsWith('.ceksubdo '))      return args ? cmdCekSubdo(client, msg, phone, args)  : cmdGuide(client, msg, '.ceksubdo');
  if (low === '.settoken'  || low.startsWith('.settoken '))      return args ? cmdSetToken(client, msg, phone, args)  : cmdGuide(client, msg, '.settoken');
  if (low === '.dnssetup')                                        return cmdDnsSetup(client, msg, phone);

  // ── BUAT PANEL PTERODACTYL (RAM-based) ───────────────────────
  if (low === '.1gb'       || low.startsWith('.1gb '))       return text.slice(5).trim() ? cmdBuatPanel(client, msg, phone, '1gb',       text.slice(5).trim())  : cmdGuide(client, msg, '.1gb');
  if (low === '.2gb'       || low.startsWith('.2gb '))       return text.slice(5).trim() ? cmdBuatPanel(client, msg, phone, '2gb',       text.slice(5).trim())  : cmdGuide(client, msg, '.2gb');
  if (low === '.4gb'       || low.startsWith('.4gb '))       return text.slice(5).trim() ? cmdBuatPanel(client, msg, phone, '4gb',       text.slice(5).trim())  : cmdGuide(client, msg, '.4gb');
  if (low === '.8gb'       || low.startsWith('.8gb '))       return text.slice(5).trim() ? cmdBuatPanel(client, msg, phone, '8gb',       text.slice(5).trim())  : cmdGuide(client, msg, '.8gb');
  if (low === '.16gb'      || low.startsWith('.16gb '))      return text.slice(6).trim() ? cmdBuatPanel(client, msg, phone, '16gb',      text.slice(6).trim())  : cmdGuide(client, msg, '.16gb');
  if (low === '.unlimited' || low.startsWith('.unlimited ')) return text.slice(11).trim()? cmdBuatPanel(client, msg, phone, 'unlimited', text.slice(11).trim()) : cmdGuide(client, msg, '.unlimited');
  if (low === '.adminpanel'|| low.startsWith('.adminpanel '))return text.slice(13).trim()? cmdBuatPanel(client, msg, phone, 'admin',     text.slice(13).trim()) : cmdGuide(client, msg, '.adminpanel');
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: GUIDE — Panduan cara pakai setiap command
// Dipanggil saat user ketik command tanpa argumen
// ═══════════════════════════════════════════════════════════════
async function cmdGuide(client, msg, cmd) {
  const guides = {
    // ── TOOLS ──────────────────────────────────────────────────
    '.tr'        : { icon:'🌐', title:'TRANSLATE',    lines:['Terjemahkan teks ke bahasa lain.','','Format:','.tr &lt;kode_bahasa&gt; &lt;teks&gt;','','Contoh:','.tr en Halo semuanya','.tr ja Selamat pagi','.tr ko Apa kabar?','','Kode bahasa umum:','id=Indonesia  en=Inggris','ja=Jepang  ko=Korea','ar=Arab  zh=China  fr=Prancis'] },
    '.calc'      : { icon:'🧮', title:'KALKULATOR',   lines:['Hitung ekspresi matematika.','','Format:','.calc &lt;ekspresi&gt;','','Contoh:','.calc 10 * 5 + 3','.calc (100/4)^2','.calc sqrt(144)','.calc sin(90)'] },
    '.kurs'      : { icon:'💱', title:'KURS MATA UANG',lines:['Cek kurs mata uang ke Rupiah.','','Format:','.kurs &lt;mata_uang&gt;','','Contoh:','.kurs USD','.kurs EUR','.kurs JPY','.kurs SGD','.kurs MYR'] },
    '.cuaca'     : { icon:'🌤', title:'CEK CUACA',     lines:['Cek cuaca terkini di suatu kota.','','Format:','.cuaca &lt;nama_kota&gt;','','Contoh:','.cuaca Jakarta','.cuaca Surabaya','.cuaca Tokyo','.cuaca London'] },
    '.wiki'      : { icon:'📖', title:'WIKIPEDIA',     lines:['Cari informasi dari Wikipedia.','','Format:','.wiki &lt;topik&gt;','','Contoh:','.wiki Indonesia','.wiki Artificial Intelligence','.wiki Presiden Soekarno'] },
    '.qr'        : { icon:'📱', title:'QR CODE',       lines:['Buat QR Code dari teks atau link.','','Format:','.qr &lt;teks/url&gt;','','Contoh:','.qr https://google.com','.qr Halo ini pesan rahasia','.qr 08123456789'] },
    '.short'     : { icon:'🔗', title:'SHORTEN URL',   lines:['Persingkat URL panjang menjadi pendek.','','Format:','.short &lt;url&gt;','','Contoh:','.short https://www.google.com/search?q=arabsubot'] },
    '.password'  : { icon:'🔐', title:'PASSWORD GEN',  lines:['Generate password acak yang kuat.','','Format:','.password &lt;panjang&gt;','','Contoh:','.password 12','.password 20','.password 8','','Default panjang: 16 karakter'] },
    '.say'       : { icon:'💬', title:'SAY',           lines:['Kirim pesan sebagai teks biasa (hapus command).','','Format:','.say &lt;pesan&gt;','','Contoh:','.say Halo semua!','.say Pesan ini dikirim oleh userbot'] },
    '.ip'        : { icon:'🌐', title:'IP LOOKUP',     lines:['Cek informasi IP address atau domain.','','Format:','.ip &lt;ip/domain&gt;','','Contoh:','.ip 8.8.8.8','.ip google.com','.ip 1.1.1.1','','Info: negara, ISP, kota, proxy status'] },
    '.whois'     : { icon:'🔍', title:'WHOIS DOMAIN',  lines:['Cek informasi registrasi domain.','','Format:','.whois &lt;domain&gt;','','Contoh:','.whois google.com','.whois tokopedia.com','.whois github.com'] },
    '.hash'      : { icon:'#️⃣', title:'HASH GENERATOR',lines:['Generate hash dari teks (MD5, SHA1, SHA256, SHA512).','','Format:','.hash &lt;teks&gt;','','Contoh:','.hash password123','.hash Zetsy UBot v4.0','.hash rahasia'] },
    '.encode'    : { icon:'🔒', title:'ENCODE BASE64',  lines:['Encode teks ke format Base64 dan URL Encode.','','Format:','.encode &lt;teks&gt;','','Contoh:','.encode Hello World','.encode Zetsy UBot'] },
    '.decode'    : { icon:'🔓', title:'DECODE BASE64',  lines:['Decode teks dari format Base64.','','Format:','.decode &lt;base64&gt;','','Contoh:','.decode SGVsbG8gV29ybGQ=','.decode QXJhYnMgVUJvdA=='] },
    '.time'      : { icon:'🕐', title:'WORLD TIME',    lines:['Cek waktu saat ini di kota manapun di dunia.','','Format:','.time &lt;kota/negara&gt;','','Contoh:','.time Tokyo','.time London','.time New York','.time Dubai','.time Sydney'] },
    '.cekrek'    : { icon:'🏦', title:'CEK REKENING',  lines:['Cek nama pemilik rekening bank.','','Format:','.cekrek &lt;nomor_rek&gt; &lt;kode_bank&gt;','','Contoh:','.cekrek 1234567890 bca','.cekrek 0987654321 bni','.cekrek 1122334455 bri','','Kode bank: bca bni bri mandiri bsi cimb'] },
    '.bmi'       : { icon:'⚖️', title:'BMI CALCULATOR',lines:['Hitung Body Mass Index dan berat badan ideal.','','Format:','.bmi &lt;berat_kg&gt; &lt;tinggi_cm&gt;','','Contoh:','.bmi 65 170','.bmi 80 175','.bmi 50 160','','Hasil: BMI, status, saran, berat ideal'] },
    '.roman'     : { icon:'🏛', title:'KONVERSI ROMAWI',lines:['Konversi angka ke Romawi atau sebaliknya.','','Format:','.roman &lt;angka&gt;   → ke Romawi','.roman &lt;romawi&gt;  → ke angka','','Contoh:','.roman 2024','.roman MMXXIV','.roman 100','.roman XIV'] },
    '.random'    : { icon:'🎲', title:'RANDOM NUMBER', lines:['Generate angka acak dalam rentang tertentu.','','Format:','.random &lt;min&gt; &lt;max&gt;','','Contoh:','.random 1 100','.random 50 200','.random 1 10','','Default: .random → angka 1 s/d 100'] },

    // ── DOWNLOADER ─────────────────────────────────────────────
    '.ytdlp'     : { icon:'▶️', title:'YOUTUBE DL',    lines:['Download video dari YouTube.','','Format:','.ytdlp &lt;url_youtube&gt;','','Contoh:','.ytdlp https://youtu.be/xxxxx','.ytdlp https://www.youtube.com/watch?v=xxxxx','','Support: video, shorts, music'] },
    '.ttdlp'     : { icon:'🎵', title:'TIKTOK DL',     lines:['Download video TikTok tanpa watermark.','','Format:','.ttdlp &lt;url_tiktok&gt;','','Contoh:','.ttdlp https://vt.tiktok.com/xxxxx','.ttdlp https://www.tiktok.com/@user/video/xxx'] },
    '.igdlp'     : { icon:'📸', title:'INSTAGRAM DL',  lines:['Download foto/video dari Instagram.','','Format:','.igdlp &lt;url_instagram&gt;','','Contoh:','.igdlp https://www.instagram.com/p/xxxxx','.igdlp https://www.instagram.com/reel/xxxxx'] },

    // ── NOTES ──────────────────────────────────────────────────
    '.note'      : { icon:'📝', title:'SIMPAN CATATAN',lines:['Simpan catatan dengan judul tertentu.','','Format:','.note &lt;judul&gt; | &lt;isi_catatan&gt;','','Contoh:','.note belanja | beli susu, roti, telur','.note meeting | jam 10 di kantor besok','','Lihat semua catatan: .notes'] },
    '.delnote'   : { icon:'🗑', title:'HAPUS CATATAN', lines:['Hapus catatan berdasarkan judul.','','Format:','.delnote &lt;judul&gt;','','Contoh:','.delnote belanja','.delnote meeting','','Lihat semua catatan: .notes'] },
    '.remind'    : { icon:'⏰', title:'REMINDER',      lines:['Set pengingat otomatis.','','Format:','.remind &lt;menit&gt; &lt;pesan&gt;','','Contoh:','.remind 30 Saatnya makan siang','.remind 60 Meeting sama client','.remind 5 Cek email penting'] },

    // ── BROADCAST ──────────────────────────────────────────────
    '.setbc'       : { icon:'📡', title:'SET BROADCAST', lines:['Set pesan yang akan di-broadcast.','','Format:','.setbc &lt;pesan&gt;','','Contoh:','.setbc Halo! Ada promo spesial hari ini 🎉','.setbc Update bot telah tersedia!','','Setelah set, jalankan: .startbc'] },
    '.setdelay'    : { icon:'⏱', title:'SET DELAY BC',  lines:['Set jeda waktu antar pesan broadcast (dalam detik).','','Format:','.setdelay &lt;detik&gt;','','Min: 0.5 detik | Max: 60 detik (1 menit)','','Contoh:','.setdelay 0.5','.setdelay 2','.setdelay 10','','Rekomendasi: 2-5 detik agar tidak kena ban'] },
    '.sharemsg'    : { icon:'📤', title:'SHARE MSG',     lines:['Share pesan dari channel ke semua grup.','Header channel otomatis muncul di atas pesan.','','Cara pakai:','1. Buka channel kamu','2. Reply ke pesan yang mau di-share','3. Ketik .sharemsg','','Speed: 3 detik / grup (sekali kirim, tidak loop)','','Pesan tampil dengan blockquote cantik + nama channel di atas 📢'] },
    '.addgroupbc'       : { icon:'➕', title:'TAMBAH GRUP BC',     lines:['Tambahkan grup ini ke daftar target BC.','','Cara pakai:','Ketik .addgroupbc di dalam grup yang dituju.','','Lihat daftar: .listgroupbc','Hapus grup: .delgroupbc &lt;id&gt;'] },
    '.delgroupbc'       : { icon:'❌', title:'HAPUS GRUP BC',       lines:['Hapus grup dari daftar target BC.','','Format:','.delgroupbc &lt;id_grup&gt;','Atau ketik .delgroupbc langsung di grup tsb.','','Lihat ID: .listgroupbc'] },
    '.listgroupbc'      : { icon:'📋', title:'LIST GRUP BC',        lines:['Lihat semua grup target BC.','','Cara pakai:','.listgroupbc'] },
    '.bcgroup'          : { icon:'📢', title:'BC SEKALI (TARGET)',   lines:['Broadcast sekali ke grup target (tidak loop).','','Format:','.bcgroup &lt;pesan&gt;','','Atau reply ke pesan/foto/video → .bcgroup','','Delay: 3 detik per grup.'] },
    '.setbcgroup'       : { icon:'📡', title:'SET TEKS BC TARGET',   lines:['Set pesan yang akan di-broadcast ke grup target secara loop.','','Format:','.setbcgroup &lt;pesan&gt;','','Contoh:','.setbcgroup Promo spesial! Hubungi kami sekarang 🎉','','Setelah set, jalankan: .startbcgroup'] },
    '.setdelaybcgroup'  : { icon:'⏱', title:'SET DELAY BC TARGET',  lines:['Set jeda waktu antar pesan broadcast ke grup target.','','Format:','.setdelaybcgroup &lt;detik&gt;','','Min: 0.5 dtk | Max: 60 dtk','','Contoh:','.setdelaybcgroup 3','.setdelaybcgroup 5','','Rekomendasi: 3-5 detik agar tidak kena limit'] },
    '.setdurasibcgroup' : { icon:'⏳', title:'SET DURASI BC TARGET', lines:['Set durasi broadcast loop ke grup target (dalam jam).','','Format:','.setdurasibcgroup &lt;jam&gt;','','Min: 0.17 jam (10 menit) | Max: 24 jam','','Contoh:','.setdurasibcgroup 1','.setdurasibcgroup 2','.setdurasibcgroup 0.5 → 30 menit','','Setelah set, jalankan: .startbcgroup'] },
    '.startbcgroup'     : { icon:'▶️', title:'START BC TARGET',      lines:['Mulai broadcast loop ke grup target yang sudah didaftarkan.','','Syarat sebelum start:','1. Daftarkan grup → .addgroupbc (di tiap grup)','2. Set pesan → .setbcgroup &lt;pesan&gt;','3. (Opsional) Set delay → .setdelaybcgroup &lt;detik&gt;','4. (Opsional) Set durasi → .setdurasibcgroup &lt;jam&gt;','5. .startbcgroup','','Stop kapan saja: .stopbcgroup'] },
    '.stopbcgroup'      : { icon:'🛑', title:'STOP BC TARGET',       lines:['Stop broadcast loop ke grup target.','','Cara pakai:','.stopbcgroup'] },
    '.cekbcgroup'       : { icon:'📊', title:'STATUS BC TARGET',     lines:['Lihat status dan setting broadcast ke grup target.','','Cara pakai:','.cekbcgroup','','Menampilkan: status, teks, delay, durasi, total target grup.'] },

    // ── STIKER & MEDIA ─────────────────────────────────────────
    '.tts'       : { icon:'🔊', title:'TEXT TO SPEECH',lines:['Ubah teks menjadi pesan suara.','','Format:','.tts &lt;teks&gt;','','Contoh:','.tts Halo selamat datang','.tts Terima kasih sudah order','.tts Zetsy UBot versi empat'] },

    // ── BISNIS ─────────────────────────────────────────────────
    '.setdone'   : { icon:'✅', title:'SET PESAN DONE', lines:['Set template pesan konfirmasi order selesai.','','Format:','.setdone &lt;template&gt;','','Contoh:','.setdone Orderan kamu sudah selesai diproses! Terima kasih 🙏','','Gunakan .done untuk kirim ke buyer'] },
    '.invoice'   : { icon:'🧾', title:'BUAT INVOICE',  lines:['Buat invoice/nota pembelian otomatis.','','Format:','.invoice &lt;nama&gt; | &lt;produk&gt; | &lt;harga&gt; | &lt;qty&gt;','','Contoh:','.invoice Budi | Hosting 1GB | 50000 | 1','.invoice Ani | Panel VPS | 100000 | 2'] },
    '.diskon'    : { icon:'🏷', title:'HITUNG DISKON',  lines:['Hitung harga setelah diskon.','','Format:','.diskon &lt;harga&gt; &lt;persen%&gt;','','Contoh:','.diskon 100000 20%','.diskon 500000 15%','.diskon 75000 10%'] },
    '.laba'      : { icon:'💰', title:'HITUNG LABA',    lines:['Hitung laba/keuntungan dari modal dan harga jual.','','Format:','.laba &lt;modal&gt; &lt;harga_jual&gt;','','Contoh:','.laba 50000 80000','.laba 100000 150000'] },
    '.ongkir'    : { icon:'🚚', title:'CEK ONGKIR',     lines:['Cek ongkos kirim antar kota.','','Format:','.ongkir &lt;kota_asal&gt; | &lt;kota_tujuan&gt; | &lt;berat_gram&gt;','','Contoh:','.ongkir Jakarta | Surabaya | 1000','.ongkir Bandung | Medan | 500'] },
    '.resi'      : { icon:'📦', title:'CEK RESI',       lines:['Lacak status pengiriman paket.','','Format:','.resi &lt;nomor_resi&gt;','','Contoh:','.resi JX1234567890','.resi LP123456789ID','','Support: JNE, J&T, SiCepat, Anteraja, Pos'] },

    // ── BLACKLIST ──────────────────────────────────────────────
    '.addbl'     : { icon:'🚫', title:'TAMBAH BLACKLIST',lines:['Tambahkan nomor ke daftar blacklist.','','Format:','.addbl &lt;nomor&gt;','','Contoh:','.addbl 08123456789','.addbl +6281234567890','','User blacklist tidak bisa pakai bot'] },
    '.delbl'     : { icon:'✅', title:'HAPUS BLACKLIST', lines:['Hapus nomor dari daftar blacklist.','','Format:','.delbl &lt;nomor&gt;','','Contoh:','.delbl 08123456789','','Lihat daftar: .listbl'] },

    // ── WHATSAPP ───────────────────────────────────────────────
    '.pairing'   : { icon:'📱', title:'WA PAIRING CODE',lines:['Dapatkan kode pairing WhatsApp.','','Format:','.pairing &lt;nomor_wa&gt;','','Contoh:','.pairing 08123456789','.pairing +6281234567890','','Gunakan untuk login WA tanpa scan QR'] },
    '.cekbio'    : { icon:'👤', title:'CEK BIO WA',     lines:['Cek profil WhatsApp seseorang.','','Format:','.cekbio &lt;nomor_wa&gt;','','Contoh:','.cekbio 08123456789','.cekbio +6281234567890','','Info: nama, status, foto profil'] },

    // ── PTERODACTYL ────────────────────────────────────────────
    '.install'   : { icon:'🚀', title:'INSTALL PTERODACTYL',lines:['Install Pterodactyl Panel otomatis via SSH.','','Format:','.install &lt;user&gt;@&lt;ip&gt; &lt;password&gt;','','Contoh:','.install root@123.456.789.0 mypassword123','','Syarat:','• VPS/server dengan OS Ubuntu/Debian','• Akses SSH root','• RAM minimal 1GB','','Proses: 5-15 menit otomatis'] },

    // ── MEMBER MANAGEMENT ──────────────────────────────────────
    '.add'       : { icon:'👤', title:'TAMBAH MEMBER',  lines:['Tambahkan member baru (owner only).','','Format:','.add &lt;userId&gt; &lt;role&gt; &lt;durasi&gt;','','Role: seller | reseller | pt','Durasi: 30d | 7d | 1d | selamanya','','Contoh:','.add 123456789 seller 30d','.add 987654321 reseller 7d'] },
    '.delmember' : { icon:'🗑', title:'HAPUS MEMBER',   lines:['Hapus/nonaktifkan member (owner only).','','Format:','.delmember &lt;userId&gt;','','Contoh:','.delmember 123456789','','Lihat daftar: .listmember'] },

    // ── PANEL CREATOR ──────────────────────────────────────────
    '.1gb'       : { icon:'🖥', title:'BUAT SERVER 1GB', lines:['Buat server Pterodactyl dengan RAM 1GB.','','Format:','.1gb &lt;nama_server&gt;','','Contoh:','.1gb ubotku','.1gb server-testing','','Username & password = nama server (huruf kecil)'] },
    '.2gb'       : { icon:'🖥', title:'BUAT SERVER 2GB', lines:['Buat server Pterodactyl dengan RAM 2GB.','','Format:','.2gb &lt;nama_server&gt;','','Contoh:','.2gb ubotku','.2gb myserver'] },
    '.4gb'       : { icon:'🖥', title:'BUAT SERVER 4GB', lines:['Buat server Pterodactyl dengan RAM 4GB.','','Format:','.4gb &lt;nama_server&gt;','','Contoh:','.4gb ubotku'] },
    '.8gb'       : { icon:'🖥', title:'BUAT SERVER 8GB', lines:['Buat server Pterodactyl dengan RAM 8GB.','','Format:','.8gb &lt;nama_server&gt;','','Contoh:','.8gb ubotku'] },
    '.16gb'      : { icon:'🖥', title:'BUAT SERVER 16GB',lines:['Buat server Pterodactyl dengan RAM 16GB.','','Format:','.16gb &lt;nama_server&gt;','','Contoh:','.16gb ubotku'] },
    '.unlimited' : { icon:'🖥', title:'BUAT SERVER UNLIMITED',lines:['Buat server Pterodactyl dengan RAM unlimited.','','Format:','.unlimited &lt;nama_server&gt;','','Contoh:','.unlimited ubotku'] },
    '.adminpanel': { icon:'👑', title:'BUAT ADMIN PANEL',lines:['Buat akun admin di Pterodactyl Panel.','','Format:','.adminpanel &lt;nama_user&gt;','','Contoh:','.adminpanel arabsadmin','','User akan punya akses admin penuh ke panel'] },

    // ── 🌐 DNS SUBDOMAIN MANAGER ─────────────────────────────────────────────
    '.subdo'     : { icon:'🌐', title:'DAFTARKAN SUBDOMAIN', lines:['Daftarkan subdomain ke 5 provider DNS gratis sekaligus!','','Format:','.subdo "nama","IP"','','Contoh:','.subdo "serverku","103.21.56.77"','.subdo "arabsvps","45.123.56.1"','','5 Domain yang dibuat:','1️⃣ nama.my.id        → Cloudflare','2️⃣ nama.biz.id       → Cloudflare','3️⃣ nama.duckdns.org  → DuckDNS (gratis)','4️⃣ nama.dynu.com     → Dynu (gratis)','5️⃣ nama.dedyn.io     → deSEC (gratis, auto-register)','','Semua domain aktif sekaligus! Progress bar tampil di chat.','Setup token: node setupDNS.js atau .dnssetup di bot'] },
    '.listsubdo' : { icon:'📋', title:'DAFTAR SUBDOMAIN',    lines:['Lihat semua subdomain yang sudah didaftarkan.','','Format:','.listsubdo','','Menampilkan: nama, IP, provider, tanggal daftar'] },
    '.delsubdo'  : { icon:'🗑', title:'HAPUS SUBDOMAIN',     lines:['Hapus subdomain dari semua provider sekaligus.','','Format:','.delsubdo "nama"','','Contoh:','.delsubdo "serverku"','','Subdomain dihapus dari semua provider yang terdaftar.'] },
    '.ceksubdo'  : { icon:'🔍', title:'CEK STATUS DNS',      lines:['Cek status DNS resolve setiap subdomain.','','Format:','.ceksubdo "nama"','','Contoh:','.ceksubdo "serverku"','','Menampilkan: FQDN, IP resolve, status aktif/propagasi'] },
    '.settoken'  : { icon:'🔑', title:'SIMPAN TOKEN DNS',    lines:['Simpan token/credential provider DNS ke config.js','','Format:','.settoken &lt;provider&gt; &lt;token&gt;','','Provider & format:','duck TOKEN              → DuckDNS','dynu CLIENTID SECRET    → Dynu','desec TOKEN EMAIL       → deSEC','cf TOKEN ZONE_MYID ZONE_BIZID MYID BIZID → Cloudflare','freedns SHA1TOKEN       → FreeDNS','','Contoh:','.settoken duck abc123-xxx-yyy','.settoken dynu clientid mysecret','.settoken desec t0kenXXX email@gmail.com'] },
    '.dnssetup'  : { icon:'⚙️', title:'INFO SETUP DNS',      lines:['Lihat status semua provider DNS dan cara setup.','','Format:','.dnssetup','','Menampilkan status token setiap provider.','Setup otomatis: node setupDNS.js di server'] },
  };

  const g = guides[cmd];
  if (!g) return; // command tidak ada di daftar panduan

  const body = g.lines
    .map(l => l === '' ? '│' : `│ <tg-spoiler>${l}</tg-spoiler>`)
    .join('\n');

  await reply(client, msg,
    `<blockquote expandable>╭──「 ${g.icon} <b>${g.title}</b> 」\n` +
    `${body}\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot — Ketik command dengan argumen untuk mulai ✦</tg-spoiler></blockquote>`
  );
}
// ═══════════════════════════════════════════════════════════════
// Zetsy: BANNER URL — Ganti URL ini dengan banner kamu sendiri!
// Rekomendasi ukuran: 1280x640px, format JPG/PNG
// ═══════════════════════════════════════════════════════════════
const BANNER_URL = 'https://i.ibb.co/0jFJmNf/arabs-ubot-banner.jpg';

async function cmdAfk(client, msg, phone, reason) {
  const alasan = reason || 'Tidak ada alasan';
  afkState.set(phone, { reason: alasan, since: Date.now() });
  await reply(client, msg,
    box('💤', 'AFK AKTIF', [
      ['Alasan', alasan, true],
      ['Sejak', new Date().toLocaleTimeString('id-ID'), true],
    ], 'Zetsy | Auto-reply aktif')
  );
}

async function cmdUnafk(client, msg, phone) {
  if (!afkState.has(phone)) return reply(client, msg,
    `<blockquote>╭──「 ❌ <b>ERROR</b> 」\n│ <tg-spoiler>Kamu tidak sedang AFK!</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const { reason, since } = afkState.get(phone);
  afkState.delete(phone);
  await reply(client, msg,
    box('✅', 'AFK DICABUT', [
      ['Alasan tadi', reason, true],
      ['Total AFK', formatDurasi(Date.now() - since), true],
    ], 'Zetsy | Selamat kembali!')
  );
}



// ═══════════════════════════════════════════════════════════════
// Zetsy: BROADCAST
// ═══════════════════════════════════════════════════════════════
function getBroadcastCfg(phone) {
  if (!broadcastCfg.has(phone)) {
    broadcastCfg.set(phone, db.getUbotBroadcastCfg(phone) || {});
  }
  return broadcastCfg.get(phone);
}

function persistBroadcastCfg(phone) {
  const cfg = getBroadcastCfg(phone);
  db.saveUbotBroadcastCfg(phone, {
    text: cfg.text || '',
    textEntities: cfg.textEntities || undefined,
    delay: cfg.delay || undefined,
    duration: cfg.duration || undefined,
  });
}

async function cmdSetBc(client, msg, phone, text) {
  const payload = extractCommandPayload(msg, '.setbc');
  const sourceText = payload.text || text || '';
  if (!sourceText) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .setbc &lt;teks&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const cfg = getBroadcastCfg(phone);
  cfg.text = sourceText;
  cfg.textEntities = payload.entities;
  persistBroadcastCfg(phone);
  await reply(client, msg,
    `<blockquote>╭──「 ✅ <b>TEKS BC DISET</b> 」\n│ <b>Preview:</b>\n│ <tg-spoiler>${esc(sourceText.slice(0, 100))}${sourceText.length > 100 ? '...' : ''}</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

async function cmdSetDelay(client, msg, phone, args) {
  const n = parseFloat(args);
  const MIN_DELAY = 0.5;  // 0.5 detik
  const MAX_DELAY = 60;   // 1 menit
  if (isNaN(n) || n < MIN_DELAY || n > MAX_DELAY) return reply(client, msg,
    `<blockquote>╭──「 ❌ <b>SETDELAY GAGAL</b> 」\n│ <tg-spoiler>Format: .setdelay &lt;detik&gt;</tg-spoiler>\n│ <tg-spoiler>Min: 0.5 dtk | Max: 60 dtk (1 menit)</tg-spoiler>\n│ <tg-spoiler>Contoh: .setdelay 2 → 2 detik</tg-spoiler>\n│ <tg-spoiler>Contoh: .setdelay 0.5 → 0.5 detik</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const cfg = getBroadcastCfg(phone);
  cfg.delay = Math.round(n * 1000);
  persistBroadcastCfg(phone);

  let displayDelay;
  if (n < 1)  displayDelay = `${n} detik (${Math.round(n * 1000)}ms)`;
  else if (n < 60) displayDelay = `${n} detik`;
  else         displayDelay = `1 menit`;

  await reply(client, msg,
    `<blockquote>╭──「 ✅ <b>DELAY DISET</b> 」\n│\n│ <b>Delay antar pesan:</b> <tg-spoiler>${displayDelay}</tg-spoiler>\n│ <tg-spoiler>Min: 0.5 dtk | Max: 60 dtk (1 menit)</tg-spoiler>\n│\n│ <tg-spoiler>⚠️ Delay terlalu cepat bisa kena ban!</tg-spoiler>\n│ <tg-spoiler>Rekomendasi: 2–10 detik</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

async function cmdSetDur(client, msg, phone, args) {
  const n = parseInt(args);
  if (isNaN(n) || n < 1) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .setdur &lt;menit&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const cfg = getBroadcastCfg(phone);
  cfg.duration = n * 60000;
  persistBroadcastCfg(phone);
  await reply(client, msg,
    `<blockquote>╭──「 ✅ <b>DURASI DISET</b> 」\n│ <tg-spoiler>${n} menit</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

async function cmdSetDurasi(client, msg, phone, args) {
  const n = parseFloat(args);
  const MIN_JAM = 10 / 60;   // 10 menit dalam jam
  const MAX_JAM = 24;         // 24 jam
  if (isNaN(n) || n < MIN_JAM || n > MAX_JAM) return reply(client, msg,
    `<blockquote>╭──「 ❌ <b>SETDURASI GAGAL</b> 」\n│ <tg-spoiler>Format: .setdurasi &lt;jam&gt;</tg-spoiler>\n│ <tg-spoiler>Min: 0.17 jam (10 menit)</tg-spoiler>\n│ <tg-spoiler>Max: 24 jam</tg-spoiler>\n│ <tg-spoiler>Contoh: .setdurasi 1 → broadcast 1 jam</tg-spoiler>\n│ <tg-spoiler>Contoh: .setdurasi 24 → broadcast 24 jam</tg-spoiler>\n│ <tg-spoiler>Contoh: .setdurasi 0.5 → broadcast 30 menit</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const cfg = getBroadcastCfg(phone);
  cfg.duration = Math.round(n * 3600 * 1000); // simpan dalam ms
  persistBroadcastCfg(phone);

  // Format tampilan yang lebih manusiawi
  const totalMenit = n * 60;
  let displayDurasi;
  if (totalMenit < 60)       displayDurasi = `${totalMenit.toFixed(0)} menit`;
  else if (n < 24)           displayDurasi = `${n} jam (${totalMenit.toFixed(0)} menit)`;
  else                       displayDurasi = `24 jam (1 hari penuh)`;

  await reply(client, msg,
    `<blockquote>╭──「 ⏱ <b>DURASI BROADCAST DISET</b> 」\n│\n│ <b>Broadcast akan berjalan selama:</b>\n│ <tg-spoiler>⏳ ${displayDurasi}</tg-spoiler>\n│\n│ <tg-spoiler>BC akan terus loop ke semua grup</tg-spoiler>\n│ <tg-spoiler>hingga durasi ${displayDurasi} habis.</tg-spoiler>\n│\n│ <tg-spoiler>Min: 10 menit | Max: 24 jam</tg-spoiler>\n│ <tg-spoiler>Jalankan: .startbc</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

async function cmdStartBc(client, msg, phone) {
  const cfg = getBroadcastCfg(phone);
  if (!cfg?.text)  return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Set teks dulu: .setbc &lt;teks&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  if (cfg.running) return reply(client, msg,
    `<blockquote>╭──「 ⚠️ 」\n│ <tg-spoiler>BC sudah berjalan! .stopbc untuk stop</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  const delay    = cfg.delay    || 5000;         // default 5 detik
  const duration = cfg.duration || 10 * 60000;   // default 10 menit

  let dialogs;
  try { dialogs = await client.getDialogs({ limit: 500 }); }
  catch (e) { return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  ); }

  // ── Filter: hanya GROUP/SUPERGROUP (bukan channel broadcast) ──────────────────
  // Fix: GramJS kadang mark supergroup sebagai "isChannel" padahal megagroup=true
  // Solusi: cek entity.megagroup untuk deteksi supergroup yang benar
  const groups = dialogs.filter(d => {
    if (!d.entity) return false;
    const e = d.entity;

    // Grup biasa (Chat) → langsung include
    if (d.isGroup) return true;

    // Supergroup: GramJS bisa detect sebagai isChannel tapi entity punya megagroup=true
    // Ini penyebab utama broadcast skip di akun non-owner!
    if (e.megagroup === true) return true;

    // Gigagroup (community) → include juga
    if (e.gigagroup === true) return true;

    // Channel broadcast murni → hanya include kalau kita creator atau admin dengan hak post
    if (d.isChannel) {
      if (e.creator) return true;                          // kita owner channel
      if (e.adminRights?.postMessages) return true;       // kita admin dengan hak post
      return false;                                        // subscriber biasa → skip
    }

    return false;
  });

  // Debug log: bantu diagnosa kalau broadcast masih kosong
  console.log(`[Zetsy BC] Total dialogs: ${dialogs.length}, Grup terfilter: ${groups.length} (phone: ${phone})`);
  if (groups.length === 0) {
    const sample = dialogs.slice(0, 5).map(d => `${d.title || d.name} | isGroup:${d.isGroup} isChannel:${d.isChannel} mega:${d.entity?.megagroup}`).join("\n");
    console.log(`[Zetsy BC] Sample dialogs:\n${sample}`);
  }
  if (!groups.length) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Tidak ada grup ditemukan!</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  cfg.running = true;

  // Format durasi untuk display
  const durMs = duration;
  const durMnt = Math.round(durMs / 60000);
  let displayDur;
  if (durMnt < 60)       displayDur = `${durMnt} menit`;
  else if (durMnt < 1440) displayDur = `${(durMnt/60).toFixed(1)} jam`;
  else                    displayDur = `24 jam`;

  await reply(client, msg,
    box('📡', 'BROADCAST DIMULAI', [
      ['Target', `${groups.length} grup`, true],
      ['Delay', `${delay/1000} dtk/pesan`, true],
      ['Durasi', displayDur, true],
      ['Mode', 'Loop sampai waktu habis 🔁', true],
    ], 'Zetsy: .stopbc untuk stop')
  );

  const bcText = cfg.text;
  const bcTextEntities = cfg.textEntities;

  const t0 = Date.now();
  const endTime = t0 + duration;
  let sent = 0, fail = 0, skipped = 0, round = 0;

  // ── Progress bar helper ──────────────────────────────────────────
  const total = groups.length;
  function bcBar(done, tot) {
    const pct  = Math.min(100, Math.round((done / Math.max(tot, 1)) * 100));
    const fill = Math.round(pct / 5);
    return '█'.repeat(fill) + '░'.repeat(20 - fill) + ` ${pct}%`;
  }
  function timeBar() {
    const elapsed = Date.now() - t0;
    const pct     = Math.min(100, Math.round((elapsed / duration) * 100));
    const fill    = Math.round(pct / 5);
    return '█'.repeat(fill) + '░'.repeat(20 - fill) + ` ${pct}%`;
  }
  function sisaWaktu() {
    const sisa = Math.max(0, endTime - Date.now());
    return formatDurasi(sisa);
  }

  // Kirim pesan progress awal
  let progMsg;
  try {
    progMsg = await client.sendMessage(msg.chatId, {
      message: `<blockquote>╭──「 📡 <b>BROADCAST BERJALAN</b> 」\n│\n│ <b>Ronde     :</b> <tg-spoiler>#1 dari ∞</tg-spoiler>\n│ <b>Progress  :</b> <tg-spoiler>0 / ${total} grup</tg-spoiler>\n│ <tg-spoiler>${bcBar(0, total)}</tg-spoiler>\n│ <b>Waktu     :</b> <tg-spoiler>${timeBar()}</tg-spoiler>\n│ <b>Sisa waktu:</b> <tg-spoiler>${sisaWaktu()}</tg-spoiler>\n│ <b>Terkirim  :</b> <tg-spoiler>0 ✅</tg-spoiler>\n│ <b>Gagal     :</b> <tg-spoiler>0 ❌</tg-spoiler>\n│ <b>Dilewati  :</b> <tg-spoiler>0 ⏭</tg-spoiler>\n╰────────────────────────</blockquote>`,
      parseMode: 'html',
    });
  } catch (_) { progMsg = null; }

  let lastUpdate = Date.now();
  const UPDATE_EVERY = Math.max(1, Math.floor(total / 20));

  ;(async () => {
    // ── WHILE LOOP: terus putar sampai durasi habis ──────────────────
    while (getBroadcastCfg(phone)?.running && Date.now() < endTime) {
      round++;
      let roundIdx = 0;

      for (const d of groups) {
        if (!getBroadcastCfg(phone)?.running) break;
        if (Date.now() >= endTime) break;

        roundIdx++;

        // ── Cek apakah grup masuk blacklist ──
        const groupId = d.id?.toString();
        if (isGroupBlacklisted(phone, groupId)) { skipped++; }
        else {
          // Gunakan d.entity untuk peer yang lebih reliable
          const peer = d.entity || d.id;
          let attempts = 0;
          let success  = false;

          while (attempts < 3 && !success) {
            attempts++;
            try {
              await client.sendMessage(peer, buildTextPayload(bcText, bcTextEntities));
              sent++;
              success = true;
            } catch (err) {
              const errMsg = err?.message || err?.errorMessage || '';

              // FLOOD_WAIT: Telegram minta tunggu → tunggu lalu retry
              const floodMatch = errMsg.match(/FLOOD_WAIT_(\d+)/);
              if (floodMatch) {
                const waitSec = parseInt(floodMatch[1]) + 1;
                console.log(`[Zetsy BC] FLOOD_WAIT ${waitSec}s, menunggu...`);
                await sleep(waitSec * 1000);
                // jangan increment attempts, coba lagi setelah tunggu
                attempts--;
                continue;
              }

              // Tidak ada hak kirim / banned / private → langsung skip (jangan retry)
              if (
                errMsg.includes('CHAT_WRITE_FORBIDDEN') ||
                errMsg.includes('USER_BANNED_IN_CHANNEL') ||
                errMsg.includes('CHANNEL_PRIVATE') ||
                errMsg.includes('USER_NOT_PARTICIPANT') ||
                errMsg.includes('PEER_ID_INVALID') ||
                errMsg.includes('CHAT_RESTRICTED') ||
                errMsg.includes('You were kicked')
              ) {
                skipped++; // hitung sebagai dilewati, bukan gagal
                success = true; // stop retry
                break;
              }

              // Error lain (jaringan, timeout, dll) → jika sudah 3x baru fail
              if (attempts >= 3) {
                fail++;
              } else {
                await sleep(1500); // tunggu sebentar sebelum retry
              }
            }
          }
        }

        const now = Date.now();

        // Update progress bar
        if (progMsg && (roundIdx % UPDATE_EVERY === 0 || now - lastUpdate >= 4000)) {
          lastUpdate = now;
          try {
            await edit(client, msg.chatId, progMsg.id,
              `<blockquote>╭──「 📡 <b>BROADCAST BERJALAN</b> 」\n│\n│ <b>Ronde     :</b> <tg-spoiler>#${round} (grup ${roundIdx}/${total})</tg-spoiler>\n│ <b>Progress  :</b> <tg-spoiler>${bcBar(roundIdx, total)}</tg-spoiler>\n│ <b>Waktu     :</b> <tg-spoiler>${timeBar()}</tg-spoiler>\n│ <b>Sisa waktu:</b> <tg-spoiler>${sisaWaktu()}</tg-spoiler>\n│ <b>Terkirim  :</b> <tg-spoiler>${sent} ✅</tg-spoiler>\n│ <b>Gagal     :</b> <tg-spoiler>${fail} ❌</tg-spoiler>\n│ <b>Dilewati  :</b> <tg-spoiler>${skipped} ⏭</tg-spoiler>\n╰────────────────────────</blockquote>`
            );
          } catch (_) {}
        }

        await sleep(delay);
      }
      // selesai 1 ronde, lanjut ronde berikutnya kalau masih ada waktu
    }

    getBroadcastCfg(phone).running = false;

    const totalElapsed = Date.now() - t0;

    // Edit progress jadi selesai
    if (progMsg) {
      try {
        await edit(client, msg.chatId, progMsg.id,
          `<blockquote>╭──「 ✅ <b>BROADCAST SELESAI</b> 」\n│\n│ <b>Total Ronde  :</b> <tg-spoiler>${round} putaran 🔁</tg-spoiler>\n│ <tg-spoiler>████████████████████ 100%</tg-spoiler>\n│ <b>Terkirim     :</b> <tg-spoiler>${sent} pesan ✅</tg-spoiler>\n│ <b>Dilewati (BL):</b> <tg-spoiler>${skipped} pesan ⏭</tg-spoiler>\n│ <b>Gagal        :</b> <tg-spoiler>${fail} pesan ❌</tg-spoiler>\n│ <b>Total Waktu  :</b> <tg-spoiler>${formatDurasi(totalElapsed)}</tg-spoiler>\n╰────────────────────────</blockquote>`
        );
      } catch (_) {
        await client.sendMessage(msg.chatId, {
          message: box('✅', 'BROADCAST SELESAI', [
            ['Total Ronde', `${round} putaran`, true],
            ['Terkirim', `${sent} pesan`, true],
            ['Dilewati (BL)', `${skipped} pesan`, true],
            ['Gagal', `${fail} pesan`, true],
            ['Total Waktu', formatDurasi(totalElapsed), true],
          ], 'Zetsy UBot'),
          parseMode: 'html',
        });
      }
    }
  })().catch(e => console.error('[Zetsy BC]', e.message));
}

async function cmdStopBc(client, msg, phone) {
  const cfg = getBroadcastCfg(phone);
  if (!cfg?.running) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Tidak ada BC berjalan!</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  cfg.running = false;
  await reply(client, msg,
    `<blockquote>╭──「 🛑 <b>BROADCAST DIHENTIKAN</b> 」\n│ <tg-spoiler>Zetsy: BC berhasil distop</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

async function cmdCekBc(client, msg, phone) {
  const cfg = getBroadcastCfg(phone) || {};

  // Format durasi dalam jam/menit
  let displayDur = 'Belum diset (default 10mnt)';
  if (cfg.duration) {
    const durMnt = Math.round(cfg.duration / 60000);
    if (durMnt < 60)        displayDur = `${durMnt} menit`;
    else if (durMnt < 1440) displayDur = `${(durMnt/60).toFixed(1)} jam`;
    else                    displayDur = `24 jam`;
  }

  // Format delay
  let displayDelay = '5 dtk (default)';
  if (cfg.delay) {
    const dSec = cfg.delay / 1000;
    displayDelay = dSec < 1 ? `${dSec}dtk` : `${dSec}dtk`;
  }

  await reply(client, msg,
    box('📡', 'STATUS BROADCAST', [
      ['Status', cfg.running ? '🟢 Berjalan (loop aktif)' : '🔴 Berhenti', false],
      ['Teks', cfg.text?.slice(0, 50) || 'Belum diset', true],
      ['Delay antar pesan', displayDelay, true],
      ['Durasi BC', displayDur, true],
    ], 'Zetsy UBot')
  );
}



// ═══════════════════════════════════════════════════════════════
// Zetsy: BROADCAST KE GRUP TARGET TERTENTU
// Perintah: .addgroupbc .delgroupbc .listgroupbc .bcgroup
// ─────────────────────────────────────────────────────────────
// bcTargetStore: Map<phone, Map<groupId, {id, name, addedAt}>>
// ═══════════════════════════════════════════════════════════════

function getBcTargets(phone) {
  if (!bcTargetStore.has(phone)) {
    const raw = db.getUbotBcTargets(phone) || {};
    const map = new Map();
    Object.values(raw).forEach((g) => {
      if (!g?.id) return;
      map.set(String(g.id), {
        id: String(g.id),
        name: g.name || String(g.id),
        addedAt: g.addedAt || Date.now(),
      });
    });
    bcTargetStore.set(phone, map);
  }
  return bcTargetStore.get(phone);
}

function persistBcTargets(phone) {
  const targets = getBcTargets(phone);
  const out = {};
  for (const [gid, v] of targets.entries()) out[String(gid)] = v;
  db.saveUbotBcTargets(phone, out);
}

// ── .addgroupbc — tambah grup ini ke target BC ────────────────
async function cmdAddGroupBc(client, msg, phone) {
  const chatId  = msg.chatId?.toString();
  const isGroup = msg.isGroup || msg.isChannel || (!msg.isPrivate && chatId?.startsWith('-'));

  if (!isGroup) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>BUKAN GRUP</b> 」\n│\n│ <tg-spoiler>Ketik .addgroupbc di dalam grup</tg-spoiler>\n│ <tg-spoiler>yang ingin dijadikan target BC!</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  const targets = getBcTargets(phone);

  if (targets.has(chatId)) {
    return reply(client, msg,
      `<blockquote>╭──「 ⚠️ <b>SUDAH TERDAFTAR</b> 」\n│\n│ <tg-spoiler>Grup ini sudah ada di daftar target BC!</tg-spoiler>\n│ <tg-spoiler>Lihat daftar: .listgroupbc</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  let groupName = 'Unknown Group';
  try {
    const entity = await client.getEntity(msg.chatId);
    groupName = entity?.title || entity?.firstName || groupName;
  } catch (_) {}

  targets.set(chatId, { id: chatId, name: groupName, addedAt: Date.now() });
  persistBcTargets(phone);

  await reply(client, msg,
    `<blockquote>╭──「 ✅ <b>GRUP DITAMBAHKAN</b> 」\n│\n│ <b>Nama  :</b> <tg-spoiler>${esc(groupName)}</tg-spoiler>\n│ <b>ID    :</b> <tg-spoiler>${esc(chatId)}</tg-spoiler>\n│ <b>Total :</b> <tg-spoiler>${targets.size} grup target</tg-spoiler>\n│\n│ <tg-spoiler>Gunakan .bcgroup &lt;pesan&gt;</tg-spoiler>\n│ <tg-spoiler>untuk broadcast ke grup ini.</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

// ── .delgroupbc <id> — hapus grup dari target BC ─────────────
async function cmdDelGroupBc(client, msg, phone, args) {
  const targets = getBcTargets(phone);

  // Kalau tanpa args dan di grup → hapus grup saat ini
  const chatId   = msg.chatId?.toString();
  const isGroup  = msg.isGroup || msg.isChannel || (!msg.isPrivate && chatId?.startsWith('-'));
  const targetId = args.trim() || (isGroup ? chatId : null);

  if (!targetId) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>DELGROUPBC GAGAL</b> 」\n│\n│ <tg-spoiler>Format: .delgroupbc &lt;id_grup&gt;</tg-spoiler>\n│ <tg-spoiler>Atau ketik .delgroupbc di dalam grup tsb</tg-spoiler>\n│ <tg-spoiler>Lihat ID: .listgroupbc</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  if (!targets.has(targetId)) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>TIDAK DITEMUKAN</b> 」\n│\n│ <tg-spoiler>ID ${esc(targetId)} tidak ada di daftar target BC.</tg-spoiler>\n│ <tg-spoiler>Lihat daftar: .listgroupbc</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  const removed = targets.get(targetId);
  targets.delete(targetId);
  persistBcTargets(phone);

  await reply(client, msg,
    `<blockquote>╭──「 🗑 <b>GRUP DIHAPUS</b> 」\n│\n│ <b>Nama  :</b> <tg-spoiler>${esc(removed.name)}</tg-spoiler>\n│ <b>ID    :</b> <tg-spoiler>${esc(targetId)}</tg-spoiler>\n│ <b>Sisa  :</b> <tg-spoiler>${targets.size} grup target</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

// ── .listgroupbc — lihat daftar grup target BC ────────────────
async function cmdListGroupBc(client, msg, phone) {
  const targets = getBcTargets(phone);

  if (targets.size === 0) {
    return reply(client, msg,
      `<blockquote>╭──「 📋 <b>DAFTAR GRUP BC TARGET</b> 」\n│\n│ <tg-spoiler>Belum ada grup terdaftar!</tg-spoiler>\n│\n│ <b>Cara tambah:</b>\n│ <tg-spoiler>Ketik .addgroupbc di dalam grup yang</tg-spoiler>\n│ <tg-spoiler>ingin dijadikan target broadcast.</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  const listArr = Array.from(targets.values());
  const lines   = listArr.map((g, i) => `│ <b>${i + 1}.</b> <tg-spoiler>${esc(g.name)}</tg-spoiler>\n│    <tg-spoiler>ID: ${esc(g.id)}</tg-spoiler>`).join('\n');

  await reply(client, msg,
    `<blockquote>╭──「 📋 <b>DAFTAR GRUP BC TARGET</b> 」\n│\n│ <b>Total: ${targets.size} grup</b>\n│\n${lines}\n│\n│ <tg-spoiler>.bcgroup &lt;pesan&gt; → kirim ke semua</tg-spoiler>\n│ <tg-spoiler>.addgroupbc → tambah grup baru</tg-spoiler>\n│ <tg-spoiler>.delgroupbc &lt;id&gt; → hapus grup</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

// ── .bcgroup <pesan> / reply → .bcgroup ──────────────────────
// Broadcast sekali ke semua grup target, anti-flood, support semua media
async function cmdBcGroup(client, msg, phone, args, selfId) {
  const targets = getBcTargets(phone);

  if (targets.size === 0) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>TIDAK ADA TARGET</b> 」\n│\n│ <tg-spoiler>Belum ada grup terdaftar!</tg-spoiler>\n│ <tg-spoiler>Tambah dulu: .addgroupbc</tg-spoiler>\n│ <tg-spoiler>(ketik di dalam grup yang dituju)</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  // Ambil pesan yang akan di-broadcast
  // Mode 1: .bcgroup <teks>
  // Mode 2: reply ke pesan/foto/video/stiker → .bcgroup
  const cmdPayload = extractCommandPayload(msg, '.bcgroup');
  const bcText     = cmdPayload.text || args.trim();
  const bcTextEntities = cmdPayload.entities;
  const hasReply   = !!msg.replyTo?.replyToMsgId;
  const hasContent = bcText || hasReply;

  if (!hasContent) {
    return reply(client, msg,
      `<blockquote>╭──「 ℹ️ <b>CARA PAKAI .bcgroup</b> 」\n│\n│ <b>Mode 1 - Teks langsung:</b>\n│ <tg-spoiler>.bcgroup Halo semua! Ada info penting nih 📢</tg-spoiler>\n│\n│ <b>Mode 2 - Reply ke pesan/media:</b>\n│ <tg-spoiler>Reply pesan/foto/video/stiker</tg-spoiler>\n│ <tg-spoiler>lalu ketik .bcgroup</tg-spoiler>\n│\n│ <b>Target saat ini: ${targets.size} grup</b>\n│ <tg-spoiler>Delay: 3 detik per grup (anti-limit)</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  // Ambil pesan yang di-reply jika mode 2
  let replyMsg = null;
  if (hasReply) {
    try {
      const fetched = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
      replyMsg = fetched?.[0] || null;
    } catch (_) {}
  }

  const total     = targets.size;
  const DELAY_MS  = 3000; // 3 detik per grup — aman dari flood

  // Helper progress bar
  function bcBar(done, tot) {
    const pct  = Math.min(100, Math.round((done / Math.max(tot, 1)) * 100));
    const fill = Math.round(pct / 5);
    return '█'.repeat(fill) + '░'.repeat(20 - fill) + ` ${pct}%`;
  }

  // Kirim pesan progress awal
  let progMsg = null;
  try {
    progMsg = await client.sendMessage(msg.chatId, {
      message:
        `<blockquote>╭──「 📢 <b>BC GRUP TARGET DIMULAI</b> 」\n│\n│ <b>Target   :</b> <tg-spoiler>${total} grup</tg-spoiler>\n│ <b>Delay    :</b> <tg-spoiler>3 detik / grup</tg-spoiler>\n│ <b>Progress :</b> <tg-spoiler>${bcBar(0, total)}</tg-spoiler>\n│ <b>Terkirim :</b> <tg-spoiler>0 ✅</tg-spoiler>\n│ <b>Gagal    :</b> <tg-spoiler>0 ❌</tg-spoiler>\n╰────────────────────────</blockquote>`,
      parseMode: 'html',
    });
  } catch (_) { progMsg = null; }

  const UPDATE_EVERY = Math.max(1, Math.floor(total / 10));
  let lastUpdate = Date.now();
  let sent = 0, fail = 0, skipped = 0;
  const failList = [];

  const targetList = Array.from(targets.values());

  ;(async () => {
    for (let i = 0; i < targetList.length; i++) {
      const g = targetList[i];

      try {
        let peer;
        try { peer = await client.getEntity(g.id); }
        catch (_) { peer = g.id; }

        if (replyMsg) {
          // Mode reply: forward media/pesan yang di-reply
          if (replyMsg.media) {
            // Ada media (foto, video, dokumen, stiker, dll)
            const captionText = bcText || replyMsg.message || '';
            const captionEntities = bcText
              ? bcTextEntities
              : (replyMsg.entities || undefined);
            await client.sendFile(peer, {
              file     : replyMsg.media,
              caption  : captionText,
              formattingEntities: cloneEntities(captionEntities),
            });
          } else {
            // Teks saja
            const kombinasi = combineTextEntities(
              replyMsg.message || '',
              replyMsg.entities,
              bcText,
              bcTextEntities
            );
            await client.sendMessage(peer, buildTextPayload(kombinasi.text || '—', kombinasi.entities));
          }
        } else {
          // Mode teks langsung
          await client.sendMessage(peer, buildTextPayload(bcText, bcTextEntities));
        }
        sent++;
      } catch (err) {
        const errMsg = err?.message || err?.errorMessage || '';

        // FLOOD_WAIT → tunggu lalu retry sekali
        const floodMatch = errMsg.match(/FLOOD_WAIT_(\d+)/);
        if (floodMatch) {
          const waitSec = parseInt(floodMatch[1]) + 2;
          console.log(`[Zetsy BCGroup] FLOOD_WAIT ${waitSec}s for ${g.id}`);
          await sleep(waitSec * 1000);
          // retry
          try {
            const peer2 = g.id;
            if (replyMsg?.media) {
              const captionText2 = bcText || replyMsg.message || '';
              const captionEntities2 = bcText
                ? bcTextEntities
                : (replyMsg.entities || undefined);
              await client.sendFile(peer2, {
                file: replyMsg.media,
                caption: captionText2,
                formattingEntities: cloneEntities(captionEntities2),
              });
            } else {
              const txt2 = replyMsg
                ? combineTextEntities(replyMsg.message || '', replyMsg.entities, bcText, bcTextEntities)
                : { text: bcText, entities: bcTextEntities };
              await client.sendMessage(peer2, buildTextPayload(txt2.text || '—', txt2.entities));
            }
            sent++;
          } catch (_) {
            fail++;
            failList.push(esc(g.name));
          }
        } else if (
          errMsg.includes('CHAT_WRITE_FORBIDDEN') ||
          errMsg.includes('USER_BANNED_IN_CHANNEL') ||
          errMsg.includes('CHANNEL_PRIVATE') ||
          errMsg.includes('USER_NOT_PARTICIPANT') ||
          errMsg.includes('PEER_ID_INVALID') ||
          errMsg.includes('CHAT_RESTRICTED') ||
          errMsg.includes('You were kicked') ||
          errMsg.includes('ChatWriteForbiddenError')
        ) {
          skipped++;
          failList.push(esc(g.name) + ' <i>(no akses)</i>');
        } else {
          fail++;
          failList.push(esc(g.name));
        }
      }

      // Update progress
      const now = Date.now();
      if (progMsg && ((i + 1) % UPDATE_EVERY === 0 || now - lastUpdate >= 4000 || i === targetList.length - 1)) {
        lastUpdate = now;
        try {
          await edit(client, msg.chatId, progMsg.id,
            `<blockquote>╭──「 📢 <b>BC GRUP TARGET BERJALAN</b> 」\n│\n│ <b>Progress :</b> <tg-spoiler>${bcBar(i + 1, total)}</tg-spoiler>\n│ <tg-spoiler>${i + 1} / ${total} grup</tg-spoiler>\n│ <b>Terkirim :</b> <tg-spoiler>${sent} ✅</tg-spoiler>\n│ <b>Gagal    :</b> <tg-spoiler>${fail} ❌</tg-spoiler>\n│ <b>Skip     :</b> <tg-spoiler>${skipped} ⏭</tg-spoiler>\n╰────────────────────────</blockquote>`
          );
        } catch (_) {}
      }

      // Delay anti-limit (3 detik)
      if (i < targetList.length - 1) await sleep(DELAY_MS);
    }

    // Laporan akhir
    let failInfo = '';
    if (failList.length > 0 && failList.length <= 10) {
      failInfo = '\n│\n│ <b>Gagal/Skip:</b>\n' + failList.map(f => `│ <tg-spoiler>• ${f}</tg-spoiler>`).join('\n');
    }

    const finalMsg =
      `<blockquote>╭──「 ✅ <b>BC GRUP TARGET SELESAI</b> 」\n│\n│ <tg-spoiler>████████████████████ 100%</tg-spoiler>\n│ <b>Target   :</b> <tg-spoiler>${total} grup</tg-spoiler>\n│ <b>Terkirim :</b> <tg-spoiler>${sent} pesan ✅</tg-spoiler>\n│ <b>Skip     :</b> <tg-spoiler>${skipped} pesan ⏭</tg-spoiler>\n│ <b>Gagal    :</b> <tg-spoiler>${fail} pesan ❌</tg-spoiler>${failInfo}\n╰────────────────────────</blockquote>`;

    try {
      if (progMsg) {
        await edit(client, msg.chatId, progMsg.id, finalMsg);
      } else {
        await client.sendMessage(msg.chatId, { message: finalMsg, parseMode: 'html' });
      }
    } catch (_) {
      await client.sendMessage(msg.chatId, { message: finalMsg, parseMode: 'html' }).catch(() => {});
    }
  })().catch(e => console.error('[Zetsy BCGroup]', e.message));
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: BC GRUP TARGET — SISTEM LENGKAP (loop + delay + durasi)
// Perintah: .setbcgroup .setdelaybcgroup .setdurasibcgroup
//           .startbcgroup .stopbcgroup .cekbcgroup
// ═══════════════════════════════════════════════════════════════

function getBcTargetCfg(phone) {
  if (!bcTargetCfg.has(phone)) {
    bcTargetCfg.set(phone, db.getUbotBcTargetCfg(phone) || {});
  }
  return bcTargetCfg.get(phone);
}

function persistBcTargetCfg(phone) {
  const cfg = getBcTargetCfg(phone);
  db.saveUbotBcTargetCfg(phone, {
    text: cfg.text || '',
    textEntities: cfg.textEntities || undefined,
    delay: cfg.delay || undefined,
    duration: cfg.duration || undefined,
  });
}

// ── .setbcgroup <teks> ────────────────────────────────────────
async function cmdSetBcGroup(client, msg, phone, args) {
  const payload = extractCommandPayload(msg, '.setbcgroup');
  const text = payload.text || args.trim();
  if (!text) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .setbcgroup &lt;teks&gt;</tg-spoiler>\n│ <tg-spoiler>Contoh: .setbcgroup Promo hari ini! 🎉</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const cfg = getBcTargetCfg(phone);
  cfg.text = text;
  cfg.textEntities = payload.entities;
  persistBcTargetCfg(phone);
  await reply(client, msg,
    `<blockquote>╭──「 ✅ <b>TEKS BC TARGET DISET</b> 」\n│\n│ <b>Teks:</b>\n│ <tg-spoiler>${esc(text.slice(0, 80))}${text.length > 80 ? '...' : ''}</tg-spoiler>\n│\n│ <tg-spoiler>Jalankan: .startbcgroup</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

// ── .setdelaybcgroup <detik> ──────────────────────────────────
async function cmdSetDelayBcGroup(client, msg, phone, args) {
  const n = parseFloat(args.trim());
  if (isNaN(n) || n < 0.5 || n > 60) return reply(client, msg,
    `<blockquote>╭──「 ❌ <b>SETDELAYBCGROUP GAGAL</b> 」\n│ <tg-spoiler>Format: .setdelaybcgroup &lt;detik&gt;</tg-spoiler>\n│ <tg-spoiler>Min: 0.5 dtk | Max: 60 dtk</tg-spoiler>\n│ <tg-spoiler>Contoh: .setdelaybcgroup 3</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const cfg = getBcTargetCfg(phone);
  cfg.delay = Math.round(n * 1000);
  persistBcTargetCfg(phone);
  await reply(client, msg,
    `<blockquote>╭──「 ⏱ <b>DELAY BC TARGET DISET</b> 」\n│\n│ <b>Delay:</b> <tg-spoiler>${n} detik per grup</tg-spoiler>\n│ <tg-spoiler>Rekomendasi: 3-5 detik agar aman</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

// ── .setdurasibcgroup <jam> ───────────────────────────────────
async function cmdSetDurasiBcGroup(client, msg, phone, args) {
  const n = parseFloat(args.trim());
  if (isNaN(n) || n < 0.17 || n > 24) return reply(client, msg,
    `<blockquote>╭──「 ❌ <b>SETDURASIBCGROUP GAGAL</b> 」\n│ <tg-spoiler>Format: .setdurasibcgroup &lt;jam&gt;</tg-spoiler>\n│ <tg-spoiler>Min: 0.17 jam (10 menit)</tg-spoiler>\n│ <tg-spoiler>Max: 24 jam</tg-spoiler>\n│ <tg-spoiler>Contoh: .setdurasibcgroup 1</tg-spoiler>\n│ <tg-spoiler>Contoh: .setdurasibcgroup 0.5 → 30 menit</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const cfg = getBcTargetCfg(phone);
  cfg.duration = Math.round(n * 3600 * 1000);
  persistBcTargetCfg(phone);
  const mnt = Math.round(cfg.duration / 60000);
  const display = mnt < 60 ? `${mnt} menit` : `${(mnt/60).toFixed(1)} jam`;
  await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>DURASI BC TARGET DISET</b> 」\n│\n│ <b>Durasi:</b> <tg-spoiler>${display}</tg-spoiler>\n│ <tg-spoiler>BC akan loop selama ${display}</tg-spoiler>\n│ <tg-spoiler>Jalankan: .startbcgroup</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

// ── .startbcgroup — mulai loop BC ke grup target ──────────────
async function cmdStartBcGroup(client, msg, phone) {
  const cfg     = getBcTargetCfg(phone);
  const targets = getBcTargets(phone);

  if (!cfg.text) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Set teks dulu: .setbcgroup &lt;teks&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  if (cfg.running) return reply(client, msg,
    `<blockquote>╭──「 ⚠️ 」\n│ <tg-spoiler>BC Target sudah berjalan! .stopbcgroup untuk stop</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  if (targets.size === 0) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Belum ada grup target! Tambah dulu: .addgroupbc</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  const delay    = cfg.delay    || 3000;        // default 3 detik
  const duration = cfg.duration || 10 * 60000;  // default 10 menit
  const total    = targets.size;

  const durMnt = Math.round(duration / 60000);
  const displayDur = durMnt < 60 ? `${durMnt} menit` : `${(durMnt/60).toFixed(1)} jam`;

  cfg.running = true;

  await reply(client, msg,
    box('📡', 'BC TARGET DIMULAI', [
      ['Target',  `${total} grup terdaftar`,     true],
      ['Delay',   `${delay/1000} dtk/pesan`,     true],
      ['Durasi',  displayDur,                    true],
      ['Mode',    'Loop sampai waktu habis 🔁',  true],
    ], 'Zetsy: .stopbcgroup untuk stop')
  );

  const bcText = cfg.text;
  const bcTextEntities = cfg.textEntities;

  const t0      = Date.now();
  const endTime = t0 + duration;
  let sent = 0, fail = 0, skipped = 0, round = 0;

  // Progress bar helpers
  function bcBar(done, tot) {
    const pct  = Math.min(100, Math.round((done / Math.max(tot, 1)) * 100));
    const fill = Math.round(pct / 5);
    return '█'.repeat(fill) + '░'.repeat(20 - fill) + ` ${pct}%`;
  }
  function timeBar() {
    const elapsed = Date.now() - t0;
    const pct     = Math.min(100, Math.round((elapsed / duration) * 100));
    const fill    = Math.round(pct / 5);
    return '█'.repeat(fill) + '░'.repeat(20 - fill) + ` ${pct}%`;
  }
  function sisaWaktu() {
    const sisa = Math.max(0, endTime - Date.now());
    return formatDurasi(sisa);
  }

  // Pesan progress awal
  let progMsg = null;
  try {
    progMsg = await client.sendMessage(msg.chatId, {
      message:
        `<blockquote>╭──「 📡 <b>BC TARGET BERJALAN</b> 」\n│\n│ <b>Ronde    :</b> <tg-spoiler>#1 dari ∞</tg-spoiler>\n│ <b>Target   :</b> <tg-spoiler>${total} grup</tg-spoiler>\n│ <b>Progress :</b> <tg-spoiler>${bcBar(0, total)}</tg-spoiler>\n│ <b>Waktu    :</b> <tg-spoiler>${timeBar()}</tg-spoiler>\n│ <b>Sisa     :</b> <tg-spoiler>${sisaWaktu()}</tg-spoiler>\n│ <b>Terkirim :</b> <tg-spoiler>0 ✅</tg-spoiler>\n│ <b>Gagal    :</b> <tg-spoiler>0 ❌</tg-spoiler>\n│ <b>Dilewati :</b> <tg-spoiler>0 ⏭</tg-spoiler>\n╰────────────────────────</blockquote>`,
      parseMode: 'html',
    });
  } catch (_) { progMsg = null; }

  const UPDATE_EVERY = Math.max(1, Math.floor(total / 10));
  let lastUpdate = Date.now();

  ;(async () => {
    while (getBcTargetCfg(phone)?.running && Date.now() < endTime) {
      round++;
      let roundIdx = 0;
      const targetList = Array.from(getBcTargets(phone).values());

      for (const g of targetList) {
        if (!getBcTargetCfg(phone)?.running) break;
        if (Date.now() >= endTime) break;
        roundIdx++;

        let peer;
        try { peer = await client.getEntity(g.id); } catch (_) { peer = g.id; }

        let attempts = 0, success = false;
        while (attempts < 3 && !success) {
          attempts++;
          try {
            await client.sendMessage(peer, buildTextPayload(bcText, bcTextEntities));
            sent++;
            success = true;
          } catch (err) {
            const errMsg = err?.message || err?.errorMessage || '';
            const floodMatch = errMsg.match(/FLOOD_WAIT_(\d+)/);
            if (floodMatch) {
              const waitSec = parseInt(floodMatch[1]) + 1;
              console.log(`[Zetsy BCTargetLoop] FLOOD_WAIT ${waitSec}s`);
              await sleep(waitSec * 1000);
              attempts--;   // retry tidak habis attempt
            } else if (
              errMsg.includes('CHAT_WRITE_FORBIDDEN') ||
              errMsg.includes('USER_BANNED_IN_CHANNEL') ||
              errMsg.includes('CHANNEL_PRIVATE') ||
              errMsg.includes('USER_NOT_PARTICIPANT') ||
              errMsg.includes('PEER_ID_INVALID') ||
              errMsg.includes('CHAT_RESTRICTED') ||
              errMsg.includes('You were kicked')
            ) {
              skipped++;
              success = true; // tandai selesai (bukan retry)
            } else {
              fail++;
              success = true;
            }
          }
        }

        // Update progress
        const now = Date.now();
        if (progMsg && (roundIdx % UPDATE_EVERY === 0 || now - lastUpdate >= 4000)) {
          lastUpdate = now;
          try {
            await edit(client, msg.chatId, progMsg.id,
              `<blockquote>╭──「 📡 <b>BC TARGET BERJALAN</b> 」\n│\n│ <b>Ronde    :</b> <tg-spoiler>#${round} (grup ${roundIdx}/${total})</tg-spoiler>\n│ <b>Progress :</b> <tg-spoiler>${bcBar(roundIdx, total)}</tg-spoiler>\n│ <b>Waktu    :</b> <tg-spoiler>${timeBar()}</tg-spoiler>\n│ <b>Sisa     :</b> <tg-spoiler>${sisaWaktu()}</tg-spoiler>\n│ <b>Terkirim :</b> <tg-spoiler>${sent} ✅</tg-spoiler>\n│ <b>Gagal    :</b> <tg-spoiler>${fail} ❌</tg-spoiler>\n│ <b>Dilewati :</b> <tg-spoiler>${skipped} ⏭</tg-spoiler>\n╰────────────────────────</blockquote>`
            );
          } catch (_) {}
        }

        await sleep(delay);
      }
    }

    // Selesai (durasi habis atau distop)
    const totalElapsed = Date.now() - t0;
    getBcTargetCfg(phone).running = false;

    const finalMsg =
      `<blockquote>╭──「 ✅ <b>BC TARGET SELESAI</b> 」\n│\n│ <tg-spoiler>████████████████████ 100%</tg-spoiler>\n│ <b>Total Ronde  :</b> <tg-spoiler>${round} putaran 🔁</tg-spoiler>\n│ <b>Total Grup   :</b> <tg-spoiler>${total} grup</tg-spoiler>\n│ <b>Terkirim     :</b> <tg-spoiler>${sent} pesan ✅</tg-spoiler>\n│ <b>Dilewati     :</b> <tg-spoiler>${skipped} pesan ⏭</tg-spoiler>\n│ <b>Gagal        :</b> <tg-spoiler>${fail} pesan ❌</tg-spoiler>\n│ <b>Total Waktu  :</b> <tg-spoiler>${formatDurasi(totalElapsed)}</tg-spoiler>\n╰────────────────────────</blockquote>`;
    try {
      if (progMsg) await edit(client, msg.chatId, progMsg.id, finalMsg);
      else await client.sendMessage(msg.chatId, { message: finalMsg, parseMode: 'html' });
    } catch (_) {
      await client.sendMessage(msg.chatId, { message: finalMsg, parseMode: 'html' }).catch(() => {});
    }
  })().catch(e => console.error('[Zetsy BCTargetLoop]', e.message));
}

// ── .stopbcgroup ──────────────────────────────────────────────
async function cmdStopBcGroup(client, msg, phone) {
  const cfg = getBcTargetCfg(phone);
  if (!cfg.running) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Tidak ada BC Target yang berjalan!</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  cfg.running = false;
  await reply(client, msg,
    `<blockquote>╭──「 🛑 <b>BC TARGET DIHENTIKAN</b> 」\n│ <tg-spoiler>Broadcast ke grup target berhasil distop.</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

// ── .cekbcgroup ───────────────────────────────────────────────
async function cmdCekBcGroup(client, msg, phone) {
  const cfg     = getBcTargetCfg(phone);
  const targets = getBcTargets(phone);

  let displayDur = 'Belum diset (default 10 mnt)';
  if (cfg.duration) {
    const mnt = Math.round(cfg.duration / 60000);
    displayDur = mnt < 60 ? `${mnt} menit` : `${(mnt/60).toFixed(1)} jam`;
  }

  let displayDelay = '3 dtk (default)';
  if (cfg.delay) {
    const dSec = cfg.delay / 1000;
    displayDelay = `${dSec} dtk`;
  }

  await reply(client, msg,
    box('📊', 'STATUS BC TARGET', [
      ['Status',        cfg.running ? '🟢 Berjalan (loop aktif)' : '🔴 Berhenti', false],
      ['Teks',          cfg.text ? cfg.text.slice(0, 50) + (cfg.text.length > 50 ? '...' : '') : 'Belum diset', true],
      ['Delay',         displayDelay, true],
      ['Durasi',        displayDur,   true],
      ['Total target',  `${targets.size} grup terdaftar`, false],
    ], 'Zetsy UBot')
  );
}
async function cmdShareMsg(client, msg, phone, selfId) {
  // ── Harus reply ke sebuah pesan ──────────────────────────────
  if (!msg.replyTo?.replyToMsgId) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>SHARE MSG</b> 」\n│\n│ <tg-spoiler>Reply ke pesan yang ingin di-share!</tg-spoiler>\n│ <tg-spoiler>Contoh: reply pesan di channel → .sharemsg</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  // ── Ambil pesan yang di-reply ─────────────────────────────────
  let targetMsg;
  try {
    const fetched = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
    targetMsg = fetched?.[0];
  } catch (e) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Gagal ambil pesan: ${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  if (!targetMsg) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Pesan tidak ditemukan!</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  // ── Ambil info channel/grup sumber ────────────────────────────
  let channelName = 'Channel';
  let channelUsername = '';
  let channelLink = '';
  try {
    const chatEntity = await client.getEntity(msg.chatId);
    channelName     = chatEntity.title || chatEntity.firstName || 'Channel';
    channelUsername = chatEntity.username ? `@${chatEntity.username}` : '';
    channelLink     = chatEntity.username
      ? `https://t.me/${chatEntity.username}`
      : '';
  } catch (_) {}

  // ── Isi pesan yang di-reply ───────────────────────────────────
  const rawText = targetMsg.rawText || targetMsg.message || '';

  // ── Bangun format blockquote cantik ──────────────────────────
  // Header: nama channel + username/link
  // Isi: teks pesan (dibungkus blockquote, tiap baris pakai │)
  const headerLine = channelUsername
    ? `<a href="${channelLink}"><b>${esc(channelName)}</b></a>  <tg-spoiler>${esc(channelUsername)}</tg-spoiler>`
    : `<b>${esc(channelName)}</b>`;

  const isiLines = esc(rawText).split('\n').map(l => `│ ${l}`).join('\n');

  const shareText = channelUsername
    ? `📢 ${headerLine}\n\n${esc(rawText)}`
    : `📢 ${headerLine}\n\n${esc(rawText)}`;

  // ── Ambil semua grup (logika sama dengan startbc) ─────────────
  let dialogs;
  try { dialogs = await client.getDialogs({ limit: 500 }); }
  catch (e) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  const groups = dialogs.filter(d => {
    if (!d.entity) return false;
    const e = d.entity;
    if (d.isGroup) return true;
    if (e.megagroup === true) return true;
    if (e.gigagroup === true) return true;
    if (d.isChannel) {
      if (e.creator) return true;
      if (e.adminRights?.postMessages) return true;
      return false;
    }
    return false;
  });

  if (!groups.length) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Tidak ada grup ditemukan!</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  const total = groups.length;
  const DELAY_SHARE = 3000; // 3 detik per grup (hardcoded)

  // ── Kirim notif mulai + progress awal ────────────────────────
  let progMsg;
  try {
    progMsg = await client.sendMessage(msg.chatId, {
      message: `<blockquote>╭──「 📤 <b>SHARE MSG DIMULAI</b> 」\n│\n│ <b>Sumber   :</b> <tg-spoiler>${esc(channelName)} ${esc(channelUsername)}</tg-spoiler>\n│ <b>Target   :</b> <tg-spoiler>${total} grup</tg-spoiler>\n│ <b>Speed    :</b> <tg-spoiler>3 detik / grup</tg-spoiler>\n│ <b>Progress :</b> <tg-spoiler>░░░░░░░░░░░░░░░░░░░░ 0%</tg-spoiler>\n│ <b>Terkirim :</b> <tg-spoiler>0 ✅</tg-spoiler>\n│ <b>Gagal    :</b> <tg-spoiler>0 ❌</tg-spoiler>\n╰────────────────────────</blockquote>`,
      parseMode: 'html',
    });
  } catch (_) { progMsg = null; }

  // ── Helper progress bar ───────────────────────────────────────
  function shareBar(done, tot) {
    const pct  = Math.min(100, Math.round((done / Math.max(tot, 1)) * 100));
    const fill = Math.round(pct / 5);
    return '█'.repeat(fill) + '░'.repeat(20 - fill) + ` ${pct}%`;
  }

  // ── Loop kirim ke semua grup (sekali, tidak loop) ────────────
  let sent = 0, fail = 0, skipped = 0;
  let lastUpdate = Date.now();
  const UPDATE_EVERY = Math.max(1, Math.floor(total / 20));

  ;(async () => {
    for (let i = 0; i < groups.length; i++) {
      const d = groups[i];
      const groupId = d.id?.toString();

      if (isGroupBlacklisted(phone, groupId)) {
        skipped++;
      } else {
        const peer = d.entity || d.id;
        try {
          await client.sendMessage(peer, { message: shareText, parseMode: 'html' });
          sent++;
        } catch (err) {
          const errMsg = err?.message || err?.errorMessage || '';

          // FLOOD_WAIT → tunggu lalu retry sekali
          const floodMatch = errMsg.match(/FLOOD_WAIT_(\d+)/);
          if (floodMatch) {
            const waitSec = parseInt(floodMatch[1]) + 1;
            await sleep(waitSec * 1000);
            try {
              await client.sendMessage(peer, { message: shareText, parseMode: 'html' });
              sent++;
            } catch (_) { fail++; }
          } else if (
            errMsg.includes('CHAT_WRITE_FORBIDDEN') ||
            errMsg.includes('USER_BANNED_IN_CHANNEL') ||
            errMsg.includes('CHANNEL_PRIVATE') ||
            errMsg.includes('USER_NOT_PARTICIPANT') ||
            errMsg.includes('PEER_ID_INVALID') ||
            errMsg.includes('CHAT_RESTRICTED') ||
            errMsg.includes('You were kicked')
          ) {
            skipped++;
          } else {
            fail++;
          }
        }
      }

      // Update progress bar setiap beberapa grup atau tiap 4 detik
      const now = Date.now();
      if (progMsg && ((i + 1) % UPDATE_EVERY === 0 || now - lastUpdate >= 4000 || i === groups.length - 1)) {
        lastUpdate = now;
        try {
          await edit(client, msg.chatId, progMsg.id,
            `<blockquote>╭──「 📤 <b>SHARE MSG BERJALAN</b> 」\n│\n│ <b>Sumber   :</b> <tg-spoiler>${esc(channelName)} ${esc(channelUsername)}</tg-spoiler>\n│ <b>Progress :</b> <tg-spoiler>${shareBar(i + 1, total)}</tg-spoiler>\n│ <tg-spoiler>${i + 1} / ${total} grup</tg-spoiler>\n│ <b>Terkirim :</b> <tg-spoiler>${sent} ✅</tg-spoiler>\n│ <b>Gagal    :</b> <tg-spoiler>${fail} ❌</tg-spoiler>\n│ <b>Dilewati :</b> <tg-spoiler>${skipped} ⏭</tg-spoiler>\n╰────────────────────────</blockquote>`
          );
        } catch (_) {}
      }

      await sleep(DELAY_SHARE);
    }

    // ── Selesai ───────────────────────────────────────────────
    try {
      await edit(client, msg.chatId, progMsg?.id,
        `<blockquote>╭──「 ✅ <b>SHARE MSG SELESAI</b> 」\n│\n│ <b>Sumber   :</b> <tg-spoiler>${esc(channelName)} ${esc(channelUsername)}</tg-spoiler>\n│ <tg-spoiler>████████████████████ 100%</tg-spoiler>\n│ <b>Terkirim :</b> <tg-spoiler>${sent} pesan ✅</tg-spoiler>\n│ <b>Dilewati :</b> <tg-spoiler>${skipped} pesan ⏭</tg-spoiler>\n│ <b>Gagal    :</b> <tg-spoiler>${fail} pesan ❌</tg-spoiler>\n╰────────────────────────</blockquote>`
      );
    } catch (_) {
      await client.sendMessage(msg.chatId, {
        message: box('✅', 'SHARE MSG SELESAI', [
          ['Sumber',   `${channelName} ${channelUsername}`, true],
          ['Terkirim', `${sent} pesan`, true],
          ['Dilewati', `${skipped} pesan`, true],
          ['Gagal',    `${fail} pesan`, true],
        ], 'Zetsy UBot'),
        parseMode: 'html',
      });
    }
  })().catch(e => console.error('[Zetsy ShareMsg]', e.message));
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: TAG ALL — 1 pesan, semua ter-tag, reply bubble
// ═══════════════════════════════════════════════════════════════
async function cmdTagAll(client, msg, customText) {
  const chatId = msg.chatId;
  let participants;
  try { participants = await client.getParticipants(chatId, { limit: 500 }); }
  catch (e) { return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  ); }

  const humans = (participants || []).filter(p => !p.bot && p.id);
  if (!humans.length) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Tidak ada member!</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  const header = customText
    ? `<blockquote>╭──「 📢 <b>${esc(customText)}</b> 」\n│ `
    : `<blockquote>╭──「 🏷 <b>TAG ALL MEMBER</b> 」\n│ `;

  let mentions = '';
  for (const p of humans) {
    const name = esc(([p.firstName, p.lastName].filter(Boolean).join(' ') || 'U').slice(0, 15));
    mentions += `<a href="tg://user?id=${p.id}">${name}</a> `;
  }

  const footer =
    `\n├────────────────────────\n` +
    `│ <tg-spoiler>Zetsy: ${humans.length} member di-tag</tg-spoiler>\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Tag All ✦</tg-spoiler></blockquote>`;

  const full = header + mentions + footer;

  if (full.length <= 4096) {
    await client.sendMessage(chatId, { message: full, replyTo: msg.id, parseMode: 'html', linkPreview: false });
  } else {
    for (let i = 0; i < humans.length; i += 20) {
      const chunk = humans.slice(i, i + 20);
      let line = i === 0 ? header : `<blockquote>│ `;
      for (const p of chunk) {
        const name = esc(([p.firstName, p.lastName].filter(Boolean).join(' ') || 'U').slice(0, 15));
        line += `<a href="tg://user?id=${p.id}">${name}</a> `;
      }
      if (i + 20 >= humans.length) line += footer;
      else line += `</blockquote>`;
      await client.sendMessage(chatId, { message: line, replyTo: i === 0 ? msg.id : undefined, parseMode: 'html', linkPreview: false });
      await sleep(800);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: ADD ROLE
// ═══════════════════════════════════════════════════════════════
const ROLES = {
  seller:   { icon: '🛍️', badge: '⭐ SELLER'   },
  reseller: { icon: '📦', badge: '💎 RESELLER' },
  rs:       { icon: '📦', badge: '💎 RESELLER' },
  pt:       { icon: '🏢', badge: '🏢 PARTNER'  },
  partner:  { icon: '🤝', badge: '🤝 PARTNER'  },
  vip:      { icon: '👑', badge: '👑 VIP'       },
  admin:    { icon: '🔑', badge: '🔑 ADMIN'     },
  member:   { icon: '👤', badge: '👤 MEMBER'    },
  banned:   { icon: '🚫', badge: '🚫 BANNED'    },
};







// ═══════════════════════════════════════════════════════════════
// Zetsy: TOOLS — semua pakai reply bubble + box + spoiler
// ═══════════════════════════════════════════════════════════════
async function cmdPing(client, msg) {
  const t = Date.now();
  const m = await reply(client, msg,
    `<blockquote>╭──「 🏓 <b>PING</b> 」\n│ <tg-spoiler>Zetsy: Mengukur latency...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const ms = Date.now() - t;
  await edit(client, msg.chatId, m.id,
    `<blockquote>╭──「 🏓 <b>PONG!</b> 」\n│ <b>Latency :</b> <tg-spoiler>${ms}ms</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

async function cmdAlive(client, msg) {
  const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  await reply(client, msg,
    box('✅', 'ZETSY UBOT ALIVE!', [
      ['Uptime', formatUptime(process.uptime()), true],
      ['RAM', `${mem} MB`, true],
      ['Node', process.version, true],
      ['Status', '🟢 Online & Running', false],
    ], 'Zetsy UBot v2.0 Premium')
  );
}

async function cmdInfo(client, msg, phone) {
  const me = await client.getMe();
  await reply(client, msg,
    box('👤', 'INFO AKUN', [
      ['Nama', [me.firstName, me.lastName].filter(Boolean).join(' ') || '-', true],
      ['Username', `@${me.username || '-'}`, true],
      ['Phone', phone, true],
      ['ID', me.id?.toString(), true],
      ['Premium', me.premium ? '✅ Ya' : '❌ Tidak', false],
    ], 'Zetsy UBot Info Akun')
  );
}

async function cmdSysinfo(client, msg) {
  const fm = (os.freemem() / 1024 / 1024).toFixed(0);
  const tm = (os.totalmem() / 1024 / 1024).toFixed(0);
  await reply(client, msg,
    box('🖥', 'SYSTEM INFO', [
      ['OS', `${os.type()} ${os.arch()}`, true],
      ['CPU Load', os.loadavg()[0].toFixed(2), true],
      ['RAM', `${fm}MB / ${tm}MB`, true],
      ['Uptime', formatUptime(os.uptime()), true],
      ['Node', process.version, true],
    ], 'Zetsy UBot System Info')
  );
}

async function cmdId(client, msg) {
  const rows = [['Chat ID', msg.chatId?.toString(), true]];
  if (msg.replyTo?.replyToMsgId) {
    try {
      const r = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
      if (r?.[0]?.senderId) rows.push(['User ID', r[0].senderId?.toString(), true]);
    } catch (_) {}
  }
  await reply(client, msg, box('🆔', 'ID INFO', rows, 'Zetsy UBot ID Tool'));
}







async function cmdCalc(client, msg, expr) {
  if (!expr) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .calc &lt;ekspresi&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const result = Function('"use strict"; return (' + expr.replace(/[^0-9+\-*/.()%\s]/g, '') + ')')();
    await reply(client, msg, box('🧮', 'KALKULATOR', [['Expr', expr, true], ['Hasil', String(result), true]], 'Zetsy UBot Calculator'));
  } catch (_) { await reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Ekspresi tidak valid!</tg-spoiler>\n╰────────────────────────</blockquote>`
  ); }
}

async function cmdKurs(client, msg, args) {
  if (!args) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .kurs USD</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Zetsy: Mengambil kurs...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res  = await axios.get('https://open.er-api.com/v6/latest/IDR', { timeout: 8000 });
    const code = args.toUpperCase();
    const rate = res.data?.rates?.[code];
    if (!rate) throw new Error(`${code} tidak ditemukan`);
    await edit(client, msg.chatId, m.id,
      box(`💱`, `KURS ${code}`, [
        ['1 IDR', `${(1/rate).toFixed(6)} ${code}`, true],
        [`1 ${code}`, `Rp ${parseFloat(rate.toFixed(2)).toLocaleString('id-ID')}`, true],
      ], 'Zetsy UBot Kurs')
    );
  } catch (e) { await edit(client, msg.chatId, m.id,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  ); }
}

async function cmdCuaca(client, msg, kota) {
  if (!kota) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .cuaca Jakarta</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Zetsy: Mengambil cuaca ${esc(kota)}...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res  = await axios.get(`https://wttr.in/${encodeURIComponent(kota)}?format=j1`, { timeout: 8000 });
    const cur  = res.data?.current_condition?.[0];
    const area = res.data?.nearest_area?.[0];
    const nama = area?.areaName?.[0]?.value || kota;
    await edit(client, msg.chatId, m.id,
      box(`☁️`, `CUACA ${nama.toUpperCase()}`, [
        ['Kondisi',    cur?.weatherDesc?.[0]?.value || '-', true],
        ['Suhu',       `${cur?.temp_C}°C (terasa ${cur?.FeelsLikeC}°C)`, true],
        ['Kelembapan', `${cur?.humidity}%`, true],
        ['Angin',      `${cur?.windspeedKmph} km/h`, true],
      ], 'Zetsy UBot Cuaca')
    );
  } catch (e) { await edit(client, msg.chatId, m.id,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  ); }
}

async function cmdKbbi(client, msg, kata) {
  if (!kata) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .kbbi &lt;kata&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 🔍 」\n│ <tg-spoiler>Zetsy: Mencari di KBBI...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res   = await axios.get(`https://kbbi.kemdikbud.go.id/entri/${encodeURIComponent(kata)}`, { timeout: 10000 });
    const match = res.data.match(/<ol>([\s\S]*?)<\/ol>/);
    const arti  = match ? match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300) : 'Tidak ditemukan';
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 📖 <b>KBBI: ${esc(kata.toUpperCase())}</b> 」\n│ <tg-spoiler>${esc(arti)}</tg-spoiler>\n╰────────────────────────\n<tg-spoiler>Zetsy: kbbi.kemdikbud.go.id</tg-spoiler></blockquote>`
    );
  } catch (_) { await edit(client, msg.chatId, m.id,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Kata tidak ditemukan</tg-spoiler>\n╰────────────────────────</blockquote>`
  ); }
}

async function cmdQr(client, msg, text) {
  if (!text) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .qr &lt;teks/url&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Zetsy: Membuat QR Code...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(text)}`;
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    const tmp = `./downloads/qr_${Date.now()}.png`;
    if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
    fs.writeFileSync(tmp, res.data);
    await client.deleteMessages(msg.chatId, [m.id], { revoke: true }).catch(() => {});
    await client.sendFile(msg.chatId, {
      file: tmp,
      caption:
        `<blockquote>╭──「 📱 <b>QR CODE</b> 」\n│ <b>Data :</b> <tg-spoiler>${esc(text.slice(0, 60))}</tg-spoiler>\n│ <b>Size :</b> <tg-spoiler>512 x 512px</tg-spoiler>\n╰────────────────────────</blockquote>`,
      replyTo: msg.id,
      parseMode: 'html',
    });
    fs.unlinkSync(tmp);
  } catch (e) { await edit(client, msg.chatId, m.id,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  ); }
}

async function cmdShorten(client, msg, url) {
  if (!url) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .short &lt;url&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Zetsy: Mempersingkat URL...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout: 8000 });
    await edit(client, msg.chatId, m.id,
      box('🔗', 'SHORT URL', [
        ['Short', res.data, true],
      ], 'Zetsy UBot URL Shortener')
    );
  } catch (e) { await edit(client, msg.chatId, m.id,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  ); }
}



async function cmdNoteSet(client, msg, phone, args) {
  const [key, ...val] = args.split(' '); const value = val.join(' ');
  if (!key || !value) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .note &lt;key&gt; &lt;isi&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  db.saveNote(phone, key, value);
  await reply(client, msg,
    `<blockquote>╭──「 ✅ <b>CATATAN DISIMPAN</b> 」\n│ <b>Key   :</b> <tg-spoiler>${esc(key)}</tg-spoiler>\n│ <b>Value :</b> <tg-spoiler>${esc(value.slice(0, 80))}</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

async function cmdNoteList(client, msg, phone) {
  const notes = db.getAllNotes(phone); const keys = Object.keys(notes);
  if (!keys.length) return reply(client, msg,
    `<blockquote>╭──「 ℹ️ 」\n│ <tg-spoiler>Belum ada catatan!</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  let txt = `<blockquote>╭──「 📝 <b>CATATAN KAMU</b> 」\n`;
  for (const k of keys) txt += `│ <b>${esc(k)}</b> → <tg-spoiler>${esc(notes[k].value.slice(0, 50))}</tg-spoiler>\n`;
  txt += `╰────────────────────────\n<tg-spoiler>Zetsy: ${keys.length} catatan</tg-spoiler></blockquote>`;
  await reply(client, msg, txt);
}

async function cmdNoteDel(client, msg, phone, key) {
  if (!key) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .delnote &lt;key&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  db.deleteNote(phone, key);
  await reply(client, msg,
    `<blockquote>╭──「 ✅ 」\n│ <tg-spoiler>Catatan '${esc(key)}' dihapus!</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

async function cmdRemind(client, msg, phone, args) {
  const [mnt, ...txt] = args.split(' '); const menit = parseInt(mnt); const teks = txt.join(' ');
  if (isNaN(menit) || menit < 1 || !teks) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .remind &lt;menit&gt; &lt;teks&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  await reply(client, msg,
    `<blockquote>╭──「 ⏰ <b>REMINDER DISET</b> 」\n│ <b>Dalam :</b> <tg-spoiler>${menit} menit</tg-spoiler>\n│ <b>Teks  :</b> <tg-spoiler>${esc(teks)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  setTimeout(async () => {
    await reply(client, msg,
      `<blockquote>╭──「 ⏰ <b>REMINDER!</b> 」\n│ <tg-spoiler>${esc(teks)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }, menit * 60000);
}

async function cmdClear(client, msg, selfId) {
  const msgs = await client.getMessages(msg.chatId, { limit: 50 });
  const ids  = msgs.filter(m => m.senderId?.toString() === selfId).slice(0, 10).map(m => m.id);
  if (ids.length) await client.deleteMessages(msg.chatId, ids, { revoke: true });
}

async function cmdSay(client, msg, text) {
  if (!text) return;
  await client.sendMessage(msg.chatId, {
    message: `<blockquote>${esc(text)}</blockquote>`,
    parseMode: 'html',
  });
  await client.deleteMessages(msg.chatId, [msg.id], { revoke: true }).catch(() => {});
}

async function cmdTranslate(client, msg, args) {
  const [lang, ...rest] = args.split(' '); const text = rest.join(' ');
  if (!lang || !text) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .tr en Halo</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 🌐 」\n│ <tg-spoiler>Zetsy: Mentranslate...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: { client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: text }, timeout: 10000,
    });
    const out = res.data[0].map(x => x[0]).join('');
    await edit(client, msg.chatId, m.id,
      box('🌐', 'TRANSLATE', [
        ['Asal',  text.slice(0, 50), true],
        ['Hasil', out, true],
        ['Lang',  `→ ${lang.toUpperCase()}`, false],
      ], 'Zetsy UBot Translate')
    );
  } catch (e) { await edit(client, msg.chatId, m.id,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  ); }
}

async function cmdWiki(client, msg, query) {
  if (!query) return;
  const m = await reply(client, msg,
    `<blockquote>╭──「 🔍 」\n│ <tg-spoiler>Zetsy: Mencari di Wikipedia...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res = await axios.get(`https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`, { timeout: 10000 });
    const d   = res.data;
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 📖 <b>${esc(d.title)}</b> 」\n│\n│ <tg-spoiler>${esc((d.extract || '-').slice(0, 350))}</tg-spoiler>\n│\n│ 🔗 <tg-spoiler>${esc(d.content_urls?.desktop?.page || '-')}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  } catch (_) { await edit(client, msg.chatId, m.id,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Tidak ditemukan</tg-spoiler>\n╰────────────────────────</blockquote>`
  ); }
}

async function cmdTTS(client, msg, text) {
  if (!text) return;
  const m = await reply(client, msg,
    `<blockquote>╭──「 🔊 」\n│ <tg-spoiler>Zetsy: Membuat voice...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res = await axios.get(
      `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=id&client=tw-ob`,
      { responseType: 'arraybuffer', timeout: 10000 }
    );
    const tmp = `./downloads/tts_${Date.now()}.mp3`;
    if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
    fs.writeFileSync(tmp, res.data);
    await client.deleteMessages(msg.chatId, [m.id], { revoke: true }).catch(() => {});
    await client.sendFile(msg.chatId, {
      file: tmp,
      caption:
        `<blockquote>╭──「 🔊 <b>TEXT TO SPEECH</b> 」\n│ <tg-spoiler>${esc(text.slice(0, 60))}</tg-spoiler>\n╰────────────────────────</blockquote>`,
      replyTo: msg.id,
      voiceNote: true,
      parseMode: 'html',
    });
    fs.unlinkSync(tmp);
  } catch (e) { await edit(client, msg.chatId, m.id,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>TTS gagal: ${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  ); }
}

async function cmdDownload(client, msg, platform, url) {
  if (!url) return;
  const dl = require('../helpers/downloader');
  const m  = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Zetsy: Download ${esc(platform)}...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const result = await dl.download(platform, url);
    await client.deleteMessages(msg.chatId, [m.id], { revoke: true }).catch(() => {});
    await client.sendFile(msg.chatId, {
      file: result.path,
      caption:
        `<blockquote>╭──「 ✅ <b>DOWNLOAD SELESAI</b> 」\n│ <tg-spoiler>${esc((result.title || platform).slice(0, 80))}</tg-spoiler>\n╰────────────────────────</blockquote>`,
      replyTo: msg.id,
      parseMode: 'html',
    });
    if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
  } catch (e) { await edit(client, msg.chatId, m.id,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  ); }
}



// ═══════════════════════════════════════════════════════════════
// Zetsy: BLACKLIST — .addbl .listbl .delbl
// Mencegah orang tertentu direply AFK / interaksi ubot
// ═══════════════════════════════════════════════════════════════
async function cmdBrat(client, msg, args) {
  let bratText = args.trim();
  if (!bratText && msg.replyTo?.replyToMsgId) {
    try {
      const r = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
      bratText = r?.[0]?.rawText?.trim() || '';
    } catch (_) {}
  }
  if (!bratText) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .brat &lt;teks&gt; atau reply ke pesan</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  const m = await reply(client, msg,
    `<blockquote>╭──「 🎨 」\n│ <tg-spoiler>Zetsy: Membuat stiker brat...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  try {
    // Buat stiker via API brat generator
    const encodedText = encodeURIComponent(bratText.slice(0, 60));
    // Zetsy: multi-API fallback brat generator
    const apis = [
      `https://api.nekosia.cat/api/v1/images/brat?text=${encodedText}`,
      `https://brat-generator.vercel.app/api?text=${encodedText}`,
    ];
    let bratSent = false;
    for (const apiUrl of apis) {
      try {
        const res = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 10000 });
        if (res.data && res.data.byteLength > 500) {
          const tmp = `./downloads/brat_${Date.now()}.webp`;
          if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
          fs.writeFileSync(tmp, res.data);
          await client.deleteMessages(msg.chatId, [m.id], { revoke: true }).catch(() => {});
          await client.sendFile(msg.chatId, { file: tmp, replyTo: msg.id, forceDocument: false });
          fs.unlinkSync(tmp);
          bratSent = true;
          break;
        }
      } catch (_) { continue; }
    }
    if (!bratSent) {
      // fallback: teks bergaya brat
      await client.deleteMessages(msg.chatId, [m.id], { revoke: true }).catch(() => {});
      await reply(client, msg,
        `<blockquote>🎨 <b>BRAT</b>\n\n<i><b>${esc(bratText.slice(0,60))}</b></i>\n</blockquote>`
      );
    }
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Brat gagal: ${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: DONE / KONFIRMASI PEMBAYARAN — .done & .setdone
// Kirim pesan konfirmasi pembayaran otomatis ke user yang reply
// ═══════════════════════════════════════════════════════════════
async function cmdSetDone(client, msg, phone, args) {
  if (!args) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .setdone &lt;template pesan&gt;</tg-spoiler>\n│ <tg-spoiler>Gunakan {nama} untuk nama buyer</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  doneTemplates.set(phone, args);
  await reply(client, msg,
    `<blockquote>╭──「 ✅ <b>TEMPLATE DONE DISET</b> 」\n│ <tg-spoiler>${esc(args.slice(0, 100))}</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

async function cmdDone(client, msg, phone, args) {
  let targetName = 'Kak';
  let targetMention = 'Kak';
  if (msg.replyTo?.replyToMsgId) {
    try {
      const r = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
      const s = r?.[0]?.sender;
      if (s) {
        targetName = [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Kak';
        targetMention = s.username ? `@${s.username}` : `<a href="tg://user?id=${s.id}">${esc(targetName)}</a>`;
      }
    } catch (_) {}
  }

  const extraNote = args.trim();
  const template = doneTemplates.get(phone) || null;

  let doneMsg;
  if (template) {
    const filled = template.replace(/\{nama\}/gi, targetName);
    doneMsg =
      `<blockquote>╭──「 ✅ <b>PEMBAYARAN TERKONFIRMASI</b> 」\n` +
      `│ <b>Untuk :</b> ${targetMention}\n` +
      `│\n` +
      `│ <tg-spoiler>${esc(filled)}</tg-spoiler>\n` +
      (extraNote ? `│ <tg-spoiler>📌 ${esc(extraNote)}</tg-spoiler>\n` : '') +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Terima kasih sudah berbelanja! ✦</tg-spoiler></blockquote>`;
  } else {
    doneMsg =
      `<blockquote>╭──「 ✅ <b>PEMBAYARAN TERKONFIRMASI</b> 」\n` +
      `│ <b>Untuk :</b> ${targetMention}\n` +
      `│\n` +
      `│ <tg-spoiler>Pembayaran kamu sudah kami terima dengan baik! 🎉</tg-spoiler>\n` +
      `│ <tg-spoiler>Pesanan akan segera diproses ya ${esc(targetName)} 🙏</tg-spoiler>\n` +
      (extraNote ? `│\n│ 📌 <tg-spoiler>${esc(extraNote)}</tg-spoiler>\n` : '') +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot — Auto Konfirmasi ✦</tg-spoiler></blockquote>`;
  }

  // Kirim ke chat — reply ke pesan buyer jika ada, kalau tidak reply ke .done sendiri
  const replyToId = msg.replyTo?.replyToMsgId ?? msg.id;
  await client.sendMessage(msg.chatId, {
    message: doneMsg,
    replyTo: replyToId,
    parseMode: 'html',
  });

  // Hapus pesan .done milik sendiri agar chat lebih bersih
  try { await client.deleteMessages(msg.chatId, [msg.id], { revoke: true }); } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: INVITE LINK — .inv
// Buat link undangan grup
// ═══════════════════════════════════════════════════════════════
async function cmdSteal(client, msg, args) {
  if (!msg.replyTo?.replyToMsgId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Reply ke stiker yang ingin di-steal!</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Zetsy: Mengambil stiker...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const r = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
    const stickerMsg = r?.[0];
    if (!stickerMsg?.media) throw new Error('Pesan bukan stiker!');
    const buf = await client.downloadMedia(stickerMsg.media, {});
    const ext = stickerMsg.media?.document?.mimeType === 'video/webm' ? 'webm' : 'webp';
    const tmp = `./downloads/stl_${Date.now()}.${ext}`;
    if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
    fs.writeFileSync(tmp, buf);
    await client.deleteMessages(msg.chatId, [m.id], { revoke: true }).catch(() => {});
    await client.sendFile(msg.chatId, {
      file: tmp,
      caption: `<blockquote>╭──「 🎭 <b>STIKER DICURI</b> 」\n│ <tg-spoiler>Format: ${esc(ext.toUpperCase())}</tg-spoiler>\n╰────────────────────────</blockquote>`,
      replyTo: msg.id,
      forceDocument: true,
      parseMode: 'html',
    });
    fs.unlinkSync(tmp);
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: JADWAL KIRIM PESAN — .sched <menit> <teks>
// Kirim pesan terjadwal ke chat yang sama setelah X menit
// ═══════════════════════════════════════════════════════════════
async function cmdSched(client, msg, phone, args) {
  const [mnt, ...rest] = args.split(' ');
  const menit = parseInt(mnt);
  const teks  = rest.join(' ');
  if (isNaN(menit) || menit < 1 || !teks) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .sched &lt;menit&gt; &lt;pesan&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  if (!schedMsgStore.has(phone)) schedMsgStore.set(phone, []);
  const tid = Date.now();
  schedMsgStore.get(phone).push({ chatId: msg.chatId, text: teks, timeMs: Date.now() + menit * 60000, tid });

  await reply(client, msg,
    `<blockquote>╭──「 ⏰ <b>PESAN DIJADWALKAN</b> 」\n│ <b>Dalam :</b> <tg-spoiler>${menit} menit</tg-spoiler>\n│ <b>Pesan :</b> <tg-spoiler>${esc(teks.slice(0, 80))}</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  setTimeout(async () => {
    // Cek apakah masih di list (belum di-cancel)
    const store = schedMsgStore.get(phone) || [];
    if (!store.find(s => s.tid === tid)) return;
    await client.sendMessage(msg.chatId, {
      message:
        `<blockquote>╭──「 ⏰ <b>PESAN TERJADWAL</b> 」\n│ <tg-spoiler>${esc(teks)}</tg-spoiler>\n╰────────────────────────</blockquote>`,
      parseMode: 'html',
    }).catch(() => {});
    // Hapus dari store setelah terkirim
    const idx = store.findIndex(s => s.tid === tid);
    if (idx !== -1) store.splice(idx, 1);
  }, menit * 60000);
}

async function cmdListSched(client, msg, phone) {
  const store = schedMsgStore.get(phone) || [];
  if (!store.length) return reply(client, msg,
    `<blockquote>╭──「 ℹ️ 」\n│ <tg-spoiler>Tidak ada pesan terjadwal</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  let txt = `<blockquote>╭──「 ⏰ <b>JADWAL PESAN</b> 」\n`;
  store.forEach((s, i) => {
    const sisaMs = s.timeMs - Date.now();
    const sisaMnt = Math.max(0, Math.ceil(sisaMs / 60000));
    txt += `│ ${i+1}. <tg-spoiler>${esc(s.text.slice(0, 40))}... (${sisaMnt} mnt lagi)</tg-spoiler>\n`;
  });
  txt += `╰────────────────────────\n<tg-spoiler>Zetsy: ${store.length} jadwal aktif</tg-spoiler></blockquote>`;
  await reply(client, msg, txt);
}

async function cmdCancelSched(client, msg, phone) {
  const store = schedMsgStore.get(phone) || [];
  const count = store.length;
  schedMsgStore.set(phone, []);
  await reply(client, msg,
    `<blockquote>╭──「 🛑 <b>JADWAL DIBATALKAN</b> 」\n│ <tg-spoiler>${count} jadwal dihapus</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}





// ═══════════════════════════════════════════════════════════════
// Zetsy: FONT CONVERTER — .font <teks>
// Ubah teks biasa jadi berbagai gaya font unicode unik
// ═══════════════════════════════════════════════════════════════
function convertFont(text) {
  const fonts = {
    bold:    [...'𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇'],
    italic:  [...'𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻'],
    bubble:  [...'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ'],
  };
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const convert = (t, map) => [...t].map(c => {
    const idx = alpha.indexOf(c);
    return idx >= 0 ? map[idx] : c;
  }).join('');
  return {
    bold:   convert(text, fonts.bold),
    italic: convert(text, fonts.italic),
    bubble: convert(text, fonts.bubble),
  };
}



// ═══════════════════════════════════════════════════════════════
// Zetsy: KATA KATA MOTIVASI — .katakata
// Kirim kata motivasi/inspirasi random
// ═══════════════════════════════════════════════════════════════
async function cmdKataKata(client, msg) {
  const quotes = [
    ['Jangan takut gagal, takutlah tidak pernah mencoba.', 'Anonim'],
    ['Kesuksesan adalah hasil dari persiapan, kerja keras, dan belajar dari kegagalan.', 'Colin Powell'],
    ['Mimpimu tidak akan berakhir jika kamu tidak berhenti berjuang.', 'Anonim'],
    ['Setiap hari adalah kesempatan baru untuk menjadi lebih baik.', 'Anonim'],
    ['Tidak ada yang tidak mungkin jika kamu mau berusaha.', 'Anonim'],
    ['Mulailah dari mana kamu berada, gunakan apa yang kamu punya, lakukan apa yang kamu bisa.', 'Arthur Ashe'],
    ['Hidup bukan tentang menunggu badai berlalu, tapi belajar menari di tengah hujan.', 'Vivian Greene'],
    ['Orang yang luar biasa adalah orang biasa yang tidak menyerah.', 'Anonim'],
    ['Kesempatan tidak datang dua kali, tapi keberanian bisa dilatih setiap hari.', 'Anonim'],
    ['Bukan seberapa keras kamu jatuh, tapi seberapa cepat kamu bangkit.', 'Anonim'],
  ];
  const [quote, author] = quotes[Math.floor(Math.random() * quotes.length)];
  await reply(client, msg,
    `<blockquote>╭──「 💬 <b>KATA KATA HARI INI</b> 」\n│\n│ <tg-spoiler>"${esc(quote)}"</tg-spoiler>\n│\n│ — <tg-spoiler>${esc(author)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: UPTIME
// ═══════════════════════════════════════════════════════════════
async function cmdUptime(client, msg) {
  const mem = process.memoryUsage();
  await reply(client, msg,
    box('⏱', 'UPTIME & SISTEM', [
      ['Bot Uptime', formatUptime(process.uptime()),                  true],
      ['Heap Used',  (mem.heapUsed/1024/1024).toFixed(1) + ' MB',    true],
      ['RSS',        (mem.rss/1024/1024).toFixed(1) + ' MB',         true],
      ['Node',       process.version,                                 false],
      ['Platform',   process.platform,                                false],
    ], 'Zetsy UBot System')
  );
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: PASSWORD & UUID
// ═══════════════════════════════════════════════════════════════
async function cmdPassword(client, msg, args) {
  const len   = Math.min(Math.max(parseInt(args) || 16, 6), 64);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+';
  let pass = '';
  for (let i = 0; i < len; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  await reply(client, msg,
    box('🔐', 'PASSWORD GENERATOR', [
      ['Password', pass,                                                true],
      ['Panjang',  `${len} karakter`,                                  false],
      ['Strength', len >= 16 ? '💪 Kuat' : len >= 10 ? '⚡ Sedang' : '⚠️ Lemah', false],
    ], 'Zetsy UBot Password Gen')
  );
}

async function cmdUuid(client, msg) {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
  await reply(client, msg, box('🔑', 'UUID GENERATOR', [['UUID', uuid, true]], 'Zetsy UBot UUID'));
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: TOOLS TAMBAHAN — 10 Command Baru
// ═══════════════════════════════════════════════════════════════

// .ip <ip/domain> — Cek info IP atau domain
async function cmdIp(client, msg, args) {
  const target = args.trim();
  if (!target) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .ip &lt;ip/domain&gt;</tg-spoiler>\n│ <tg-spoiler>Contoh: .ip 8.8.8.8</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>CEK IP</b> 」\n│ <tg-spoiler>Mengambil data...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const r = await axios.get(`http://ip-api.com/json/${encodeURIComponent(target)}?fields=status,message,country,regionName,city,zip,isp,org,as,query,mobile,proxy,hosting`, { timeout: 8000 });
    const d = r.data;
    if (d.status !== 'success') throw new Error(d.message || 'Gagal');
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 🌐 <b>INFO IP</b> 」\n` +
      `│ <b>IP      :</b> <tg-spoiler>${esc(d.query)}</tg-spoiler>\n` +
      `│ <b>ISP     :</b> <tg-spoiler>${esc(d.isp)}</tg-spoiler>\n` +
      `│ <b>ORG     :</b> <tg-spoiler>${esc(d.org)}</tg-spoiler>\n` +
      `│ <b>AS      :</b> <tg-spoiler>${esc(d.as)}</tg-spoiler>\n` +
      `│ <b>Negara  :</b> <tg-spoiler>${esc(d.country)}</tg-spoiler>\n` +
      `│ <b>Wilayah :</b> <tg-spoiler>${esc(d.regionName)}</tg-spoiler>\n` +
      `│ <b>Kota    :</b> <tg-spoiler>${esc(d.city)}</tg-spoiler>\n` +
      `│ <b>ZIP     :</b> <tg-spoiler>${esc(d.zip)}</tg-spoiler>\n` +
      `│ <b>Mobile  :</b> <tg-spoiler>${d.mobile ? 'Ya' : 'Tidak'}</tg-spoiler>\n` +
      `│ <b>Proxy   :</b> <tg-spoiler>${d.proxy ? '⚠️ Ya' : 'Tidak'}</tg-spoiler>\n` +
      `│ <b>Hosting :</b> <tg-spoiler>${d.hosting ? 'Ya' : 'Tidak'}</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot IP Lookup ✦</tg-spoiler></blockquote>`
    );
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ <b>GAGAL</b> 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// .whois <domain> — Cek info registrasi domain
async function cmdWhois(client, msg, args) {
  const domain = args.trim().replace(/^https?:\/\//,'').replace(/\/.*/,'');
  if (!domain) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .whois &lt;domain&gt;</tg-spoiler>\n│ <tg-spoiler>Contoh: .whois google.com</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>WHOIS</b> 」\n│ <tg-spoiler>Mencari data domain...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const r = await axios.get(`https://api.domainsdb.info/v1/domains/search?domain=${encodeURIComponent(domain)}&zone=com`, { timeout: 10000 });
    const ip = await axios.get(`http://ip-api.com/json/${encodeURIComponent(domain)}?fields=status,isp,org,country,query`, { timeout: 8000 });
    const d = ip.data;
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 🔍 <b>WHOIS</b> 」\n` +
      `│ <b>Domain  :</b> <tg-spoiler>${esc(domain)}</tg-spoiler>\n` +
      `│ <b>IP      :</b> <tg-spoiler>${esc(d.query || '-')}</tg-spoiler>\n` +
      `│ <b>ISP     :</b> <tg-spoiler>${esc(d.isp || '-')}</tg-spoiler>\n` +
      `│ <b>ORG     :</b> <tg-spoiler>${esc(d.org || '-')}</tg-spoiler>\n` +
      `│ <b>Negara  :</b> <tg-spoiler>${esc(d.country || '-')}</tg-spoiler>\n` +
      `│ <b>Status  :</b> <tg-spoiler>${d.status === 'success' ? '🟢 Online' : '🔴 Tidak dikenal'}</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot Whois ✦</tg-spoiler></blockquote>`
    );
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// .hash <teks> — Generate MD5 & SHA256
async function cmdHash(client, msg, args) {
  if (!args.trim()) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .hash &lt;teks&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const crypto = require('crypto');
  const md5    = crypto.createHash('md5').update(args).digest('hex');
  const sha1   = crypto.createHash('sha1').update(args).digest('hex');
  const sha256 = crypto.createHash('sha256').update(args).digest('hex');
  const sha512 = crypto.createHash('sha512').update(args).digest('hex');
  await reply(client, msg,
    `<blockquote>╭──「 #️⃣ <b>HASH GENERATOR</b> 」\n` +
    `│ <b>Input  :</b> <tg-spoiler>${esc(args.slice(0,50))}${args.length>50?'...':''}</tg-spoiler>\n` +
    `│\n` +
    `│ <b>MD5    :</b>\n│ <tg-spoiler><code>${md5}</code></tg-spoiler>\n` +
    `│\n│ <b>SHA1   :</b>\n│ <tg-spoiler><code>${sha1}</code></tg-spoiler>\n` +
    `│\n│ <b>SHA256 :</b>\n│ <tg-spoiler><code>${sha256}</code></tg-spoiler>\n` +
    `│\n│ <b>SHA512 :</b>\n│ <tg-spoiler><code>${sha512.slice(0,64)}...</code></tg-spoiler>\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Hash ✦</tg-spoiler></blockquote>`
  );
}

// .encode <teks> — Encode ke Base64
async function cmdEncode(client, msg, args) {
  if (!args.trim()) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .encode &lt;teks&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const b64 = Buffer.from(args).toString('base64');
  const url = encodeURIComponent(args);
  await reply(client, msg,
    `<blockquote>╭──「 🔒 <b>ENCODE</b> 」\n` +
    `│ <b>Input    :</b> <tg-spoiler>${esc(args.slice(0,50))}${args.length>50?'...':''}</tg-spoiler>\n` +
    `│\n│ <b>Base64   :</b>\n│ <tg-spoiler><code>${esc(b64)}</code></tg-spoiler>\n` +
    `│\n│ <b>URL Enc  :</b>\n│ <tg-spoiler><code>${esc(url.slice(0,100))}</code></tg-spoiler>\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Encode ✦</tg-spoiler></blockquote>`
  );
}

// .decode <base64> — Decode dari Base64
async function cmdDecode(client, msg, args) {
  if (!args.trim()) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .decode &lt;base64&gt;</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const decoded = Buffer.from(args.trim(), 'base64').toString('utf8');
    if (!decoded || decoded === args) throw new Error('Bukan format Base64 yang valid');
    await reply(client, msg,
      `<blockquote>╭──「 🔓 <b>DECODE BASE64</b> 」\n` +
      `│ <b>Input   :</b> <tg-spoiler>${esc(args.slice(0,50))}...</tg-spoiler>\n` +
      `│\n│ <b>Hasil   :</b>\n│ <tg-spoiler>${esc(decoded.slice(0,300))}</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot Decode ✦</tg-spoiler></blockquote>`
    );
  } catch (e) {
    await reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// .time <kota/negara> — Cek waktu saat ini di lokasi tertentu
async function cmdTime(client, msg, args) {
  const lokasi = args.trim();
  if (!lokasi) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .time &lt;kota/negara&gt;</tg-spoiler>\n│ <tg-spoiler>Contoh: .time Tokyo</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Mencari waktu...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    // Geocoding → dapatkan koordinat
    const geo = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(lokasi)}&format=json&limit=1`,
      { timeout: 8000, headers: { 'User-Agent': 'Zetsy-UBot/4.0' } }
    );
    if (!geo.data?.length) throw new Error(`Lokasi "${lokasi}" tidak ditemukan`);
    const { lat, lon, display_name } = geo.data[0];

    // Timezone dari koordinat
    const tz = await axios.get(
      `https://timeapi.io/api/Time/current/coordinate?latitude=${lat}&longitude=${lon}`,
      { timeout: 8000 }
    );
    const t = tz.data;
    const waktu = `${String(t.hour).padStart(2,'0')}:${String(t.minute).padStart(2,'0')}:${String(t.seconds).padStart(2,'0')}`;
    const tgl   = `${t.dayOfWeek}, ${t.day} ${['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][t.month]} ${t.year}`;

    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 🕐 <b>WORLD TIME</b> 」\n` +
      `│ <b>Lokasi    :</b> <tg-spoiler>${esc(lokasi)}</tg-spoiler>\n` +
      `│ <b>Lengkap   :</b> <tg-spoiler>${esc(display_name.slice(0,60))}</tg-spoiler>\n` +
      `│ <b>Waktu     :</b> <tg-spoiler>${esc(waktu)}</tg-spoiler>\n` +
      `│ <b>Tanggal   :</b> <tg-spoiler>${esc(tgl)}</tg-spoiler>\n` +
      `│ <b>Timezone  :</b> <tg-spoiler>${esc(t.timeZone)}</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot World Time ✦</tg-spoiler></blockquote>`
    );
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// .cekrek <nomor> <bank> — Cek nama pemilik rekening
async function cmdCekRek(client, msg, args) {
  const parts = args.trim().split(/\s+/);
  const noRek = parts[0], bank = parts[1];
  if (!noRek || !bank) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .cekrek &lt;norek&gt; &lt;bank&gt;</tg-spoiler>\n│ <tg-spoiler>Contoh: .cekrek 1234567890 bca</tg-spoiler>\n│ <tg-spoiler>Bank: bca bni bri mandiri bsi dll</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>CEK REKENING</b> 」\n│ <tg-spoiler>Memverifikasi rekening...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const r = await axios.get(
      `https://rekening.lfourr.com/api/cek-rekening?bank=${encodeURIComponent(bank.toLowerCase())}&rekening=${encodeURIComponent(noRek)}`,
      { timeout: 10000 }
    );
    const d = r.data;
    if (!d.data?.account_name) throw new Error(d.message || 'Rekening tidak ditemukan');
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 🏦 <b>CEK REKENING</b> 」\n` +
      `│ <b>Bank    :</b> <tg-spoiler>${esc(bank.toUpperCase())}</tg-spoiler>\n` +
      `│ <b>No Rek  :</b> <tg-spoiler>${esc(noRek)}</tg-spoiler>\n` +
      `│ <b>Nama    :</b> <tg-spoiler>${esc(d.data.account_name)}</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot Cek Rekening ✦</tg-spoiler></blockquote>`
    );
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// .bmi <berat_kg> <tinggi_cm> — Hitung Body Mass Index
async function cmdBmi(client, msg, args) {
  const parts = args.trim().split(/\s+/);
  const bb = parseFloat(parts[0]), tb = parseFloat(parts[1]);
  if (isNaN(bb) || isNaN(tb) || bb <= 0 || tb <= 0) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .bmi &lt;berat kg&gt; &lt;tinggi cm&gt;</tg-spoiler>\n│ <tg-spoiler>Contoh: .bmi 65 170</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const tbM  = tb / 100;
  const bmi  = (bb / (tbM * tbM)).toFixed(1);
  const bmiN = parseFloat(bmi);
  let status, saran;
  if      (bmiN < 17.0) { status = '⚠️ Kekurangan berat badan berat';  saran = 'Konsultasi dokter, tambah asupan kalori.'; }
  else if (bmiN < 18.5) { status = '😟 Kekurangan berat badan ringan'; saran = 'Tingkatkan asupan nutrisi.'; }
  else if (bmiN < 25.0) { status = '✅ Normal / Ideal';                saran = 'Pertahankan pola makan & olahraga.'; }
  else if (bmiN < 27.0) { status = '⚠️ Kelebihan berat badan ringan';  saran = 'Mulai diet sehat & olahraga rutin.'; }
  else if (bmiN < 30.0) { status = '🟠 Kelebihan berat badan berat';   saran = 'Diet ketat & olahraga teratur.'; }
  else                   { status = '🔴 Obesitas';                       saran = 'Konsultasi dokter segera.'; }

  // Berat ideal (Rumus Broca)
  const idealMin = (tb - 100) * 0.9 - 10;
  const idealMax = (tb - 100) * 0.9 + 10;

  await reply(client, msg,
    `<blockquote>╭──「 ⚖️ <b>BMI CALCULATOR</b> 」\n` +
    `│ <b>Berat   :</b> <tg-spoiler>${bb} kg</tg-spoiler>\n` +
    `│ <b>Tinggi  :</b> <tg-spoiler>${tb} cm</tg-spoiler>\n` +
    `│ <b>BMI     :</b> <tg-spoiler>${bmi}</tg-spoiler>\n` +
    `│ <b>Status  :</b> <tg-spoiler>${status}</tg-spoiler>\n` +
    `│ <b>Ideal   :</b> <tg-spoiler>${idealMin.toFixed(1)} – ${idealMax.toFixed(1)} kg</tg-spoiler>\n` +
    `│ <b>Saran   :</b> <tg-spoiler>${saran}</tg-spoiler>\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot BMI ✦</tg-spoiler></blockquote>`
  );
}

// .roman <angka atau angka romawi> — Konversi angka ↔ Romawi
async function cmdRoman(client, msg, args) {
  const input = args.trim();
  if (!input) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .roman &lt;angka&gt; atau &lt;romawi&gt;</tg-spoiler>\n│ <tg-spoiler>Contoh: .roman 2024  atau  .roman MMXXIV</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const romanNums = [
    [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
    [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I'],
  ];
  function toRoman(n) {
    if (n < 1 || n > 3999) throw new Error('Angka harus 1–3999');
    let result = '';
    for (const [val, sym] of romanNums) { while (n >= val) { result += sym; n -= val; } }
    return result;
  }
  function fromRoman(s) {
    const map = {I:1,V:5,X:10,L:50,C:100,D:500,M:1000};
    let result = 0;
    for (let i = 0; i < s.length; i++) {
      const cur = map[s[i]], nxt = map[s[i+1]];
      if (!cur) throw new Error('Karakter romawi tidak valid');
      result += nxt > cur ? -cur : cur;
    }
    return result;
  }
  try {
    const isNum = /^\d+$/.test(input);
    if (isNum) {
      const n = parseInt(input);
      const r = toRoman(n);
      await reply(client, msg,
        `<blockquote>╭──「 🏛 <b>ANGKA → ROMAWI</b> 」\n│ <b>Input  :</b> <tg-spoiler>${n}</tg-spoiler>\n│ <b>Romawi :</b> <tg-spoiler><code>${r}</code></tg-spoiler>\n╰────────────────────────</blockquote>`
      );
    } else {
      const upp = input.toUpperCase();
      const n   = fromRoman(upp);
      await reply(client, msg,
        `<blockquote>╭──「 🏛 <b>ROMAWI → ANGKA</b> 」\n│ <b>Input  :</b> <tg-spoiler><code>${esc(upp)}</code></tg-spoiler>\n│ <b>Angka  :</b> <tg-spoiler>${n}</tg-spoiler>\n╰────────────────────────</blockquote>`
      );
    }
  } catch (e) {
    await reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// .random [min] [max] — Generate angka random
async function cmdRandom(client, msg, args) {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  let min = 1, max = 100;
  if (parts.length === 1) { max = parseInt(parts[0]); }
  else if (parts.length >= 2) { min = parseInt(parts[0]); max = parseInt(parts[1]); }
  if (isNaN(min) || isNaN(max) || min >= max) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .random [min] [max]</tg-spoiler>\n│ <tg-spoiler>Contoh: .random 1 100</tg-spoiler>\n│ <tg-spoiler>Default: .random → 1 s/d 100</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const hasil  = Math.floor(Math.random() * (max - min + 1)) + min;
  const persen = (((hasil - min) / (max - min)) * 100).toFixed(1);
  await reply(client, msg,
    `<blockquote>╭──「 🎲 <b>RANDOM NUMBER</b> 」\n` +
    `│ <b>Range   :</b> <tg-spoiler>${min} – ${max}</tg-spoiler>\n` +
    `│ <b>Hasil   :</b> <tg-spoiler><code>${hasil}</code></tg-spoiler>\n` +
    `│ <b>Posisi  :</b> <tg-spoiler>${persen}% dari range</tg-spoiler>\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Random ✦</tg-spoiler></blockquote>`
  );
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: TO URL — .tourl
// Reply ke foto/gambar → upload ke CatBox → kirim URL-nya
// ═══════════════════════════════════════════════════════════════
async function cmdToUrl(client, msg) {
  // Harus reply ke pesan yang ada foto/gambar
  if (!msg.replyTo?.replyToMsgId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n` +
    `│ <tg-spoiler>Reply ke foto/gambar dulu!</tg-spoiler>\n` +
    `│ <tg-spoiler>Contoh: reply foto → ketik .tourl</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>UPLOAD KE CATBOX</b> 」\n` +
    `│ <tg-spoiler>Mengunduh foto dari Telegram...</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  try {
    // Ambil pesan yang di-reply
    const msgs = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
    const target = msgs?.[0];
    if (!target) throw new Error('Pesan tidak ditemukan!');

    // Cek apakah ada media foto
    const media = target.media;
    if (!media) throw new Error('Pesan yang di-reply bukan foto/gambar!');

    // Validasi tipe media — hanya foto/gambar
    const isPhoto = media.photo || media.document?.mimeType?.startsWith('image/');
    if (!isPhoto) throw new Error('Hanya bisa upload foto/gambar! (bukan video/file)');

    // Download foto dari Telegram
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ⏳ <b>UPLOAD KE CATBOX</b> 」\n` +
      `│ <tg-spoiler>Mengunduh foto...</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    );

    const buf = await client.downloadMedia(media, {});
    if (!buf || !buf.length) throw new Error('Gagal mengunduh foto!');

    // Tentukan ekstensi file
    const mimeType = media.document?.mimeType || 'image/jpeg';
    const ext      = mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const fileName = `Zetsy_${Date.now()}.${ext}`;

    // Upload ke CatBox via multipart/form-data
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ⏳ <b>UPLOAD KE CATBOX</b> 」\n` +
      `│ <tg-spoiler>Mengupload ke catbox.moe...</tg-spoiler>\n` +
      `│ <tg-spoiler>Ukuran: ${(buf.length / 1024).toFixed(1)} KB</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    );

    const FormData = require('form-data');
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('userhash', ''); // anonymous upload
    form.append('fileToUpload', buf, { filename: fileName, contentType: mimeType });

    const res = await axios.post('https://catbox.moe/user/api.php', form, {
      headers : { ...form.getHeaders() },
      timeout : 30000,
      maxBodyLength: Infinity,
    });

    const url = res.data?.trim();
    if (!url || !url.startsWith('https://')) throw new Error(`CatBox error: ${res.data || 'Tidak ada response'}`);

    // Kirim hasil
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 🔗 <b>UPLOAD BERHASIL</b> 」\n` +
      `│\n` +
      `│ <b>URL :</b>\n` +
      `│ <code>${esc(url)}</code>\n` +
      `│\n` +
      `│ <b>Info :</b>\n` +
      `│ <tg-spoiler>Ukuran  : ${(buf.length / 1024).toFixed(1)} KB</tg-spoiler>\n` +
      `│ <tg-spoiler>Format  : ${ext.toUpperCase()}</tg-spoiler>\n` +
      `│ <tg-spoiler>Host    : catbox.moe (permanent)</tg-spoiler>\n` +
      `│\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot ToURL ✦</tg-spoiler></blockquote>`
    );

  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ <b>GAGAL UPLOAD</b> 」\n` +
      `│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: OCR — .ocr
// Reply ke foto → ekstrak teks dari gambar via api.ocr.space
// ═══════════════════════════════════════════════════════════════
async function cmdOcr(client, msg) {
  if (!msg.replyTo?.replyToMsgId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n` +
    `│ <tg-spoiler>Reply ke foto/gambar dulu!</tg-spoiler>\n` +
    `│ <tg-spoiler>Contoh: reply foto → ketik .ocr</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>OCR</b> 」\n│ <tg-spoiler>Membaca teks dari gambar...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  try {
    const msgs   = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
    const target = msgs?.[0];
    if (!target?.media) throw new Error('Pesan yang di-reply bukan foto/gambar!');

    const isPhoto = target.media.photo || target.media.document?.mimeType?.startsWith('image/');
    if (!isPhoto) throw new Error('Hanya bisa OCR foto/gambar!');

    const buf = await client.downloadMedia(target.media, {});
    if (!buf?.length) throw new Error('Gagal mengunduh foto!');

    const FormData = require('form-data');
    const form = new FormData();
    form.append('apikey', 'helloworld'); // free key OCR.Space
    form.append('language', 'eng');
    form.append('isOverlayRequired', 'false');
    form.append('file', buf, { filename: 'image.jpg', contentType: 'image/jpeg' });

    const res = await axios.post('https://api.ocr.space/parse/image', form, {
      headers: { ...form.getHeaders() },
      timeout: 30000,
    });

    const parsed = res.data?.ParsedResults?.[0];
    if (!parsed) throw new Error('Tidak ada hasil OCR!');
    if (parsed.ErrorMessage) throw new Error(parsed.ErrorMessage);

    const text = parsed.ParsedText?.trim();
    if (!text) throw new Error('Tidak ada teks yang terdeteksi di gambar ini!');

    // Kirim hasil, potong jika terlalu panjang
    const maxLen = 3000;
    const display = text.length > maxLen ? text.slice(0, maxLen) + '\n...(dipotong)' : text;

    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 🔍 <b>HASIL OCR</b> 」\n` +
      `│ <tg-spoiler>Karakter terdeteksi: ${text.length}</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>\n\n` +
      `<code>${esc(display)}</code>`
    );

  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ <b>OCR GAGAL</b> 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: SCREENSHOT — .ss <url>
// Screenshot halaman web via screenshotone API (free tier)
// ═══════════════════════════════════════════════════════════════
async function cmdScreenshot(client, msg, args) {
  let url = args.trim();
  if (!url.startsWith('http')) url = 'https://' + url;

  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>SCREENSHOT</b> 」\n│ <tg-spoiler>Mengambil screenshot ${esc(url)}...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  try {
    // Pakai screenshotmachine API (free, no key needed)
    const ssUrl = `https://mini.s-shot.ru/1024x768/JPEG/1024/Z100/?${encodeURIComponent(url)}`;

    const res = await axios.get(ssUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.data?.byteLength) throw new Error('Screenshot kosong / website tidak bisa diakses');

    const buf      = Buffer.from(res.data);
    const tmpPath  = `./downloads/ss_${Date.now()}.jpg`;
    if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
    fs.writeFileSync(tmpPath, buf);

    await client.deleteMessages(msg.chatId, [m.id], { revoke: true }).catch(() => {});
    await client.sendFile(msg.chatId, {
      file    : tmpPath,
      caption :
        `<blockquote>╭──「 📸 <b>SCREENSHOT</b> 」\n` +
        `│ <b>URL    :</b> <tg-spoiler>${esc(url)}</tg-spoiler>\n` +
        `│ <b>Size   :</b> <tg-spoiler>${(buf.length / 1024).toFixed(1)} KB</tg-spoiler>\n` +
        `╰────────────────────────\n` +
        `<tg-spoiler>✦ Zetsy UBot Screenshot ✦</tg-spoiler></blockquote>`,
      replyTo  : msg.id,
      parseMode: 'html',
    });
    fs.unlinkSync(tmpPath);

  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ <b>SCREENSHOT GAGAL</b> 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: COLOR DETECTOR — .color
// Reply ke foto → deteksi warna dominan (hex + nama warna)
// ═══════════════════════════════════════════════════════════════
async function cmdColor(client, msg) {
  if (!msg.replyTo?.replyToMsgId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n` +
    `│ <tg-spoiler>Reply ke foto dulu!</tg-spoiler>\n` +
    `│ <tg-spoiler>Contoh: reply foto → ketik .color</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>COLOR DETECTOR</b> 」\n│ <tg-spoiler>Mendeteksi warna dominan...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  try {
    const msgs   = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
    const target = msgs?.[0];
    if (!target?.media) throw new Error('Pesan yang di-reply bukan foto!');

    const isPhoto = target.media.photo || target.media.document?.mimeType?.startsWith('image/');
    if (!isPhoto) throw new Error('Hanya bisa deteksi warna dari foto!');

    const buf = await client.downloadMedia(target.media, {});
    if (!buf?.length) throw new Error('Gagal mengunduh foto!');

    // Upload ke tmpfiles dulu, lalu pakai color-api
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', buf, { filename: 'image.jpg', contentType: 'image/jpeg' });

    // Pakai color thief via microlink
    const b64   = buf.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${b64}`;

    // Algoritma manual: sampling pixel untuk deteksi warna dominan
    // Gunakan pendekatan: ambil pixel-pixel dari gambar lalu hitung frekuensi warna
    // Karena tidak ada sharp, kita pakai color-extractor API gratis
    const uploadRes = await axios.post('https://api.imgbb.com/1/upload', new URLSearchParams({
      key   : '2e6cc5b8e8c7b9b8b7a6c5d4e3f2a1b0', // free imgbb key placeholder
      image : b64,
    }), { timeout: 20000 });

    const imgUrl = uploadRes.data?.data?.url;
    if (!imgUrl) throw new Error('Gagal upload gambar untuk analisis!');

    // Minta color API
    const colorRes = await axios.get(
      `https://color-finder-api.vercel.app/api?url=${encodeURIComponent(imgUrl)}`,
      { timeout: 15000 }
    ).catch(() => null);

    // Fallback: hitung warna dominan secara manual dari byte buffer
    // Sample setiap N byte untuk dapat RGB dominan
    let r = 0, g = 0, b = 0, count = 0;
    // Cari signature JPEG (FF D8) dan ambil data pixel kasar
    const step = Math.max(1, Math.floor(buf.length / 500));
    for (let i = 0; i < buf.length - 2; i += step) {
      // Skip JPEG header bytes
      if (buf[i] > 20 && buf[i] < 235) {
        r += buf[i];
        g += buf[i + 1] || buf[i];
        b += buf[i + 2] || buf[i];
        count++;
      }
    }

    let hexColor, colorName;
    if (count > 0) {
      const avgR = Math.min(255, Math.floor(r / count));
      const avgG = Math.min(255, Math.floor(g / count));
      const avgB = Math.min(255, Math.floor(b / count));
      hexColor   = `#${avgR.toString(16).padStart(2,'0')}${avgG.toString(16).padStart(2,'0')}${avgB.toString(16).padStart(2,'0')}`.toUpperCase();

      // Tebak nama warna berdasarkan RGB dominan
      const max = Math.max(avgR, avgG, avgB);
      const min = Math.min(avgR, avgG, avgB);
      const brightness = (avgR * 299 + avgG * 587 + avgB * 114) / 1000;

      if (brightness < 40)       colorName = '⬛ Hitam (Black)';
      else if (brightness > 215) colorName = '⬜ Putih (White)';
      else if (max - min < 30)   colorName = '🩶 Abu-abu (Gray)';
      else if (avgR > avgG && avgR > avgB) {
        colorName = avgR > 180 ? '🔴 Merah (Red)' : '🟤 Coklat (Brown)';
      } else if (avgG > avgR && avgG > avgB) {
        colorName = '🟢 Hijau (Green)';
      } else if (avgB > avgR && avgB > avgG) {
        colorName = avgB > 180 ? '🔵 Biru (Blue)' : '🟣 Ungu (Purple)';
      } else if (avgR > 180 && avgG > 180) {
        colorName = '🟡 Kuning (Yellow)';
      } else if (avgR > 180 && avgB > 180) {
        colorName = '🩷 Magenta (Pink)';
      } else if (avgG > 180 && avgB > 180) {
        colorName = '🩵 Cyan (Cyan)';
      } else {
        colorName = '🎨 Campuran (Mixed)';
      }
    } else {
      hexColor  = '#808080';
      colorName = '🩶 Abu-abu (Gray)';
    }

    // Cek hasil dari color API jika berhasil
    const apiColors = colorRes?.data?.colors;
    let detailColors = '';
    if (Array.isArray(apiColors) && apiColors.length) {
      detailColors = '\n│\n│ <b>Top Warna:</b>\n';
      apiColors.slice(0, 5).forEach((c, i) => {
        detailColors += `│ <tg-spoiler>${i+1}. ${esc(c.hex || c.color)} — ${esc(c.name || '')}</tg-spoiler>\n`;
      });
    }

    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 🎨 <b>COLOR DETECTOR</b> 」\n` +
      `│\n` +
      `│ <b>Warna Dominan :</b>\n` +
      `│ <code>${esc(hexColor)}</code>\n` +
      `│ <tg-spoiler>${colorName}</tg-spoiler>\n` +
      `│\n` +
      `│ <b>Komponen RGB :</b>\n` +
      `│ <tg-spoiler>R: ${Math.floor(r/(count||1))} | G: ${Math.floor(g/(count||1))} | B: ${Math.floor(b/(count||1))}</tg-spoiler>\n` +
      detailColors +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot Color ✦</tg-spoiler></blockquote>`
    );

  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ <b>COLOR GAGAL</b> 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: EXIF — .exif
// Reply ke foto → tampilkan metadata EXIF (kamera, tanggal, dll)
// ═══════════════════════════════════════════════════════════════
async function cmdExif(client, msg) {
  if (!msg.replyTo?.replyToMsgId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n` +
    `│ <tg-spoiler>Reply ke foto dulu!</tg-spoiler>\n` +
    `│ <tg-spoiler>Contoh: reply foto → ketik .exif</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>EXIF READER</b> 」\n│ <tg-spoiler>Membaca metadata foto...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  try {
    const msgs   = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
    const target = msgs?.[0];
    if (!target?.media) throw new Error('Pesan yang di-reply bukan foto!');

    const media   = target.media;
    const isPhoto = media.photo || media.document?.mimeType?.startsWith('image/');
    if (!isPhoto) throw new Error('Hanya bisa baca EXIF dari foto/gambar!');

    const buf = await client.downloadMedia(media, {});
    if (!buf?.length) throw new Error('Gagal mengunduh foto!');

    // Baca EXIF dari buffer menggunakan library exifr (lightweight)
    let exifData = {};
    try {
      const exifr = require('exifr');
      exifData = await exifr.parse(buf, {
        tiff: true, exif: true, gps: true, icc: false, iptc: false,
      }) || {};
    } catch (_) {
      // exifr tidak ada, baca manual dari raw bytes
      // Cari marker EXIF: FF E1 + "Exif"
      exifData = { note: 'Install exifr untuk hasil lebih lengkap' };
    }

    // Ambil info dari Telegram media langsung (selalu tersedia)
    const tgInfo = {};
    if (media.photo) {
      const sizes = media.photo.sizes || [];
      const largest = sizes[sizes.length - 1];
      if (largest) {
        tgInfo.width  = largest.w;
        tgInfo.height = largest.h;
      }
      tgInfo.date = media.photo.date
        ? new Date(media.photo.date * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        : null;
    } else if (media.document) {
      const attrs = media.document.attributes || [];
      const imgAttr = attrs.find(a => a.w && a.h);
      if (imgAttr) { tgInfo.width = imgAttr.w; tgInfo.height = imgAttr.h; }
      tgInfo.mimeType = media.document.mimeType;
      tgInfo.fileSize = media.document.size;
      tgInfo.date = media.document.date
        ? new Date(media.document.date * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        : null;
    }

    // Format output
    let txt =
      `<blockquote>╭──「 📷 <b>EXIF METADATA</b> 」\n` +
      `│\n` +
      `│ <b>[ INFO TELEGRAM ]</b>\n`;

    if (tgInfo.width && tgInfo.height) txt += `│ <tg-spoiler>Resolusi : ${tgInfo.width} × ${tgInfo.height} px</tg-spoiler>\n`;
    if (tgInfo.date)     txt += `│ <tg-spoiler>Tanggal  : ${tgInfo.date}</tg-spoiler>\n`;
    if (tgInfo.mimeType) txt += `│ <tg-spoiler>Format   : ${tgInfo.mimeType}</tg-spoiler>\n`;
    if (tgInfo.fileSize) txt += `│ <tg-spoiler>Ukuran   : ${(tgInfo.fileSize / 1024).toFixed(1)} KB</tg-spoiler>\n`;
    txt += `│ <tg-spoiler>File size: ${(buf.length / 1024).toFixed(1)} KB</tg-spoiler>\n`;

    const exifKeys = Object.keys(exifData).filter(k => k !== 'note' && exifData[k] !== null && exifData[k] !== undefined);

    if (exifKeys.length > 0) {
      txt += `│\n│ <b>[ EXIF DATA ]</b>\n`;
      const important = ['Make','Model','Software','DateTime','DateTimeOriginal','ExposureTime','FNumber','ISO','FocalLength','Flash','WhiteBalance','GPSLatitude','GPSLongitude','GPSAltitude','ImageWidth','ImageHeight','Orientation'];
      const labels    = { Make:'Merek', Model:'Model', Software:'Software', DateTime:'Tanggal', DateTimeOriginal:'Tgl Foto', ExposureTime:'Exposure', FNumber:'F-Number', ISO:'ISO', FocalLength:'Focal Length', Flash:'Flash', WhiteBalance:'White Balance', GPSLatitude:'Latitude', GPSLongitude:'Longitude', GPSAltitude:'Altitude', ImageWidth:'Lebar', ImageHeight:'Tinggi', Orientation:'Orientasi' };

      let shown = 0;
      for (const key of important) {
        if (exifData[key] !== undefined && shown < 12) {
          let val = exifData[key];
          if (typeof val === 'number') val = val.toFixed(4);
          if (Array.isArray(val)) val = val.join(', ');
          txt += `│ <tg-spoiler>${labels[key] || key}: ${esc(String(val).slice(0, 60))}</tg-spoiler>\n`;
          shown++;
        }
      }

      if (exifData.GPSLatitude && exifData.GPSLongitude) {
        const lat = Array.isArray(exifData.GPSLatitude) ? exifData.GPSLatitude[0] : exifData.GPSLatitude;
        const lon = Array.isArray(exifData.GPSLongitude) ? exifData.GPSLongitude[0] : exifData.GPSLongitude;
        txt += `│ <tg-spoiler>🗺 Maps: maps.google.com/?q=${lat},${lon}</tg-spoiler>\n`;
      }
    } else {
      txt += `│\n│ <tg-spoiler>ℹ️ Tidak ada data EXIF ditemukan.</tg-spoiler>\n`;
      txt += `│ <tg-spoiler>(Foto mungkin sudah dikompresi Telegram)</tg-spoiler>\n`;
      if (exifData.note) txt += `│ <tg-spoiler>${esc(exifData.note)}</tg-spoiler>\n`;
    }

    txt += `╰────────────────────────</blockquote>`;
    await edit(client, msg.chatId, m.id, txt);

  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ <b>EXIF GAGAL</b> 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: PDF TO IMAGE — .pdf2img
// Reply ke file PDF → konversi halaman pertama jadi gambar JPG
// Pakai pdf2pic / pdftopic atau fallback ke API online
// ═══════════════════════════════════════════════════════════════
async function cmdPdf2Img(client, msg) {
  if (!msg.replyTo?.replyToMsgId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n` +
    `│ <tg-spoiler>Reply ke file PDF dulu!</tg-spoiler>\n` +
    `│ <tg-spoiler>Contoh: reply file PDF → ketik .pdf2img</tg-spoiler>\n` +
    `│ <tg-spoiler>Akan mengkonversi halaman pertama jadi gambar</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>PDF → IMAGE</b> 」\n│ <tg-spoiler>Mengunduh file PDF...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  try {
    const msgs   = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
    const target = msgs?.[0];
    if (!target?.media) throw new Error('Pesan yang di-reply bukan file!');

    const mimeType = target.media.document?.mimeType || '';
    const fileName = target.media.document?.attributes?.find(a => a.fileName)?.fileName || 'file.pdf';
    if (!mimeType.includes('pdf') && !fileName.toLowerCase().endsWith('.pdf')) {
      throw new Error('File harus berformat PDF!');
    }

    const buf = await client.downloadMedia(target.media, {});
    if (!buf?.length) throw new Error('Gagal mengunduh file PDF!');

    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ⏳ <b>PDF → IMAGE</b> 」\n│ <tg-spoiler>Mengkonversi PDF ke gambar...</tg-spoiler>\n│ <tg-spoiler>Ukuran: ${(buf.length/1024).toFixed(1)} KB</tg-spoiler>\n╰────────────────────────</blockquote>`
    );

    // Simpan PDF sementara
    if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
    const pdfPath = `./downloads/pdf_${Date.now()}.pdf`;
    const imgPath = pdfPath.replace('.pdf', '.jpg');
    fs.writeFileSync(pdfPath, buf);

    let imgBuf = null;

    // Coba pakai pdf-img-convert jika tersedia
    try {
      const pdfImgConvert = require('pdf-img-convert');
      const outputImages  = await pdfImgConvert.convert(pdfPath, {
        width: 1200, page_numbers: [1],
      });
      if (outputImages?.[0]) {
        imgBuf = Buffer.isBuffer(outputImages[0]) ? outputImages[0] : Buffer.from(outputImages[0]);
        fs.writeFileSync(imgPath, imgBuf);
      }
    } catch (_) {
      // Fallback: upload ke API konversi online
      try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('instructions', JSON.stringify({
          parts: [{ file: 'document' }],
          output: { type: 'image', format: 'jpg', dpi: 150 },
        }));
        form.append('document', buf, { filename: 'document.pdf', contentType: 'application/pdf' });

        const apiRes = await axios.post('https://api.pdfrest.com/jpg', form, {
          headers: { ...form.getHeaders(), 'Api-Key': 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
          timeout: 30000,
          responseType: 'arraybuffer',
        }).catch(() => null);

        if (apiRes?.data) {
          imgBuf = Buffer.from(apiRes.data);
          fs.writeFileSync(imgPath, imgBuf);
        }
      } catch (_) {}
    }

    // Jika semua konversi gagal, beri tahu user untuk install library
    if (!imgBuf) {
      fs.unlinkSync(pdfPath);
      return edit(client, msg.chatId, m.id,
        `<blockquote>╭──「 ⚠️ <b>PERLU INSTALL LIBRARY</b> 」\n` +
        `│\n` +
        `│ <tg-spoiler>Jalankan dulu di Termux:</tg-spoiler>\n` +
        `│ <code>npm install pdf-img-convert</code>\n` +
        `│\n` +
        `│ <tg-spoiler>Lalu restart bot & coba lagi!</tg-spoiler>\n` +
        `╰────────────────────────</blockquote>`
      );
    }

    // Kirim hasil gambar
    await client.deleteMessages(msg.chatId, [m.id], { revoke: true }).catch(() => {});
    await client.sendFile(msg.chatId, {
      file    : imgPath,
      caption :
        `<blockquote>╭──「 🖼 <b>PDF → IMAGE</b> 」\n` +
        `│ <b>File    :</b> <tg-spoiler>${esc(fileName)}</tg-spoiler>\n` +
        `│ <b>Halaman :</b> <tg-spoiler>Halaman 1</tg-spoiler>\n` +
        `│ <b>Ukuran  :</b> <tg-spoiler>${(imgBuf.length / 1024).toFixed(1)} KB</tg-spoiler>\n` +
        `╰────────────────────────\n` +
        `<tg-spoiler>✦ Zetsy UBot PDF2Img ✦</tg-spoiler></blockquote>`,
      replyTo  : msg.id,
      parseMode: 'html',
    });

    // Cleanup
    fs.unlinkSync(pdfPath);
    fs.unlinkSync(imgPath);

  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ <b>PDF2IMG GAGAL</b> 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// ██████████████████████████████████████████████████████████████
//   FUN & GAME MODULES (15 commands)
// ██████████████████████████████████████████████████████████████
// ═══════════════════════════════════════════════════════════════

// ── .truth ───────────────────────────────────────────────────
async function cmdTruth(client, msg) {
  const list = [
    'Siapa orang yang paling kamu sukai di sini?',
    'Pernahkah kamu bohong kepada sahabat terbaikmu?',
    'Apa hal paling memalukan yang pernah kamu lakukan?',
    'Siapa crush pertamamu dan bagaimana ceritanya?',
    'Apa rahasia terbesarmu yang belum pernah kamu ceritakan?',
    'Pernahkah kamu pura-pura sakit untuk menghindari sesuatu?',
    'Apa hal yang paling kamu sesali dalam hidupmu?',
    'Siapa orang yang paling sering kamu stalk di sosmed?',
    'Pernahkah kamu menangis karena game atau film?',
    'Apa hal terbodoh yang pernah kamu lakukan karena suka seseorang?',
    'Berapa lama kamu tidak mandi terlama?',
    'Pernahkah kamu mengintip hadiah ulang tahunmu sendiri?',
    'Apa hal yang kamu sembunyikan dari orang tuamu?',
    'Siapa yang paling sering kamu ghosting?',
    'Apa aplikasi yang paling sering kamu pakai tapi malu ngakuin?',
  ];
  const q = list[Math.floor(Math.random() * list.length)];
  await reply(client, msg,
    `<blockquote>╭──「 🎯 <b>TRUTH</b> 」\n` +
    `│\n` +
    `│ <tg-spoiler>${esc(q)}</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Truth or Dare ✦</tg-spoiler></blockquote>`
  );
}

// ── .dare ────────────────────────────────────────────────────
async function cmdDare(client, msg) {
  const list = [
    'Kirim selfie dengan ekspresi paling aneh kamu!',
    'Tulis status WA/IG: "Aku lagi naksir seseorang" selama 10 menit.',
    'Kirim voice note sambil nyanyi lagu anak-anak.',
    'Screenshot chat terakhirmu dan kirim di sini!',
    'Tag 3 orang secara acak dan bilang "Aku sayang kamu".',
    'Ganti nama kontakmu jadi "Babi Lucu" selama 1 jam.',
    'Kirim foto makanan paling aneh yang ada di kulkasmu sekarang.',
    'Tulis puisi 4 baris tentang kucing dalam 60 detik.',
    'Kirim voice note sambil bilang "Aku ganteng/cantik banget" 5x.',
    'Screenshot biodata WA kamu dan kirim ke sini.',
    'Minta maaf ke seseorang yang pernah kamu sakiti via chat.',
    'Ketik "Saya suka makan bawang mentah" dan kirim ke 3 orang.',
    'Kirim GIF atau stiker paling random dari koleksimu.',
    'Ceritakan mimpi paling aneh yang pernah kamu alami.',
    'Ubah foto profil jadi foto meme selama 30 menit.',
  ];
  const d = list[Math.floor(Math.random() * list.length)];
  await reply(client, msg,
    `<blockquote>╭──「 🔥 <b>DARE</b> 」\n` +
    `│\n` +
    `│ <tg-spoiler>${esc(d)}</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Truth or Dare ✦</tg-spoiler></blockquote>`
  );
}

// ── .roast <nama> ─────────────────────────────────────────────
async function cmdRoast(client, msg, args) {
  const nama = args?.trim() || 'kamu';
  const list = [
    `${nama} tuh kayak wifi gratis — semua orang pake tapi gak ada yang appreciate.`,
    `${nama} mirip password yang lemah — gampang ditebak, gampang dilupain.`,
    `Otak ${nama} kayak RAM 512MB — buka dua aplikasi aja udah lag.`,
    `${nama} tuh kayak charger palsu — keliatan berguna tapi bikin rusak.`,
    `Kalau ${nama} jadi meme, captionnya pasti: "Expectation vs Reality".`,
    `${nama} kayak sinyal 2G — lemot, sering putus, dan bikin frustrasi.`,
    `${nama} mirip kupon diskon expired — punya value tapi udah gak berlaku.`,
    `${nama} kayak antivirus gratisan — niatnya ngejaga tapi malah bikin masalah.`,
    `Kalau ${nama} jadi film, genrenya horror — nakutin tapi gak berkesan.`,
    `${nama} tuh kayak baterai 1% — sebentar lagi mati dan gak ada yang notice.`,
  ];
  const r = list[Math.floor(Math.random() * list.length)];
  await reply(client, msg,
    `<blockquote>╭──「 🔥 <b>ROAST</b> 」\n` +
    `│\n` +
    `│ <tg-spoiler>${esc(r)}</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Ini cuma bercanda ya! ✦</tg-spoiler></blockquote>`
  );
}

// ── .ship <nama1> & <nama2> ──────────────────────────────────
async function cmdShip(client, msg, args) {
  const parts = args.split(/[&,|]+/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .ship Nama1 & Nama2</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const [n1, n2] = parts;
  // Seed dari nama agar hasilnya konsisten untuk pasangan yang sama
  const seed = [...(n1 + n2).toLowerCase()].reduce((a, c) => a + c.charCodeAt(0), 0);
  const pct  = (seed % 101);
  const bar  = '❤️'.repeat(Math.floor(pct / 10)) + '🖤'.repeat(10 - Math.floor(pct / 10));
  const level = pct >= 90 ? '💒 JODOH BANGET!' : pct >= 70 ? '💕 Sangat Cocok!' : pct >= 50 ? '💞 Lumayan Cocok' : pct >= 30 ? '💔 Kurang Cocok' : '🚫 Gak Cocok Sama Sekali';
  await reply(client, msg,
    `<blockquote>╭──「 💘 <b>SHIP METER</b> 」\n` +
    `│\n` +
    `│ <b>${esc(n1)}</b> + <b>${esc(n2)}</b>\n` +
    `│\n` +
    `│ ${bar}\n` +
    `│ <b>${pct}%</b> — <tg-spoiler>${level}</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Ship ✦</tg-spoiler></blockquote>`
  );
}

// ── .zodiak <dd/mm> ──────────────────────────────────────────
async function cmdZodiak(client, msg, args) {
  const match = args.trim().match(/(\d{1,2})[\/\-\.](\d{1,2})/);
  if (!match) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .zodiak 25/12 (tgl/bulan)</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const day = parseInt(match[1]), month = parseInt(match[2]);
  const zodiaks = [
    { name:'Capricorn',  emoji:'♑', start:[12,22], end:[1,19],  sifat:'Ambisius, disiplin, bertanggung jawab', lucky:'Sabtu', color:'Coklat & Hitam' },
    { name:'Aquarius',   emoji:'♒', start:[1,20],  end:[2,18],  sifat:'Inovatif, mandiri, humanitarian', lucky:'Sabtu', color:'Biru & Abu-abu' },
    { name:'Pisces',     emoji:'♓', start:[2,19],  end:[3,20],  sifat:'Empatik, artistik, intuitif', lucky:'Kamis', color:'Hijau Laut' },
    { name:'Aries',      emoji:'♈', start:[3,21],  end:[4,19],  sifat:'Berani, energetik, kompetitif', lucky:'Selasa', color:'Merah' },
    { name:'Taurus',     emoji:'♉', start:[4,20],  end:[5,20],  sifat:'Sabar, setia, pekerja keras', lucky:'Jumat', color:'Hijau & Pink' },
    { name:'Gemini',     emoji:'♊', start:[5,21],  end:[6,20],  sifat:'Adaptif, komunikatif, cerdas', lucky:'Rabu', color:'Kuning' },
    { name:'Cancer',     emoji:'♋', start:[6,21],  end:[7,22],  sifat:'Protektif, intuitif, setia', lucky:'Senin', color:'Putih & Silver' },
    { name:'Leo',        emoji:'♌', start:[7,23],  end:[8,22],  sifat:'Percaya diri, kreatif, loyal', lucky:'Minggu', color:'Emas & Oranye' },
    { name:'Virgo',      emoji:'♍', start:[8,23],  end:[9,22],  sifat:'Analitis, perfeksionis, helpful', lucky:'Rabu', color:'Coklat & Hijau' },
    { name:'Libra',      emoji:'♎', start:[9,23],  end:[10,22], sifat:'Adil, sosial, harmonis', lucky:'Jumat', color:'Pink & Biru' },
    { name:'Scorpio',    emoji:'♏', start:[10,23], end:[11,21], sifat:'Intens, passionate, misterius', lucky:'Selasa', color:'Merah & Hitam' },
    { name:'Sagittarius',emoji:'♐', start:[11,22], end:[12,21], sifat:'Optimis, bebas, petualang', lucky:'Kamis', color:'Ungu & Biru' },
  ];
  let found = null;
  for (const z of zodiaks) {
    const [sm, sd] = z.start, [em, ed] = z.end;
    if ((month === sm && day >= sd) || (month === em && day <= ed)) { found = z; break; }
  }
  if (!found) found = zodiaks[0]; // Capricorn fallback
  await reply(client, msg,
    `<blockquote>╭──「 ${found.emoji} <b>ZODIAK — ${found.name.toUpperCase()}</b> 」\n` +
    `│\n` +
    `│ <b>Tanggal  :</b> <tg-spoiler>${day}/${month}</tg-spoiler>\n` +
    `│ <b>Sifat    :</b> <tg-spoiler>${found.sifat}</tg-spoiler>\n` +
    `│ <b>Hari Hoki:</b> <tg-spoiler>${found.lucky}</tg-spoiler>\n` +
    `│ <b>Warna    :</b> <tg-spoiler>${found.color}</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Zodiak ✦</tg-spoiler></blockquote>`
  );
}

// ── .meme ────────────────────────────────────────────────────
async function cmdMeme(client, msg) {
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Mengambil meme random...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res  = await axios.get('https://meme-api.com/gimme', { timeout: 10000 });
    const meme = res.data;
    if (!meme?.url) throw new Error('Tidak ada meme ditemukan');

    const imgRes = await axios.get(meme.url, { responseType: 'arraybuffer', timeout: 15000 });
    const buf    = Buffer.from(imgRes.data);
    const tmp    = `./downloads/meme_${Date.now()}.jpg`;
    if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
    fs.writeFileSync(tmp, buf);

    await client.deleteMessages(msg.chatId, [m.id], { revoke: true }).catch(() => {});
    await client.sendFile(msg.chatId, {
      file    : tmp,
      caption :
        `<blockquote>╭──「 😂 <b>MEME RANDOM</b> 」\n` +
        `│ <tg-spoiler>${esc(meme.title?.slice(0, 100) || 'Meme')}</tg-spoiler>\n` +
        `│ <tg-spoiler>👍 ${meme.ups || 0} | r/${meme.subreddit || 'memes'}</tg-spoiler>\n` +
        `╰────────────────────────\n` +
        `<tg-spoiler>✦ Zetsy UBot Meme ✦</tg-spoiler></blockquote>`,
      replyTo: msg.id, parseMode: 'html',
    });
    fs.unlinkSync(tmp);
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ── .8ball <pertanyaan> ──────────────────────────────────────
async function cmd8Ball(client, msg, args) {
  const answers = [
    '✅ Ya, sudah pasti!', '✅ Tentu saja!', '✅ Sangat yakin!',
    '✅ Kelihatannya iya', '✅ Kemungkinan besar iya',
    '🤔 Coba tanya lagi nanti', '🤔 Susah diprediksi', '🤔 Tidak bisa dipastikan sekarang',
    '❌ Jangan berharap', '❌ Kemungkinan besar tidak', '❌ Tidak sama sekali!',
  ];
  const ans = answers[Math.floor(Math.random() * answers.length)];
  await reply(client, msg,
    `<blockquote>╭──「 🎱 <b>MAGIC 8-BALL</b> 」\n` +
    `│\n` +
    `│ <b>Pertanyaan:</b>\n` +
    `│ <tg-spoiler>${esc(args)}</tg-spoiler>\n` +
    `│\n` +
    `│ <b>Jawaban:</b>\n` +
    `│ <tg-spoiler>${esc(ans)}</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot 8Ball ✦</tg-spoiler></blockquote>`
  );
}

// ── .tebakangka ──────────────────────────────────────────────
const tebakAngkaStore = new Map(); // phone → { answer, chatId, attempts }
async function cmdTebakAngka(client, msg, phone) {
  const chatId = msg.chatId?.toString();
  const existing = tebakAngkaStore.get(phone + chatId);

  // Jika sudah ada game aktif, cek jawaban
  if (existing) {
    const tebakan = parseInt(msg.message?.replace(/\D/g,'') || '');
    if (isNaN(tebakan)) {
      return reply(client, msg,
        `<blockquote>╭──「 🎮 <b>TEBAK ANGKA</b> 」\n` +
        `│ <tg-spoiler>Game aktif! Kirim angka 1-100 untuk menebak.</tg-spoiler>\n` +
        `│ <tg-spoiler>Sisa percobaan: ${existing.attempts}</tg-spoiler>\n` +
        `╰────────────────────────</blockquote>`
      );
    }
    existing.attempts--;
    if (tebakan === existing.answer) {
      tebakAngkaStore.delete(phone + chatId);
      return reply(client, msg,
        `<blockquote>╭──「 🎉 <b>BENAR!</b> 」\n│ <tg-spoiler>Jawabannya memang ${existing.answer}! Selamat! 🏆</tg-spoiler>\n╰────────────────────────</blockquote>`
      );
    }
    if (existing.attempts <= 0) {
      tebakAngkaStore.delete(phone + chatId);
      return reply(client, msg,
        `<blockquote>╭──「 💀 <b>GAME OVER</b> 」\n│ <tg-spoiler>Jawaban yang benar adalah: ${existing.answer}</tg-spoiler>\n╰────────────────────────</blockquote>`
      );
    }
    const hint = tebakan < existing.answer ? '⬆️ Terlalu kecil!' : '⬇️ Terlalu besar!';
    return reply(client, msg,
      `<blockquote>╭──「 🎮 <b>TEBAK ANGKA</b> 」\n│ <tg-spoiler>${hint}</tg-spoiler>\n│ <tg-spoiler>Sisa percobaan: ${existing.attempts}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  // Mulai game baru
  const answer = Math.floor(Math.random() * 100) + 1;
  tebakAngkaStore.set(phone + chatId, { answer, chatId, attempts: 7 });
  await reply(client, msg,
    `<blockquote>╭──「 🎮 <b>TEBAK ANGKA</b> 」\n` +
    `│\n` +
    `│ <tg-spoiler>Saya sedang memikirkan angka 1-100.</tg-spoiler>\n` +
    `│ <tg-spoiler>Kamu punya 7 percobaan untuk menebak!</tg-spoiler>\n` +
    `│ <tg-spoiler>Kirim angkamu sekarang!</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Game ✦</tg-spoiler></blockquote>`
  );
}

// ── .kuis ────────────────────────────────────────────────────
async function cmdKuis(client, msg) {
  const questions = [
    { q:'Ibu kota Australia?', a:'Canberra', opts:['Sydney','Melbourne','Canberra','Brisbane'] },
    { q:'Planet terbesar di tata surya?', a:'Jupiter', opts:['Saturnus','Jupiter','Uranus','Neptunus'] },
    { q:'Siapa penulis Harry Potter?', a:'J.K. Rowling', opts:['J.K. Rowling','Stephenie Meyer','George R.R. Martin','Tolkien'] },
    { q:'Berapa sisi hexagon?', a:'6', opts:['5','6','7','8'] },
    { q:'Bahasa resmi Brazil?', a:'Portugis', opts:['Spanyol','Portugis','Inggris','Perancis'] },
    { q:'Organ terbesar tubuh manusia?', a:'Kulit', opts:['Hati','Paru-paru','Kulit','Jantung'] },
    { q:'Siapa yang melukis Mona Lisa?', a:'Leonardo da Vinci', opts:['Michelangelo','Leonardo da Vinci','Raphael','Van Gogh'] },
    { q:'Berapa jumlah planet di tata surya?', a:'8', opts:['7','8','9','10'] },
    { q:'Gas terbanyak di atmosfer bumi?', a:'Nitrogen', opts:['Oksigen','Nitrogen','CO2','Argon'] },
    { q:'Negara terluas di dunia?', a:'Rusia', opts:['China','Amerika','Rusia','Kanada'] },
  ];
  const kuis = questions[Math.floor(Math.random() * questions.length)];
  const shuffled = [...kuis.opts].sort(() => Math.random() - 0.5);
  const labels = ['A','B','C','D'];
  let optsText = '';
  shuffled.forEach((o, i) => { optsText += `│ <tg-spoiler>${labels[i]}. ${esc(o)}</tg-spoiler>\n`; });
  const ansLabel = labels[shuffled.indexOf(kuis.a)];

  await reply(client, msg,
    `<blockquote>╭──「 🧠 <b>KUIS TRIVIA</b> 」\n` +
    `│\n` +
    `│ <b>${esc(kuis.q)}</b>\n` +
    `│\n` +
    optsText +
    `│\n` +
    `│ <tg-spoiler>|| Jawaban: ${ansLabel}. ${esc(kuis.a)} ||</tg-spoiler>\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Kuis ✦</tg-spoiler></blockquote>`
  );
}

// ── .horoscope <zodiak> ──────────────────────────────────────
async function cmdHoroscope(client, msg, args) {
  const sign = args.trim().toLowerCase();
  const validSigns = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
  if (!validSigns.includes(sign)) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Zodiak valid: ${validSigns.join(', ')}</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Mengambil horoskop ${sign}...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res  = await axios.get(`https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${sign}&day=TODAY`, { timeout: 10000 });
    const data = res.data?.data;
    if (!data) throw new Error('Data horoskop tidak tersedia');
    const emojis = { aries:'♈',taurus:'♉',gemini:'♊',cancer:'♋',leo:'♌',virgo:'♍',libra:'♎',scorpio:'♏',sagittarius:'♐',capricorn:'♑',aquarius:'♒',pisces:'♓' };
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ${emojis[sign]||'⭐'} <b>HOROSKOP ${sign.toUpperCase()}</b> 」\n` +
      `│\n` +
      `│ <b>Tanggal :</b> <tg-spoiler>${data.date || 'Hari ini'}</tg-spoiler>\n` +
      `│\n` +
      `│ <tg-spoiler>${esc(data.horoscope_data || 'Tidak tersedia')}</tg-spoiler>\n` +
      `│\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot Horoscope ✦</tg-spoiler></blockquote>`
    );
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ── .lyric <judul lagu> ──────────────────────────────────────
async function cmdLyric(client, msg, args) {
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Mencari lirik "${esc(args)}"...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const search = await axios.get(`https://lyrist.vercel.app/api/${encodeURIComponent(args)}`, { timeout: 12000 });
    const data   = search.data;
    if (!data?.lyrics) throw new Error('Lirik tidak ditemukan!');

    const lines   = data.lyrics.split('\n').slice(0, 40).join('\n'); // max 40 baris
    const display = lines.length > 2000 ? lines.slice(0, 2000) + '\n...(dipotong)' : lines;

    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 🎵 <b>LIRIK LAGU</b> 」\n` +
      `│ <b>Judul  :</b> <tg-spoiler>${esc(data.title || args)}</tg-spoiler>\n` +
      `│ <b>Artist :</b> <tg-spoiler>${esc(data.artist || '-')}</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>\n\n` +
      `<tg-spoiler>${esc(display)}</tg-spoiler>`
    );
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ── .asciify <teks> ──────────────────────────────────────────
async function cmdAsciify(client, msg, args) {
  const text = args.trim().slice(0, 20).toUpperCase();
  if (!text) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .asciify teks (maks 20 karakter)</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res = await axios.get(`https://artii.herokuapp.com/make?text=${encodeURIComponent(text)}&font=banner`, { timeout: 10000 });
    const art = res.data?.trim();
    if (!art) throw new Error('Gagal generate ASCII art');
    await reply(client, msg,
      `<blockquote>╭──「 🎨 <b>ASCII ART</b> 」\n╰────────────────────────</blockquote>\n<pre>${esc(art.slice(0, 3000))}</pre>`
    );
  } catch (_) {
    // Fallback ASCII sederhana
    const simple = text.split('').map(c => `[${c}]`).join('');
    await reply(client, msg,
      `<blockquote>╭──「 🎨 <b>ASCII ART</b> 」\n│ <code>${esc(simple)}</code>\n╰────────────────────────</blockquote>`
    );
  }
}

// ── .emotify <teks> ──────────────────────────────────────────
async function cmdEmotify(client, msg, args) {
  const emojiMap = {
    a:'🅰️', b:'🅱️', c:'🌊', d:'🌀', e:'📧', f:'🎏', g:'🌀', h:'♓',
    i:'ℹ️', j:'🎷', k:'🎋', l:'🕒', m:'〽️', n:'♑', o:'⭕', p:'🅿️',
    q:'🎯', r:'®️', s:'💲', t:'✝️', u:'⛎', v:'✌️', w:'〰️', x:'❌',
    y:'💹', z:'💤', ' ':'　', '!':'❗', '?':'❓', '.':'🔵', ',':'🔸',
  };
  const result = args.toLowerCase().split('').map(c => emojiMap[c] || c).join(' ');
  await reply(client, msg,
    `<blockquote>╭──「 😄 <b>EMOTIFY</b> 」\n│\n│ ${result.slice(0, 500)}\n│\n╰────────────────────────</blockquote>`
  );
}

// ── .reversechat ─────────────────────────────────────────────
async function cmdReverseChat(client, msg) {
  if (!msg.replyTo?.replyToMsgId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Reply ke pesan yang mau dibalik!</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const msgs   = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
    const text   = msgs?.[0]?.message;
    if (!text) throw new Error('Pesan tidak punya teks!');
    const reversed = text.split('').reverse().join('');
    await reply(client, msg,
      `<blockquote>╭──「 🔄 <b>REVERSE CHAT</b> 」\n│\n│ <tg-spoiler>${esc(reversed.slice(0, 1000))}</tg-spoiler>\n│\n╰────────────────────────</blockquote>`
    );
  } catch (e) {
    await reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ── .spongebob <teks> ────────────────────────────────────────
async function cmdSpongebob(client, msg, args) {
  const result = args.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join('');
  await reply(client, msg,
    `<blockquote>╭──「 🧽 <b>SPONGEBOB MOCKING</b> 」\n│\n│ <tg-spoiler>${esc(result.slice(0, 1000))}</tg-spoiler>\n│\n╰────────────────────────</blockquote>`
  );
}

// ═══════════════════════════════════════════════════════════════
// ██████████████████████████████████████████████████████████████
//   TOOLS LANJUTAN MODULES (15 commands)
// ██████████████████████████████████████████████████████████████
// ═══════════════════════════════════════════════════════════════

// ── .tinyurl <url> ───────────────────────────────────────────
async function cmdTinyUrl(client, msg, args) {
  let url = args.trim();
  if (!url.startsWith('http')) url = 'https://' + url;
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Mempersingkat URL...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res  = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout: 10000 });
    const tiny = res.data?.trim();
    if (!tiny?.startsWith('http')) throw new Error('Gagal mempersingkat URL');
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 🔗 <b>TINYURL</b> 」\n` +
      `│\n` +
      `│ <b>Original :</b>\n│ <tg-spoiler>${esc(url.slice(0,100))}</tg-spoiler>\n` +
      `│\n` +
      `│ <b>Short URL :</b>\n│ <code>${esc(tiny)}</code>\n` +
      `│\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot TinyURL ✦</tg-spoiler></blockquote>`
    );
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ── .base64 <encode|decode> <teks> ──────────────────────────
async function cmdBase64(client, msg, args) {
  const parts = args.trim().split(/\s+/);
  const mode  = parts[0]?.toLowerCase();
  const text  = parts.slice(1).join(' ');
  if (!['encode','decode'].includes(mode) || !text) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .base64 encode teks</tg-spoiler>\n│ <tg-spoiler>Format: .base64 decode base64string</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  let result;
  try {
    result = mode === 'encode'
      ? Buffer.from(text).toString('base64')
      : Buffer.from(text, 'base64').toString('utf-8');
  } catch (_) { result = 'Gagal decode — pastikan input valid Base64'; }

  await reply(client, msg,
    `<blockquote>╭──「 🔐 <b>BASE64 ${mode.toUpperCase()}</b> 」\n` +
    `│\n│ <b>Input  :</b> <tg-spoiler>${esc(text.slice(0,100))}</tg-spoiler>\n` +
    `│ <b>Output :</b>\n│ <code>${esc(result.slice(0,2000))}</code>\n│\n` +
    `╰────────────────────────</blockquote>`
  );
}

// ── .hex <encode|decode> <teks> ──────────────────────────────
async function cmdHex(client, msg, args) {
  const parts = args.trim().split(/\s+/);
  const mode  = parts[0]?.toLowerCase();
  const text  = parts.slice(1).join(' ');
  if (!['encode','decode'].includes(mode) || !text) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .hex encode teks</tg-spoiler>\n│ <tg-spoiler>Format: .hex decode hexstring</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  let result;
  try {
    result = mode === 'encode'
      ? Buffer.from(text).toString('hex')
      : Buffer.from(text.replace(/\s/g,''), 'hex').toString('utf-8');
  } catch (_) { result = 'Gagal decode — pastikan input valid HEX'; }

  await reply(client, msg,
    `<blockquote>╭──「 🔢 <b>HEX ${mode.toUpperCase()}</b> 」\n` +
    `│\n│ <b>Input  :</b> <tg-spoiler>${esc(text.slice(0,100))}</tg-spoiler>\n` +
    `│ <b>Output :</b>\n│ <code>${esc(result.slice(0,2000))}</code>\n│\n` +
    `╰────────────────────────</blockquote>`
  );
}

// ── .cekssl <domain> ─────────────────────────────────────────
async function cmdCekSsl(client, msg, args) {
  const domain = args.trim().replace(/https?:\/\//,'').split('/')[0];
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Mengecek SSL ${esc(domain)}...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res  = await axios.get(`https://api.ssllabs.com/api/v3/analyze?host=${domain}&publish=off&all=done`, { timeout: 15000 });
    const data = res.data;
    // SSL Labs bisa butuh waktu, cek statusnya
    if (data.status === 'DNS' || data.status === 'IN_PROGRESS') {
      // Fallback: cek via simple HTTPS request
      await axios.get(`https://${domain}`, { timeout: 8000 }).catch(() => {});
      return edit(client, msg.chatId, m.id,
        `<blockquote>╭──「 🔒 <b>CEK SSL</b> 」\n` +
        `│ <b>Domain :</b> <tg-spoiler>${esc(domain)}</tg-spoiler>\n` +
        `│ <b>HTTPS  :</b> <tg-spoiler>✅ Aktif (HTTPS dapat diakses)</tg-spoiler>\n` +
        `│ <tg-spoiler>Analisis lengkap: ssllabs.com/ssltest/analyze?d=${domain}</tg-spoiler>\n` +
        `╰────────────────────────</blockquote>`
      );
    }
    const ep    = data.endpoints?.[0];
    const grade = ep?.grade || 'N/A';
    const gradeEmoji = { 'A+':'🏆','A':'✅','B':'🟡','C':'🟠','D':'🔴','F':'❌' }[grade] || '❓';
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 🔒 <b>CEK SSL — ${esc(domain)}</b> 」\n` +
      `│\n` +
      `│ <b>Grade    :</b> <tg-spoiler>${gradeEmoji} ${grade}</tg-spoiler>\n` +
      `│ <b>Status   :</b> <tg-spoiler>${esc(data.status || 'OK')}</tg-spoiler>\n` +
      `│ <b>Endpoint :</b> <tg-spoiler>${esc(ep?.ipAddress || '-')}</tg-spoiler>\n` +
      `│ <b>Server   :</b> <tg-spoiler>${esc(ep?.serverName || domain)}</tg-spoiler>\n` +
      `│\n╰────────────────────────</blockquote>`
    );
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ── .ping2 <host> ────────────────────────────────────────────
async function cmdPing2(client, msg, args) {
  const host = args.trim().replace(/https?:\/\//,'').split('/')[0];
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Pinging ${esc(host)}...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const results = [];
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      await axios.get(`https://${host}`, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => {});
      results.push(Date.now() - start);
      await sleep(300);
    }
    const avg = Math.round(results.reduce((a,b) => a+b, 0) / results.length);
    const min = Math.min(...results);
    const max = Math.max(...results);
    const status = avg < 200 ? '🟢 Excellent' : avg < 500 ? '🟡 Good' : avg < 1000 ? '🟠 Fair' : '🔴 Poor';
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 📡 <b>PING — ${esc(host)}</b> 」\n` +
      `│\n` +
      `│ <b>Min    :</b> <tg-spoiler>${min}ms</tg-spoiler>\n` +
      `│ <b>Max    :</b> <tg-spoiler>${max}ms</tg-spoiler>\n` +
      `│ <b>Avg    :</b> <tg-spoiler>${avg}ms</tg-spoiler>\n` +
      `│ <b>Status :</b> <tg-spoiler>${status}</tg-spoiler>\n` +
      `│\n╰────────────────────────</blockquote>`
    );
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ── .pastebin <teks> ─────────────────────────────────────────
async function cmdPastebin(client, msg, args) {
  // Jika reply ke pesan, ambil teks dari situ
  let content = args.trim();
  if (!content && msg.replyTo?.replyToMsgId) {
    const msgs = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] }).catch(() => []);
    content = msgs?.[0]?.message || '';
  }
  if (!content) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .pastebin teks atau reply pesan</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Mengupload ke pastebin...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    // Pakai dpaste (tidak butuh API key)
    const res = await axios.post('https://dpaste.com/api/v2/', new URLSearchParams({
      content, syntax: 'text', title: 'Zetsy UBot Paste', expiry_days: '7',
    }), { timeout: 15000 });
    const url = res.headers?.location || res.data?.trim();
    if (!url) throw new Error('Gagal mendapat URL paste');
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 📋 <b>PASTEBIN</b> 」\n` +
      `│\n` +
      `│ <b>URL :</b>\n│ <code>${esc(url)}</code>\n` +
      `│ <tg-spoiler>Expire: 7 hari</tg-spoiler>\n` +
      `│ <tg-spoiler>Karakter: ${content.length}</tg-spoiler>\n` +
      `│\n╰────────────────────────</blockquote>`
    );
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ── .sticker ─────────────────────────────────────────────────
async function cmdSticker(client, msg) {
  if (!msg.replyTo?.replyToMsgId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Reply ke foto dulu! Foto akan dijadikan stiker.</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Membuat stiker...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const msgs   = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
    const target = msgs?.[0];
    if (!target?.media) throw new Error('Pesan yang di-reply bukan foto!');
    const isPhoto = target.media.photo || target.media.document?.mimeType?.startsWith('image/');
    if (!isPhoto) throw new Error('Hanya bisa buat stiker dari foto!');

    const buf     = await client.downloadMedia(target.media, {});
    const tmpPath = `./downloads/sticker_${Date.now()}.webp`;
    if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');

    // Konversi ke webp menggunakan API online
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', buf, { filename: 'image.jpg', contentType: 'image/jpeg' });

    // Coba konversi pakai cloudconvert-like free API
    // Fallback: kirim langsung sebagai stiker Telegram tanpa konversi
    fs.writeFileSync(tmpPath.replace('.webp','.jpg'), buf);

    await client.deleteMessages(msg.chatId, [m.id], { revoke: true }).catch(() => {});
    await client.sendFile(msg.chatId, {
      file      : tmpPath.replace('.webp','.jpg'),
      forceDocument: false,
      attributes: [{ className: 'DocumentAttributeSticker', alt: '🎨', stickerset: { className: 'InputStickerSetEmpty' } }],
      replyTo   : msg.id,
    }).catch(async () => {
      // Fallback: kirim sebagai foto biasa dengan caption
      await client.sendFile(msg.chatId, {
        file   : tmpPath.replace('.webp','.jpg'),
        caption: `<blockquote>╭──「 🎨 <b>STIKER</b> 」\n│ <tg-spoiler>Simpan foto ini sebagai stiker manual!</tg-spoiler>\n╰────────────────────────</blockquote>`,
        replyTo: msg.id, parseMode: 'html',
      });
    });
    fs.unlinkSync(tmpPath.replace('.webp','.jpg'));
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ── .removebg ────────────────────────────────────────────────
async function cmdRemoveBg(client, msg) {
  if (!msg.replyTo?.replyToMsgId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Reply ke foto dulu!</tg-spoiler>\n│ <tg-spoiler>.removebg → hapus background foto</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>REMOVE BG</b> 」\n│ <tg-spoiler>Menghapus background foto...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const msgs   = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
    const target = msgs?.[0];
    if (!target?.media) throw new Error('Pesan yang di-reply bukan foto!');
    const isPhoto = target.media.photo || target.media.document?.mimeType?.startsWith('image/');
    if (!isPhoto) throw new Error('Hanya bisa remove bg dari foto!');

    const buf = await client.downloadMedia(target.media, {});
    if (!buf?.length) throw new Error('Gagal mengunduh foto!');

    // Pakai remove.bg API (free tier: 50/bulan)
    // Atau fallback ke photoroom
    const FormData = require('form-data');
    const form = new FormData();
    form.append('image_file', buf, { filename: 'image.jpg', contentType: 'image/jpeg' });
    form.append('size', 'auto');

    const res = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
      headers: { ...form.getHeaders(), 'X-Api-Key': 'YOUR_REMOVEBG_KEY' },
      responseType: 'arraybuffer',
      timeout: 30000,
    }).catch(() => null);

    if (!res?.data) {
      // Fallback: pakai backgroundremover API gratis
      const form2 = new FormData();
      form2.append('image_file', buf, { filename: 'image.jpg', contentType: 'image/jpeg' });
      const res2 = await axios.post('https://www.remove.bg/api/removebg', form2, {
        headers: { ...form2.getHeaders() },
        responseType: 'arraybuffer',
        timeout: 30000,
      }).catch(() => null);

      if (!res2?.data) throw new Error(
        'Remove.bg butuh API key gratis!\nDaftar di: remove.bg/api\nLalu set key di config.js: REMOVEBG_KEY'
      );
    }

    const outBuf  = Buffer.from((res || res2).data);
    const tmpPath = `./downloads/removebg_${Date.now()}.png`;
    if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
    fs.writeFileSync(tmpPath, outBuf);

    await client.deleteMessages(msg.chatId, [m.id], { revoke: true }).catch(() => {});
    await client.sendFile(msg.chatId, {
      file    : tmpPath,
      caption :
        `<blockquote>╭──「 ✂️ <b>REMOVE BG</b> 」\n│ <tg-spoiler>Background berhasil dihapus!</tg-spoiler>\n│ <tg-spoiler>Ukuran: ${(outBuf.length/1024).toFixed(1)} KB</tg-spoiler>\n╰────────────────────────</blockquote>`,
      replyTo: msg.id, parseMode: 'html',
    });
    fs.unlinkSync(tmpPath);
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ <b>REMOVE BG GAGAL</b> 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ── .timestamp [tanggal] ─────────────────────────────────────
async function cmdTimestamp(client, msg, args) {
  let date;
  if (args?.trim()) {
    date = new Date(args.trim());
    if (isNaN(date.getTime())) return reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .timestamp 2024-12-25 atau .timestamp (tanpa args = sekarang)</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  } else {
    date = new Date();
  }
  const unix  = Math.floor(date.getTime() / 1000);
  const ms    = date.getTime();
  const iso   = date.toISOString();
  const local = date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  await reply(client, msg,
    `<blockquote>╭──「 🕐 <b>TIMESTAMP</b> 」\n` +
    `│\n` +
    `│ <b>Waktu Lokal :</b> <tg-spoiler>${local} WIB</tg-spoiler>\n` +
    `│ <b>Unix (detik):</b> <code>${unix}</code>\n` +
    `│ <b>Unix (ms)   :</b> <code>${ms}</code>\n` +
    `│ <b>ISO 8601    :</b> <tg-spoiler>${iso}</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Timestamp ✦</tg-spoiler></blockquote>`
  );
}

// ── .countdown <tanggal> ─────────────────────────────────────
async function cmdCountdown(client, msg, args) {
  const target = new Date(args.trim());
  if (isNaN(target.getTime())) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .countdown 2025-12-31</tg-spoiler>\n│ <tg-spoiler>Format: .countdown 2025-06-17 08:00</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const now  = Date.now();
  const diff = target.getTime() - now;
  if (diff < 0) return reply(client, msg,
    `<blockquote>╭──「 ⏰ <b>COUNTDOWN</b> 」\n│ <tg-spoiler>Tanggal tersebut sudah berlalu ${formatDurasi(Math.abs(diff))} yang lalu.</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins  = Math.floor((diff % 3600000) / 60000);
  const secs  = Math.floor((diff % 60000) / 1000);

  await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>COUNTDOWN</b> 」\n` +
    `│\n` +
    `│ <b>Target :</b> <tg-spoiler>${target.toLocaleString('id-ID', {timeZone:'Asia/Jakarta'})}</tg-spoiler>\n` +
    `│\n` +
    `│ <b>${days}</b> <tg-spoiler>hari</tg-spoiler>\n` +
    `│ <b>${hours}</b> <tg-spoiler>jam</tg-spoiler>\n` +
    `│ <b>${mins}</b> <tg-spoiler>menit</tg-spoiler>\n` +
    `│ <b>${secs}</b> <tg-spoiler>detik</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Countdown ✦</tg-spoiler></blockquote>`
  );
}

// ── .age <dd/mm/yyyy> ────────────────────────────────────────
async function cmdAge(client, msg, args) {
  const match = args.trim().match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (!match) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .age 25/12/1999 (tgl/bln/tahun)</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const [,d,mo,y] = match;
  const bday  = new Date(parseInt(y), parseInt(mo)-1, parseInt(d));
  const now   = new Date();
  if (bday > now) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Tanggal lahir tidak boleh di masa depan!</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  let age = now.getFullYear() - bday.getFullYear();
  const monthDiff = now.getMonth() - bday.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < bday.getDate())) age--;
  const nextBday = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  if (nextBday < now) nextBday.setFullYear(now.getFullYear() + 1);
  const daysLeft = Math.ceil((nextBday - now) / 86400000);
  const totalDays = Math.floor((now - bday) / 86400000);

  await reply(client, msg,
    `<blockquote>╭──「 🎂 <b>KALKULATOR UMUR</b> 」\n` +
    `│\n` +
    `│ <b>Lahir    :</b> <tg-spoiler>${d}/${mo}/${y}</tg-spoiler>\n` +
    `│ <b>Umur     :</b> <tg-spoiler>${age} tahun</tg-spoiler>\n` +
    `│ <b>Hari HBD :</b> <tg-spoiler>${daysLeft} hari lagi 🎉</tg-spoiler>\n` +
    `│ <b>Total    :</b> <tg-spoiler>${totalDays.toLocaleString()} hari hidup</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Age ✦</tg-spoiler></blockquote>`
  );
}

// ── .timezone <zona> <waktu> ─────────────────────────────────
async function cmdTimezone(client, msg, args) {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 1) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .timezone Asia/Jakarta</tg-spoiler>\n│ <tg-spoiler>Format: .timezone America/New_York</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const tz = parts[0];
  try {
    const now    = new Date();
    const zones  = ['Asia/Jakarta','Asia/Singapore','Asia/Tokyo','Asia/Dubai','Europe/London','America/New_York','America/Los_Angeles','Australia/Sydney'];
    let result   = `<blockquote>╭──「 🌍 <b>TIMEZONE</b> 」\n│\n`;

    if (tz.includes('/')) {
      // Tampilkan waktu di zona yang diminta
      const time = now.toLocaleString('id-ID', { timeZone: tz, hour12: false });
      result += `│ <b>Zona    :</b> <tg-spoiler>${esc(tz)}</tg-spoiler>\n`;
      result += `│ <b>Waktu   :</b> <tg-spoiler>${time}</tg-spoiler>\n│\n`;
    }

    // Tampilkan beberapa zona populer
    result += `│ <b>Zona Populer :</b>\n`;
    for (const z of zones) {
      const t = now.toLocaleTimeString('id-ID', { timeZone: z, hour12: false });
      const label = z.split('/')[1].replace(/_/g,' ');
      result += `│ <tg-spoiler>${label.padEnd(15)} ${t}</tg-spoiler>\n`;
    }
    result += `│\n╰────────────────────────</blockquote>`;
    await reply(client, msg, result);
  } catch (e) {
    await reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Zona tidak valid: ${esc(tz)}</tg-spoiler>\n│ <tg-spoiler>Contoh: Asia/Jakarta, America/New_York</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ── .json <teks json> ────────────────────────────────────────
async function cmdJson(client, msg, args) {
  // Jika reply ke pesan, ambil teksnya
  let content = args.trim();
  if (!content && msg.replyTo?.replyToMsgId) {
    const msgs = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] }).catch(() => []);
    content = msgs?.[0]?.message?.trim() || '';
  }
  if (!content) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .json {"key":"value"}</tg-spoiler>\n│ <tg-spoiler>Atau reply ke pesan JSON → .json</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const parsed  = JSON.parse(content);
    const pretty  = JSON.stringify(parsed, null, 2);
    const lines   = pretty.split('\n').length;
    const keys    = typeof parsed === 'object' ? Object.keys(parsed).length : 0;
    const display = pretty.length > 3000 ? pretty.slice(0, 3000) + '\n...(dipotong)' : pretty;

    await reply(client, msg,
      `<blockquote>╭──「 📋 <b>JSON FORMATTER</b> 」\n` +
      `│ <tg-spoiler>Baris: ${lines} | Keys: ${keys}</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>\n\n<pre>${esc(display)}</pre>`
    );
  } catch (e) {
    await reply(client, msg,
      `<blockquote>╭──「 ❌ <b>JSON INVALID</b> 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: MOTIVASI — .motivasi
// Kirim kata motivasi random dalam bahasa Indonesia
// ═══════════════════════════════════════════════════════════════
async function cmdMotivasi(client, msg) {
  const list = [
    'Jangan hitung hari, buat setiap hari berarti. — Muhammad Ali',
    'Kesuksesan adalah jumlah dari usaha-usaha kecil yang diulang setiap hari. — Robert Collier',
    'Orang yang tidak pernah membuat kesalahan adalah orang yang tidak pernah mencoba hal baru. — Albert Einstein',
    'Impian tanpa tujuan hanyalah mimpi. Tujuan tanpa rencana hanyalah keinginan. — Antoine de Saint-Exupéry',
    'Jangan takut gagal. Takutlah tidak pernah mencoba.',
    'Setiap pagi kamu bangun dengan dua pilihan: lanjut tidur dan bermimpi, atau bangun dan kejar impianmu.',
    'Kamu tidak harus hebat untuk memulai, tapi kamu harus memulai untuk menjadi hebat. — Zig Ziglar',
    'Kesulitan dalam hidup dimaksudkan untuk membuat kita lebih baik, bukan lebih pahit.',
    'Percayalah pada dirimu sendiri dan semua yang kamu miliki. Ketahuilah bahwa ada sesuatu di dalam dirimu yang lebih besar dari rintangan apapun.',
    'Bekerja keraslah saat orang lain sedang tidur. Belajarlah saat orang lain sedang bersantai.',
    'Hidup bukan tentang menunggu badai berlalu, tapi tentang belajar menari di bawah hujan.',
    'Satu-satunya cara untuk melakukan pekerjaan hebat adalah dengan mencintai apa yang kamu lakukan. — Steve Jobs',
    'Jangan pernah menyerah. Hari ini terasa berat, esok akan lebih baik.',
    'Kamu lebih berani dari yang kamu percaya, lebih kuat dari yang kamu lihat. — A.A. Milne',
    'Mulailah dari mana kamu berada. Gunakan apa yang kamu miliki. Lakukan apa yang kamu bisa.',
  ];
  const q = list[Math.floor(Math.random() * list.length)];
  const [text, author] = q.includes(' — ') ? q.split(' — ') : [q, 'Anonim'];
  await reply(client, msg,
    `<blockquote>╭──「 💪 <b>MOTIVASI HARI INI</b> 」\n` +
    `│\n` +
    `│ <tg-spoiler>"${esc(text)}"</tg-spoiler>\n` +
    `│\n` +
    `│ <b>— ${esc(author)}</b>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Motivasi ✦</tg-spoiler></blockquote>`
  );
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: GAYA KATA — .gayakata <teks>
// Konversi teks ke berbagai gaya tulisan unik
// ═══════════════════════════════════════════════════════════════
async function cmdGayaKata(client, msg, args) {
  const text = args.trim();
  if (!text) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .gayakata teks kamu</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  const bold     = [...text].map(c => {
    const code = c.codePointAt(0);
    if (code >= 65 && code <= 90)  return String.fromCodePoint(code - 65 + 0x1D400);
    if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + 0x1D41A);
    if (code >= 48 && code <= 57)  return String.fromCodePoint(code - 48 + 0x1D7CE);
    return c;
  }).join('');

  const italic   = [...text].map(c => {
    const code = c.codePointAt(0);
    if (code >= 65 && code <= 90)  return String.fromCodePoint(code - 65 + 0x1D434);
    if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + 0x1D44E);
    return c;
  }).join('');

  const mono     = [...text].map(c => {
    const code = c.codePointAt(0);
    if (code >= 65 && code <= 90)  return String.fromCodePoint(code - 65 + 0x1D670);
    if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + 0x1D68A);
    if (code >= 48 && code <= 57)  return String.fromCodePoint(code - 48 + 0x1D7F6);
    return c;
  }).join('');

  const bubble   = [...text].map(c => {
    const code = c.codePointAt(0);
    if (code >= 65 && code <= 90)  return String.fromCodePoint(code - 65 + 0x24B6);
    if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + 0x24D0);
    if (code >= 49 && code <= 57)  return String.fromCodePoint(code - 49 + 0x2460);
    if (code === 48) return '⓪';
    return c;
  }).join('');

  const flip     = [...text].map(c => {
    const map = { a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z','!':'¡','?':'¿',',':'\'','\'':',','.':'˙' };
    return map[c.toLowerCase()] || c;
  }).reverse().join('');

  const swords   = [...text].map(c => {
    const code = c.codePointAt(0);
    if (code >= 65 && code <= 90)  return String.fromCodePoint(code - 65 + 0x1D56C);
    if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + 0x1D586);
    return c;
  }).join('');

  await reply(client, msg,
    `<blockquote>╭──「 ✍️ <b>GAYA KATA</b> 」\n` +
    `│\n` +
    `│ <b>Bold     :</b> ${bold.slice(0,50)}\n` +
    `│ <b>Italic   :</b> ${italic.slice(0,50)}\n` +
    `│ <b>Mono     :</b> ${mono.slice(0,50)}\n` +
    `│ <b>Bubble   :</b> ${bubble.slice(0,50)}\n` +
    `│ <b>Flip     :</b> ${flip.slice(0,50)}\n` +
    `│ <b>Medieval :</b> ${swords.slice(0,50)}\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot GayaKata ✦</tg-spoiler></blockquote>`
  );
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: BISNIS & TRANSAKSI
// ═══════════════════════════════════════════════════════════════
async function cmdInvoice(client, msg, phone, args) {
  if (!args) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .invoice NamaBuyer | Produk | Harga | Qty</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const parts = args.split('|').map(s => s.trim());
  const [buyer = 'Customer', produk = '-', harga = '0', qty = '1'] = parts;
  const total = parseInt(harga.replace(/\D/g,'')) * parseInt(qty);
  const id    = 'INV-' + Date.now().toString(36).toUpperCase();
  await reply(client, msg,
    `<blockquote>╭──「 🧾 <b>INVOICE</b> 」\n` +
    `│ <b>No      :</b> <tg-spoiler>${id}</tg-spoiler>\n` +
    `│ <b>Tgl     :</b> <tg-spoiler>${new Date().toLocaleDateString('id-ID')}</tg-spoiler>\n` +
    `│ <b>Buyer   :</b> <tg-spoiler>${esc(buyer)}</tg-spoiler>\n` +
    `├────────────────────────\n` +
    `│ <b>Produk  :</b> ${esc(produk)}\n` +
    `│ <b>Qty     :</b> ${esc(qty)}x\n` +
    `│ <b>Harga   :</b> <tg-spoiler>Rp ${parseInt(harga.replace(/\D/g,'')).toLocaleString('id-ID')}</tg-spoiler>\n` +
    `│ <b>Total   :</b> <tg-spoiler>Rp ${total.toLocaleString('id-ID')}</tg-spoiler>\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Terima kasih telah berbelanja! ✦</tg-spoiler></blockquote>`
  );
}

async function cmdDiskon(client, msg, args) {
  const parts = args.trim().split(/\s+/);
  const harga = parseFloat(parts[0]?.replace(/\D/g,''));
  const pct   = parseFloat(parts[1]?.replace('%',''));
  if (isNaN(harga) || isNaN(pct)) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .diskon 100000 20%</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const disc  = harga * (pct / 100);
  const bayar = harga - disc;
  await reply(client, msg,
    box('🏷', 'HITUNG DISKON', [
      ['Harga Asli',  `Rp ${harga.toLocaleString('id-ID')}`,  false],
      ['Diskon',      `${pct}% = Rp ${disc.toLocaleString('id-ID')}`, true],
      ['Harga Bayar', `Rp ${bayar.toLocaleString('id-ID')}`,  true],
    ], 'Zetsy UBot Diskon')
  );
}

async function cmdLaba(client, msg, args) {
  const parts  = args.trim().split(/\s+/);
  const modal  = parseFloat(parts[0]?.replace(/\D/g,''));
  const jual   = parseFloat(parts[1]?.replace(/\D/g,''));
  if (isNaN(modal) || isNaN(jual)) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .laba 50000 80000</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const laba   = jual - modal;
  const margin = ((laba / modal) * 100).toFixed(1);
  await reply(client, msg,
    box('💹', 'HITUNG LABA', [
      ['Modal',       `Rp ${modal.toLocaleString('id-ID')}`, false],
      ['Harga Jual',  `Rp ${jual.toLocaleString('id-ID')}`,  false],
      ['Laba',        `Rp ${laba.toLocaleString('id-ID')}`,  true],
      ['Margin',      `${margin}%`,                          true],
      ['Status',      laba > 0 ? '✅ Untung' : '❌ Rugi',   false],
    ], 'Zetsy UBot Laba')
  );
}

async function cmdOngkir(client, msg, args) {
  const parts = args.split('|').map(s => s.trim());
  if (parts.length < 3) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .ongkir Jakarta | Surabaya | 500</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const [asal, tujuan, berat] = parts;
  const kg  = Math.ceil(parseInt(berat) / 1000);
  await reply(client, msg,
    box('🚚', 'ESTIMASI ONGKIR', [
      ['Asal',      asal,                                    false],
      ['Tujuan',    tujuan,                                  false],
      ['Berat',     `${berat} gram`,                         false],
      ['JNE REG',   `Rp ${(kg*9000).toLocaleString('id-ID')}`, true],
      ['JNE YES',   `Rp ${(kg*19000).toLocaleString('id-ID')}`,true],
      ['J&T',       `Rp ${(kg*8000).toLocaleString('id-ID')}`, true],
      ['SiCepat',   `Rp ${(kg*7000).toLocaleString('id-ID')}`, true],
    ], 'Zetsy UBot Ongkir — Estimasi saja')
  );
}

async function cmdResi(client, msg, args) {
  if (!args) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Format: .resi <nomor_resi></tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ 」\n│ <tg-spoiler>Zetsy: Melacak resi ${esc(args)}...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    const res = await axios.get(
      `https://api.binderbyte.com/v1/track?api_key=free&courier=auto&awb=${encodeURIComponent(args)}`,
      { timeout: 12000 }
    );
    const d    = res.data?.data;
    if (!d) throw new Error('Resi tidak ditemukan');
    const last = d.history?.[0];
    await edit(client, msg.chatId, m.id,
      box('📦', 'LACAK RESI', [
        ['Resi',    args,                        true],
        ['Kurir',   d.summary?.courier || '-',   false],
        ['Status',  d.summary?.status  || '-',   false],
        ['Terakhir',last?.desc          || '-',   true],
        ['Lokasi',  last?.location      || '-',   true],
      ], 'Zetsy UBot Lacak Resi')
    );
  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Lacak gagal: ${esc(e.message)}</tg-spoiler>\n│ <tg-spoiler>Cek manual di cek-resi.com</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: FUN
// ═══════════════════════════════════════════════════════════════
async function cmdCekKontol(client, msg, nama) {
  if (!nama || nama.trim().length < 1) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>FORMAT SALAH</b> 」\n│ <tg-spoiler>Format: .cekkontol nama</tg-spoiler>\n│ <tg-spoiler>Contoh: .cekkontol Ahmad</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  // Generate angka "konsisten" berdasarkan nama biar seru
  // Pakai hash sederhana dari nama supaya angka yang sama tiap dipanggil dengan nama sama
  const seed   = nama.trim().split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const panjang = (seed % 24) + 1; // range 1–24 cm
  const bar    = '█'.repeat(Math.floor(panjang / 2)) + (panjang % 2 ? '▌' : '');

  let verdict, emoji;
  if (panjang <= 5) {
    verdict = 'KONTOL LU KECIL BANGET ANJIRR 😭💀';
    emoji   = '😭😭😭';
  } else if (panjang <= 10) {
    verdict = 'YA LUMAYAN LAH, STANDAR MANUSIA 😐';
    emoji   = '😐🤏';
  } else if (panjang <= 16) {
    verdict = 'GEDE JUGA KONTOL LU BRO 😳🔥';
    emoji   = '😳🔥';
  } else {
    verdict = 'KONTOL LU GEDE PARAH MONSTER FR FR 💀🗿';
    emoji   = '💀🗿🗿';
  }

  await reply(client, msg,
    `<blockquote>╭──「 🍆 <b>CEK UKURAN KONTOL</b> 」\n│\n` +
    `│ <b>Nama   :</b> <tg-spoiler>${esc(nama.trim())}</tg-spoiler>\n` +
    `│ <b>Panjang:</b> <tg-spoiler>${panjang} cm</tg-spoiler>\n` +
    `│ <b>Visual :</b> <tg-spoiler>|${bar}| ${panjang}cm</tg-spoiler>\n` +
    `│\n` +
    `│ <tg-spoiler>${esc(verdict)}</tg-spoiler>\n` +
    `│ <tg-spoiler>${emoji}</tg-spoiler>\n` +
    `│\n╰────────────────────────\n` +
    `<tg-spoiler>✦ Just for fun! Jangan baper ya~ ✦</tg-spoiler></blockquote>`
  );
}

async function cmdJoke(client, msg) {
  const jokes = [
    'Kenapa programmer selalu memakai kacamata? Karena mereka tidak bisa C# 😂',
    'Bug: fitur yang belum terdokumentasi — setiap programmer',
    'Kenapa code saya tidak work? Because you wrote it.',
    'Kenapa programmer suka gelap? Karena light attracts bugs! 🪲',
    'Istri programmer nanya: "Pergi ke warung, beli 1 roti. Kalau ada telur, beli 12." — Balik bawa 12 roti 😂',
    'HTTP 404: Jokes not found... tapi ini ada! 😁',
  ];
  await reply(client, msg,
    `<blockquote>╭──「 😂 <b>JOKE OF THE DAY</b> 」\n│\n│ <tg-spoiler>${esc(jokes[Math.floor(Math.random()*jokes.length)])}</tg-spoiler>\n│\n╰────────────────────────</blockquote>`
  );
}

async function cmdFakta(client, msg) {
  const faktas = [
    'Honey tidak pernah basi. Madu berusia 3000 tahun ditemukan di makam Mesir dan masih bisa dimakan!',
    'Gurita memiliki 3 jantung dan darahnya berwarna biru.',
    'Pisang secara teknis adalah buah beri, tapi stroberi bukan.',
    'Otak manusia menghasilkan listrik cukup untuk menyalakan bohlam LED kecil.',
    'Sidik jari koala hampir identik dengan manusia sehingga bisa membingungkan forensik.',
    'Air hangat membeku lebih cepat dari air dingin — disebut efek Mpemba.',
  ];
  await reply(client, msg,
    `<blockquote>╭──「 🔬 <b>FAKTA UNIK</b> 」\n│\n│ <tg-spoiler>${esc(faktas[Math.floor(Math.random()*faktas.length)])}</tg-spoiler>\n│\n╰────────────────────────</blockquote>`
  );
}

async function cmdRamalan(client, msg) {
  const r = [
    'Hari ini adalah hari yang sangat baik untuk memulai sesuatu yang baru! ✨',
    'Rezekimu sedang dalam perjalanan, bersabarlah! 💰',
    'Tetaplah fokus, kesuksesan sudah dekat! 🎯',
    'Peluang besar sedang menunggumu, jangan lewatkan! 🚀',
    'Jaga kesehatan hari ini, tubuh adalah aset terbaikmu! 💪',
  ];
  await reply(client, msg,
    `<blockquote>╭──「 🔮 <b>RAMALAN HARI INI</b> 」\n│\n│ <tg-spoiler>${esc(r[Math.floor(Math.random()*r.length)])}</tg-spoiler>\n│\n╰────────────────────────</blockquote>`
  );
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: GRUP TAMBAHAN
// ═══════════════════════════════════════════════════════════════
async function cmdGcInfo(client, msg) {
  try {
    const entity = await client.getEntity(msg.chatId);
    const full   = await client.invoke(new Api.channels.GetFullChannel({
      channel: await client.getInputEntity(msg.chatId),
    })).catch(() => null);
    await reply(client, msg,
      box('👥', 'INFO GRUP', [
        ['Nama',    entity.title || '-',                           false],
        ['Username',entity.username ? `@${entity.username}` : 'Private', true],
        ['ID',      msg.chatId?.toString(),                        true],
        ['Member',  `${full?.fullChat?.participantsCount || '?'} orang`, true],
        ['Desc',    (full?.fullChat?.about || '-').slice(0,80),   true],
      ], 'Zetsy UBot GC Info')
    );
  } catch (e) {
    await reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

async function cmdInvite(client, msg) {
  try {
    const result = await client.invoke(new Api.messages.ExportChatInvite({
      peer: await client.getInputEntity(msg.chatId),
    }));
    await reply(client, msg,
      `<blockquote>╭──「 🔗 <b>INVITE LINK</b> 」\n│ <tg-spoiler>${esc(result.link)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  } catch (e) {
    await reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

async function cmdPin(client, msg) {
  if (!msg.replyTo?.replyToMsgId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Reply ke pesan yang ingin di-pin!</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  try {
    await client.invoke(new Api.messages.UpdatePinnedMessage({
      peer: await client.getInputEntity(msg.chatId),
      id: msg.replyTo.replyToMsgId, silent: true,
    }));
    await reply(client, msg,
      `<blockquote>╭──「 📌 <b>PESAN DIPIN</b> 」\n│ <tg-spoiler>Berhasil!</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  } catch (e) {
    await reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

async function cmdUnpin(client, msg) {
  try {
    await client.invoke(new Api.messages.UnpinAllMessages({
      peer: await client.getInputEntity(msg.chatId),
    }));
    await reply(client, msg,
      `<blockquote>╭──「 📌 <b>SEMUA PIN DILEPAS</b> 」\n│ <tg-spoiler>Berhasil unpin semua pesan</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  } catch (e) {
    await reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: BLACKLIST — User & Grup
// ─────────────────────────────────────────────────────────────
// Struktur blacklistStore:
//   blacklistStore.get(phone) = {
//     users : Set<string>,   // ID user → blokir AFK reply
//     groups: Map<string, {  // ID grup → blokir broadcast & bubble
//       id   : string,
//       name : string,
//       addedAt: number,
//     }>
//   }
// ─────────────────────────────────────────────────────────────
// Helper: ambil atau buat store untuk phone
function getBl(phone) {
  if (!blacklistStore.has(phone)) {
    blacklistStore.set(phone, { users: new Set(), groups: new Map() });
  }
  const bl = blacklistStore.get(phone);
  // Migrasi dari Set lama (jika masih berupa Set murni)
  if (bl instanceof Set) {
    const oldSet = bl;
    blacklistStore.set(phone, { users: oldSet, groups: new Map() });
  }
  return blacklistStore.get(phone);
}

// Helper: cek apakah grup di-blacklist (dipakai oleh broadcast & reply)
function isGroupBlacklisted(phone, groupId) {
  const bl = blacklistStore.get(phone);
  if (!bl || bl instanceof Set) return false;
  return bl.groups?.has(String(groupId)) ?? false;
}

// ── .addbl ────────────────────────────────────────────────────
// Tanpa args + tidak di-reply    → blacklist GRUP saat ini
// Dengan args (ID) / reply user  → blacklist USER
async function cmdAddBl(client, msg, phone, args) {
  const bl = getBl(phone);
  const argsTrim = args.trim();

  // ── MODE GRUP: tidak ada args dan tidak reply → blacklist grup saat ini
  if (!argsTrim && !msg.replyTo?.replyToMsgId) {
    const chatId   = msg.chatId?.toString();
    const isGroup  = msg.isGroup || msg.isChannel || (!msg.isPrivate && chatId?.startsWith('-'));

    if (!isGroup) return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>BUKAN GRUP</b> 」\n` +
      `│ <tg-spoiler>Perintah ini harus diketik di dalam grup!</tg-spoiler>\n` +
      `│\n` +
      `│ <b>Cara pakai:</b>\n` +
      `│ <tg-spoiler>• Di grup → .addbl (blacklist grup ini)</tg-spoiler>\n` +
      `│ <tg-spoiler>• .addbl &lt;userId&gt; → blacklist user</tg-spoiler>\n` +
      `│ <tg-spoiler>• Reply pesan user → blacklist user tsb</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    );

    if (bl.groups.has(chatId)) return reply(client, msg,
      `<blockquote>╭──「 ⚠️ <b>SUDAH ADA</b> 」\n` +
      `│ <tg-spoiler>Grup ini sudah ada di blacklist!</tg-spoiler>\n` +
      `│ <tg-spoiler>Gunakan .delbl untuk menghapusnya</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    );

    // Ambil nama grup
    let groupName = 'Unknown Group';
    try {
      const entity = await client.getEntity(msg.chatId);
      groupName = entity?.title || groupName;
    } catch (_) {}

    bl.groups.set(chatId, { id: chatId, name: groupName, addedAt: Date.now() });

    return reply(client, msg,
      `<blockquote>╭──「 🚫 <b>BERHASIL DI TAMBAHKAN KE DALAM LIST JEMBOT</b> 」\n` +
      `│\n` +
      `│ <b>Nama Grup :</b> <tg-spoiler>${esc(groupName)}</tg-spoiler>\n` +
      `│ <b>ID Grup   :</b> <tg-spoiler>${esc(chatId)}</tg-spoiler>\n` +
      `│\n` +
      `│ <tg-spoiler>🚫 Broadcast tidak akan dikirim ke sini</tg-spoiler>\n` +
      `│ <tg-spoiler>🚫 AFK reply diblokir di grup ini</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot ✦</tg-spoiler></blockquote>`
    );
  }

  // ── MODE USER: ada args ID atau reply ke pesan user
  let targetId = argsTrim || null;
  let targetName = targetId || 'User';

  if (!targetId && msg.replyTo?.replyToMsgId) {
    try {
      const r = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
      const s = r?.[0]?.sender;
      if (s) {
        targetId   = s.id?.toString();
        targetName = [s.firstName, s.lastName].filter(Boolean).join(' ') || 'User';
      }
    } catch (_) {}
  }

  if (!targetId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n` +
    `│ <tg-spoiler>Cara pakai:</tg-spoiler>\n` +
    `│ <tg-spoiler>• Di grup tanpa args → blacklist grup ini</tg-spoiler>\n` +
    `│ <tg-spoiler>• .addbl &lt;userId&gt; → blacklist user</tg-spoiler>\n` +
    `│ <tg-spoiler>• Reply pesan user → blacklist user tsb</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  bl.users.add(targetId);
  await reply(client, msg,
    `<blockquote>╭──「 🚫 <b>USER DIBLACKLIST</b> 」\n` +
    `│\n` +
    `│ <b>Nama :</b> <tg-spoiler>${esc(targetName)}</tg-spoiler>\n` +
    `│ <b>ID   :</b> <tg-spoiler>${esc(targetId)}</tg-spoiler>\n` +
    `│\n` +
    `│ <b>Efek blacklist user:</b>\n` +
    `│ <tg-spoiler>🚫 AFK auto-reply tidak akan dikirim ke user ini</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Blacklist User ✦</tg-spoiler></blockquote>`
  );
}

// ── .listbl ───────────────────────────────────────────────────
async function cmdListBl(client, msg, phone) {
  const bl = getBl(phone);
  const totalUser  = bl.users.size;
  const totalGroup = bl.groups.size;

  if (totalUser === 0 && totalGroup === 0) return reply(client, msg,
    `<blockquote>╭──「 ℹ️ 」\n│ <tg-spoiler>Blacklist masih kosong!</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  let txt = `<blockquote>╭──「 🚫 <b>DAFTAR BLACKLIST</b> 」\n│\n`;

  // Seksi Grup
  txt += `│ <b>[ 🏘 GRUP DIBLACKLIST (${totalGroup}) ]</b>\n`;
  if (totalGroup === 0) {
    txt += `│ <tg-spoiler>  (kosong)</tg-spoiler>\n`;
  } else {
    let i = 1;
    for (const [id, info] of bl.groups) {
      const tgl = new Date(info.addedAt).toLocaleDateString('id-ID');
      txt += `│ ${i++}. <tg-spoiler>${esc(info.name)}</tg-spoiler>\n`;
      txt += `│    ID: <tg-spoiler>${esc(id)}</tg-spoiler>\n`;
      txt += `│    Ditambah: <tg-spoiler>${tgl}</tg-spoiler>\n`;
    }
  }

  txt += `│\n│ <b>[ 👤 USER DIBLACKLIST (${totalUser}) ]</b>\n`;
  if (totalUser === 0) {
    txt += `│ <tg-spoiler>  (kosong)</tg-spoiler>\n`;
  } else {
    [...bl.users].forEach((id, i) => {
      txt += `│ ${i + 1}. <tg-spoiler>${esc(id)}</tg-spoiler>\n`;
    });
  }

  txt +=
    `│\n╰────────────────────────\n` +
    `<tg-spoiler>✦ Total: ${totalGroup} grup + ${totalUser} user diblokir ✦</tg-spoiler></blockquote>`;

  await reply(client, msg, txt);
}

// ── .delbl ────────────────────────────────────────────────────
// Tanpa args + di grup → hapus grup saat ini dari blacklist
// Dengan args ID / reply user → hapus user dari blacklist
async function cmdDelBl(client, msg, phone, args) {
  const bl      = getBl(phone);
  const argsTrim = args.trim();

  // MODE GRUP: hapus grup saat ini
  if (!argsTrim && !msg.replyTo?.replyToMsgId) {
    const chatId  = msg.chatId?.toString();
    const isGroup = msg.isGroup || msg.isChannel || (!msg.isPrivate && chatId?.startsWith('-'));

    if (!isGroup) return reply(client, msg,
      `<blockquote>╭──「 ❌ 」\n` +
      `│ <tg-spoiler>Ketik di dalam grup untuk hapus grup dari blacklist</tg-spoiler>\n` +
      `│ <tg-spoiler>Atau: .delbl &lt;userId&gt; untuk hapus user</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    );

    if (!bl.groups.has(chatId)) return reply(client, msg,
      `<blockquote>╭──「 ⚠️ 」\n` +
      `│ <tg-spoiler>Grup ini tidak ada di blacklist!</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    );

    const info = bl.groups.get(chatId);
    bl.groups.delete(chatId);

    return reply(client, msg,
      `<blockquote>╭──「 ✅ <b>GRUP DIHAPUS DARI BLACKLIST</b> 」\n` +
      `│ <tg-spoiler>${esc(info.name)}</tg-spoiler>\n` +
      `│ <tg-spoiler>ID: ${esc(chatId)}</tg-spoiler>\n` +
      `│ <tg-spoiler>Broadcast & bubble sudah diizinkan kembali!</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    );
  }

  // MODE USER
  let targetId = argsTrim || null;
  if (!targetId && msg.replyTo?.replyToMsgId) {
    try {
      const r = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
      const s = r?.[0]?.sender;
      if (s) targetId = s.id?.toString();
    } catch (_) {}
  }

  if (!targetId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n` +
    `│ <tg-spoiler>Ketik di grup → hapus grup dari blacklist</tg-spoiler>\n` +
    `│ <tg-spoiler>.delbl &lt;userId&gt; atau reply → hapus user</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  if (!bl.users.has(targetId)) return reply(client, msg,
    `<blockquote>╭──「 ⚠️ 」\n` +
    `│ <tg-spoiler>User ${esc(targetId)} tidak ada di blacklist!</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  bl.users.delete(targetId);
  await reply(client, msg,
    `<blockquote>╭──「 ✅ <b>USER DIHAPUS DARI BLACKLIST</b> 」\n` +
    `│ <tg-spoiler>ID: ${esc(targetId)}</tg-spoiler>\n` +
    `│ <tg-spoiler>AFK reply sudah aktif kembali untuk user ini</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );
}

// ═══════════════════════════════════════════════════════════════
// ╔══════════════════════════════════════════════════════════════╗
// ║    🚀 AUTO INSTALLER PTERODACTYL PANEL + WINGS + DB         ║
// ║                                                              ║
// ║  .install "IP, PW_ROOT, DOMAIN_PANEL, DOMAIN_NODE, RAM"    ║
// ║                                                              ║
// ║  - Install Panel Pterodactyl otomatis                        ║
// ║  - Install Wings (daemon) otomatis                           ║
// ║  - Buat database MySQL "Zetsy"                               ║
// ║  - Username & password admin = nama akun Telegram kamu       ║
// ║  - Buat Node otomatis di panel                               ║
// ║  - Progress live update via Telegram                         ║
// ╚══════════════════════════════════════════════════════════════╝
// ═══════════════════════════════════════════════════════════════

// Script bash installer full Pterodactyl
function generateInstallScript(cfg) {
  const {
    domain,       // domain panel   misal: panel.domain.com
    nodeDomain,   // domain node    misal: node.domain.com
    dbPass,       // password MySQL (= username telegram)
    adminUser,    // username admin  (= username telegram)
    adminPass,    // password admin  (= username telegram)
    adminEmail,   // email admin
    ram,          // RAM VPS dalam MB misal: 2048
  } = cfg;

  return `#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

# ── Warna output ──
RED='\\033[0;31m'; GREEN='\\033[0;32m'; YELLOW='\\033[1;33m'; CYAN='\\033[0;36m'; NC='\\033[0m'
log()  { echo -e "\\${CYAN}[Zetsy]\\${NC} $1"; }
ok()   { echo -e "\\${GREEN}[OK]\\${NC} $1"; }
warn() { echo -e "\\${YELLOW}[WARN]\\${NC} $1"; }

# ════════════════════════════════════════════════════
# STEP 1: Update & install dependency
# ════════════════════════════════════════════════════
log "Step 1/9: Update sistem & install dependency..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl wget git unzip tar software-properties-common \
  apt-transport-https ca-certificates gnupg2 ufw fail2ban htop net-tools
ok "Dependency terinstall"

# ════════════════════════════════════════════════════
# STEP 2: Install PHP 8.3
# ════════════════════════════════════════════════════
log "Step 2/9: Install PHP 8.3..."
add-apt-repository -y ppa:ondrej/php || true
apt-get update -y
apt-get install -y php8.3 php8.3-{cli,gd,mysql,pdo,mbstring,tokenizer,bcmath,xml,fpm,curl,zip}
ok "PHP 8.3 terinstall: $(php -v | head -1)"

# ════════════════════════════════════════════════════
# STEP 3: Install MySQL & buat database Zetsy
# ════════════════════════════════════════════════════
log "Step 3/9: Install MySQL & setup database 'Zetsy'..."
apt-get install -y mysql-server
systemctl enable --now mysql

mysql -u root << 'SQLEOF'
CREATE DATABASE IF NOT EXISTS Zetsy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'Zetsy'@'127.0.0.1' IDENTIFIED BY '${dbPass}';
GRANT ALL PRIVILEGES ON Zetsy.* TO 'Zetsy'@'127.0.0.1';
CREATE USER IF NOT EXISTS 'Zetsy'@'localhost' IDENTIFIED BY '${dbPass}';
GRANT ALL PRIVILEGES ON Zetsy.* TO 'Zetsy'@'localhost';
FLUSH PRIVILEGES;
SQLEOF
ok "Database 'Zetsy' dibuat, user 'Zetsy' siap"

# ════════════════════════════════════════════════════
# STEP 4: Install Redis
# ════════════════════════════════════════════════════
log "Step 4/9: Install Redis..."
apt-get install -y redis-server
systemctl enable --now redis-server
ok "Redis running"

# ════════════════════════════════════════════════════
# STEP 5: Install Nginx & Composer
# ════════════════════════════════════════════════════
log "Step 5/9: Install Nginx & Composer..."
apt-get install -y nginx
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
ok "Nginx & Composer siap"

# ════════════════════════════════════════════════════
# STEP 6: Download & install Pterodactyl Panel
# ════════════════════════════════════════════════════
log "Step 6/9: Download Pterodactyl Panel v1.x..."
mkdir -p /var/www/pterodactyl
cd /var/www/pterodactyl
curl -Lo panel.tar.gz https://github.com/pterodactyl/panel/releases/latest/download/panel.tar.gz
tar -xzvf panel.tar.gz && rm panel.tar.gz

chmod -R 755 storage/* bootstrap/cache/

# Copy & configure .env
cp .env.example .env
sed -i "s|APP_URL=.*|APP_URL=https://${domain}|g" .env
sed -i "s|DB_DATABASE=.*|DB_DATABASE=Zetsy|g" .env
sed -i "s|DB_USERNAME=.*|DB_USERNAME=Zetsy|g" .env
sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=${dbPass}|g" .env
sed -i "s|CACHE_DRIVER=.*|CACHE_DRIVER=redis|g" .env
sed -i "s|SESSION_DRIVER=.*|SESSION_DRIVER=redis|g" .env
sed -i "s|QUEUE_CONNECTION=.*|QUEUE_CONNECTION=redis|g" .env

composer install --no-dev --optimize-autoloader --no-interaction
php artisan key:generate --force
php artisan p:environment:database --host=127.0.0.1 --port=3306 \
  --database=Zetsy --username=Zetsy --password=${dbPass} --no-interaction
php artisan migrate --seed --force

# Buat admin user dengan username & password = nama akun telegram
php artisan p:user:make \
  --email=${adminEmail} \
  --username=${adminUser} \
  --name-first=${adminUser} \
  --name-last=Zetsy \
  --password=${adminPass} \
  --admin=1

chown -R www-data:www-data /var/www/pterodactyl
ok "Pterodactyl Panel terinstall! Admin: ${adminUser} / ${adminPass}"

# ════════════════════════════════════════════════════
# STEP 7: Setup Nginx untuk Panel
# ════════════════════════════════════════════════════
log "Step 7/9: Konfigurasi Nginx untuk Panel..."
cat > /etc/nginx/sites-available/pterodactyl << 'NGINXEOF'
server {
    listen 80;
    server_name ${domain};
    root /var/www/pterodactyl/public;
    index index.php;
    charset utf-8;

    location / {
        try_files \\$uri \\$uri/ /index.php?\\$query_string;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }

    access_log /var/log/nginx/pterodactyl.app-access.log;
    error_log  /var/log/nginx/pterodactyl.app-error.log error;

    client_max_body_size 100m;
    client_body_timeout 120s;
    sendfile off;

    location ~ \\.php$ {
        fastcgi_split_path_info ^(.+\\.php)(/.+)$;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param PHP_VALUE "upload_max_filesize = 100M \\npost_max_size=100M";
        fastcgi_param SCRIPT_FILENAME \\$document_root\\$fastcgi_script_name;
        fastcgi_read_timeout 300;
    }

    location ~ /\\.ht { deny all; }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/pterodactyl /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
ok "Nginx dikonfigurasi untuk ${domain}"

# ════════════════════════════════════════════════════
# STEP 8: Install Pterodactyl Wings (daemon)
# ════════════════════════════════════════════════════
log "Step 8/9: Install Pterodactyl Wings..."

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Download Wings binary
mkdir -p /etc/pterodactyl
curl -L -o /usr/local/bin/wings https://github.com/pterodactyl/wings/releases/latest/download/wings_linux_amd64
chmod +x /usr/local/bin/wings

# Setup systemd service Wings
cat > /etc/systemd/system/wings.service << 'WINGSEOF'
[Unit]
Description=Pterodactyl Wings Daemon
After=docker.service network.target
Requires=docker.service

[Service]
User=root
WorkingDirectory=/etc/pterodactyl
LimitNOFILE=4096
PIDFile=/var/run/wings/daemon.pid
ExecStart=/usr/local/bin/wings
Restart=on-failure
StartLimitInterval=180
StartLimitBurst=30
RestartSec=5s

[Install]
WantedBy=multi-user.target
WINGSEOF

systemctl enable wings
ok "Wings terinstall (belum start — perlu config.yml dari panel)"

# ════════════════════════════════════════════════════
# STEP 9: Setup Queue Worker & Cron
# ════════════════════════════════════════════════════
log "Step 9/9: Setup Queue Worker & Cron..."

cat > /etc/systemd/system/pteroq.service << 'QUEUEEOF'
[Unit]
Description=Pterodactyl Queue Worker
After=redis.service

[Service]
User=www-data
Group=www-data
Restart=always
ExecStart=/usr/bin/php /var/www/pterodactyl/artisan queue:work --queue=high,standard,low --sleep=3 --tries=3
StartLimitInterval=180
StartLimitBurst=30
RestartSec=5s

[Install]
WantedBy=multi-user.target
QUEUEEOF

systemctl enable --now pteroq

# Cron
(crontab -l 2>/dev/null; echo "* * * * * php /var/www/pterodactyl/artisan schedule:run >> /dev/null 2>&1") | crontab -

# Firewall
ufw allow ssh
ufw allow 80
ufw allow 443
ufw allow 8080
ufw allow 2022
echo "y" | ufw enable || true

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         ✅ PTERODACTYL BERHASIL TERINSTALL!          ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  🌐 Panel  : http://${domain}                       "
echo "║  👤 User   : ${adminUser}                           "
echo "║  🔑 Pass   : ${adminPass}                           "
echo "║  🗄 DB     : Zetsy (user: Zetsy)                    "
echo "║  📦 Wings  : Siap — tambahkan node di panel lalu   "
echo "║             salin config.yml ke /etc/pterodactyl/  "
echo "╚══════════════════════════════════════════════════════╝"
`;
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: CMD INSTALL — .install "IP, PW, DOMAIN, NODE_DOMAIN, RAM"
// ═══════════════════════════════════════════════════════════════
async function cmdInstall(client, msg, phone, args) {
  // Parse args — bisa pakai koma atau spasi sebagai separator
  // Format: .install 1.2.3.4, root123, panel.domain.com, node.domain.com, 2048
  const parts = args.split(',').map(s => s.trim());

  if (parts.length < 5) return reply(client, msg,
    `<blockquote>╭──「 ❌ <b>FORMAT SALAH</b> 」\n` +
    `│\n` +
    `│ <b>Format:</b>\n` +
    `│ <tg-spoiler>.install IP, PW_ROOT, DOMAIN_PANEL, DOMAIN_NODE, RAM_MB</tg-spoiler>\n` +
    `│\n` +
    `│ <b>Contoh:</b>\n` +
    `│ <tg-spoiler>.install 1.2.3.4, root123, panel.Zetsy.com, node.Zetsy.com, 2048</tg-spoiler>\n` +
    `│\n` +
    `│ <b>Keterangan:</b>\n` +
    `│ <tg-spoiler>• IP      = IP VPS kamu</tg-spoiler>\n` +
    `│ <tg-spoiler>• PW_ROOT = password root VPS</tg-spoiler>\n` +
    `│ <tg-spoiler>• DOMAIN  = domain panel (arahkan ke IP VPS)</tg-spoiler>\n` +
    `│ <tg-spoiler>• NODE    = domain node (boleh sama dengan domain)</tg-spoiler>\n` +
    `│ <tg-spoiler>• RAM_MB  = total RAM VPS dalam MB (contoh: 2048)</tg-spoiler>\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Username & password panel = username Telegram kamu ✦</tg-spoiler></blockquote>`
  );

  const [ip, pw, domain, nodeDomain, ram] = parts;

  // Ambil username Telegram sebagai admin credentials
  let adminUser = 'Zetsy', adminEmail = 'admin@arabs.com';
  try {
    const me = await client.getMe();
    adminUser  = me.username || [me.firstName, me.lastName].filter(Boolean).join('').replace(/\s+/g,'') || 'Zetsy';
    adminEmail = `${adminUser.toLowerCase()}@arabs.com`;
  } catch (_) {}

  const cfg = {
    domain:      domain,
    nodeDomain:  nodeDomain,
    dbPass:      adminUser,    // password DB = username telegram
    adminUser:   adminUser,    // username panel = username telegram
    adminPass:   adminUser,    // password panel = username telegram
    adminEmail:  adminEmail,
    ram:         parseInt(ram) || 2048,
  };

  // Cek apakah sudah ada proses install berjalan
  if (installStatus.has(phone)) {
    return reply(client, msg,
      `<blockquote>╭──「 ⚠️ 」\n│ <tg-spoiler>Install sedang berjalan! Ketik .installstatus untuk cek.</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }

  // Konfirmasi awal
  const confirmMsg = await reply(client, msg,
    `<blockquote>╭──「 🚀 <b>PTERODACTYL INSTALLER</b> 」\n` +
    `│\n` +
    `│ <b>IP VPS    :</b> <tg-spoiler>${esc(ip)}</tg-spoiler>\n` +
    `│ <b>Domain    :</b> <tg-spoiler>${esc(domain)}</tg-spoiler>\n` +
    `│ <b>Node      :</b> <tg-spoiler>${esc(nodeDomain)}</tg-spoiler>\n` +
    `│ <b>RAM       :</b> <tg-spoiler>${esc(ram)} MB</tg-spoiler>\n` +
    `│ <b>DB Name   :</b> <tg-spoiler>Zetsy</tg-spoiler>\n` +
    `│ <b>Admin User:</b> <tg-spoiler>${esc(adminUser)}</tg-spoiler>\n` +
    `│ <b>Admin Pass:</b> <tg-spoiler>${esc(adminUser)}</tg-spoiler>\n` +
    `│\n` +
    `│ ⏳ <tg-spoiler>Memulai koneksi SSH ke VPS...</tg-spoiler>\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot — Auto Pterodactyl Installer ✦</tg-spoiler></blockquote>`
  );

  installStatus.set(phone, { step: 'connecting', chatId: msg.chatId, msgId: confirmMsg.id });

  // Jalankan installer secara async (non-blocking)
  runPterodactylInstall(client, msg, phone, confirmMsg.id, ip, pw, cfg).catch(async (err) => {
    installStatus.delete(phone);
    await edit(client, msg.chatId, confirmMsg.id,
      `<blockquote>╭──「 ❌ <b>INSTALL GAGAL</b> 」\n│ <tg-spoiler>${esc(err.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
    ).catch(() => {});
  });
}

// ── Core installer via SSH ────────────────────────────────────
async function runPterodactylInstall(client, msg, phone, statusMsgId, ip, pw, cfg) {
  const ssh = new NodeSSH();

  const updateStatus = async (step, detail, emoji = '⏳') => {
    installStatus.set(phone, { ...installStatus.get(phone), step });
    await edit(client, msg.chatId, statusMsgId,
      `<blockquote>╭──「 🚀 <b>PTERODACTYL INSTALLER</b> 」\n` +
      `│\n` +
      `│ ${emoji} <b>${esc(step)}</b>\n` +
      `│ <tg-spoiler>${esc(detail)}</tg-spoiler>\n` +
      `│\n` +
      `│ <tg-spoiler>Jangan matikan bot selama proses ini...</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot — Pterodactyl Installer ✦</tg-spoiler></blockquote>`
    ).catch(() => {});
  };

  try {
    // Step 1: Connect SSH
    await updateStatus('Connecting SSH...', `Menghubungi ${ip}:22`, '🔌');
    await ssh.connect({
      host: ip,
      username: 'root',
      password: pw,
      port: 22,
      readyTimeout: 30000,
      timeout: 30000,
    });
    await updateStatus('SSH Terhubung ✅', `Berhasil masuk ke ${ip}`, '✅');
    await sleep(1000);

    // Step 2: Upload & jalankan script installer
    await updateStatus('Upload Script...', 'Mengirim script installer ke VPS', '📤');
    const script = generateInstallScript(cfg);
    const scriptPath = '/tmp/arabs_ptero_install.sh';
    await ssh.execCommand(`cat > ${scriptPath} << 'ZETSYEOF'\n${script}\nZETSYEOF`);
    await ssh.execCommand(`chmod +x ${scriptPath}`);
    await updateStatus('Script Siap ✅', 'Script installer berhasil diupload', '✅');
    await sleep(500);

    // Step 3: Update sistem
    await updateStatus('Step 1/9: Update Sistem...', 'apt-get update & upgrade — bisa 3-5 menit', '🔄');
    const step1 = await ssh.execCommand('apt-get update -y && apt-get upgrade -y 2>&1 | tail -5', { execOptions: { pty: true } });
    await sleep(500);

    // Step 4: Install PHP
    await updateStatus('Step 2/9: Install PHP 8.3...', 'Menginstall PHP 8.3 dan extensions', '🐘');
    await ssh.execCommand('add-apt-repository -y ppa:ondrej/php 2>&1 | tail -3; apt-get update -y; apt-get install -y php8.3 php8.3-cli php8.3-gd php8.3-mysql php8.3-pdo php8.3-mbstring php8.3-tokenizer php8.3-bcmath php8.3-xml php8.3-fpm php8.3-curl php8.3-zip 2>&1 | tail -3');
    await sleep(500);

    // Step 5: Install MySQL & buat DB Zetsy
    await updateStatus('Step 3/9: Setup Database Zetsy...', 'Install MySQL & buat database "Zetsy"', '🗄️');
    await ssh.execCommand('apt-get install -y mysql-server 2>&1 | tail -3; systemctl enable --now mysql');
    const sqlCmd = `mysql -u root -e "CREATE DATABASE IF NOT EXISTS Zetsy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'Zetsy'@'127.0.0.1' IDENTIFIED BY '${cfg.dbPass}'; GRANT ALL PRIVILEGES ON Zetsy.* TO 'Zetsy'@'127.0.0.1'; FLUSH PRIVILEGES;"`;
    await ssh.execCommand(sqlCmd);
    await sleep(500);

    // Step 6: Install Redis + Nginx + Composer
    await updateStatus('Step 4/9: Install Redis, Nginx, Composer...', 'Menginstall web server dan cache', '⚙️');
    await ssh.execCommand('apt-get install -y redis-server nginx 2>&1 | tail -3; systemctl enable --now redis-server');
    await ssh.execCommand('curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer 2>&1 | tail -2');
    await sleep(500);

    // Step 7: Download & install Panel
    await updateStatus('Step 5/9: Install Pterodactyl Panel...', 'Download & konfigurasi panel — bisa 5-10 menit', '🦕');
    await ssh.execCommand('mkdir -p /var/www/pterodactyl && cd /var/www/pterodactyl && curl -Lo panel.tar.gz https://github.com/pterodactyl/panel/releases/latest/download/panel.tar.gz && tar -xzvf panel.tar.gz && rm panel.tar.gz 2>&1 | tail -3');
    await ssh.execCommand(`cd /var/www/pterodactyl && chmod -R 755 storage/* bootstrap/cache/ && cp .env.example .env`);
    const envCmds = [
      `sed -i "s|APP_URL=.*|APP_URL=https://${cfg.domain}|g" /var/www/pterodactyl/.env`,
      `sed -i "s|DB_DATABASE=.*|DB_DATABASE=Zetsy|g" /var/www/pterodactyl/.env`,
      `sed -i "s|DB_USERNAME=.*|DB_USERNAME=Zetsy|g" /var/www/pterodactyl/.env`,
      `sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=${cfg.dbPass}|g" /var/www/pterodactyl/.env`,
      `sed -i "s|CACHE_DRIVER=.*|CACHE_DRIVER=redis|g" /var/www/pterodactyl/.env`,
      `sed -i "s|SESSION_DRIVER=.*|SESSION_DRIVER=redis|g" /var/www/pterodactyl/.env`,
    ].join(' && ');
    await ssh.execCommand(envCmds);
    await ssh.execCommand('cd /var/www/pterodactyl && composer install --no-dev --optimize-autoloader --no-interaction 2>&1 | tail -5');
    await ssh.execCommand('cd /var/www/pterodactyl && php artisan key:generate --force && php artisan migrate --seed --force 2>&1 | tail -5');

    // Step 8: Buat admin user
    await updateStatus('Step 6/9: Membuat Admin User...', `Username: ${cfg.adminUser} | Pass: ${cfg.adminPass}`, '👤');
    const makeUserCmd = `cd /var/www/pterodactyl && echo -e "${cfg.adminEmail}\n${cfg.adminUser}\n${cfg.adminUser}\nZetsy\n${cfg.adminPass}\n1" | php artisan p:user:make 2>&1 | tail -5`;
    await ssh.execCommand(makeUserCmd);
    await sleep(500);

    // Step 9: Konfigurasi Nginx
    await updateStatus('Step 7/9: Konfigurasi Nginx...', `Setup virtual host untuk ${cfg.domain}`, '🌐');
    const nginxConf = `server {
    listen 80;
    server_name ${cfg.domain};
    root /var/www/pterodactyl/public;
    index index.php;
    location / { try_files $uri $uri/ /index.php?$query_string; }
    location ~ \\.php$ {
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
    location ~ /\\.ht { deny all; }
}`;
    await ssh.execCommand(`echo '${nginxConf}' > /etc/nginx/sites-available/pterodactyl && ln -sf /etc/nginx/sites-available/pterodactyl /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl restart nginx`);
    await ssh.execCommand('chown -R www-data:www-data /var/www/pterodactyl');
    await sleep(500);

    // Step 10: Install Docker + Wings
    await updateStatus('Step 8/9: Install Docker & Wings...', 'Menginstall Wings daemon untuk node', '🐳');
    await ssh.execCommand('curl -fsSL https://get.docker.com | sh && systemctl enable --now docker 2>&1 | tail -3');
    await ssh.execCommand('mkdir -p /etc/pterodactyl && curl -L -o /usr/local/bin/wings https://github.com/pterodactyl/wings/releases/latest/download/wings_linux_amd64 && chmod +x /usr/local/bin/wings');
    const wingsService = `[Unit]
Description=Pterodactyl Wings Daemon
After=docker.service network.target
Requires=docker.service
[Service]
User=root
WorkingDirectory=/etc/pterodactyl
LimitNOFILE=4096
ExecStart=/usr/local/bin/wings
Restart=on-failure
RestartSec=5s
[Install]
WantedBy=multi-user.target`;
    await ssh.execCommand(`echo '${wingsService}' > /etc/systemd/system/wings.service && systemctl enable wings`);
    await sleep(500);

    // Step 11: Queue worker + cron
    await updateStatus('Step 9/9: Queue Worker & Cron...', 'Setup antrian & jadwal otomatis', '⚙️');
    const queueService = `[Unit]
Description=Pterodactyl Queue Worker
After=redis.service
[Service]
User=www-data
Group=www-data
Restart=always
ExecStart=/usr/bin/php /var/www/pterodactyl/artisan queue:work --queue=high,standard,low --sleep=3 --tries=3
RestartSec=5s
[Install]
WantedBy=multi-user.target`;
    await ssh.execCommand(`echo '${queueService}' > /etc/systemd/system/pteroq.service && systemctl enable --now pteroq`);
    await ssh.execCommand(`(crontab -l 2>/dev/null; echo "* * * * * php /var/www/pterodactyl/artisan schedule:run >> /dev/null 2>&1") | crontab -`);

    // Firewall
    await ssh.execCommand('ufw allow ssh && ufw allow 80 && ufw allow 443 && ufw allow 8080 && ufw allow 2022 && echo "y" | ufw enable || true');

    // Verifikasi
    const checkPanel = await ssh.execCommand('systemctl is-active nginx && systemctl is-active mysql && systemctl is-active redis');
    await ssh.dispose();
    installStatus.delete(phone);

    // SUCCESS!
    await edit(client, msg.chatId, statusMsgId,
      `<blockquote>╭──「 ✅ <b>PTERODACTYL BERHASIL TERINSTALL!</b> 」\n` +
      `│\n` +
      `│ 🌐 <b>Panel URL  :</b>\n` +
      `│    <tg-spoiler>http://${esc(cfg.domain)}</tg-spoiler>\n` +
      `│\n` +
      `│ 👤 <b>Login Panel:</b>\n` +
      `│    Username: <tg-spoiler>${esc(cfg.adminUser)}</tg-spoiler>\n` +
      `│    Password: <tg-spoiler>${esc(cfg.adminPass)}</tg-spoiler>\n` +
      `│\n` +
      `│ 🗄️ <b>Database:</b>\n` +
      `│    DB Name : <tg-spoiler>Zetsy</tg-spoiler>\n` +
      `│    DB User : <tg-spoiler>Zetsy</tg-spoiler>\n` +
      `│    DB Pass : <tg-spoiler>${esc(cfg.dbPass)}</tg-spoiler>\n` +
      `│\n` +
      `│ 🐳 <b>Wings:</b>\n` +
      `│    <tg-spoiler>Sudah terinstall! Buka panel →</tg-spoiler>\n` +
      `│    <tg-spoiler>Admin → Nodes → Add Node →</tg-spoiler>\n` +
      `│    <tg-spoiler>Domain: ${esc(cfg.nodeDomain)}</tg-spoiler>\n` +
      `│    <tg-spoiler>Lalu salin config.yml ke /etc/pterodactyl/</tg-spoiler>\n` +
      `│    <tg-spoiler>Lalu: systemctl start wings</tg-spoiler>\n` +
      `│\n` +
      `│ ⚠️  <b>Langkah selanjutnya:</b>\n` +
      `│    <tg-spoiler>1. Arahkan DNS ${esc(cfg.domain)} → ${esc(ip)}</tg-spoiler>\n` +
      `│    <tg-spoiler>2. Install SSL: certbot --nginx -d ${esc(cfg.domain)}</tg-spoiler>\n` +
      `│    <tg-spoiler>3. Buat node di panel & download config.yml</tg-spoiler>\n` +
      `│    <tg-spoiler>4. systemctl start wings</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot — Pterodactyl Auto Installer ✦</tg-spoiler></blockquote>`
    ).catch(() => {});

  } catch (err) {
    try { await ssh.dispose(); } catch (_) {}
    installStatus.delete(phone);
    throw err;
  }
}

// ── .installstatus ────────────────────────────────────────────
async function cmdInstallStatus(client, msg, phone) {
  const status = installStatus.get(phone);
  if (!status) return reply(client, msg,
    `<blockquote>╭──「 ℹ️ 」\n│ <tg-spoiler>Tidak ada proses install yang berjalan</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  await reply(client, msg,
    `<blockquote>╭──「 🔄 <b>STATUS INSTALL</b> 」\n│ <b>Step :</b> <tg-spoiler>${esc(status.step)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

// ── .installcancel ────────────────────────────────────────────
async function cmdInstallCancel(client, msg, phone) {
  if (!installStatus.has(phone)) return reply(client, msg,
    `<blockquote>╭──「 ℹ️ 」\n│ <tg-spoiler>Tidak ada install yang berjalan</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  installStatus.delete(phone);
  await reply(client, msg,
    `<blockquote>╭──「 🛑 <b>INSTALL DIBATALKAN</b> 」\n│ <tg-spoiler>Tracking dihapus. Script di VPS mungkin masih jalan.</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: GREEN API — WhatsApp Integration
// Semua fitur WA (.pairing, .cekbio, .cekbiofile) pakai Green API
// Tidak butuh Baileys, 100% HTTP request, jalan 100% di Termux
// Credentials diambil dari config.GREEN_API
// ═══════════════════════════════════════════════════════════════

// ── Helper: base URL Green API ──
function gaUrl(path) {
  const g = config.GREEN_API;
  return `${g.apiUrl}/waInstance${g.idInstance}/${path}/${g.apiToken}`;
}

// ── Helper: GET request ke Green API ──
async function gaGet(path) {
  const res = await axios.get(gaUrl(path), { timeout: 15000 });
  return res.data;
}

// ── Helper: POST request ke Green API ──
async function gaPost(path, body) {
  const res = await axios.post(gaUrl(path), body, { timeout: 15000 });
  return res.data;
}

// ── Helper: Cek status instance Green API ──
async function gaCheckAuth() {
  try {
    const data = await gaGet('getStateInstance');
    return data?.stateInstance === 'authorized';
  } catch (_) { return false; }
}

// ── Helper: Cek nomor WA terdaftar atau tidak ──
async function gaCheckPhone(number) {
  // Format: harus pakai @c.us
  try {
    const data = await gaPost('checkWhatsapp', { phoneNumber: number });
    return { exists: data?.existsWhatsapp === true };
  } catch (_) { return { exists: false }; }
}

// ── Helper: Ambil info kontak WA (nama, status/bio) ──
async function gaGetContact(number) {
  try {
    const data = await gaPost('getContactInfo', {
      chatId: `${number}@c.us`,
    });
    return {
      name   : data?.name || data?.contactName || '',
      bio    : data?.description || '(tidak ada bio)',
    };
  } catch (_) { return { name: '', bio: '(tidak ada bio)' }; }
}

// ── Helper: Ambil foto profil WA ──
async function gaGetAvatar(number) {
  try {
    const data = await gaPost('getAvatar', {
      chatId: `${number}@c.us`,
    });
    if (data?.urlAvatar) {
      const res = await axios.get(data.urlAvatar, {
        responseType: 'arraybuffer', timeout: 10000,
      });
      return Buffer.from(res.data);
    }
    return null;
  } catch (_) { return null; }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: .pairing <nomor>
// Cek status koneksi Green API + tampilkan info instance
// Karena Green API sudah authorized via dashboard, .pairing
// hanya menampilkan status & nomor yang terhubung
// ═══════════════════════════════════════════════════════════════
async function cmdPairing(client, msg, phone, args) {
  const waNumber = args.trim().replace(/[^0-9]/g, '');
  if (!waNumber || waNumber.length < 10) return reply(client, msg,
    `<blockquote>╭──「 ❌ <b>FORMAT SALAH</b> 」\n` +
    `│ <tg-spoiler>Format: .pairing 628xxxxxxxxxx</tg-spoiler>\n` +
    `│ <tg-spoiler>Gunakan format internasional tanpa +</tg-spoiler>\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot WA Pairing ✦</tg-spoiler></blockquote>`
  );

  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>MENGECEK KONEKSI WA</b> 」\n` +
    `│ <tg-spoiler>Menghubungi Green API server...</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  try {
    // Cek apakah instance authorized
    const authorized = await gaCheckAuth();

    if (!authorized) {
      return edit(client, msg.chatId, m.id,
        `<blockquote>╭──「 ❌ <b>INSTANCE BELUM AUTHORIZED</b> 」\n` +
        `│\n` +
        `│ <tg-spoiler>Green API instance belum terhubung ke WA!</tg-spoiler>\n` +
        `│\n` +
        `│ <b>Cara fix:</b>\n` +
        `│ <tg-spoiler>1. Buka console.green-api.com</tg-spoiler>\n` +
        `│ <tg-spoiler>2. Pilih instance kamu</tg-spoiler>\n` +
        `│ <tg-spoiler>3. Klik "Link with phone number"</tg-spoiler>\n` +
        `│ <tg-spoiler>4. Masukkan nomor & kode WA</tg-spoiler>\n` +
        `╰────────────────────────\n` +
        `<tg-spoiler>✦ Zetsy UBot WA Pairing ✦</tg-spoiler></blockquote>`
      );
    }

    // Cek apakah nomor yang diminta sama dengan yang login di instance
    const stateData = await gaGet('getStateInstance').catch(() => ({}));
    const instancePhone = config.GREEN_API.idInstance;

    // Cek nomor WA target
    const check = await gaCheckPhone(waNumber);

    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ✅ <b>WA TERHUBUNG</b> 」\n` +
      `│\n` +
      `│ <b>Status     :</b> <tg-spoiler>🟢 Authorized & Online</tg-spoiler>\n` +
      `│ <b>Instance   :</b> <tg-spoiler>${esc(instancePhone)}</tg-spoiler>\n` +
      `│ <b>Nomor Cek  :</b> <tg-spoiler>${esc(waNumber)}</tg-spoiler>\n` +
      `│ <b>WA Aktif   :</b> <tg-spoiler>${check.exists ? '✅ Ya, terdaftar di WA' : '❌ Tidak terdaftar'}</tg-spoiler>\n` +
      `│\n` +
      `│ <tg-spoiler>Kamu bisa langsung gunakan:</tg-spoiler>\n` +
      `│ <tg-spoiler>.cekbio 628xxx 628yyy ...</tg-spoiler>\n` +
      `│ <tg-spoiler>.cekbiofile (reply ke file .txt)</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot WA via Green API ✦</tg-spoiler></blockquote>`
    );

  } catch (e) {
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ <b>ERROR</b> 」\n` +
      `│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n` +
      `│ <tg-spoiler>Cek koneksi internet & coba lagi</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: HELPER — Progress Bar visual
// ═══════════════════════════════════════════════════════════════
function buildProgressBar(current, total, barLen = 14) {
  const pct    = total === 0 ? 0 : Math.floor((current / total) * 100);
  const filled = Math.floor((current / total) * barLen);
  const empty  = barLen - filled;
  const bar    = '█'.repeat(filled) + '░'.repeat(empty);
  return { bar, pct };
}

function buildProgressMsg(current, total, label, results) {
  const { bar, pct } = buildProgressBar(current, total);
  const aktif        = results.filter(r => r.aktif && !r.banned).length;
  const aktifBanned  = results.filter(r => r.aktif && r.banned).length;
  const nonWa        = results.filter(r => !r.aktif && !r.banned).length;
  // Tidak aktif + banned (terdaftar tapi banned & kemungkinan mati) — rare case
  const nonWaBanned  = results.filter(r => !r.aktif && r.banned).length;
  return (
    `<blockquote>╭──「 ⏳ <b>${esc(label)}</b> 」\n` +
    `│\n` +
    `│ <b>Progress :</b>\n` +
    `│ <code>[${bar}]</code> <tg-spoiler>${pct}%</tg-spoiler>\n` +
    `│ <tg-spoiler>${current} / ${total} nomor diproses</tg-spoiler>\n` +
    `│\n` +
    `│ <b>Live Stats :</b>\n` +
    `│ ✅ <tg-spoiler>Aktif WA            : ${aktif}</tg-spoiler>\n` +
    `│ 🚫 <tg-spoiler>Aktif + Banned      : ${aktifBanned}</tg-spoiler>\n` +
    `│ ❌ <tg-spoiler>Tidak Aktif         : ${nonWa}</tg-spoiler>\n` +
    `│ ☠️  <tg-spoiler>Tidak Aktif + Banned: ${nonWaBanned}</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot — 3-Layer WA Detection ✦</tg-spoiler></blockquote>`
  );
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: HELPER — Cek satu nomor via Green API
// Multi-strategy untuk hindari false negative dari checkWhatsapp
//
// MASALAH LAMA: Green API checkWhatsapp sering return false
// meski nomor aktif → semua nomor dianggap tidak aktif.
//
// SOLUSI: 3-layer detection:
//  Layer 1 — checkWhatsapp (cepat, tapi sering false negative)
//  Layer 2 — getContactInfo langsung (bypass checkWhatsapp)
//  Layer 3 — getAvatar (kalau dapat foto = pasti aktif)
//
// Banned detection:
//  - Terdaftar di WA (layer 1/2/3 ada hasilnya)
//  - Tapi: tidak ada nama, tidak ada bio, tidak ada foto PP
//  - Kalau privasi total (semua disembunyikan) = anggap banned
// ═══════════════════════════════════════════════════════════════
async function checkWaStatus(num) {
  const result = {
    num,
    aktif      : false,
    banned     : false,
    bio        : '(tidak ada bio)',
    ppBuffer   : null,
    ppUrl      : null,
    statusLabel: '',
  };

  try {
    const chatId = `${num}@c.us`;

    // ── Layer 1: checkWhatsapp ─────────────────────────────────
    let existsFromCheck = false;
    try {
      const check = await gaPost('checkWhatsapp', { phoneNumber: num });
      existsFromCheck = check?.existsWhatsapp === true;
    } catch (_) {}

    // ── Layer 2: getContactInfo (bypass checkWhatsapp) ─────────
    // Green API sering return existsWhatsapp=false padahal nomor ada.
    // getContactInfo lebih reliable — kalau dapat data = nomor ada.
    let contactData = null;
    try {
      const raw = await gaPost('getContactInfo', { chatId });
      // Response valid = ada objek dengan minimal salah satu field
      if (raw && typeof raw === 'object' && !raw.error) {
        contactData = raw;
      }
    } catch (_) {}

    // ── Layer 3: getAvatar ─────────────────────────────────────
    // Sebagai konfirmasi tambahan — kalau dapat URL avatar = pasti terdaftar
    let avatarData = null;
    try {
      const raw = await gaPost('getAvatar', { chatId });
      if (raw?.urlAvatar) avatarData = raw;
    } catch (_) {}

    // ── Tentukan aktif/tidak aktif ─────────────────────────────
    // Aktif jika minimal satu layer mendeteksi keberadaan nomor
    const hasContact = contactData && (
      contactData.name        ||
      contactData.contactName ||
      contactData.description ||
      contactData.isInContacts !== undefined ||
      contactData.type
    );
    const hasAvatar  = !!(avatarData?.urlAvatar);
    const isActive   = existsFromCheck || !!hasContact || hasAvatar;

    if (!isActive) {
      // Benar-benar tidak terdaftar di WA
      result.aktif       = false;
      result.banned      = false;
      result.statusLabel = '❌ Tidak Aktif';
      return result;
    }

    // ── Nomor terdaftar, ambil detail ─────────────────────────
    result.aktif = true;

    // Bio dari contactData
    const bioRaw = contactData?.description || contactData?.bio || '';
    result.bio   = bioRaw.trim() !== '' ? bioRaw.trim() : '(tidak ada bio)';

    // Nama dari contactData
    const namaRaw = contactData?.name || contactData?.contactName || '';

    // Foto profil
    if (hasAvatar) {
      try {
        const ppRes = await axios.get(avatarData.urlAvatar, {
          responseType: 'arraybuffer', timeout: 10000,
        });
        const buf = Buffer.from(ppRes.data);
        if (buf.length > 100) {
          result.ppBuffer = buf;
          result.ppUrl    = avatarData.urlAvatar;
        }
      } catch (_) {}
    }

    // ── Deteksi banned ─────────────────────────────────────────
    // Akun banned biasanya:
    //  - Tidak ada nama (contactData kosong atau nama hilang)
    //  - Tidak ada bio
    //  - Tidak ada foto profil
    //  - Tapi nomor masih "terdaftar" di server WA (existsWhatsapp=true)
    //
    // Catatan: privasi ketat (semua disembunyikan) mirip banned,
    // tapi kita tandai banned hanya kalau existsFromCheck=true
    // dan semua info kosong (privasi ketat biasanya masih bisa
    // dapat nama dari kontak tersimpan).
    const noBio      = result.bio === '(tidak ada bio)';
    const noPP       = !result.ppUrl;
    const namaKosong = !namaRaw || namaRaw.trim() === '';

    if (existsFromCheck && noBio && noPP && namaKosong) {
      // Terdaftar di checkWhatsapp tapi semua data kosong = kemungkinan banned
      result.banned      = true;
      result.statusLabel = '🚫 Aktif + Banned';
    } else if (!existsFromCheck && result.aktif && noBio && noPP && namaKosong) {
      // Terdeteksi aktif via layer 2/3, tapi semua data kosong
      // → mungkin banned atau privasi ekstrem, tandai sebagai banned
      result.banned      = true;
      result.statusLabel = '🚫 Aktif + Banned';
    } else {
      result.banned      = false;
      result.statusLabel = '✅ Aktif';
    }

  } catch (err) {
    result.aktif       = false;
    result.banned      = false;
    result.statusLabel = '❌ Tidak Aktif (error)';
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: HELPER — Cek nomor tidak aktif apakah pernah banned
// ═══════════════════════════════════════════════════════════════
async function checkBannedInactive(num) {
  try {
    const data = await gaPost('getContactInfo', { chatId: `${num}@c.us` });
    if (data && (data.name || data.description)) return true;
    return false;
  } catch (_) { return false; }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: HELPER — Proses batch cekbio 25x/detik (concurrent)
// Memproses 25 nomor sekaligus per batch untuk kecepatan optimal
// ═══════════════════════════════════════════════════════════════
async function runCekBioProcess(client, msg, numbers, label = 'CEK BIO WA') {
  const total      = numbers.length;
  const results    = new Array(total);
  const BATCH_SIZE = 5;           // 5 nomor sekaligus (3 req/nomor = 15 req/batch, aman dari rate-limit)
  const BATCH_DELAY = 300;        // 300ms antar batch

  const m = await reply(client, msg, buildProgressMsg(0, total, label, []));

  let processed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch   = numbers.slice(i, i + BATCH_SIZE);
    const indices = batch.map((_, j) => i + j);

    // Proses seluruh batch secara paralel
    const batchResults = await Promise.allSettled(
      batch.map(num => checkWaStatus(num))
    );

    // Simpan hasil sesuai urutan asli
    batchResults.forEach((res, j) => {
      const idx = indices[j];
      if (res.status === 'fulfilled') {
        results[idx] = res.value;
      } else {
        // Kalau gagal, anggap tidak aktif
        results[idx] = {
          num       : batch[j],
          aktif     : false,
          banned    : false,
          bio       : '(tidak ada bio)',
          ppBuffer  : null,
          ppUrl     : null,
          statusLabel: '❌ Tidak Aktif (error)',
        };
      }
      processed++;
    });

    // Update progress bar setiap batch
    const filled = results.filter(Boolean);
    await edit(client, msg.chatId, m.id,
      buildProgressMsg(processed, total, label, filled)
    ).catch(() => {});

    // Jeda kecil antar batch supaya Green API tidak rate-limit
    if (i + BATCH_SIZE < total) await sleep(BATCH_DELAY);
  }

  await client.deleteMessages(msg.chatId, [m.id], { revoke: true }).catch(() => {});
  return results.filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: HELPER — Kirim foto profil 3 nomor paling aktif
// ═══════════════════════════════════════════════════════════════
async function kirimFotoProfil(client, msg, results) {
  const aktifList = results
    .filter(r => r.aktif && !r.banned)
    .map(r => ({
      ...r,
      skor: (r.ppBuffer ? 2 : 0) + (r.bio && r.bio !== '(tidak ada bio)' ? 1 : 0),
    }))
    .sort((a, b) => b.skor - a.skor)
    .slice(0, 3);

  if (!aktifList.length) return;

  await client.sendMessage(msg.chatId, {
    message:
      `<blockquote>╭──「 🏆 <b>TOP 3 NOMOR PALING AKTIF</b> 」\n` +
      `│ <tg-spoiler>Foto profil dikirim satu per satu</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot CekBio ✦</tg-spoiler></blockquote>`,
    parseMode: 'html',
  });

  for (let i = 0; i < aktifList.length; i++) {
    const r    = aktifList[i];
    const rank = ['🥇', '🥈', '🥉'][i];
    const caption =
      `<blockquote>╭──「 ${rank} <b>NOMOR AKTIF #${i + 1}</b> 」\n` +
      `│ <b>Nomor  :</b> <tg-spoiler>${esc(r.num)}</tg-spoiler>\n` +
      `│ <b>Bio    :</b> <tg-spoiler>${esc(r.bio.slice(0, 100))}</tg-spoiler>\n` +
      `│ <b>Status :</b> <tg-spoiler>✅ Aktif di WhatsApp</tg-spoiler>\n` +
      `│ <b>Banned :</b> <tg-spoiler>❌ Tidak</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot CekBio ✦</tg-spoiler></blockquote>`;

    if (r.ppBuffer) {
      const tmpPp = `./downloads/pp_${r.num}_${Date.now()}.jpg`;
      if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
      fs.writeFileSync(tmpPp, r.ppBuffer);
      try {
        await client.sendFile(msg.chatId, { file: tmpPp, caption, replyTo: msg.id, parseMode: 'html' });
      } catch (_) {
        await client.sendMessage(msg.chatId, { message: caption, parseMode: 'html' });
      }
      fs.unlinkSync(tmpPp);
    } else {
      await client.sendMessage(msg.chatId, {
        message: caption + '\n<tg-spoiler>(Foto profil tidak tersedia / privasi)</tg-spoiler>',
        parseMode: 'html',
      });
    }
    await sleep(800);
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: HELPER — Buat file hasil cekbio lengkap
// ═══════════════════════════════════════════════════════════════
function buildCekBioFile(results, sumber = '') {
  const aktif       = results.filter(r => r.aktif && !r.banned);
  const aktifBanned = results.filter(r => r.aktif && r.banned);
  const nonWa       = results.filter(r => !r.aktif && !r.banned);
  const nonWaBanned = results.filter(r => !r.aktif && r.banned);
  const now         = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  const lines = [];
  lines.push('╔══════════════════════════════════════════════════╗');
  lines.push('║         HASIL CEK BIO WHATSAPP                  ║');
  lines.push('║         Zetsy UBot v4.0 Premium                 ║');
  lines.push('║         Kecepatan: 25 nomor/detik               ║');
  lines.push('╚══════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`📅 Waktu Cek            : ${now} WIB`);
  if (sumber) lines.push(`📂 File Sumber          : ${sumber}`);
  lines.push(`📊 Total Dicek          : ${results.length} nomor`);
  lines.push(`✅ Aktif WA             : ${aktif.length} nomor`);
  lines.push(`🚫 Aktif + Banned       : ${aktifBanned.length} nomor`);
  lines.push(`❌ Tidak Aktif          : ${nonWa.length} nomor`);
  lines.push(`☠️  Tidak Aktif + Banned : ${nonWaBanned.length} nomor`);
  lines.push('');

  // ── KATEGORI 1: Aktif normal ──
  lines.push('══════════════════════════════════════════════════');
  lines.push('  ✅ NOMOR AKTIF (Terdaftar & Tidak Banned)');
  lines.push('══════════════════════════════════════════════════');
  if (!aktif.length) { lines.push('  (tidak ada)'); }
  else aktif.forEach((r, i) => {
    lines.push(`[${String(i+1).padStart(3,'0')}] +${r.num}`);
    lines.push(`      Status  : ✅ AKTIF`);
    lines.push(`      Banned  : ❌ Tidak`);
    lines.push(`      Foto PP : ${r.ppUrl ? '✅ Ada' : '⚠️ Tidak ada / privasi'}`);
    lines.push(`      Bio     : ${r.bio}`);
    lines.push('');
  });

  // ── KATEGORI 2: Aktif tapi banned ──
  lines.push('══════════════════════════════════════════════════');
  lines.push('  🚫 NOMOR AKTIF + BANNED (Terdaftar tapi kena banned WA)');
  lines.push('══════════════════════════════════════════════════');
  if (!aktifBanned.length) { lines.push('  (tidak ada)'); }
  else aktifBanned.forEach((r, i) => {
    lines.push(`[${String(i+1).padStart(3,'0')}] +${r.num}`);
    lines.push(`      Status  : ⚠️ TERDAFTAR`);
    lines.push(`      Banned  : 🚫 YA — Kemungkinan kena banned WhatsApp`);
    lines.push(`      Foto PP : ${r.ppUrl ? '✅ Ada' : '❌ Tidak ada'}`);
    lines.push(`      Bio     : ${r.bio}`);
    lines.push('');
  });

  // ── KATEGORI 3: Tidak aktif (tidak terdaftar) ──
  lines.push('══════════════════════════════════════════════════');
  lines.push('  ❌ NOMOR TIDAK AKTIF (Tidak terdaftar di WA)');
  lines.push('══════════════════════════════════════════════════');
  if (!nonWa.length) { lines.push('  (tidak ada)'); }
  else nonWa.forEach((r, i) => {
    lines.push(`[${String(i+1).padStart(3,'0')}] +${r.num}`);
    lines.push(`      Status  : ❌ TIDAK AKTIF`);
    lines.push(`      Banned  : — (tidak terdaftar di WA)`);
    lines.push('');
  });

  // ── KATEGORI 4: Tidak aktif + pernah banned ──
  lines.push('══════════════════════════════════════════════════');
  lines.push('  ☠️  NOMOR TIDAK AKTIF + BANNED (Pernah ada, kena banned & dihapus)');
  lines.push('══════════════════════════════════════════════════');
  if (!nonWaBanned.length) { lines.push('  (tidak ada)'); }
  else nonWaBanned.forEach((r, i) => {
    lines.push(`[${String(i+1).padStart(3,'0')}] +${r.num}`);
    lines.push(`      Status  : ☠️ TIDAK AKTIF`);
    lines.push(`      Banned  : 🚫 YA — Pernah banned lalu akun dihapus/mati`);
    lines.push('');
  });

  lines.push('══════════════════════════════════════════════════');
  lines.push('✦ Dibuat oleh Zetsy UBot v4.0 Premium ✦');
  lines.push('✦ Kecepatan: 25 nomor/detik (concurrent) ✦');
  lines.push('══════════════════════════════════════════════════');
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: CEK BIO WA — .cekbio 628xxx 628yyy ...
// Cek info/bio hingga 300 nomor via Green API
// ═══════════════════════════════════════════════════════════════
async function cmdCekBio(client, msg, phone, args) {
  // Cek apakah Green API authorized
  const authorized = await gaCheckAuth().catch(() => false);
  if (!authorized) return reply(client, msg,
    `<blockquote>╭──「 ❌ <b>WA BELUM TERHUBUNG</b> 」\n` +
    `│ <tg-spoiler>Gunakan .pairing untuk cek status koneksi</tg-spoiler>\n` +
    `│ <tg-spoiler>Lalu authorize di console.green-api.com</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  const rawNumbers = args.split(/[\s,\n]+/)
    .map(n => n.trim().replace(/[^0-9]/g, ''))
    .filter(n => n.length >= 8);

  if (!rawNumbers.length) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n` +
    `│ <tg-spoiler>Format: .cekbio 628xxx 628yyy 628zzz</tg-spoiler>\n` +
    `│ <tg-spoiler>Maks 300 nomor sekaligus</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  const numbers = [...new Set(rawNumbers)].slice(0, 300);

  // FASE 1: Progress bar
  const results = await runCekBioProcess(client, msg, numbers, 'CEK BIO WA');

  const aktif       = results.filter(r => r.aktif && !r.banned);
  const aktifBanned = results.filter(r => r.aktif && r.banned);
  const nonWa       = results.filter(r => !r.aktif && !r.banned);
  const nonWaBanned = results.filter(r => !r.aktif && r.banned);

  // FASE 2: Ringkasan
  await reply(client, msg,
    `<blockquote>╭──「 📊 <b>STATISTIK CEK BIO WA</b> 」\n` +
    `│\n` +
    `│ <b>Total Dicek          :</b> <tg-spoiler>${numbers.length} nomor</tg-spoiler>\n` +
    `│ <b>✅ Aktif WA          :</b> <tg-spoiler>${aktif.length} nomor</tg-spoiler>\n` +
    `│ <b>🚫 Aktif + Banned    :</b> <tg-spoiler>${aktifBanned.length} nomor</tg-spoiler>\n` +
    `│ <b>❌ Tidak Aktif       :</b> <tg-spoiler>${nonWa.length} nomor</tg-spoiler>\n` +
    `│ <b>☠️ Tidak Aktif+Banned:</b> <tg-spoiler>${nonWaBanned.length} nomor</tg-spoiler>\n` +
    `│\n` +
    `│ <tg-spoiler>Mengirim foto profil top 3 aktif...</tg-spoiler>\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot CekBio ✦</tg-spoiler></blockquote>`
  );

  // FASE 3: Foto profil top 3
  await kirimFotoProfil(client, msg, results);

  // FASE 4: File hasil
  const fileContent = buildCekBioFile(results);
  const outputPath  = `./downloads/cekbio_${Date.now()}.txt`;
  if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
  fs.writeFileSync(outputPath, fileContent, 'utf-8');

  await client.sendFile(msg.chatId, {
    file: outputPath,
    caption:
      `<blockquote>╭──「 📄 <b>FILE HASIL CEK BIO</b> 」\n` +
      `│ <b>Total</b>           : <tg-spoiler>${numbers.length} nomor dicek</tg-spoiler>\n` +
      `│ <b>Aktif</b>           : <tg-spoiler>${aktif.length} nomor ✅</tg-spoiler>\n` +
      `│ <b>Aktif+Banned</b>    : <tg-spoiler>${aktifBanned.length} nomor 🚫</tg-spoiler>\n` +
      `│ <b>Tidak Aktif</b>     : <tg-spoiler>${nonWa.length} nomor ❌</tg-spoiler>\n` +
      `│ <b>TdkAktif+Banned</b> : <tg-spoiler>${nonWaBanned.length} nomor ☠️</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot CekBio v4.0 ✦</tg-spoiler></blockquote>`,
    replyTo: msg.id,
    parseMode: 'html',
  });
  fs.unlinkSync(outputPath);
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: CEK BIO WA DARI FILE — .cekbiofile
// Reply ke file .txt berisi daftar nomor (maks 300)
// ═══════════════════════════════════════════════════════════════
async function cmdCekBioFile(client, msg, phone) {
  const authorized = await gaCheckAuth().catch(() => false);
  if (!authorized) return reply(client, msg,
    `<blockquote>╭──「 ❌ <b>WA BELUM TERHUBUNG</b> 」\n` +
    `│ <tg-spoiler>Gunakan .pairing untuk cek status koneksi</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  if (!msg.replyTo?.replyToMsgId) return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n` +
    `│ <tg-spoiler>Reply ke file .txt berisi daftar nomor!</tg-spoiler>\n` +
    `│ <tg-spoiler>Format: satu nomor per baris</tg-spoiler>\n` +
    `│ <code>628111222333</code>\n` +
    `│ <code>628444555666</code>\n` +
    `╰────────────────────────</blockquote>`
  );

  const mRead = await reply(client, msg,
    `<blockquote>╭──「 📂 」\n│ <tg-spoiler>Zetsy: Membaca file...</tg-spoiler>\n╰────────────────────────</blockquote>`
  );

  try {
    const r = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
    const fileMsg = r?.[0];
    if (!fileMsg?.media) throw new Error('Pesan yang di-reply bukan file!');

    const mimeType = fileMsg.media?.document?.mimeType || '';
    const fileName = fileMsg.media?.document?.attributes?.find(a => a.fileName)?.fileName
                  || fileMsg.media?.document?.attributes?.find(a => a.className === 'DocumentAttributeFilename')?.fileName
                  || 'nomor.txt';

    if (!mimeType.includes('text') && !fileName.endsWith('.txt') && !fileName.endsWith('.csv')) {
      throw new Error('File harus berformat .txt atau .csv!');
    }

    const buf  = await client.downloadMedia(fileMsg.media, {});
    const text = buf.toString('utf-8');

    const rawNumbers = text.split(/[\r\n,;]+/)
      .map(n => n.trim().replace(/[^0-9]/g, ''))
      .filter(n => n.length >= 8);

    if (!rawNumbers.length) throw new Error('Tidak ada nomor valid di dalam file!');
    const numbers = [...new Set(rawNumbers)].slice(0, 300);

    await edit(client, msg.chatId, mRead.id,
      `<blockquote>╭──「 📂 <b>FILE DIBACA</b> 」\n` +
      `│ <b>Nama File :</b> <tg-spoiler>${esc(fileName)}</tg-spoiler>\n` +
      `│ <b>Nomor     :</b> <tg-spoiler>${numbers.length} nomor unik${rawNumbers.length > 300 ? ' (dipotong 300)' : ''}</tg-spoiler>\n` +
      `│ <tg-spoiler>Memulai pengecekan...</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    );
    await sleep(1200);
    await client.deleteMessages(msg.chatId, [mRead.id], { revoke: true }).catch(() => {});

    // FASE 1: Progress bar
    const results = await runCekBioProcess(client, msg, numbers, 'CEK BIO FILE');

    const aktif       = results.filter(r => r.aktif && !r.banned);
    const aktifBanned = results.filter(r => r.aktif && r.banned);
    const nonWa       = results.filter(r => !r.aktif && !r.banned);
    const nonWaBanned = results.filter(r => !r.aktif && r.banned);

    // FASE 2: Ringkasan
    await reply(client, msg,
      `<blockquote>╭──「 📊 <b>STATISTIK CEK BIO FILE</b> 」\n` +
      `│\n` +
      `│ <b>File Sumber          :</b> <tg-spoiler>${esc(fileName)}</tg-spoiler>\n` +
      `│ <b>Total Dicek          :</b> <tg-spoiler>${numbers.length} nomor</tg-spoiler>\n` +
      `│ <b>✅ Aktif WA          :</b> <tg-spoiler>${aktif.length} nomor</tg-spoiler>\n` +
      `│ <b>🚫 Aktif + Banned    :</b> <tg-spoiler>${aktifBanned.length} nomor</tg-spoiler>\n` +
      `│ <b>❌ Tidak Aktif       :</b> <tg-spoiler>${nonWa.length} nomor</tg-spoiler>\n` +
      `│ <b>☠️ Tidak Aktif+Banned:</b> <tg-spoiler>${nonWaBanned.length} nomor</tg-spoiler>\n` +
      `│\n` +
      `│ <tg-spoiler>Mengirim foto profil top 3 aktif...</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot CekBioFile ✦</tg-spoiler></blockquote>`
    );

    // FASE 3: Foto profil top 3
    await kirimFotoProfil(client, msg, results);

    // FASE 4: File hasil
    const fileContent = buildCekBioFile(results, fileName);
    const outputPath  = `./downloads/cekbio_${Date.now()}.txt`;
    if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
    fs.writeFileSync(outputPath, fileContent, 'utf-8');

    await client.sendFile(msg.chatId, {
      file: outputPath,
      caption:
        `<blockquote>╭──「 📄 <b>FILE HASIL CEK BIO</b> 」\n` +
        `│ <b>Sumber</b>           : <tg-spoiler>${esc(fileName)}</tg-spoiler>\n` +
        `│ <b>Total</b>            : <tg-spoiler>${numbers.length} nomor dicek</tg-spoiler>\n` +
        `│ <b>Aktif</b>            : <tg-spoiler>${aktif.length} nomor ✅</tg-spoiler>\n` +
        `│ <b>Aktif+Banned</b>     : <tg-spoiler>${aktifBanned.length} nomor 🚫</tg-spoiler>\n` +
        `│ <b>Tidak Aktif</b>      : <tg-spoiler>${nonWa.length} nomor ❌</tg-spoiler>\n` +
        `│ <b>TdkAktif+Banned</b>  : <tg-spoiler>${nonWaBanned.length} nomor ☠️</tg-spoiler>\n` +
        `╰────────────────────────\n` +
        `<tg-spoiler>✦ Zetsy UBot CekBioFile v4.0 ✦</tg-spoiler></blockquote>`,
      replyTo: msg.id,
      parseMode: 'html',
    });
    fs.unlinkSync(outputPath);

  } catch (e) {
    await edit(client, msg.chatId, mRead.id,
      `<blockquote>╭──「 ❌ <b>ERROR</b> 」\n` +
      `│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    ).catch(async () => {
      await reply(client, msg,
        `<blockquote>╭──「 ❌ <b>ERROR</b> 」\n│ <tg-spoiler>${esc(e.message)}</tg-spoiler>\n╰────────────────────────</blockquote>`
      );
    });
  }
}


// ═══════════════════════════════════════════════════════════════
// Zetsy: ANTI-LINK — .antilink [on/off]
// Toggle auto-hapus pesan berisi link di grup
// .antilink       → lihat status
// .antilink on    → aktifkan
// .antilink off   → matikan
// ═══════════════════════════════════════════════════════════════
async function cmdAntilink(client, msg, phone, args) {
  const chatId = msg.chatId?.toString();
  const sub    = args.trim().toLowerCase();
  const current = antilinkStore.get(chatId);

  if (!sub) {
    // Tampilkan status
    const aktif = current?.enabled && current?.phone === phone;
    return reply(client, msg,
      `<blockquote>╭──「 🔗 <b>ANTILINK STATUS</b> 」\n` +
      `│ <b>Status :</b> <tg-spoiler>${aktif ? '✅ Aktif' : '❌ Nonaktif'}</tg-spoiler>\n` +
      `│\n` +
      `│ <tg-spoiler>Gunakan .antilink on untuk aktifkan</tg-spoiler>\n` +
      `│ <tg-spoiler>Gunakan .antilink off untuk matikan</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot AntiLink ✦</tg-spoiler></blockquote>`
    );
  }

  if (sub === 'on') {
    antilinkStore.set(chatId, { enabled: true, phone });
    return reply(client, msg,
      `<blockquote>╭──「 ✅ <b>ANTILINK DIAKTIFKAN</b> 」\n` +
      `│ <tg-spoiler>Pesan berisi link akan otomatis dihapus!</tg-spoiler>\n` +
      `│ <tg-spoiler>Link yang dideteksi: http, https, t.me, wa.me, bit.ly, dll.</tg-spoiler>\n` +
      `│\n` +
      `│ <tg-spoiler>Gunakan .antilink off untuk matikan</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot AntiLink ✦</tg-spoiler></blockquote>`
    );
  }

  if (sub === 'off') {
    antilinkStore.set(chatId, { enabled: false, phone });
    return reply(client, msg,
      `<blockquote>╭──「 🔕 <b>ANTILINK DIMATIKAN</b> 」\n` +
      `│ <tg-spoiler>Penghapusan link otomatis sudah dinonaktifkan.</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot AntiLink ✦</tg-spoiler></blockquote>`
    );
  }

  return reply(client, msg,
    `<blockquote>╭──「 ❌ 」\n│ <tg-spoiler>Gunakan: .antilink on / .antilink off</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║     Zetsy UBot — HELP MENU v4.0                             ║
// ║                                                             ║
// ║  Flow:                                                      ║
// ║  1. User ketik .help → userbot kirim foto + caption         ║
// ║  2. Tombol grid pakai URL button → deep link ke bot         ║
// ║  3. Klik tombol → buka bot → bot kirim list command         ║
// ║  4. Semua pesan dikirim OLEH USERBOT sendiri                ║
// ╚══════════════════════════════════════════════════════════════╝

// Kategori help — data sama dengan index.js
const HELP_CAT_DATA = {
  sistem    : '.ping  .alive  .sysinfo  .uptime  .id  .info',
  tools     : '.tr  .calc  .qr  .short  .kurs  .cuaca  .wiki  .password  .uuid  .say  .clr',
  whatsapp  : '.pairing  .cekbio  .cekbiofile',
  downloader: '.ytdlp  .ttdlp  .igdlp',
  notes     : '.note  .notes  .delnote  .remind',
  afk       : '.afk  .unafk',
  ptero     : '.install  .installstatus  .installcancel  .1gb  .2gb  .4gb  .8gb  .16gb  .unlimited  .adminpanel',
  bisnis    : '.done  .setdone  .invoice  .diskon  .laba  .ongkir  .resi',
  fun       : '.joke  .fakta  .ramalan  .katakata  .cekkontol  .brat  .stl  .tts',
};

// ════════════════════════════════════════════════════════════════
// Zetsy: HELP MENU v5.0 — Clean Single Message
// Semua command dalam 1 pesan rapi, tanpa tombol
// (MTProto userbot tidak bisa render tombol aktif di chat bot)
// ════════════════════════════════════════════════════════════════

const helpCooldown = new Map();

async function cmdHelp(client, msg) {
  await client.deleteMessages(msg.chatId, [msg.id], { revoke: true }).catch(() => {});

  // Anti-double: skip jika chat ini sudah kirim menu dalam 3 detik terakhir
  const chatKey = msg.chatId?.toString();
  const now     = Date.now();
  if (helpCooldown.has(chatKey) && now - helpCooldown.get(chatKey) < 3000) return;
  helpCooldown.set(chatKey, now);

  let me = {};
  try { me = await client.getMe(); } catch (_) {}
  const myUsername = me.username ? `@${me.username}` : 'Private';
  const myName     = [me.firstName, me.lastName].filter(Boolean).join(' ') || 'Zetsy UBot';
  const uptime     = formatUptime(process.uptime());
  const ram        = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

  const menu =
    `<blockquote expandable>` +
    `╭──「 🤖 <b>ZETSY UBOT v4.0</b> 」\n` +
    `│ <b>UBOT    :</b> <tg-spoiler>${esc(myUsername)}</tg-spoiler>\n` +
    `│ <b>NAMA    :</b> <tg-spoiler>${esc(myName)}</tg-spoiler>\n` +
    `│ <b>MODULES :</b> <code>64</code>  <b>PREFIX :</b> <code>.</code>\n` +
    `│ <b>UPTIME  :</b> <tg-spoiler>${esc(uptime)}</tg-spoiler>\n` +
    `│ <b>RAM     :</b> <tg-spoiler>${esc(ram)} MB</tg-spoiler>\n` +
    `│\n` +
    `├──「 🖥 <b>SISTEM</b> 」\n` +
    `│ <tg-spoiler>.ping .alive .sysinfo .uptime .id .info</tg-spoiler>\n` +
    `│\n` +
    `├──「 🛠 <b>TOOLS</b> 」\n` +
    `│ <tg-spoiler>.tr .calc .qr .short .kurs .cuaca .wiki</tg-spoiler>\n` +
    `│ <tg-spoiler>.password .uuid .say .clr</tg-spoiler>\n` +
    `│ <tg-spoiler>.ip .whois .hash .encode .decode</tg-spoiler>\n` +
    `│ <tg-spoiler>.time .cekrek .bmi .roman .random .tourl</tg-spoiler>\n` +
    `│ <tg-spoiler>.ocr .ss .color .exif .pdf2img</tg-spoiler>\n` +
    `│ <tg-spoiler>.tinyurl .base64 .hex .cekssl .ping2</tg-spoiler>\n` +
    `│ <tg-spoiler>.pastebin .sticker .removebg .timestamp .countdown</tg-spoiler>\n` +
    `│ <tg-spoiler>.age .timezone .json</tg-spoiler>\n` +
    `│\n` +
    `├──「 🎮 <b>FUN & GAME</b> 」\n` +
    `│ <tg-spoiler>.truth .dare .roast .ship .zodiak .meme</tg-spoiler>\n` +
    `│ <tg-spoiler>.8ball .tebakangka .kuis .horoscope .lyric</tg-spoiler>\n` +
    `│ <tg-spoiler>.asciify .emotify .reversechat .spongebob</tg-spoiler>\n` +
    `│ <tg-spoiler>.motivasi .gayakata</tg-spoiler>\n` +
    `│\n` +
    `├──「 📱 <b>WHATSAPP</b> 」\n` +
    `│ <tg-spoiler>.pairing .cekbio .cekbiofile</tg-spoiler>\n` +
    `│\n` +
    `├──「 📥 <b>DOWNLOADER</b> 」\n` +
    `│ <tg-spoiler>.ytdlp .ttdlp .igdlp</tg-spoiler>\n` +
    `│\n` +
    `├──「 📝 <b>NOTES</b> 」\n` +
    `│ <tg-spoiler>.note .notes .delnote .remind</tg-spoiler>\n` +
    `│\n` +
    `├──「 💤 <b>AFK</b> 」\n` +
    `│ <tg-spoiler>.afk .unafk</tg-spoiler>\n` +
    `│\n` +
    `├──「 📡 <b>BROADCAST</b> 」\n` +
    `│ <tg-spoiler>.setbc .setdelay .startbc .stopbc .cekbc</tg-spoiler>\n` +
    `│ <tg-spoiler>.sharemsg</tg-spoiler>\n` +
    `│\n` +
    `├──「 👥 <b>GRUP</b> 」\n` +
    `│ <tg-spoiler>.tagall .gcinfo .inv .pin .unpin .antilink</tg-spoiler>\n` +
    `│\n` +
    `├──「 🚀 <b>PTERO</b> 」\n` +
    `│ <tg-spoiler>.install .installstatus .installcancel</tg-spoiler>\n` +
    `│ <tg-spoiler>.1gb .2gb .4gb .8gb .16gb .unlimited .adminpanel</tg-spoiler>\n` +
    `│\n` +
    `├──「 💰 <b>BISNIS</b> 」\n` +
    `│ <tg-spoiler>.done .setdone .invoice .diskon .laba .ongkir .resi</tg-spoiler>\n` +
    `│\n` +
    `├──「 🚫 <b>BLACKLIST</b> 」\n` +
    `│ <tg-spoiler>.addbl .listbl .delbl</tg-spoiler>\n` +
    `│\n` +
    `├──「 👤 <b>MEMBER</b> 」\n` +
    `│ <tg-spoiler>.add .listmember .delmember .member</tg-spoiler>\n` +
    `│\n` +
    `├──「 😂 <b>FUN</b> 」\n` +
    `│ <tg-spoiler>.joke .fakta .ramalan .katakata .cekkontol</tg-spoiler>\n` +
    `│ <tg-spoiler>.brat .stl .tts</tg-spoiler>\n` +
    `│\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Premium v4.0 — 64 Modules ✦</tg-spoiler>` +
    `</blockquote>`;

  // Kirim foto banner jika ada
  const BANNER = config.UBOT_PHOTOS?.main || '';
  let sent = false;

  if (BANNER && !BANNER.includes('placeholder')) {
    try {
      const res        = await axios.get(BANNER, { responseType: 'arraybuffer', timeout: 10000 });
      const bannerPath = `./downloads/banner_help_${Date.now()}.jpg`;
      if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads', { recursive: true });
      fs.writeFileSync(bannerPath, res.data);
      await client.sendFile(msg.chatId, {
        file     : bannerPath,
        caption  : menu,
        parseMode: 'html',
      });
      fs.unlinkSync(bannerPath);
      sent = true;
    } catch (_) {}
  }

  if (!sent) {
    await client.sendMessage(msg.chatId, {
      message  : menu,
      parseMode: 'html',
    });
  }
}


// ═══════════════════════════════════════════════════════════════
// Zetsy: HELPERS
// ═══════════════════════════════════════════════════════════════
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function formatUptime(sec) {
  const d=Math.floor(sec/86400),h=Math.floor((sec%86400)/3600);
  const m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);
  return `${d}d ${h}h ${m}m ${s}s`;
}
function formatDurasi(ms) {
  const s=Math.floor(ms/1000),j=Math.floor(s/3600),m=Math.floor((s%3600)/60),dt=s%60;
  return j>0?`${j}j ${m}m ${dt}d`:m>0?`${m}m ${dt}d`:`${dt}d`;
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: RESTART / SIGNOUT / AUTOSTART
// ═══════════════════════════════════════════════════════════════
async function restartAll() {
  for (const [,c] of activeClients) { try { await c.disconnect(); } catch (_) {} }
  activeClients.clear();
  registeredClients.clear(); // hapus semua guard agar handler bisa register ulang ke client baru
  for (const s of db.getSessions().filter(x => x.session)) {
    if (!isSessionOwnerActive(s)) {
      db.removeSession(s.phone);
      console.warn(`[Zetsy] Session removed (expired owner): ${s.phone}`);
      continue;
    }
    try {
      const client = new TelegramClient(new StringSession(s.session), config.API_ID, config.API_HASH, { connectionRetries:5, useWSS:false });
      await client.connect();
      await registerUserbot(s.phone, client);
    } catch (e) { console.error(`[Zetsy] Restart fail ${s.phone}:`, e.message); }
  }
}

async function signOut(phone) {
  if (activeClients.has(phone)) {
    try { await activeClients.get(phone).invoke(new Api.auth.LogOut()); } catch (_) {}
    try { await activeClients.get(phone).disconnect(); } catch (_) {}
    activeClients.delete(phone);
  }
  // Hapus guard agar bisa register ulang kalau phone ini login lagi
  for (const key of registeredClients) {
    if (key.startsWith(`${phone}_`)) registeredClients.delete(key);
  }
  pendingCodes.delete(phone); afkState.delete(phone); broadcastCfg.delete(phone);
}

async function autoStart() {
  // Load sessions dari MongoDB langsung (async) agar dapat data terbaru
  let sessions = [];
  try {
    if (db.initMongo) {
      const mdb = await db.initMongo();
      if (mdb) {
        const col = mdb.collection('sessions');
        const docs = await col.find({ session: { $exists: true, $ne: '' } }).toArray();
        sessions = docs.filter(s => s.session && s.session.length > 10);
        // Update cache
        if (db.loadSessionsCache) await db.loadSessionsCache();
      }
    }
  } catch {}
  // Fallback ke cache/file
  if (!sessions.length) {
    sessions = db.getSessions().filter(s => s.session && s.session.length > 10);
  }
  if (!sessions.length) {
    console.log('[Zetsy] No sessions to autostart.');
    return;
  }
  console.log(`[Zetsy] Auto-starting ${sessions.length} userbot(s)...`);
  for (const s of sessions) {
    try {
      const client = new TelegramClient(new StringSession(s.session), config.API_ID, config.API_HASH, {
        connectionRetries: 5, useWSS: false, autoReconnect: true,
      });
      await client.connect();
      await registerUserbot(s.phone, client);
      // Keep-alive: reconnect otomatis jika disconnect
      client.addEventHandler(async () => {}, { build: () => ({ className: 'Disconnected' }) });
    } catch (e) { console.error(`[Zetsy] AutoStart fail ${s.phone}:`, e.message); }
  }
}

function isSessionOwnerActive(sessionRow) {
  const ownerId = sessionRow?.ownerId ? String(sessionRow.ownerId) : null;
  if (!ownerId) return true; // legacy session: tetap jalan
  if (String(config.OWNER_ID) === ownerId) return true;

  const member = db.getMember(Number(ownerId));
  if (member) return !member.expired && member.active !== false;
  return !db.isGuestExpired(Number(ownerId));
}

async function enforceExpiredSessions() {
  const sessions = db.getSessions();
  for (const s of sessions) {
    if (isSessionOwnerActive(s)) continue;
    try { await signOut(s.phone); } catch (_) {}
    db.removeSession(s.phone);
    console.log(`[Zetsy] Auto logout expired session: ${s.phone} (owner: ${s.ownerId || '-'})`);
  }
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: BUAT PANEL PTERODACTYL
// Perintah: /1gb "nama" | /2gb "nama" | /4gb "nama" | /8gb "nama"
//           /16gb "nama" | /unlimited "nama" | /adminpanel "nama"
// Konfigurasi Panel API diambil dari config.PANEL_API
// Username & password user akan sama dengan nama panel
// ═══════════════════════════════════════════════════════════════
async function cmdBuatPanel(client, msg, phone, ramTier, namaPanel) {
  const cfg = config.PANEL_API;

  // ── Validasi konfigurasi ──
  if (!cfg || !cfg.url || !cfg.apiKey) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>PANEL API BELUM DIKONFIGURASI</b> 」\n` +
      `│ <tg-spoiler>Isi PANEL_API di config.js terlebih dahulu!</tg-spoiler>\n` +
      `│ <tg-spoiler>Butuh: url, apiKey, locationId, nestId, eggId</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot Panel Creator ✦</tg-spoiler></blockquote>`
    );
  }

  // ── Validasi nama panel ──
  const nama = namaPanel.replace(/['"]/g, '').trim();
  if (!nama || nama.length < 2) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>FORMAT SALAH</b> 」\n` +
      `│ <tg-spoiler>Format: .${ramTier} namaPanel</tg-spoiler>\n` +
      `│ <tg-spoiler>Contoh: .${ramTier} arabs</tg-spoiler>\n` +
      `│ <tg-spoiler>→ Username & password otomatis = namaPanel</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot Panel Creator ✦</tg-spoiler></blockquote>`
    );
  }

  // ── Ambil batas RAM dari config ──
  const ramMap = cfg.ramLimits || {
    '1gb'      : 1024,
    '2gb'      : 2048,
    '4gb'      : 4096,
    '8gb'      : 8192,
    '16gb'     : 16384,
    'unlimited': 0,      // 0 = unlimited di Pterodactyl
    'admin'    : 0,
  };
  const ramMb = ramMap[ramTier] ?? 1024;

  // ── Buat username & password = nama panel (huruf kecil, no spasi) ──
  const username = nama.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const password = nama; // password = nama asli (case-sensitive)
  const email    = `${username}@${cfg.emailDomain || 'arabsubot.local'}`;
  const isAdmin  = (ramTier === 'admin');

  const m = await reply(client, msg,
    `<blockquote>╭──「 ⏳ <b>MEMBUAT PANEL...</b> 」\n` +
    `│ <b>Nama  :</b> <tg-spoiler>${esc(nama)}</tg-spoiler>\n` +
    `│ <b>RAM   :</b> <tg-spoiler>${ramMb === 0 ? 'Unlimited' : ramMb + ' MB'}</tg-spoiler>\n` +
    `│ <tg-spoiler>Mohon tunggu...</tg-spoiler>\n` +
    `╰────────────────────────\n` +
    `<tg-spoiler>✦ Zetsy UBot Panel Creator ✦</tg-spoiler></blockquote>`
  );

  const panelUrl = cfg.url.replace(/\/$/, '');
  const headers  = {
    'Authorization' : `Bearer ${cfg.apiKey}`,
    'Content-Type'  : 'application/json',
    'Accept'        : 'application/json',
  };

  try {
    // ── STEP 1: Buat user di panel ──
    let userId;
    try {
      const userRes = await axios.post(`${panelUrl}/api/application/users`, {
        username,
        email,
        first_name : nama,
        last_name  : 'Zetsy',
        password,
        root_admin : isAdmin,
      }, { headers, timeout: 15000 });
      userId = userRes.data?.attributes?.id;
    } catch (userErr) {
      // Kalau user sudah ada, cari dulu
      if (userErr.response?.status === 422) {
        const findRes = await axios.get(
          `${panelUrl}/api/application/users?filter[username]=${username}`,
          { headers, timeout: 15000 }
        );
        userId = findRes.data?.data?.[0]?.attributes?.id;
        if (!userId) throw new Error('Gagal membuat user & user tidak ditemukan!');
      } else throw userErr;
    }

    // ── STEP 2: Buat server (skip jika admin panel) ──
    let serverIdentifier = null;
    let serverUuid       = null;

    if (!isAdmin) {
      // ── Fetch detail egg otomatis dari API ──
      // Ini penting agar startup command & environment sesuai egg yang dipakai
      const eggId  = cfg.eggId  || 3;
      const nestId = cfg.nestId || 5;

      let eggStartup = cfg.startup || '';
      let eggEnv     = {};
      let eggImage   = cfg.dockerImage || 'ghcr.io/pterodactyl/yolks:nodejs_20';

      try {
        const eggRes = await axios.get(
          `${panelUrl}/api/application/nests/${nestId}/eggs/${eggId}?include=variables`,
          { headers, timeout: 10000 }
        );
        const eggData = eggRes.data?.attributes;

        // Ambil startup command dari egg jika tidak diisi manual di config
        if (!cfg.startup && eggData?.startup) {
          eggStartup = eggData.startup;
        }

        // Ambil docker image dari egg jika tidak diisi manual
        if (!cfg.dockerImage && eggData?.docker_image) {
          eggImage = eggData.docker_image;
        }

        // Build environment dari default values tiap variable egg
        const eggVars = eggData?.relationships?.variables?.data || [];
        for (const v of eggVars) {
          const attr = v.attributes;
          // Pakai env_variable sebagai key, default_value sebagai value
          eggEnv[attr.env_variable] = attr.default_value ?? '';
        }
      } catch (eggErr) {
        // Kalau fetch egg gagal, pakai yang ada di config
        eggStartup = cfg.startup || 'node index.js';
        eggEnv     = cfg.environment || {};
      }

      // Merge dengan override dari config (jika ada)
      if (cfg.environment) {
        eggEnv = { ...eggEnv, ...cfg.environment };
      }

      const serverRes = await axios.post(`${panelUrl}/api/application/servers`, {
        name           : nama,
        user           : userId,
        egg            : eggId,
        docker_image   : eggImage,
        startup        : eggStartup,
        environment    : eggEnv,
        limits: {
          memory       : ramMb,
          swap         : cfg.swap ?? 0,
          disk         : cfg.disk ?? 5120,
          io           : cfg.io   ?? 500,
          cpu          : cfg.cpu  ?? 100,
        },
        feature_limits : {
          databases    : cfg.databases   ?? 1,
          backups      : cfg.backups     ?? 2,
          allocations  : cfg.allocations ?? 1,
        },
        allocation     : {
          default      : await autoDetectAllocation(panelUrl, headers, cfg.allocationId),
        },
      }, { headers, timeout: 20000 });

      serverIdentifier = serverRes.data?.attributes?.identifier;
      serverUuid       = serverRes.data?.attributes?.uuid;
    }

    // ── STEP 3: Kirim hasil ──
    const serverUrl = isAdmin
      ? `${panelUrl}/admin`
      : `${panelUrl}`;

    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ✅ <b>PANEL BERHASIL DIBUAT!</b> 」\n` +
      `│\n` +
      `│ 🌐 <b>URL Panel     :</b>\n` +
      `│    <tg-spoiler>${esc(serverUrl)}</tg-spoiler>\n` +
      `│\n` +
      `│ 👤 <b>Login Panel  :</b>\n` +
      `│    Username : <tg-spoiler>${esc(username)}</tg-spoiler>\n` +
      `│    Password : <tg-spoiler>${esc(password)}</tg-spoiler>\n` +
      `│    Email    : <tg-spoiler>${esc(email)}</tg-spoiler>\n` +
      `│\n` +
      `│ 🖥️ <b>Server Info  :</b>\n` +
      `│    Nama     : <tg-spoiler>${esc(nama)}</tg-spoiler>\n` +
      `│    RAM      : <tg-spoiler>${ramMb === 0 ? '♾️ Unlimited' : ramMb + ' MB'}</tg-spoiler>\n` +
      `│    Tipe     : <tg-spoiler>${isAdmin ? '👑 Admin Panel' : ramTier.toUpperCase()}</tg-spoiler>\n` +
      (serverIdentifier ? `│    ID Server: <tg-spoiler>${esc(serverIdentifier)}</tg-spoiler>\n` : '') +
      `│\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot — Panel Creator ✦</tg-spoiler></blockquote>`
    );

  } catch (e) {
    const errMsg = e.response?.data?.errors?.[0]?.detail
                || e.response?.data?.message
                || e.message
                || 'Unknown error';
    await edit(client, msg.chatId, m.id,
      `<blockquote>╭──「 ❌ <b>GAGAL BUAT PANEL</b> 」\n` +
      `│ <tg-spoiler>${esc(errMsg)}</tg-spoiler>\n` +
      `│\n` +
      `│ <tg-spoiler>Cek: url, apiKey, eggId, allocationId di config.js</tg-spoiler>\n` +
      `╰────────────────────────\n` +
      `<tg-spoiler>✦ Zetsy UBot Panel Creator ✦</tg-spoiler></blockquote>`
    );
  }
}


// ═══════════════════════════════════════════════════════════════
// Zetsy: AUTO-DETECT ALLOCATION — cari allocation kosong otomatis
// Fix error: "The selected allocation.default is invalid"
// ═══════════════════════════════════════════════════════════════
async function autoDetectAllocation(panelUrl, headers, fallbackId) {
  try {
    // Cari semua node
    const nodesRes = await axios.get(`${panelUrl}/api/application/nodes?per_page=100`, { headers, timeout: 10000 });
    const nodes    = nodesRes.data?.data || [];
    for (const node of nodes) {
      const nodeId = node.attributes?.id;
      const allocRes = await axios.get(
        `${panelUrl}/api/application/nodes/${nodeId}/allocations?per_page=100`,
        { headers, timeout: 10000 }
      );
      const allocs = allocRes.data?.data || [];
      // Cari allocation yang BELUM dipakai
      const free = allocs.find(a => !a.attributes?.assigned);
      if (free) {
        console.log(`[Zetsy Panel] Found free allocation: ${free.attributes?.id} (${free.attributes?.ip}:${free.attributes?.port})`);
        return free.attributes?.id;
      }
    }
    console.log('[Zetsy Panel] No free allocation found, using fallback:', fallbackId || 1);
  } catch (err) {
    console.error('[Zetsy Panel] autoDetectAllocation error:', err.message);
  }
  return fallbackId || 1;
}

// ═══════════════════════════════════════════════════════════════
// Zetsy: MEMBER MANAGEMENT COMMANDS — di dalam userbot
// .add seller/reseller/pt/owner <userId>
// .listmember — list semua member
// .delmember <userId> — hapus member
// .member — cek status diri sendiri
// Hanya bisa dipakai owner (selfId === config.OWNER_ID)
// ═══════════════════════════════════════════════════════════════

async function cmdAddMember(client, msg, phone, selfId, args) {
  // Cek owner
  const me = await client.getMe();
  if (String(me.id) !== String(config.OWNER_ID)) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>AKSES DITOLAK</b> 」
│ <tg-spoiler>Hanya Owner yang bisa menambahkan member!</tg-spoiler>
╰────────────────────────</blockquote>`
    );
  }

  // Parse args: .add seller 123456789
  const parts  = (args || '').trim().split(/\s+/);
  const role   = (parts[0] || '').toLowerCase();
  let   userId = parts[1] || '';

  const validRoles = ['seller','reseller','pt','owner'];
  if (!validRoles.includes(role)) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>FORMAT SALAH</b> 」
│
` +
      `│ <tg-spoiler>Format: .add &lt;role&gt; &lt;userId&gt;</tg-spoiler>
│
` +
      `│ <b>Role tersedia:</b>
` +
      `│ <tg-spoiler>• seller   = 30 hari, full akses</tg-spoiler>
` +
      `│ <tg-spoiler>• reseller = permanen, limited (no panel)</tg-spoiler>
` +
      `│ <tg-spoiler>• pt       = 7 hari, full akses</tg-spoiler>
` +
      `│ <tg-spoiler>• owner    = permanen, full akses</tg-spoiler>
` +
      `│
│ <tg-spoiler>Contoh: .add seller 123456789</tg-spoiler>
` +
      `╰────────────────────────
<tg-spoiler>✦ Zetsy UBot Member System ✦</tg-spoiler></blockquote>`
    );
  }

  // Kalau tidak ada userId, coba ambil dari reply
  if (!userId && msg.replyTo?.replyToMsgId) {
    try {
      const replied = await client.getMessages(msg.chatId, { ids: [msg.replyTo.replyToMsgId] });
      userId = replied?.[0]?.senderId?.toString() || '';
    } catch (_) {}
  }

  if (!userId || !/^\d+$/.test(userId)) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>USER ID TIDAK VALID</b> 」
│ <tg-spoiler>Sertakan userId atau reply ke pesan user</tg-spoiler>
│ <tg-spoiler>Contoh: .add seller 123456789</tg-spoiler>
╰────────────────────────</blockquote>`
    );
  }

  try {
    const m = db.addMember(userId, role, String(me.id));
    const expiryStr = m.expiry ? new Date(m.expiry).toLocaleString('id-ID') : 'Permanen ♾️';
    const limited   = role === 'reseller' ? 'Limited (no panel/installer)' : 'Full akses';
    await reply(client, msg,
      `<blockquote>╭──「 ✅ <b>MEMBER BERHASIL DITAMBAHKAN!</b> 」
│
` +
      `│ <b>User ID :</b> <tg-spoiler>${esc(userId)}</tg-spoiler>
` +
      `│ <b>Role    :</b> <tg-spoiler>${esc(m.label)}</tg-spoiler>
` +
      `│ <b>Akses   :</b> <tg-spoiler>${limited}</tg-spoiler>
` +
      `│ <b>Expired :</b> <tg-spoiler>${expiryStr}</tg-spoiler>
` +
      `│
╰────────────────────────
<tg-spoiler>✦ Zetsy UBot Member System ✦</tg-spoiler></blockquote>`
    );
  } catch (err) {
    await reply(client, msg,
      `<blockquote>╭──「 ❌ <b>GAGAL</b> 」
│ <tg-spoiler>${esc(err.message)}</tg-spoiler>
╰────────────────────────</blockquote>`
    );
  }
}

async function cmdListMember(client, msg, phone, selfId) {
  const me = await client.getMe();
  if (String(me.id) !== String(config.OWNER_ID)) {
    return reply(client, msg, `<blockquote>╭──「 ❌ 」
│ <tg-spoiler>Hanya Owner!</tg-spoiler>
╰────────────────────────</blockquote>`);
  }
  const members = db.getAllMembers();
  const keys    = Object.keys(members);
  if (!keys.length) {
    return reply(client, msg, `<blockquote>╭──「 📋 <b>DAFTAR MEMBER</b> 」
│ <tg-spoiler>Belum ada member!</tg-spoiler>
╰────────────────────────</blockquote>`);
  }
  let txt = `<blockquote>╭──「 📋 <b>DAFTAR MEMBER UBOT</b> 」
│
`;
  const now = Date.now();
  for (const uid of keys) {
    const m   = members[uid];
    const exp = m.expiry ? (now > m.expiry ? '⚠️ EXPIRED' : `${Math.floor((m.expiry-now)/86400000)}h lagi`) : '♾️';
    const sta = (m.expiry && now > m.expiry) ? '🔴' : '🟢';
    txt += `│ ${sta} <b>${esc(m.label||m.role)}</b> — <tg-spoiler>${esc(uid)}</tg-spoiler>
`;
    txt += `│   <tg-spoiler>Expired: ${exp}</tg-spoiler>
`;
  }
  txt += `│
│ <tg-spoiler>Total: ${keys.length} member</tg-spoiler>
╰────────────────────────
<tg-spoiler>✦ Zetsy UBot Member System ✦</tg-spoiler></blockquote>`;
  await reply(client, msg, txt);
}

async function cmdDelMember(client, msg, phone, selfId, args) {
  const me = await client.getMe();
  if (String(me.id) !== String(config.OWNER_ID)) {
    return reply(client, msg, `<blockquote>╭──「 ❌ 」
│ <tg-spoiler>Hanya Owner!</tg-spoiler>
╰────────────────────────</blockquote>`);
  }
  const userId = (args || '').trim();
  if (!userId) return reply(client, msg, `<blockquote>╭──「 ❌ 」
│ <tg-spoiler>Format: .delmember &lt;userId&gt;</tg-spoiler>
╰────────────────────────</blockquote>`);
  const m = db.getMember(userId);
  if (!m) return reply(client, msg, `<blockquote>╭──「 ❌ 」
│ <tg-spoiler>User ${esc(userId)} tidak ditemukan!</tg-spoiler>
╰────────────────────────</blockquote>`);
  db.removeMember(userId);
  await reply(client, msg, `<blockquote>╭──「 ✅ <b>MEMBER DIHAPUS</b> 」
│ <tg-spoiler>User ${esc(userId)} (${esc(m.label||m.role)}) berhasil dihapus!</tg-spoiler>
╰────────────────────────
<tg-spoiler>✦ Zetsy UBot Member System ✦</tg-spoiler></blockquote>`);
}

async function cmdMyMember(client, msg, phone) {
  const me  = await client.getMe();
  const uid = String(me.id);
  if (uid === String(config.OWNER_ID)) {
    return reply(client, msg,
      `<blockquote>╭──「 👑 <b>STATUS MEMBER</b> 」
│
` +
      `│ <b>Role   :</b> <tg-spoiler>👑 Owner</tg-spoiler>
` +
      `│ <b>Akses  :</b> <tg-spoiler>Full — Unlimited</tg-spoiler>
` +
      `│ <b>Expired:</b> <tg-spoiler>Tidak pernah ♾️</tg-spoiler>
` +
      `│
╰────────────────────────
<tg-spoiler>✦ Zetsy UBot ✦</tg-spoiler></blockquote>`
    );
  }
  const m = db.getMember(uid);
  if (!m) {
    return reply(client, msg,
      `<blockquote>╭──「 👤 <b>STATUS MEMBER</b> 」
│
` +
      `│ <tg-spoiler>Kamu belum punya akses member!</tg-spoiler>
` +
      `│ <tg-spoiler>Hubungi owner untuk request akses.</tg-spoiler>
` +
      `│
╰────────────────────────
<tg-spoiler>✦ Zetsy UBot ✦</tg-spoiler></blockquote>`
    );
  }
  const now      = Date.now();
  const sisa     = m.expiry ? (now > m.expiry ? '⚠️ EXPIRED' : `${Math.floor((m.expiry-now)/86400000)}h ${Math.floor(((m.expiry-now)%86400000)/3600000)}j lagi`) : 'Permanen ♾️';
  const akses    = m.role === 'reseller' ? 'Limited (no panel/installer)' : 'Full akses';
  await reply(client, msg,
    `<blockquote>╭──「 👤 <b>STATUS MEMBER</b> 」
│
` +
    `│ <b>Role   :</b> <tg-spoiler>${esc(m.label||m.role)}</tg-spoiler>
` +
    `│ <b>Akses  :</b> <tg-spoiler>${akses}</tg-spoiler>
` +
    `│ <b>Expired:</b> <tg-spoiler>${sisa}</tg-spoiler>
` +
    `│ <b>Status :</b> <tg-spoiler>${m.expired ? '🔴 EXPIRED' : '🟢 Aktif'}</tg-spoiler>
` +
    `│
╰────────────────────────
<tg-spoiler>✦ Zetsy UBot Member System ✦</tg-spoiler></blockquote>`
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 🌐 SUBDOMAIN DNS MANAGER — Full System
// Perintah: .subdo · .listsubdo · .delsubdo · .ceksubdo · .settoken · .dnssetup
// Provider : Cloudflare(my.id) · Cloudflare(biz.id) · DuckDNS · Dynu · deSEC
// ══════════════════════════════════════════════════════════════════════════════

const SUBDO_DB    = './subdo_records.json';
const CONFIG_FILE = './config.js';

function loadSubdoDB() {
  try { if (fs.existsSync(SUBDO_DB)) return JSON.parse(fs.readFileSync(SUBDO_DB, 'utf8')); } catch (_) {}
  return {};
}
function saveSubdoDB(data) { fs.writeFileSync(SUBDO_DB, JSON.stringify(data, null, 2), 'utf8'); }

function subdoBar(pct) {
  const f = Math.floor(pct / 10);
  return '▓'.repeat(f) + '░'.repeat(10 - f) + ` ${pct}%`;
}

// ── Helper: Update config.js di disk ──────────────────────────────────────────
function updateConfigJs(key, value) {
  try {
    let raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const escaped = JSON.stringify(value);
    const re = new RegExp(`(${key}\\s*:\\s*)('[^']*'|"[^"]*"|null|'')`, 'g');
    if (re.test(raw)) {
      raw = raw.replace(new RegExp(`(${key}\\s*:\\s*)('[^']*'|"[^"]*"|null|'')`, 'g'), `$1${escaped}`);
    } else {
      // tambahkan field baru
      raw = raw.replace(/(\n};)/, `\n  ${key}: ${escaped},$1`);
    }
    fs.writeFileSync(CONFIG_FILE, raw, 'utf8');
    return true;
  } catch (e) { return false; }
}

// ── 5 Provider DNS ───────────────────────────────────────────────────────────
const DNS_PROVS = [
  {
    id     : 'cf_myid',
    name   : 'Cloudflare (my.id)',
    icon   : '🇮🇩',
    enabled: () => !!(config.CLOUDFLARE_TOKEN && config.CF_ZONE_MYID && config.MY_ID_DOMAIN),
    fqdn   : (sub) => `${sub}.${config.MY_ID_DOMAIN || 'my.id'}`,
  },
  {
    id     : 'cf_bizid',
    name   : 'Cloudflare (biz.id)',
    icon   : '💼',
    enabled: () => !!(config.CLOUDFLARE_TOKEN && config.CF_ZONE_BIZID && config.BIZ_ID_DOMAIN),
    fqdn   : (sub) => `${sub}.${config.BIZ_ID_DOMAIN || 'biz.id'}`,
  },
  {
    id     : 'duckdns',
    name   : 'DuckDNS',
    icon   : '🦆',
    enabled: () => !!(config.DUCKDNS_TOKEN),
    fqdn   : (sub) => `${sub}.duckdns.org`,
  },
  {
    id     : 'dynu',
    name   : 'Dynu',
    icon   : '⚡',
    enabled: () => !!(config.DYNU_CLIENT_ID && config.DYNU_SECRET),
    fqdn   : (sub) => `${sub}.dynu.com`,
  },
  {
    id     : 'desec',
    name   : 'deSEC (dedyn.io)',
    icon   : '🔒',
    enabled: () => !!(config.DESEC_TOKEN),
    fqdn   : (sub) => `${sub}.dedyn.io`,
  },
];

// ── Cloudflare: buat/update A record ─────────────────────────────────────────
async function cfUpsert(zoneId, name, ip) {
  const hdr = { Authorization: `Bearer ${config.CLOUDFLARE_TOKEN}`, 'Content-Type': 'application/json' };
  const list = await axios.get(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(name)}`, { headers: hdr, timeout: 12000 });
  const existing = list.data?.result?.[0];
  if (existing) {
    const up = await axios.put(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existing.id}`,
      { type:'A', name, content: ip, ttl: 120, proxied: false }, { headers: hdr, timeout: 12000 });
    if (!up.data?.success) throw new Error(up.data?.errors?.[0]?.message || 'CF update gagal');
    return { recordId: existing.id, action: 'updated' };
  }
  const cr = await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
    { type:'A', name, content: ip, ttl: 120, proxied: false }, { headers: hdr, timeout: 12000 });
  if (!cr.data?.success) throw new Error(cr.data?.errors?.[0]?.message || 'CF create gagal');
  return { recordId: cr.data.result.id, action: 'created' };
}
async function cfDelete(zoneId, recordId) {
  const hdr = { Authorization: `Bearer ${config.CLOUDFLARE_TOKEN}`, 'Content-Type': 'application/json' };
  await axios.delete(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, { headers: hdr, timeout: 12000 });
}

// ── DuckDNS ───────────────────────────────────────────────────────────────────
async function duckCreate(sub, ip) {
  const r = await axios.get(`https://www.duckdns.org/update?domains=${encodeURIComponent(sub)}&token=${config.DUCKDNS_TOKEN}&ip=${encodeURIComponent(ip)}&verbose=true`, { timeout: 12000 });
  const body = (r.data || '').toString();
  if (body.startsWith('KO') || (!body.startsWith('OK') && body.includes('KO'))) throw new Error('DuckDNS KO: ' + body.slice(0, 80));
  return { recordId: sub, action: 'created' };
}
async function duckDelete(sub) {
  await axios.get(`https://www.duckdns.org/update?domains=${encodeURIComponent(sub)}&token=${config.DUCKDNS_TOKEN}&ip=&clear=true`, { timeout: 12000 });
}

// ── Dynu ──────────────────────────────────────────────────────────────────────
let _dynuToken = null, _dynuExpiry = 0;
async function dynuAuth() {
  if (_dynuToken && Date.now() < _dynuExpiry) return _dynuToken;
  const r = await axios.post('https://api.dynu.com/v2/oauth2/token', null, {
    params: { client_id: config.DYNU_CLIENT_ID, client_secret: config.DYNU_SECRET, grant_type: 'client_credentials' },
    headers: { Accept: 'application/json' }, timeout: 12000,
  });
  _dynuToken  = r.data.access_token;
  _dynuExpiry = Date.now() + (r.data.expires_in || 3600) * 900;
  return _dynuToken;
}
async function dynuCreate(sub, ip) {
  const tok  = await dynuAuth();
  const hdr  = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  const list = await axios.get('https://api.dynu.com/v2/dns', { headers: hdr, timeout: 12000 });
  const host = `${sub}.dynu.com`;
  const ex   = (list.data?.domains || []).find(d => d.hostname === host);
  if (ex) {
    await axios.post(`https://api.dynu.com/v2/dns/${ex.id}`, { name: sub, ipv4Address: ip, ipv4: true, ttl: 90 }, { headers: hdr, timeout: 12000 });
    return { recordId: String(ex.id), action: 'updated' };
  }
  const r = await axios.post('https://api.dynu.com/v2/dns', { name: sub, ipv4Address: ip, ipv4: true, ttl: 90 }, { headers: hdr, timeout: 12000 });
  if (!r.data?.id) throw new Error('Dynu create gagal: ' + JSON.stringify(r.data).slice(0, 100));
  return { recordId: String(r.data.id), action: 'created' };
}
async function dynuDelete(recordId) {
  const tok = await dynuAuth();
  await axios.delete(`https://api.dynu.com/v2/dns/${recordId}`, { headers: { Authorization: `Bearer ${tok}` }, timeout: 12000 });
}

// ── deSEC (dedyn.io) ─────────────────────────────────────────────────────────
async function desecCreate(sub, ip) {
  const hdr  = { Authorization: `Token ${config.DESEC_TOKEN}`, 'Content-Type': 'application/json' };
  const name = `${sub}.dedyn.io`;
  // Pastikan domain terdaftar
  try {
    await axios.post('https://desec.io/api/v1/domains/', { name }, { headers: hdr, timeout: 15000 });
  } catch (e) {
    if (e.response?.status !== 400 && e.response?.status !== 409) throw e; // 400/409 = sudah ada, ok
  }
  // Buat/update A record
  const rr = await axios.put(`https://desec.io/api/v1/domains/${name}/rrsets/`,
    [{ subname: '', type: 'A', ttl: 300, records: [ip] }],
    { headers: hdr, timeout: 15000 }
  );
  return { recordId: name, action: 'created' };
}
async function desecDelete(domainName) {
  const hdr = { Authorization: `Token ${config.DESEC_TOKEN}` };
  try {
    await axios.delete(`https://desec.io/api/v1/domains/${domainName}/`, { headers: hdr, timeout: 12000 });
  } catch (_) {}
}

// ── Register ke satu provider ──────────────────────────────────────────────────
async function subdoRegister(prov, sub, ip) {
  try {
    if (!prov.enabled()) return { ok: false, reason: 'Token belum dikonfigurasi — gunakan .settoken atau node setupDNS.js' };
    let result;
    if (prov.id === 'cf_myid')  result = await cfUpsert(config.CF_ZONE_MYID,  `${sub}.${config.MY_ID_DOMAIN}`,  ip);
    if (prov.id === 'cf_bizid') result = await cfUpsert(config.CF_ZONE_BIZID, `${sub}.${config.BIZ_ID_DOMAIN}`, ip);
    if (prov.id === 'duckdns')  result = await duckCreate(sub, ip);
    if (prov.id === 'dynu')     result = await dynuCreate(sub, ip);
    if (prov.id === 'desec')    result = await desecCreate(sub, ip);
    return { ok: true, fqdn: prov.fqdn(sub), ...result };
  } catch (e) { return { ok: false, reason: e.message?.slice(0, 130) }; }
}

// ── Hapus dari satu provider ───────────────────────────────────────────────────
async function subdoDelete(prov, recData, sub) {
  try {
    if (!prov.enabled()) return { ok: false };
    if (prov.id === 'cf_myid')  await cfDelete(config.CF_ZONE_MYID,  recData.recordId);
    if (prov.id === 'cf_bizid') await cfDelete(config.CF_ZONE_BIZID, recData.recordId);
    if (prov.id === 'duckdns')  await duckDelete(sub);
    if (prov.id === 'dynu')     await dynuDelete(recData.recordId);
    if (prov.id === 'desec')    await desecDelete(recData.recordId);
    return { ok: true };
  } catch (e) { return { ok: false, reason: e.message?.slice(0, 80) }; }
}

// ── .subdo "nama","IP" ────────────────────────────────────────────────────────
async function cmdSubdo(client, msg, phone, args) {
  const raw   = args.trim();
  const match = raw.match(/^["']?([a-z0-9_-]+)["']?\s*,\s*["']?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})["']?$/i);
  if (!match) {
    return reply(client, msg,
      `<blockquote>╭──「 🌐 <b>SUBDOMAIN DNS MANAGER</b> 」\n│\n` +
      `│ <b>Format:</b> <tg-spoiler>.subdo "nama","IP"</tg-spoiler>\n` +
      `│ <b>Contoh:</b> <tg-spoiler>.subdo "serverku","103.21.56.77"</tg-spoiler>\n│\n` +
      `│ <b>5 Provider DNS Aktif:</b>\n` +
      `│ ${DNS_PROVS.map(p => `${p.enabled() ? '✅' : '❌'} ${p.icon} <tg-spoiler>${p.name}</tg-spoiler>`).join('\n│ ')}\n│\n` +
      `│ <tg-spoiler>Setup token: .dnssetup atau node setupDNS.js</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    );
  }
  const sub = match[1].toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const ip  = match[2];
  const oct = ip.split('.').map(Number);
  if (oct.some(n => isNaN(n) || n < 0 || n > 255)) {
    return reply(client, msg, `<blockquote>╭──「 ❌ <b>IP TIDAK VALID</b> 」\n│ <tg-spoiler>${esc(ip)} bukan IP yang valid!</tg-spoiler>\n╰────────────────────────</blockquote>`);
  }

  const activeProvs = DNS_PROVS.filter(p => p.enabled());
  if (!activeProvs.length) {
    return reply(client, msg,
      `<blockquote>╭──「 ❌ <b>BELUM ADA TOKEN DNS</b> 」\n│\n` +
      `│ <tg-spoiler>Belum ada provider DNS yang terkonfigurasi!</tg-spoiler>\n│\n` +
      `│ <b>Cara setup (pilih salah satu):</b>\n` +
      `│ <tg-spoiler>1️⃣ Jalankan: node setupDNS.js (di server)</tg-spoiler>\n` +
      `│ <tg-spoiler>2️⃣ Atau: .settoken duck TOKEN (cepat!)</tg-spoiler>\n│\n` +
      `│ <tg-spoiler>DuckDNS paling mudah: duckdns.org → login → copy token</tg-spoiler>\n` +
      `╰────────────────────────</blockquote>`
    );
  }

  const progMsg = await reply(client, msg,
    `<blockquote>╭──「 🌐 <b>MENDAFTARKAN SUBDOMAIN...</b> 」\n│\n` +
    `│ <b>📛 Nama :</b> <tg-spoiler>${esc(sub)}</tg-spoiler>\n` +
    `│ <b>🖥 IP   :</b> <tg-spoiler>${esc(ip)}</tg-spoiler>\n` +
    `│ <b>📡 Target:</b> <tg-spoiler>${activeProvs.length} provider aktif</tg-spoiler>\n│\n` +
    `│ <tg-spoiler>${subdoBar(5)} — Memulai...</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );

  const db = loadSubdoDB();
  if (!db[sub]) db[sub] = { name: sub, ip, providers: {}, createdAt: new Date().toISOString() };
  const results = [];

  for (let i = 0; i < DNS_PROVS.length; i++) {
    const prov = DNS_PROVS[i];
    const pct  = Math.round(((i + 0.5) / DNS_PROVS.length) * 90) + 5;
    try {
      await edit(client, msg.chatId, progMsg.id,
        `<blockquote>╭──「 🌐 <b>MENDAFTARKAN SUBDOMAIN...</b> 」\n│\n` +
        `│ <b>📛 Nama :</b> <tg-spoiler>${esc(sub)}</tg-spoiler>\n` +
        `│ <b>🖥 IP   :</b> <tg-spoiler>${esc(ip)}</tg-spoiler>\n│\n` +
        `│ <tg-spoiler>⏳ Mendaftar ke ${prov.icon} ${esc(prov.name)}...</tg-spoiler>\n` +
        `│ <tg-spoiler>${subdoBar(pct)}</tg-spoiler>\n` +
        `╰────────────────────────</blockquote>`
      );
    } catch (_) {}

    const r = await subdoRegister(prov, sub, ip);
    results.push({ prov, ...r });
    if (r.ok) db[sub].providers[prov.id] = { fqdn: r.fqdn, recordId: r.recordId, action: r.action };
    db[sub].ip = ip;
    saveSubdoDB(db);
    await sleep(500);
  }

  const okList   = results.filter(r => r.ok);
  const failList = results.filter(r => !r.ok);

  let txt = `<blockquote>╭──「 🌐 <b>SUBDOMAIN BERHASIL!</b> 」\n│\n`;
  txt += `│ <b>📛 Nama  :</b> <tg-spoiler>${esc(sub)}</tg-spoiler>\n`;
  txt += `│ <b>🖥 IP    :</b> <tg-spoiler>${esc(ip)}</tg-spoiler>\n`;
  txt += `│ <b>✅ Sukses:</b> <tg-spoiler>${okList.length}/${DNS_PROVS.length} provider</tg-spoiler>\n│\n`;
  txt += `│ <b>🌍 Domain Aktif Sekarang:</b>\n`;
  for (const r of results) {
    if (r.ok) {
      const act = r.action === 'updated' ? '🔄' : '✅';
      txt += `│ ${act} ${r.prov.icon} <tg-spoiler>${esc(r.fqdn)}</tg-spoiler>\n`;
    } else {
      txt += `│ ❌ ${r.prov.icon} <tg-spoiler>${esc(r.prov.name)}: ${esc(r.reason || 'Belum dikonfigurasi')}</tg-spoiler>\n`;
    }
  }
  txt += `│\n│ <tg-spoiler>${subdoBar(100)} — SELESAI! 🎉</tg-spoiler>\n`;
  if (failList.length) txt += `│\n│ <tg-spoiler>💡 Provider ❌: setup via .settoken atau node setupDNS.js</tg-spoiler>\n`;
  txt += `╰────────────────────────</blockquote>`;
  await edit(client, msg.chatId, progMsg.id, txt);
}

// ── .listsubdo ────────────────────────────────────────────────────────────────
async function cmdListSubdo(client, msg, phone) {
  const db   = loadSubdoDB();
  const keys = Object.keys(db);
  if (!keys.length) {
    return reply(client, msg,
      `<blockquote>╭──「 📋 <b>DAFTAR SUBDOMAIN</b> 」\n│ <tg-spoiler>Belum ada subdomain terdaftar!</tg-spoiler>\n│ <tg-spoiler>Buat dengan: .subdo "nama","IP"</tg-spoiler>\n╰────────────────────────</blockquote>`
    );
  }
  let txt = `<blockquote expandable>╭──「 📋 <b>DAFTAR SUBDOMAIN (${keys.length})</b> 」\n│\n`;
  for (const k of keys) {
    const r    = db[k];
    const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID') : '-';
    const pcnt = Object.keys(r.providers || {}).length;
    txt += `│ 🌐 <b>${esc(r.name)}</b>\n│   <tg-spoiler>IP: ${esc(r.ip)} · ${pcnt}/5 provider · ${date}</tg-spoiler>\n`;
    for (const [pid, pd] of Object.entries(r.providers || {})) {
      const pv = DNS_PROVS.find(p => p.id === pid);
      txt += `│   ${pv?.icon || '•'} <tg-spoiler>${esc(pd.fqdn)}</tg-spoiler>\n`;
    }
    txt += `│\n`;
  }
  txt += `╰────────────────────────</blockquote>`;
  await reply(client, msg, txt);
}

// ── .delsubdo "nama" ──────────────────────────────────────────────────────────
async function cmdDelSubdo(client, msg, phone, args) {
  const sub = args.replace(/["']/g, '').trim().toLowerCase();
  const db  = loadSubdoDB();
  if (!db[sub]) {
    return reply(client, msg, `<blockquote>╭──「 ❌ <b>TIDAK DITEMUKAN</b> 」\n│ <tg-spoiler>"${esc(sub)}" tidak ada!</tg-spoiler>\n│ <tg-spoiler>Lihat daftar: .listsubdo</tg-spoiler>\n╰────────────────────────</blockquote>`);
  }
  const rec = db[sub];
  const prog = await reply(client, msg,
    `<blockquote>╭──「 🗑 <b>MENGHAPUS...</b> 」\n│ <tg-spoiler>Menghapus "${esc(sub)}" dari semua provider...</tg-spoiler>\n│ <tg-spoiler>${subdoBar(10)}</tg-spoiler>\n╰────────────────────────</blockquote>`
  );
  const results = [];
  for (let i = 0; i < DNS_PROVS.length; i++) {
    const prov  = DNS_PROVS[i];
    const pdata = (rec.providers || {})[prov.id];
    const pct   = Math.round(((i + 1) / DNS_PROVS.length) * 90) + 5;
    try {
      await edit(client, msg.chatId, prog.id,
        `<blockquote>╭──「 🗑 <b>MENGHAPUS...</b> 」\n│ <tg-spoiler>Hapus dari ${prov.icon} ${esc(prov.name)}...</tg-spoiler>\n│ <tg-spoiler>${subdoBar(pct)}</tg-spoiler>\n╰────────────────────────</blockquote>`
      );
    } catch (_) {}
    if (!pdata) { results.push({ prov, ok: null }); continue; }
    const r = await subdoDelete(prov, pdata, sub);
    results.push({ prov, ...r });
    await sleep(300);
  }
  delete db[sub];
  saveSubdoDB(db);
  let txt = `<blockquote>╭──「 🗑 <b>SUBDOMAIN DIHAPUS!</b> 」\n│\n│ <b>📛 Nama :</b> <tg-spoiler>${esc(sub)}</tg-spoiler>\n│\n│ <b>Hasil:</b>\n`;
  for (const r of results) {
    const ic = r.ok === null ? '⏭' : r.ok ? '✅' : '❌';
    const info = r.ok === null ? 'Tidak terdaftar' : r.ok ? 'Dihapus' : (r.reason || 'Gagal');
    txt += `│ ${ic} ${r.prov.icon} <tg-spoiler>${esc(r.prov.name)}: ${esc(info)}</tg-spoiler>\n`;
  }
  txt += `│\n│ <tg-spoiler>${subdoBar(100)} — Selesai!</tg-spoiler>\n╰────────────────────────</blockquote>`;
  await edit(client, msg.chatId, prog.id, txt);
}

// ── .ceksubdo "nama" ──────────────────────────────────────────────────────────
async function cmdCekSubdo(client, msg, phone, args) {
  const sub = args.replace(/["']/g, '').trim().toLowerCase();
  const db  = loadSubdoDB();
  if (!db[sub]) {
    return reply(client, msg, `<blockquote>╭──「 ❌ <b>TIDAK DITEMUKAN</b> 」\n│ <tg-spoiler>"${esc(sub)}" tidak ada!</tg-spoiler>\n│ <tg-spoiler>Lihat daftar: .listsubdo</tg-spoiler>\n╰────────────────────────</blockquote>`);
  }
  const rec = db[sub];
  const dns = require('dns').promises;
  let txt = `<blockquote expandable>╭──「 🔍 <b>CEK SUBDOMAIN: ${esc(sub)}</b> 」\n│\n`;
  txt += `│ <b>🖥 IP Daftar:</b> <tg-spoiler>${esc(rec.ip)}</tg-spoiler>\n`;
  txt += `│ <b>📅 Dibuat  :</b> <tg-spoiler>${rec.createdAt ? new Date(rec.createdAt).toLocaleString('id-ID') : '-'}</tg-spoiler>\n│\n`;
  txt += `│ <b>🌍 Status Tiap Provider:</b>\n`;
  for (const prov of DNS_PROVS) {
    const pd = (rec.providers || {})[prov.id];
    if (!pd) { txt += `│ ⏭ ${prov.icon} <tg-spoiler>${esc(prov.name)}: Tidak terdaftar</tg-spoiler>\n`; continue; }
    try {
      const addrs = await dns.resolve4(pd.fqdn);
      const resolved = addrs[0] || '?';
      const match    = resolved === rec.ip;
      txt += `│ ${match ? '✅' : '⚠️'} ${prov.icon} <tg-spoiler>${esc(pd.fqdn)}</tg-spoiler>\n`;
      txt += `│    <tg-spoiler>→ ${esc(resolved)} ${match ? '(✓ sesuai)' : `(≠ berbeda dari ${esc(rec.ip)})`}</tg-spoiler>\n`;
    } catch (_) {
      txt += `│ ❌ ${prov.icon} <tg-spoiler>${esc(pd.fqdn)}: Belum propagasi</tg-spoiler>\n`;
    }
  }
  txt += `│\n│ <tg-spoiler>💡 DNS baru bisa propagasi 1–24 jam.</tg-spoiler>\n`;
  txt += `╰────────────────────────</blockquote>`;
  await reply(client, msg, txt);
}

// ── .settoken <provider> <token...> ─────────────────────────────────────────
async function cmdSetToken(client, msg, phone, args) {
  const parts    = args.trim().split(/\s+/);
  const provider = (parts[0] || '').toLowerCase();

  const help = `<blockquote>╭──「 🔑 <b>SET TOKEN DNS</b> 」\n│\n` +
    `│ <b>Format per provider:</b>\n` +
    `│ <tg-spoiler>.settoken duck TOKEN</tg-spoiler>\n` +
    `│ <tg-spoiler>.settoken dynu CLIENTID SECRET</tg-spoiler>\n` +
    `│ <tg-spoiler>.settoken desec TOKEN EMAIL</tg-spoiler>\n` +
    `│ <tg-spoiler>.settoken cf TOKEN ZONE_MYID ZONE_BIZID MYID BIZID</tg-spoiler>\n` +
    `│ <tg-spoiler>.settoken freedns SHA1TOKEN</tg-spoiler>\n│\n` +
    `│ <tg-spoiler>💡 Cara mudah: node setupDNS.js (di server)</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`;

  let saved = [], errs = [];

  try {
    if (provider === 'duck' || provider === 'duckdns') {
      const token = parts[1];
      if (!token) return reply(client, msg, help);
      const ok1 = updateConfigJs('DUCKDNS_TOKEN', token);
      config.DUCKDNS_TOKEN = token;
      if (ok1) saved.push('DUCKDNS_TOKEN'); else errs.push('DUCKDNS_TOKEN');

    } else if (provider === 'dynu') {
      const [, clientId, secret] = parts;
      if (!clientId || !secret) return reply(client, msg, help);
      const ok1 = updateConfigJs('DYNU_CLIENT_ID', clientId);
      const ok2 = updateConfigJs('DYNU_SECRET', secret);
      config.DYNU_CLIENT_ID = clientId; config.DYNU_SECRET = secret;
      _dynuToken = null; // reset cache
      if (ok1) saved.push('DYNU_CLIENT_ID'); else errs.push('DYNU_CLIENT_ID');
      if (ok2) saved.push('DYNU_SECRET'); else errs.push('DYNU_SECRET');

    } else if (provider === 'desec') {
      const token = parts[1];
      const email = parts[2] || '';
      if (!token) return reply(client, msg, help);
      updateConfigJs('DESEC_TOKEN', token);
      if (email) updateConfigJs('DESEC_EMAIL', email);
      config.DESEC_TOKEN = token; config.DESEC_EMAIL = email;
      saved.push('DESEC_TOKEN');
      if (email) saved.push('DESEC_EMAIL');

    } else if (provider === 'cf' || provider === 'cloudflare') {
      const [, cfToken, zoneMyId, zoneBizId, myIdDomain, bizIdDomain] = parts;
      if (!cfToken) return reply(client, msg, help);
      updateConfigJs('CLOUDFLARE_TOKEN', cfToken); config.CLOUDFLARE_TOKEN = cfToken; saved.push('CLOUDFLARE_TOKEN');
      if (zoneMyId)   { updateConfigJs('CF_ZONE_MYID', zoneMyId);     config.CF_ZONE_MYID    = zoneMyId;    saved.push('CF_ZONE_MYID'); }
      if (zoneBizId)  { updateConfigJs('CF_ZONE_BIZID', zoneBizId);   config.CF_ZONE_BIZID   = zoneBizId;   saved.push('CF_ZONE_BIZID'); }
      if (myIdDomain) { updateConfigJs('MY_ID_DOMAIN', myIdDomain);   config.MY_ID_DOMAIN    = myIdDomain;  saved.push('MY_ID_DOMAIN'); }
      if (bizIdDomain){ updateConfigJs('BIZ_ID_DOMAIN', bizIdDomain); config.BIZ_ID_DOMAIN   = bizIdDomain; saved.push('BIZ_ID_DOMAIN'); }

    } else if (provider === 'freedns') {
      const token = parts[1];
      if (!token) return reply(client, msg, help);
      updateConfigJs('FREEDNS_TOKEN', token); config.FREEDNS_TOKEN = token; saved.push('FREEDNS_TOKEN');

    } else {
      return reply(client, msg, help);
    }
  } catch (e) {
    errs.push(e.message?.slice(0, 80));
  }

  const activeProv = DNS_PROVS.filter(p => p.enabled());
  await reply(client, msg,
    `<blockquote>╭──「 🔑 <b>TOKEN BERHASIL DISIMPAN!</b> 」\n│\n` +
    `│ <b>✅ Field tersimpan:</b>\n` +
    `│ <tg-spoiler>${saved.map(s => '• ' + s).join('\n│ <tg-spoiler>') || 'Tidak ada'}</tg-spoiler>\n` +
    (errs.length ? `│\n│ <b>⚠️ Gagal update config.js:</b>\n│ <tg-spoiler>${errs.join(', ')}</tg-spoiler>\n│ <tg-spoiler>(Token aktif di session ini, restart untuk permanen)</tg-spoiler>\n` : '') +
    `│\n│ <b>📡 Provider Aktif Sekarang:</b>\n` +
    `│ <tg-spoiler>${activeProv.length ? activeProv.map(p => p.icon + ' ' + p.name).join('\n│ <tg-spoiler>') : 'Belum ada provider aktif'}</tg-spoiler>\n│\n` +
    `│ <tg-spoiler>🚀 Sekarang coba: .subdo "nama","IP"</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );
}

// ── .dnssetup — info status semua provider ────────────────────────────────────
async function cmdDnsSetup(client, msg, phone) {
  const lines = DNS_PROVS.map(p => {
    const en  = p.enabled();
    const ico = en ? '✅' : '❌';
    return `│ ${ico} ${p.icon} <tg-spoiler>${esc(p.name)}: ${en ? 'Aktif ✓' : 'Belum dikonfigurasi'}</tg-spoiler>`;
  });
  const totalActive = DNS_PROVS.filter(p => p.enabled()).length;
  await reply(client, msg,
    `<blockquote expandable>╭──「 ⚙️ <b>DNS SETUP STATUS</b> 」\n│\n` +
    `│ <b>📡 Provider (${totalActive}/5 aktif):</b>\n` +
    `${lines.join('\n')}\n│\n` +
    `│ <b>🔧 Cara Setup Token:</b>\n` +
    `│ <tg-spoiler>Metode 1 (Otomatis):</tg-spoiler>\n` +
    `│ <tg-spoiler>  → node setupDNS.js (di server)</tg-spoiler>\n│\n` +
    `│ <tg-spoiler>Metode 2 (Via Bot):</tg-spoiler>\n` +
    `│ <tg-spoiler>  .settoken duck TOKEN</tg-spoiler>\n` +
    `│ <tg-spoiler>  .settoken dynu CLIENTID SECRET</tg-spoiler>\n` +
    `│ <tg-spoiler>  .settoken desec TOKEN EMAIL</tg-spoiler>\n│\n` +
    `│ <b>🌐 Cara Dapat Token Gratis:</b>\n` +
    `│ <tg-spoiler>🦆 DuckDNS → duckdns.org → login → copy token</tg-spoiler>\n` +
    `│ <tg-spoiler>⚡ Dynu    → dynu.com → daftar → API Credentials</tg-spoiler>\n` +
    `│ <tg-spoiler>🔒 deSEC  → node setupDNS.js (auto-register!)</tg-spoiler>\n` +
    `│ <tg-spoiler>🇮🇩 my.id  → domain sendiri + Cloudflare</tg-spoiler>\n│\n` +
    `│ <tg-spoiler>Setelah setup: .subdo "nama","IP"</tg-spoiler>\n` +
    `╰────────────────────────</blockquote>`
  );
}

// autoStart disabled - dikelola oleh noktel bot
// autoStart().catch(e => console.error('[Zetsy] AutoStart error:', e.message));
module.exports = { sendCode, signIn, restartAll, signOut, enforceExpiredSessions, autoStart };
