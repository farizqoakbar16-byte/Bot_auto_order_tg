// ╔══════════════════════════════════════════╗
// ║     TG SHOP — NOKTEL BOT ULTIMATE     ║
// ║   Merged: Ates-Fixed + tg Features    ║
// ╚══════════════════════════════════════════╝

const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const chalk    = require('chalk');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const { StringSession } = require('telegram/sessions');
const { TelegramClient } = require('telegram');
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const config = require('./config.json');
const axios  = require('axios');
const { Client: SSHClient } = require('ssh2');
const fs     = require('fs');
const { createdQris, cekStatus } = require('./lib/payment');
const QRCode = require('qrcode');
// Canvas: lazy load, fallback graceful jika tidak tersedia
let _canvas = null;
function getCanvas() {
  if (_canvas) return _canvas;
  try { _canvas = require('canvas'); } catch { _canvas = null; }
  return _canvas;
}



// ══════════════════════════════════════════
//  KONFIGURASI
// ══════════════════════════════════════════
const BOT_TOKEN   = config.bot.token;
const ADMIN_ID    = config.bot.adminId;
const DEV_NAME    = config.bot.dev;
const CHANNEL_ID  = config.channel.id;
const QRIS_URL    = config.qris.imageUrl;
const QRIS_PATH   = config.qris.imagePath || null;
const START_PHOTO = config.bot.startPhoto || 'https://telegra.ph/file/start-photo.jpg';
const API_ID      = config.telegram.apiId;
const API_HASH    = config.telegram.apiHash;
const BOT_VERSION = '2.0.0';
const BOT_NAME    = 'TG SHOP ✦ NOKTEL';
const FORCE_JOIN  = config.bot.forceJoin || [];


// ── NERCPAY CONFIG ───────────────────────
const NERCPAY_CONFIG = config.nercpay || {};

// ── SUBDOMAIN DATABASE ──────────────────
global.subdomain = {
  "storexyz.web.id":       { zone: "6c8e7372366812fb4404f471ce6e8566", apitoken: "uTl_azdrB2b30hneCXvaXP0AfuMpMeFnzLHxrRN5" },
  "manhost.web.id":        { zone: "ca3628f0e7c395c7c35e49b2f6b98869", apitoken: "SmaBNxRL8MKEiduNCbJ-VNSTsdHZ3wsHP_NEAGg0" },
  "ymzprivat.biz.id":      { zone: "224d4a27f97d5895c8df248bd8d083bf", apitoken: "LhEpIRt1GG_CYUCGGxeQ7AkOELqy530vERBuvIN2" },
  "ymzpterodactyl.biz.id": { zone: "c259026028b5a0a5cad9a4624a677f36", apitoken: "iiRn_WvgI8inVMF2hJdDO06OvniBx9Hu1KF0IUJu" },
  "xyzraa.biz.id":         { zone: "9fafb2671fa1a4f67a2044803e283780", apitoken: "q54b8QI-LXyXkyGIW0W9MbcIsB6t558087L9to-Q" },
  "veyoradev.biz.id":      { zone: "c03458c7996fa426258cb75be6d23716", apitoken: "Lq9GCBQ6c5J1YuRm6DfymLuBUpXJJO1YN1zQlwJQ" },
  "kinzprivat.biz.id":     { zone: "cfbff196cdd671efd6fcd2d8662f1028", apitoken: "fmb9lwRjiEi_F5wPaEE3Ior5FgEA69SwyqvoupSj" },
  "myserverr.web.id":      { zone: "2ebdbbf3d1edf834395d9596dd0e0d53", apitoken: "Yh87xMgv4zhQNOYZ49kBiVkM7Lf9DKmmm_xCrKP5" },
  "zonapanel.web.id":      { zone: "b9acd64d7e7fa4cd2007139a8f2d4779", apitoken: "G-Quh__J5ZpFi6NQSxbsySDVRko4gnZ3EhsvbNtX" },
  "hostsatoruu.biz.id":    { zone: "30ea1aac05ca26dda61540e172f52ff4", apitoken: "eZp1wNcc0Mj-btUQQ1cDIek2NZ6u1YW1Bxc2SB3z" },
  "antirusuhvvip.web.id":  { zone: "22ad1338c3e1c8284d6d0559ea252db3", apitoken: "5V3cPFVlVq9GN1GRypddORenI9WTohsYYtZeiKDE" },
  "cyberpanel.web.id":     { zone: "6bc7749cf7691424486e0b4edda5e021", apitoken: "3fRXbZh0tlyIrwzklIONc-Fnvhkr65AQgMWQn0aE" },
  "hostingers-vvip.my.id": { zone: "2341ae01634b852230b7521af26c261f", apitoken: "Ztw1ouD8_lJf-QzRecgmijjsDJODFU4b-y697lPw" },
};

// ── GIFT CATEGORIES ─────────────────────
const GIFT_CAT = {
  "5000":  { label: "💝🧸 Rp 4.350",  enabled: true, items: [
    { emoji: "💝", price: 4350,  giftId: "5170145012310081615" },
    { emoji: "🧸", price: 4350,  giftId: "5170233102089322756" }
  ]},
  "11000": { label: "🎁🌹 Rp 7.250",  enabled: true, items: [
    { emoji: "🎁", price: 7250,  giftId: "5167939598143193218" },
    { emoji: "🌹", price: 7250,  giftId: "5168103777563050263" }
  ]},
  "14000": { label: "💐🚀🎂 Rp 14.500", enabled: true, items: [
    { emoji: "💐", price: 14500, giftId: "5170314324215857265" },
    { emoji: "🚀", price: 14500, giftId: "5170564780938756245" },
    { emoji: "🎂", price: 14500, giftId: "5170144170496491616" }
  ]},
  "29000": { label: "💍🏆💎 Rp 28.000", enabled: true, items: [
    { emoji: "💍", price: 28000, giftId: "5170521118301225164" },
    { emoji: "🏆", price: 28000, giftId: "5168043875654172773" },
    { emoji: "💎", price: 28000, giftId: "5170690322832818290" }
  ]},
};

// price overrides store (in-memory, persisted via mongo)
let giftPriceOverrides = {};

// mtproto client for sending gifts
let _mtClient = null;
async function getMtClient() {
  if (_mtClient) return _mtClient;
  const { TelegramClient: TGC } = require('telegram');
  const { StringSession: SS } = require('telegram/sessions');
  const sessionFile = './data/gift.session';
  let sessionStr = '';
  try { sessionStr = fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, 'utf8').trim() : ''; } catch {}
  const client = new TGC(new SS(sessionStr), API_ID, API_HASH, { connectionRetries: 5 });
  await client.connect();
  const saved = client.session.save();
  try { fs.mkdirSync('./data', { recursive: true }); fs.writeFileSync(sessionFile, saved, 'utf8'); } catch {}
  _mtClient = client;
  return client;
}

async function sendStarGift({ targetUsername, giftId, messageText = 'Terima kasih!' }) {
  const { Api } = require('telegram/tl');
  const client = await getMtClient();
  const uname  = String(targetUsername).replace(/^@/, '').trim();
  const entity = await client.getEntity(uname);
  const inputPeer = await client.getInputEntity(entity);
  const invoice = new Api.InputInvoiceStarGift({
    peer: inputPeer,
    giftId: BigInt(String(giftId)),
    hideName: true,
    includeUpgrade: false,
    message: new Api.TextWithEntities({ text: messageText, entities: [] }),
  });
  const form   = await client.invoke(new Api.payments.GetPaymentForm({ invoice }));
  const formId = BigInt(String(form.formId ?? form.form_id ?? form.id ?? 0));
  return client.invoke(new Api.payments.SendStarsForm({ formId, invoice }));
}

// helper: send QRIS image from URL to user
// Ambil buffer foto QRIS (lokal dulu, fallback download URL)
async function getQrisBuffer() {
  // Prioritas 1: baca dari file lokal
  if (QRIS_PATH) {
    const localPath = require('path').resolve(QRIS_PATH);
    if (fs.existsSync(localPath)) {
      try { return fs.readFileSync(localPath); } catch {}
    }
  }
  // Prioritas 2: download dari URL
  if (QRIS_URL) {
    const https = require('https');
    const http  = require('http');
    const lib   = QRIS_URL.startsWith('https') ? https : http;
    const chunks = [];
    try {
      await new Promise((resolve, reject) => {
        const req = lib.get(QRIS_URL, (res) => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          res.on('data', d => chunks.push(d));
          res.on('end', resolve);
          res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
      });
      if (chunks.length) return Buffer.concat(chunks);
    } catch (e) {
      console.error('[getQrisBuffer] Download gagal:', e.message);
    }
  }
  return null;
}

// Kirim foto QRIS + caption sebagai SATU PESAN
async function sendQrisWithCaption(chatId, captionText, replyMarkup = null) {
  const buf = await getQrisBuffer();
  const opts = { caption: captionText, parse_mode: 'HTML' };
  if (replyMarkup) opts.reply_markup = replyMarkup;
  if (buf) {
    try {
      return await bot.telegram.sendPhoto(chatId, { source: buf }, opts);
    } catch (e) {
      console.error('[sendQrisWithCaption] Gagal kirim foto:', e.message);
    }
  }
  // Fallback: kirim teks biasa tanpa foto
  return bot.telegram.sendMessage(chatId, captionText, { parse_mode: 'HTML', ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}


// ══════════════════════════════════════════
//  UI / TAMPILAN
// ══════════════════════════════════════════
const LINE  = '─────────────────────────';
const LINE2 = '═════════════════════════';
const DOT   = '◈';

// ══════════════════════════════════════════
//  MONGODB
// ══════════════════════════════════════════
let users, products, deposits, settings, vouchers, scripts, gift_orders, install_access, stor_submissions, draft_accounts;

async function connectDB() {
  await mongoose.connect(config.database.uri, { dbName: config.database.name });
  const db = mongoose.connection.db;
  users    = db.collection('users');
  products = db.collection('products');
  deposits = db.collection('deposits');
  settings = db.collection('settings');
  vouchers = db.collection('vouchers');
  scripts        = db.collection('scripts');
  gift_orders    = db.collection('gift_orders');
  install_access    = db.collection('install_access');
  stor_submissions  = db.collection('stor_submissions');
  draft_accounts    = db.collection('draft_accounts');
  draft_accounts    = db.collection('draft_accounts'); // akun belum ready (limit/perlu banding)

  await users.createIndex({ user_id: 1 }, { unique: true });
  await products.createIndex({ real_id: 1 });
  await deposits.createIndex({ ref_code: 1 }, { unique: true });

  if ((await settings.countDocuments()) === 0) {
    await settings.insertMany([
      { key: 'deposit_enabled', value: '1' },
      { key: 'deposit_min',     value: '1000' },
      { key: 'qris_name',       value: 'TG - STORE' },
    ]);
  }
  // Load gift price overrides from DB
  const overrides = await settings.find({ key: { $regex: /^giftprice_/ } }).toArray();
  for (const o of overrides) {
    const k = o.key.replace('giftprice_', '').replace('_', ':');
    giftPriceOverrides[k] = parseInt(o.value) || 0;
  }
  // Load gift category enabled state from DB
  const catStates = await settings.find({ key: { $regex: /^giftcat_/ } }).toArray();
  for (const s of catStates) {
    const k = s.key.replace('giftcat_', '');
    if (GIFT_CAT[k]) GIFT_CAT[k].enabled = s.value === '1';
  }
}

// ══════════════════════════════════════════
//  HELPERS UMUM
// ══════════════════════════════════════════
const startTime = new Date();

function formatRp(n) {
  return `Rp ${(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
// ── Helper: label digit ID Telegram ────────────────────────────
function digitLabel(id) {
  const len = String(id || '').replace(/\D/g, '').length;
  if (!len) return '';
  return ` (${len}digit)`;
}


function getUptime() {
  const s = Math.floor((new Date() - startTime) / 1000);
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function formatWIB(date) {
  if (!date) return '-';
  const d = new Date(date);
  d.setHours(d.getHours() + 7);
  return d.toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
}

function genRef() {
  return `DEP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function genCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function maskPhone(phone) {
  if (!phone) return '***';
  const s = String(phone).trim();
  if (s.length <= 5) return '***';
  return s.slice(0, -3) + '***';
}

function detectCountry(phone) {
  try {
    if (!phone) return '🌍 Unknown';
    // Normalisasi: pastikan ada + di depan
    let normalized = String(phone).replace(/\s/g, '');
    if (!normalized.startsWith('+')) normalized = '+' + normalized;

    // Coba parse dengan libphonenumber
    const parsed = parsePhoneNumberFromString(normalized);
    const code = parsed?.getCountry?.() || null;

    if (code) {
      // Generate flag emoji dari country code (universal — support semua negara)
      const flag = [...code.toUpperCase()].map(c =>
        String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
      ).join('');
      // Nama negara — map lengkap + fallback ke kode
      const names = {
        'ID':'Indonesia','MY':'Malaysia','SG':'Singapore','TH':'Thailand',
        'VN':'Vietnam','PH':'Philippines','MM':'Myanmar','IN':'India',
        'PK':'Pakistan','BD':'Bangladesh','CN':'China','JP':'Japan',
        'KR':'South Korea','KP':'North Korea','SA':'Saudi Arabia','AE':'UAE',
        'TR':'Turkey','GB':'UK','FR':'France','DE':'Germany','US':'USA',
        'AU':'Australia','RU':'Russia','BR':'Brazil','MX':'Mexico',
        'CA':'Canada','IT':'Italy','ES':'Spain','NL':'Netherlands',
        'SE':'Sweden','NO':'Norway','DK':'Denmark','FI':'Finland',
        'CH':'Switzerland','AT':'Austria','BE':'Belgium','PL':'Poland',
        'CZ':'Czech','RO':'Romania','HU':'Hungary','GR':'Greece',
        'PT':'Portugal','UA':'Ukraine','NZ':'New Zealand','ZA':'South Africa',
        'EG':'Egypt','NG':'Nigeria','KE':'Kenya','GH':'Ghana','ET':'Ethiopia',
        'TZ':'Tanzania','MA':'Morocco','DZ':'Algeria','TN':'Tunisia',
        'IQ':'Iraq','IR':'Iran','IL':'Israel','JO':'Jordan','KW':'Kuwait',
        'QA':'Qatar','BH':'Bahrain','OM':'Oman','YE':'Yemen','LB':'Lebanon',
        'LK':'Sri Lanka','NP':'Nepal','AF':'Afghanistan','KZ':'Kazakhstan',
        'UZ':'Uzbekistan','TM':'Turkmenistan','AZ':'Azerbaijan','GE':'Georgia',
        'AM':'Armenia','BY':'Belarus','MD':'Moldova','LV':'Latvia',
        'LT':'Lithuania','EE':'Estonia','HR':'Croatia','RS':'Serbia',
        'BA':'Bosnia','MK':'Macedonia','AL':'Albania','BG':'Bulgaria',
        'SK':'Slovakia','SI':'Slovenia','LU':'Luxembourg','IE':'Ireland',
        'IS':'Iceland','MT':'Malta','CY':'Cyprus',
        'TW':'Taiwan','HK':'Hong Kong','MO':'Macao',
        'KH':'Cambodia','LA':'Laos','BN':'Brunei','TL':'Timor-Leste',
        'MN':'Mongolia','BT':'Bhutan','MV':'Maldives',
        'FJ':'Fiji','PG':'Papua New Guinea','WS':'Samoa','TO':'Tonga',
        'AR':'Argentina','CL':'Chile','CO':'Colombia','PE':'Peru',
        'VE':'Venezuela','EC':'Ecuador','BO':'Bolivia','PY':'Paraguay',
        'UY':'Uruguay','GY':'Guyana','SR':'Suriname',
        'CU':'Cuba','DO':'Dominican Republic','JM':'Jamaica','HT':'Haiti',
        'GT':'Guatemala','HN':'Honduras','SV':'El Salvador','NI':'Nicaragua',
        'CR':'Costa Rica','PA':'Panama','TT':'Trinidad and Tobago',
      };
      return `${flag} ${names[code] || code}`;
    }

    // Fallback: deteksi manual dari prefix angka — semua negara
    const digits = normalized.replace(/\D/g, '');
    // Sorted longest first agar match paling spesifik
    const prefixMap = [
      // 4 digit
      ['1242','🇧🇸 Bahamas'],['1246','🇧🇧 Barbados'],['1264','🇦🇮 Anguilla'],
      ['1268','🇦🇬 Antigua'],['1284','🇻🇬 British VI'],['1340','🇻🇮 US VI'],
      ['1345','🇰🇾 Cayman'],['1441','🇧🇲 Bermuda'],['1473','🇬🇩 Grenada'],
      ['1649','🇹🇨 Turks'],['1664','🇲🇸 Montserrat'],['1670','🇲🇵 N. Mariana'],
      ['1671','🇬🇺 Guam'],['1684','🇦🇸 Am. Samoa'],['1721','🇸🇽 Sint Maarten'],
      ['1758','🇱🇨 St. Lucia'],['1767','🇩🇲 Dominica'],['1784','🇻🇨 St. Vincent'],
      ['1787','🇵🇷 Puerto Rico'],['1868','🇹🇹 Trinidad'],['1869','🇰🇳 St. Kitts'],
      ['1876','🇯🇲 Jamaica'],['1939','🇵🇷 Puerto Rico'],
      // 3 digit
      ['212','🇲🇦 Morocco'],['213','🇩🇿 Algeria'],['216','🇹🇳 Tunisia'],
      ['218','🇱🇾 Libya'],['220','🇬🇲 Gambia'],['221','🇸🇳 Senegal'],
      ['222','🇲🇷 Mauritania'],['223','🇲🇱 Mali'],['224','🇬🇳 Guinea'],
      ['225','🇨🇮 Ivory Coast'],['226','🇧🇫 Burkina Faso'],['227','🇳🇪 Niger'],
      ['228','🇹🇬 Togo'],['229','🇧🇯 Benin'],['230','🇲🇺 Mauritius'],
      ['231','🇱🇷 Liberia'],['232','🇸🇱 Sierra Leone'],['233','🇬🇭 Ghana'],
      ['234','🇳🇬 Nigeria'],['235','🇹🇩 Chad'],['236','🇨🇫 CAR'],
      ['237','🇨🇲 Cameroon'],['238','🇨🇻 Cape Verde'],['239','🇸🇹 Sao Tome'],
      ['240','🇬🇶 Eq. Guinea'],['241','🇬🇦 Gabon'],['242','🇨🇬 Congo'],
      ['243','🇨🇩 DR Congo'],['244','🇦🇴 Angola'],['245','🇬🇼 Guinea-Bissau'],
      ['246','🇮🇴 BIOT'],['247','🇦🇨 Ascension'],['248','🇸🇨 Seychelles'],
      ['249','🇸🇩 Sudan'],['250','🇷🇼 Rwanda'],['251','🇪🇹 Ethiopia'],
      ['252','🇸🇴 Somalia'],['253','🇩🇯 Djibouti'],['254','🇰🇪 Kenya'],
      ['255','🇹🇿 Tanzania'],['256','🇺🇬 Uganda'],['257','🇧🇮 Burundi'],
      ['258','🇲🇿 Mozambique'],['260','🇿🇲 Zambia'],['261','🇲🇬 Madagascar'],
      ['262','🇷🇪 Reunion'],['263','🇿🇼 Zimbabwe'],['264','🇳🇦 Namibia'],
      ['265','🇲🇼 Malawi'],['266','🇱🇸 Lesotho'],['267','🇧🇼 Botswana'],
      ['268','🇸🇿 Eswatini'],['269','🇰🇲 Comoros'],['290','🇸🇭 St. Helena'],
      ['291','🇪🇷 Eritrea'],['297','🇦🇼 Aruba'],['298','🇫🇴 Faroe Islands'],
      ['299','🇬🇱 Greenland'],
      ['350','🇬🇮 Gibraltar'],['351','🇵🇹 Portugal'],['352','🇱🇺 Luxembourg'],
      ['353','🇮🇪 Ireland'],['354','🇮🇸 Iceland'],['355','🇦🇱 Albania'],
      ['356','🇲🇹 Malta'],['357','🇨🇾 Cyprus'],['358','🇫🇮 Finland'],
      ['359','🇧🇬 Bulgaria'],['370','🇱🇹 Lithuania'],['371','🇱🇻 Latvia'],
      ['372','🇪🇪 Estonia'],['373','🇲🇩 Moldova'],['374','🇦🇲 Armenia'],
      ['375','🇧🇾 Belarus'],['376','🇦🇩 Andorra'],['377','🇲🇨 Monaco'],
      ['378','🇸🇲 San Marino'],['380','🇺🇦 Ukraine'],['381','🇷🇸 Serbia'],
      ['382','🇲🇪 Montenegro'],['383','🇽🇰 Kosovo'],['385','🇭🇷 Croatia'],
      ['386','🇸🇮 Slovenia'],['387','🇧🇦 Bosnia'],['389','🇲🇰 N. Macedonia'],
      ['420','🇨🇿 Czech'],['421','🇸🇰 Slovakia'],['423','🇱🇮 Liechtenstein'],
      ['500','🇫🇰 Falkland'],['501','🇧🇿 Belize'],['502','🇬🇹 Guatemala'],
      ['503','🇸🇻 El Salvador'],['504','🇭🇳 Honduras'],['505','🇳🇮 Nicaragua'],
      ['506','🇨🇷 Costa Rica'],['507','🇵🇦 Panama'],['508','🇵🇲 St. Pierre'],
      ['509','🇭🇹 Haiti'],['590','🇬🇵 Guadeloupe'],['591','🇧🇴 Bolivia'],
      ['592','🇬🇾 Guyana'],['593','🇪🇨 Ecuador'],['594','🇬🇫 Fr. Guiana'],
      ['595','🇵🇾 Paraguay'],['596','🇲🇶 Martinique'],['597','🇸🇷 Suriname'],
      ['598','🇺🇾 Uruguay'],['599','🇨🇼 Curacao'],
      ['670','🇹🇱 Timor-Leste'],['672','🇳🇫 Norfolk'],['673','🇧🇳 Brunei'],
      ['674','🇳🇷 Nauru'],['675','🇵🇬 Papua NG'],['676','🇹🇴 Tonga'],
      ['677','🇸🇧 Solomon'],['678','🇻🇺 Vanuatu'],['679','🇫🇯 Fiji'],
      ['680','🇵🇼 Palau'],['681','🇼🇫 Wallis'],['682','🇨🇰 Cook Islands'],
      ['683','🇳🇺 Niue'],['685','🇼🇸 Samoa'],['686','🇰🇮 Kiribati'],
      ['687','🇳🇨 New Caledonia'],['688','🇹🇻 Tuvalu'],['689','🇵🇫 Fr. Polynesia'],
      ['690','🇹🇰 Tokelau'],['691','🇫🇲 Micronesia'],['692','🇲🇭 Marshall'],
      ['850','🇰🇵 North Korea'],['852','🇭🇰 Hong Kong'],['853','🇲🇴 Macao'],
      ['855','🇰🇭 Cambodia'],['856','🇱🇦 Laos'],
      ['880','🇧🇩 Bangladesh'],['886','🇹🇼 Taiwan'],
      ['960','🇲🇻 Maldives'],['961','🇱🇧 Lebanon'],['962','🇯🇴 Jordan'],
      ['963','🇸🇾 Syria'],['964','🇮🇶 Iraq'],['965','🇰🇼 Kuwait'],
      ['966','🇸🇦 Saudi Arabia'],['967','🇾🇪 Yemen'],['968','🇴🇲 Oman'],
      ['970','🇵🇸 Palestine'],['971','🇦🇪 UAE'],['972','🇮🇱 Israel'],
      ['973','🇧🇭 Bahrain'],['974','🇶🇦 Qatar'],['975','🇧🇹 Bhutan'],
      ['976','🇲🇳 Mongolia'],['977','🇳🇵 Nepal'],
      ['992','🇹🇯 Tajikistan'],['993','🇹🇲 Turkmenistan'],['994','🇦🇿 Azerbaijan'],
      ['995','🇬🇪 Georgia'],['996','🇰🇬 Kyrgyzstan'],['998','🇺🇿 Uzbekistan'],
      // 2 digit
      ['20','🇪🇬 Egypt'],['27','🇿🇦 South Africa'],
      ['30','🇬🇷 Greece'],['31','🇳🇱 Netherlands'],['32','🇧🇪 Belgium'],
      ['33','🇫🇷 France'],['34','🇪🇸 Spain'],['36','🇭🇺 Hungary'],
      ['39','🇮🇹 Italy'],['40','🇷🇴 Romania'],['41','🇨🇭 Switzerland'],
      ['43','🇦🇹 Austria'],['44','🇬🇧 UK'],['45','🇩🇰 Denmark'],
      ['46','🇸🇪 Sweden'],['47','🇳🇴 Norway'],['48','🇵🇱 Poland'],
      ['49','🇩🇪 Germany'],['51','🇵🇪 Peru'],['52','🇲🇽 Mexico'],
      ['53','🇨🇺 Cuba'],['54','🇦🇷 Argentina'],['55','🇧🇷 Brazil'],
      ['56','🇨🇱 Chile'],['57','🇨🇴 Colombia'],['58','🇻🇪 Venezuela'],
      ['60','🇲🇾 Malaysia'],['61','🇦🇺 Australia'],['62','🇮🇩 Indonesia'],
      ['63','🇵🇭 Philippines'],['64','🇳🇿 New Zealand'],['65','🇸🇬 Singapore'],
      ['66','🇹🇭 Thailand'],['81','🇯🇵 Japan'],['82','🇰🇷 South Korea'],
      ['84','🇻🇳 Vietnam'],['86','🇨🇳 China'],['90','🇹🇷 Turkey'],
      ['91','🇮🇳 India'],['92','🇵🇰 Pakistan'],['93','🇦🇫 Afghanistan'],
      ['94','🇱🇰 Sri Lanka'],['95','🇲🇲 Myanmar'],['98','🇮🇷 Iran'],
      // 1 digit
      ['1','🇺🇸 USA/Canada'],['7','🇷🇺 Russia'],
    ];
    for (const [prefix, label] of prefixMap) {
      if (digits.startsWith(prefix)) return label;
    }
    return '🌍 Other';
  } catch { return '🌍 Unknown'; }
}

async function getUser(userId) {
  let u = await users.findOne({ user_id: userId });
  if (!u) {
    u = {
      user_id: userId, username: 'User', balance: 0, total_spent: 0,
      created_at: new Date(), mutasi: [], vouchers_used: [],
    };
    try {
      const c = await bot.telegram.getChat(userId);
      u.username = c.username || c.first_name || 'User';
    } catch {}
    await users.insertOne(u);
  }
  return u;
}

async function getSetting(key) {
  const s = await settings.findOne({ key });
  return s ? s.value : null;
}

async function setSetting(key, value) {
  await settings.updateOne({ key }, { $set: { value } }, { upsert: true });
}

async function isMaintenanceBot() {
  return (await getSetting('maintenance_bot')) === '1';
}

async function isMaintenanceStor() {
  return (await getSetting('maintenance_stor')) === '1';
}

async function getStockData() {
  const stock = { no_limit: 0, other_country: 0, repe: 0, spam_limit: 0, nine_digit: 0, tag_scam: 0, tag_fake: 0 };
  let total = 0;
  for await (const doc of products.aggregate([
    { $match: { status: 'available' } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ])) {
    if (stock[doc._id] !== undefined) stock[doc._id] = doc.count;
    total += doc.count;
  }
  // Hitung nine_digit dari real_id yang panjangnya 9 digit (jika belum masuk kategori nine_digit)
  const nineDigitExtra = await products.countDocuments({
    status: 'available',
    category: { $ne: 'nine_digit' },
    $expr: { $eq: [{ $strLenCP: { $toString: '$real_id' } }, 9] }
  });
  stock.nine_digit += nineDigitExtra;
  // Hitung tag_scam dan tag_fake dari field tag
  stock.tag_scam = await products.countDocuments({ status: 'available', tag: 'tag_scam' });
  stock.tag_fake = await products.countDocuments({ status: 'available', tag: 'tag_fake' });
  return { stock, total };
}

// ══════════════════════════════════════════
//  FORCE JOIN CHECK
// ══════════════════════════════════════════
async function checkForceJoin(userId) {
  if (!FORCE_JOIN || FORCE_JOIN.length === 0) return true;
  for (const ch of FORCE_JOIN) {
    try {
      const res = await bot.telegram.getChatMember(ch, userId);
      if (!['member', 'administrator', 'creator'].includes(res.status)) return false;
    } catch { return false; }
  }
  return true;
}

// ══════════════════════════════════════════
//  HELPER KIRIM KE CHANNEL
// ══════════════════════════════════════════
async function bcChannel(msg, buttons = null) {
  if (!CHANNEL_ID) return;
  const opt = { parse_mode: 'HTML', disable_web_page_preview: true };
  if (buttons) opt.reply_markup = { inline_keyboard: buttons };
  await bot.telegram.sendMessage(CHANNEL_ID, msg, opt).catch(() => {});
}

// ══════════════════════════════════════════
//  TELEGRAM USERBOT
// ══════════════════════════════════════════
const tempClients        = {};
const addProductSessions = {};
const storSessions       = {};
const userSessions       = {};
const nercpayActiveOrders      = {};

async function loginAccount(phone) {
  try {
    const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, { connectionRetries: 5 });
    await client.connect();
    const result = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phone);
    return { status: 'need_code', client, phoneCodeHash: result.phoneCodeHash };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

async function verifyOTP(client, phone, phoneCodeHash, code) {
  try {
    const { Api } = require('telegram/tl');
    await client.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code }));
    const me = await client.getMe();
    return { status: 'success', user: me };
  } catch (err) {
    if (err.errorMessage === 'SESSION_PASSWORD_NEEDED' || (err.message && err.message.includes('SESSION_PASSWORD_NEEDED')))
      return { status: 'need_password' };
    return { status: 'error', error: err.errorMessage || err.message };
  }
}

async function verify2FA(client, password) {
  try {
    const { Api } = require('telegram/tl');
    const { computeCheck } = require('telegram/Password');
    const pwdInfo = await client.invoke(new Api.account.GetPassword());
    const check   = await computeCheck(pwdInfo, password);
    await client.invoke(new Api.auth.CheckPassword({ password: check }));
    const me = await client.getMe();
    return { status: 'success', user: me };
  } catch (err) {
    return { status: 'error', error: err.errorMessage || err.message };
  }
}

async function fetchOTP(sessionStr) {
  const client = new TelegramClient(
    new StringSession(sessionStr), API_ID, API_HASH, { connectionRetries: 1 }
  );
  try {
    await client.connect();
    let otp = null;
    for await (const msg of client.iterMessages(777000, { limit: 10 })) {
      if (msg.text) {
        const match = msg.text.match(/\b(\d{5})\b/);
        if (match) { otp = match[1]; break; }
      }
    }
    await client.disconnect();
    return otp;
  } catch (e) {
    return null;
  }
}

// ══════════════════════════════════════════
//  BACKUP ZIP
// ══════════════════════════════════════════
async function createBackup(chatId) {
  await bot.telegram.sendMessage(chatId, `<tg-emoji emoji-id="5213452215527677338">⏳</tg-emoji> <b>Membuat arsip backup...</b>`, { parse_mode: 'HTML' });
  try {
    const zip = new AdmZip();
    const files = ['./index.js', './config.json'];
    for (const f of files) {
      const fs = require('fs');
      if (fs.existsSync(f)) zip.addLocalFile(f);
    }
    const buf = zip.toBuffer();
    await bot.telegram.sendDocument(
      chatId,
      { source: buf, filename: `Aqil_Backup_${Date.now()}.zip` },
      { caption: `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Backup selesai</b>\n${LINE}\nFile source berhasil dikemas.`, parse_mode: 'HTML' }
    );
  } catch (err) {
    await bot.telegram.sendMessage(chatId, `❌ Gagal backup: ${err.message}`, { parse_mode: 'HTML' });
  }
}

// ══════════════════════════════════════════
//  BOT
// ══════════════════════════════════════════
const bot     = new Telegraf(BOT_TOKEN);
const isAdmin = (id) => id.toString() === ADMIN_ID.toString();

// ── Global safety net: satu error di satu fitur JANGAN sampai matiin seluruh bot ──
bot.catch((err, ctx) => {
  console.error(`[bot.catch] Error di update ${ctx?.updateType || '?'}:`, err?.message || err);
  try { ctx?.reply?.('⚠️ Terjadi kesalahan, coba lagi.'); } catch {}
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err?.message || err);
});

// ── Helper: edit pesan yang ada (jika dari callback) atau kirim baru ──
async function editOrReply(ctx, text, opts = {}) {
  const msg = ctx.callbackQuery?.message;
  if (msg) {
    try {
      if (msg.photo || msg.document || msg.video || msg.audio) {
        // Pesan dengan media - edit caption
        return await ctx.editMessageCaption(text, { parse_mode: 'HTML', ...opts });
      } else {
        // Pesan teks biasa - edit text
        return await ctx.editMessageText(text, { parse_mode: 'HTML', ...opts });
      }
    } catch (e) {
      // Jika gagal edit (misal pesan sama), kirim baru
      if (!e.message?.includes('not modified')) {
        return await ctx.reply(text, { parse_mode: 'HTML', ...opts });
      }
    }
  } else {
    return await ctx.reply(text, { parse_mode: 'HTML', ...opts });
  }
}

// ── Helper: edit photo/caption atau kirim photo baru ──
async function editOrReplyPhoto(ctx, photo, opts = {}) {
  const msg = ctx.callbackQuery?.message;
  if (msg?.photo) {
    try {
      // Edit hanya reply_markup jika foto sama
      if (opts.reply_markup) {
        return await ctx.editMessageReplyMarkup(opts.reply_markup);
      }
    } catch {}
  }
  // Fallback: kirim foto baru
}



// ─── SEND WELCOME ───────────────────────
async function sendWelcome(ctx) {
  const userId = ctx.from.id;
  const joined = await checkForceJoin(userId);
  if (!joined) {
    const list = FORCE_JOIN.map(c => `  ➜ ${c}`).join('\n');
    return ctx.reply(
      `<tg-emoji emoji-id="5447644880824181073">⚠️</tg-emoji> <b>Verifikasi Channel</b>\n\n` +
      `<blockquote><tg-emoji emoji-id="5258500400918587241">📝</tg-emoji>Kamu wajib join channel berikut untuk menggunakan bot ini <a href="https://t.me/chgabut1">Channel</a> Setelah join, ketik /start lagi.</blockquote>`,
      { parse_mode: 'HTML' }
    );
  }

  const user       = await getUser(userId);
  const userStatus = isAdmin(userId) ? '👑 ADMIN' : '🔷 Member';
  const totalOrder = await products.countDocuments({ buyer_id: userId });

  // Ambil total user & pendapatan untuk info global
  const totalUser = await users.countDocuments();
  const revAgg = await products.aggregate([
    { $match: { status: { $in: ['sold', 'finished'] } } },
    { $group: { _id: null, total: { $sum: '$price' } } },
  ]).toArray();
  const totalRevenue = revAgg[0]?.total || 0;

  const caption =
    `─── <tg-emoji emoji-id="5908972566537572230">♾</tg-emoji> <b>TG | MARKET</b> ──────\n\n` +
    `<blockquote>` +
    `<tg-emoji emoji-id="5366288132834599020">💻</tg-emoji> Selamat datang di layanan resmi penjualan akun Telegram Otomatis kami\n\n` +
    `<tg-emoji emoji-id="5373261557700509032">📱</tg-emoji> <b>Layanan Kami</b>\n` +
    `<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Pemesanan akun Telegram siap pakai secara praktis dan simple.\n` +
    `<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Pengisian saldo tersedia melalui QRIS otomatis yang cepat.\n\n` +
    `<tg-emoji emoji-id="5841238690306724929">⭐️</tg-emoji> <b>Informasi System</b>\n` +
    `<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Sistem aktif secara realtime tanpa henti dan memproses transaksi sscara langsung.\n` +
    `<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Sistem transaksi tercatat pada database untuk menjaga keamanan dan ketenangan layanan.\n` +
    `</blockquote>`;

  const inlineButtons = [
  [
    {
      text: 'Toko Noktel',
      callback_data: 'menu_noktel',
      style: 'primary',
      icon_custom_emoji_id: '6129513871557267734'
    },
    {
      text: '🎟 Voucher',
      callback_data: 'voucher',
      style: 'success',
      icon_custom_emoji_id: '5346077597287589711'
    },
  ],
  [
    {
      text: 'Other Menu',
      callback_data: 'menu_other',
      style: 'success',
      icon_custom_emoji_id: '5893161718179173515'
    },
  ],
  [
    {
      text: 'Deposit Saldo',
      callback_data: 'deposit',
      style: 'danger',
      icon_custom_emoji_id: '6039641775377748623'
    },
    {
      text: 'Profil',
      callback_data: 'profile',
      style: 'primary',
      icon_custom_emoji_id: '5904630315946611415'
    },
  ],
  [
    {
      text: 'Panduan',
      callback_data: 'snk',
      style: 'success',
      icon_custom_emoji_id: '6282565984632970119'
    },
  ],
  ...(isAdmin(userId)
    ? [[{
        text: 'ADMIN PANEL',
        callback_data: 'admin',
        style: 'success',
        icon_custom_emoji_id: '6206122090819490939'
      }]]
    : []),
];

  try {
    await ctx.replyWithPhoto(START_PHOTO, {
      caption,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineButtons },
    });
  } catch {
    await ctx.reply(caption, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineButtons },
    });
  }
}

// ══════════════════════════════════════════════════════
//  GLOBAL SHARED CONTEXT
//  Semua fungsi & variabel di-expose ke global
//  supaya handler files bisa akses langsung
// ══════════════════════════════════════════════════════
global.bot                      = bot;
global.isAdmin                  = isAdmin;
global.editOrReply              = editOrReply;
global.editOrReplyPhoto         = editOrReplyPhoto;
global.sendWelcome              = sendWelcome;

// ── Constants ──
global.LINE                     = LINE;
global.LINE2                    = LINE2;
global.DOT                      = DOT;
global.BOT_NAME                 = BOT_NAME;
global.BOT_VERSION              = BOT_VERSION;
global.ADMIN_ID                 = ADMIN_ID;
global.DEV_NAME                 = DEV_NAME;
global.CHANNEL_ID               = CHANNEL_ID;
global.API_ID                   = API_ID;
global.API_HASH                 = API_HASH;
global.START_PHOTO              = START_PHOTO;
global.FORCE_JOIN               = FORCE_JOIN;
global.GIFT_CAT                 = GIFT_CAT;
global.NERCPAY_CONFIG           = NERCPAY_CONFIG;
global.QRIS_URL                 = QRIS_URL;
global.QRIS_PATH                = QRIS_PATH;
global.startTime                = startTime;

// ── Helpers ──
global.formatRp                 = formatRp;
global.digitLabel               = digitLabel;
global.getUptime                = getUptime;
global.formatWIB                = formatWIB;
global.genRef                   = genRef;
global.genCode                  = genCode;
global.maskPhone                = maskPhone;
global.detectCountry            = detectCountry;
global.bcChannel                = bcChannel;
global.getUser                  = getUser;
global.getSetting               = getSetting;
global.setSetting               = setSetting;
global.isMaintenanceBot         = isMaintenanceBot;
global.isMaintenanceStor        = isMaintenanceStor;
global.getStockData             = getStockData;
global.checkForceJoin           = checkForceJoin;
global.getCanvas                = getCanvas;
global.getQrisBuffer            = getQrisBuffer;
global.sendQrisWithCaption      = sendQrisWithCaption;
global.getMtClient              = getMtClient;
global.sendStarGift             = sendStarGift;
global.createBackup             = createBackup;
global.loginAccount             = loginAccount;
global.verifyOTP                = verifyOTP;
global.verify2FA                = verify2FA;
global.fetchOTP                 = fetchOTP;

// ── Sessions & state objects ──
global.tempClients              = tempClients;
global.addProductSessions       = addProductSessions;
global.storSessions             = storSessions;
global.userSessions             = userSessions;
global.giftPriceOverrides       = giftPriceOverrides;
global.nercpayActiveOrders      = nercpayActiveOrders;

// ── DB collections (diisi setelah connectDB) ──
global.getDB = () => ({ users, products, deposits, settings, vouchers, scripts, gift_orders, install_access, stor_submissions, draft_accounts });

// ── Lib ──
global.axios                    = axios;
global.fs                       = fs;
global.AdmZip                   = AdmZip;
global.crypto                   = crypto;
global.TelegramClient           = TelegramClient;
global.StringSession            = StringSession;
global.mongoose                 = mongoose;
global.createdQris              = createdQris;
global.cekStatus                = cekStatus;
global.QRCode                   = QRCode;

// ─── /start ────────────────────────────




// ══════════════════════════════════════════════════════
//  START & ROUTING UTAMA
// ══════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════
//  BOT HANDLERS — dipanggil dari folder handlers/
// ══════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════
//  START & ROUTING UTAMA
// ══════════════════════════════════════════════════════════

bot.start(async (ctx) => {
  if (!isAdmin(ctx.from.id) && await isMaintenanceBot()) {
    return ctx.reply(
      `🔧 <b>Bot sedang maintenance, harap jangan spam bot</b>\n\nSilahkan coba lagi nanti ya! 🙏`,
      { parse_mode: 'HTML' }
    );
  }
  const isNew = !(await users.findOne({ user_id: ctx.from.id }));
  await sendWelcome(ctx);

});

// ─── CALLBACK HANDLER ──────────────────
bot.on('callback_query', async (ctx) => {
  const action = ctx.callbackQuery.data;

  try {
    await ctx.answerCbQuery().catch(() => {});

    // ── MAINTENANCE CHECK ─────────────────────────────────────────────
    if (!isAdmin(ctx.from.id)) {
      const maintBot  = await isMaintenanceBot();
      const maintStor = await isMaintenanceStor();
      if (maintBot && !['admin', 'home'].includes(action)) {
        return ctx.answerCbQuery('🔧 Bot maintenance', { show_alert: true });
      }
      if (maintStor && action === 'storAkun') {
        return ctx.answerCbQuery('🔧 Bot maintenance', { show_alert: true });
      }
    }
    // ─────────────────────────────────────────────────────────────────

    switch (action) {
      case 'shop':       return showShop(ctx);
      case 'storAkun':    return showStorAkun(ctx);
      case 'borongan':   return showBorongan(ctx);
      case 'stock':      return showStock(ctx);
      case 'statistik':  return showStatistik(ctx);
      case 'history':    return showHistory(ctx);
      case 'deposit':    return showDeposit(ctx);
      case 'profile':    return showProfile(ctx);
      case 'admin':      return showAdmin(ctx);
      case 'admin_menu_account':  return showAdminMenuAccount(ctx);
      case 'admin_menu_gift':     return showAdminMenuGift(ctx);
      case 'admin_menu_database': return showAdminMenuDatabase(ctx);
      case 'admin_menu_stor':     return showAdminMenuStor(ctx);
      case 'admin_menu_control':  return showAdminMenuControl(ctx);
      case 'voucher':    return showVoucher(ctx);
      case 'transfer':   return showTransfer(ctx);
      case 'mutasi':     return showMutasi(ctx);
      case 'topspender': return showTopSpender(ctx);
      case 'kalkulator':  return showKalkulator(ctx);
      case 'snk':         return showSnK(ctx);
      case 'menuinstall': return showMenuInstall(ctx);
      case 'home':       try { await ctx.deleteMessage(); } catch {} return sendWelcome(ctx);
      case 'menu_noktel': return showMenuNoktel(ctx);
      case 'menu_other':  return showMenuOther(ctx);
      case 'admin_draft_db':     return showAdminDraftDB(ctx);
      case 'admin_mgmt':         return showAdminMgmt(ctx);
      case 'admin_mgmt_session': return showAdminMgmtSession(ctx);
      case 'menu_noktel': return showMenuNoktel(ctx);
      case 'menu_toko':   return showMenuToko(ctx);
      case 'menu_other':  return showMenuOther(ctx);
      case 'admin_mgmt':         return showAdminMgmt(ctx);
      case 'admin_mgmt_session': return showAdminMgmtSession(ctx);

      case 'cancel_buy':
        try {
          return await ctx.editMessageCaption(`<blockquote><tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> <b>Pembelian dibatalkan</b></blockquote>`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'shop', style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] },
          });
        } catch {
          return ctx.editMessageText(`<blockquote><tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> <b>Pembelian dibatalkan</b></blockquote>`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'shop' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] },
          }).catch(() => {});
        }

      case 'cancel_deposit':
        delete userSessions[ctx.from.id];
        // Cancel NercPay polling jika ada
        if (nercpayActiveOrders[ctx.from.id]) {
          clearInterval(nercpayActiveOrders[ctx.from.id].interval);
          delete nercpayActiveOrders[ctx.from.id];
        }
        try {
          return await ctx.editMessageCaption(`<blockquote><tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> <b>Pembelian dibatalkan</b></blockquote>`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'home', style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] },
          });
        } catch {
          return ctx.editMessageText(`❌ <b>Deposit dibatalkan</b>`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'home' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] },
          }).catch(() => {});
        }

      case 'cancel_add_product': return handleCancelAddProduct(ctx);
      case 'cancel_stor': {
        // Hapus session stor user dan kembali ke home
        const userStorSess = storSessions[ctx.from.id];
        if (userStorSess?.storId) {
          // Kalau ada storId, tandai submission sebagai cancelled
          await stor_submissions.updateOne(
            { stor_id: userStorSess.storId, status: 'pending_acc' },
            { $set: { status: 'cancelled_by_user', cancelled_at: new Date() } }
          ).catch(() => {});
          delete storSessions[`admin_stor_${userStorSess.storId}`];
        }
        delete storSessions[ctx.from.id];
        try { await ctx.deleteMessage(); } catch {}
        return sendWelcome(ctx);
      }
      case 'admin_add':          return handleAdminAdd(ctx);
      case 'admin_remove_stok':  return showRemoveStok(ctx);
      case 'admin_setting':      return handleAdminSetting(ctx);
      case 'admin_install_access':  return showAdminInstallAccess(ctx);
      case 'admin_stor_pending':     return showStorPending(ctx);
      case 'admin_maintenance':      return showMaintenance(ctx);
      case 'maint_bot_on':           return toggleMaintenance(ctx, 'bot', true);
      case 'maint_bot_off':          return toggleMaintenance(ctx, 'bot', false);
      case 'maint_stor_on':          return toggleMaintenance(ctx, 'stor', true);
      case 'maint_stor_off':         return toggleMaintenance(ctx, 'stor', false);
      case 'maint_pick_bot':         return showMaintenancePick(ctx, 'bot');
      case 'maint_pick_stor':        return showMaintenancePick(ctx, 'stor');
      case 'admin_stor_setting':     return showStorSetting(ctx);
      case 'stor_setting_2fa':       return handleStorSetting2FA(ctx);
      case 'stor_setting_surel':     return handleStorSettingSurel(ctx);
      case 'admin_backup':       return createBackup(ctx.from.id);
      case 'admin_bc':           return handleAdminBC(ctx);
      case 'admin_tools':        return showAdminTools(ctx);
      case 'tools_scan_mongo':   return handleToolsScanMongo(ctx);
      case 'admin_scripts':      return handleAdminScripts(ctx);
      case 'admin_addscript':    return handleAdminAddScript(ctx);
      case 'admin_voucher':      return handleAdminVoucher(ctx);

      default:
        if (action === 'noop') { await ctx.answerCbQuery().catch(()=>{}); return; }
        if (action.startsWith('cat_prefix_'))   return showProductsByPrefix(ctx, action.replace('cat_prefix_', ''));
        if (action.startsWith('cat_set_'))      return handleCategorySet(ctx, action.replace('cat_set_', ''));
        if (action.startsWith('tag_set_'))      return handleTagSet(ctx, action.replace('tag_set_', ''));
        if (action.startsWith('cat_'))          return showProductsByCategory(ctx, action.replace('cat_', ''));
        if (action.startsWith('buy_'))          return showBuyConfirm(ctx, action.replace('buy_', ''));
        if (action.startsWith('confirm_buy_'))  return processBuy(ctx, action.replace('confirm_buy_', ''));
        if (action.startsWith('opentx_'))       return handleOpenTx(ctx, action.replace('opentx_', ''));
        if (action.startsWith('otp_'))          return handleOTP(ctx, action.replace('otp_', ''));
        if (action.startsWith('fa2_'))          return handleFA2(ctx, action.replace('fa2_', ''));
        if (action.startsWith('logout_'))       return handleLogout(ctx, action.replace('logout_', ''));
        if (action.startsWith('dologout_'))     return handleDoLogout(ctx, action.replace('dologout_', ''));
        if (action.startsWith('canclogout_'))   return handleCancLogout(ctx, action.replace('canclogout_', ''));
        if (action.startsWith('buyscript_'))         return showScriptConfirm(ctx, action.replace('buyscript_', ''));
        if (action.startsWith('scriptpaysaldo_'))    return handleBuyScriptSaldo(ctx, action.replace('scriptpaysaldo_', ''));
        if (action.startsWith('scriptpayqris_'))     return handleBuyScriptQris(ctx, action.replace('scriptpayqris_', ''));
        if (action.startsWith('stor_cat_set_'))   return handleStorCatSet(ctx, action.replace('stor_cat_set_', ''));
        if (action.startsWith('stor_tag_set_'))   return handleStorTagSet(ctx, action.replace('stor_tag_set_', ''));
        if (action.startsWith('stor_acc_'))       return handleStorAcc(ctx, action.replace('stor_acc_', ''));
        if (action.startsWith('stor_reject_'))    return handleStorReject(ctx, action.replace('stor_reject_', ''));
        if (action === 'stor_setprice') {
          storSessions[ctx.from.id] = { step: 'stor_set_price' };
          try { await ctx.deleteMessage(); } catch {}
          return bot.telegram.sendMessage(ctx.from.id,
            `<tg-emoji emoji-id="6206027872121918710">🎁</tg-emoji> Masukkan harga stor akun tetap (angka saja, 0 = bebas)`,
            { reply_markup: { inline_keyboard: [[{ text: 'Batal', callback_data: 'admin_stor_setting', style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
          );
        }
        if (action === 'stor_pick_2fa')           return handleStorSetting2FA(ctx);
        if (action === 'stor_editprice_list')         return showEditPriceList(ctx);
        if (action.startsWith('stor_pick_akun_'))    return showStorAkunMenu(ctx, action.replace('stor_pick_akun_', ''));
        if (action.startsWith('remove_stok_confirm_')) {
          if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Bukan admin!', { show_alert: true });
          const pid = action.replace('remove_stok_confirm_', '');
          await ctx.answerCbQuery('🗑️ Menghapus...').catch(() => {});
          const pDel = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
          await products.deleteOne({ _id: new mongoose.Types.ObjectId(pid) });
          return ctx.reply(`<blockquote><tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> Akun <code>${pDel?.real_id||pid}</code> berhasil dihapus dari stok.</blockquote>`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'admin_remove_stok' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }
          });
        }
        if (action.startsWith('remove_stok_')) {
          if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Bukan admin!', { show_alert: true });
          const pid = action.replace('remove_stok_', '');
          await ctx.answerCbQuery().catch(() => {});
          const p = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
          if (!p) return ctx.reply('<blockquote><tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Produk tidak ditemukan.</blockquote>', { parse_mode: 'HTML' });
          return ctx.reply(
            `<tg-emoji emoji-id="5420323339723881652">⚠️</tg-emoji> Hapus akun <code>${p.real_id}</code>${digitLabel(p.real_id)} dari stok?\n<tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> ${p.phone}\n💰 ${formatRp(p.price)}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
              [{ text: '✅ Ya, Hapus', callback_data: `remove_stok_confirm_${pid}`, style: 'danger', icon_custom_emoji_id: '6039522349517115015' }],
              [{ text: '❌ Batal',     callback_data: 'admin_remove_stok', style: 'success', icon_custom_emoji_id: '6084880262179588505' }],
            ]}}
          );
        }
        if (action.startsWith('draft_view_'))          return showDraftDetail(ctx, action.replace('draft_view_', ''));
        if (action.startsWith('draft_spambot_appeal_')) return sendSpambotAppeal(ctx, action.replace('draft_spambot_appeal_', ''));
        if (action.startsWith('draft_spambot_'))        return startSpambotBanding(ctx, action.replace('draft_spambot_', ''));
        if (action.startsWith('draft_tool_refresh_')) {
          const id = action.replace('draft_tool_refresh_', '');
          await ctx.answerCbQuery().catch(() => {});
          const lm = await ctx.reply('🔄 Mengambil info...');
          const res = await draftToolConnect(id, async (client) => {
            const { Api } = require('telegram/tl');
            const me = await client.getMe();
            let pwdStatus = '-', devList = '';
            try {
              const pwd = await client.invoke(new Api.account.GetPassword());
              pwdStatus = pwd.hasPassword ? '✅ Aktif' : '❌ Tidak';
            } catch {}
            try {
              const auths = await client.invoke(new Api.account.GetAuthorizations());
              auths.authorizations.forEach((a,i) => { devList += `${i+1}. ${a.deviceModel||'-'} — ${a.country}\n`; });
            } catch {}
            return { me, pwdStatus, devList };
          });
          try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
          if (!res.ok) return ctx.reply(`❌ ${res.msg}`);
          const { me, pwdStatus, devList } = res.result;
          return ctx.reply(
            `🔐 <b>𝗜𝗡𝗙𝗢 𝗔𝗞𝗨𝗡 𝗗𝗥𝗔𝗙𝗧</b>\n${LINE}\n\n<blockquote>` +
            `👤 ${me.firstName||''} @${me.username||'-'}\n🔐 2FA: ${pwdStatus}\n\n📱 Device:\n${devList}</blockquote>`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'draft_view_' + id , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
          );
        }
        if (action.startsWith('draft_tool_otp_')) {
          const id = action.replace('draft_tool_otp_', '');
          await ctx.answerCbQuery().catch(() => {});
          const lm = await ctx.reply('🔍 Cek OTP...');
          const res = await draftToolConnect(id, async (client) => {
            for await (const msg of client.iterMessages(777000, { limit: 10 })) {
              const m = msg.text?.match(/\b(\d{5,6})\b/);
              if (m) return { code: m[1], time: msg.date ? new Date(msg.date*1000).toLocaleTimeString('id-ID') : '-' };
            }
            return null;
          });
          try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
          if (!res.ok) return ctx.reply(`❌ ${res.msg}`);
          return ctx.reply(res.result ? `🔑 <b>𝗢𝗧𝗣</b>: <code>${res.result.code}</code>\n⏰ ${res.result.time}` : '⚠️ OTP belum masuk.',
            { parse_mode: 'HTML' });
        }
        if (action.startsWith('draft_to_stok_')) {
          const id = action.replace('draft_to_stok_', '');
          await ctx.answerCbQuery().catch(() => {});
          const d = await draft_accounts.findOne({ _id: new mongoose.Types.ObjectId(id) });
          if (!d) return ctx.reply('❌ Tidak ditemukan.');
          await products.insertOne({
            real_id: d.real_id, phone: d.phone, price: d.price || 5000,
            category: d.category || 'no_limit', two_fa: d.two_fa || '',
            session_string: d.session_string, status: 'available', created_at: new Date(),
          });
          await draft_accounts.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
          return ctx.reply(`✅ Akun <code>${d.phone}</code> dipindah ke stok!`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '◀️ Database Akun', callback_data: 'admin_draft_db' , style: 'primary', icon_custom_emoji_id: '5472064286752775254' }]] }
          });
        }
        if (action.startsWith('draft_delete_')) {
          const id = action.replace('draft_delete_', '');
          await ctx.answerCbQuery().catch(() => {});
          await draft_accounts.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
          return ctx.reply('✅ Akun dihapus dari database.', {
            reply_markup: { inline_keyboard: [[{ text: '◀️ Database Akun', callback_data: 'admin_draft_db' , style: 'primary', icon_custom_emoji_id: '5472064286752775254' }]] }
          });
        }
        if (action === 'draft_add') {
          if (!isAdmin(ctx.from.id)) return;
          userSessions[ctx.from.id] = { step: 'draft_add_phone' };
          await ctx.answerCbQuery().catch(() => {});
          return ctx.reply(
            `➕ <b>Tambah Akun ke Database</b>\n\nMasukkan nomor HP akun (format: +62xxx):`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_draft_db' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
          );
        }
        if (action.startsWith('draft_view_'))          return showDraftDetail(ctx, action.replace('draft_view_', ''));
        if (action.startsWith('draft_spambot_appeal_')) return sendSpambotAppeal(ctx, action.replace('draft_spambot_appeal_', ''));
        if (action.startsWith('draft_spambot_'))        return startSpambotBanding(ctx, action.replace('draft_spambot_', ''));
        if (action.startsWith('draft_tool_refresh_')) {
          const id = action.replace('draft_tool_refresh_', '');
          await ctx.answerCbQuery().catch(() => {});
          const lm = await ctx.reply('🔄 Mengambil info...');
          const res = await draftToolConnect(id, async (client) => {
            const { Api } = require('telegram/tl');
            const me = await client.getMe();
            let pwdStatus = '-', devList = '';
            try { const pwd = await client.invoke(new Api.account.GetPassword()); pwdStatus = pwd.hasPassword ? '✅ Aktif' : '❌ Tidak'; } catch {}
            try { const auths = await client.invoke(new Api.account.GetAuthorizations()); auths.authorizations.forEach((a,i) => { devList += (i+1)+'. '+( a.deviceModel||'-')+' — '+a.country+'\n'; }); } catch {}
            return { me, pwdStatus, devList };
          });
          try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
          if (!res.ok) return ctx.reply('❌ ' + res.msg);
          const { me, pwdStatus, devList } = res.result;
          return ctx.reply(
            '🔐 <b>𝗜𝗡𝗙𝗢 𝗔𝗞𝗨𝗡 𝗗𝗥𝗔𝗙𝗧</b>\n'+LINE+'\n\n<blockquote>👤 '+(me.firstName||'')+' @'+(me.username||'-')+'\n🔐 2FA: '+pwdStatus+'\n\n📱 Device:\n'+devList+'</blockquote>',
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'draft_view_' + id , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
          );
        }
        if (action.startsWith('draft_tool_otp_')) {
          const id = action.replace('draft_tool_otp_', '');
          await ctx.answerCbQuery().catch(() => {});
          const lm = await ctx.reply('🔍 Cek OTP...');
          const res = await draftToolConnect(id, async (client) => {
            for await (const msg of client.iterMessages(777000, { limit: 10 })) {
              const m = msg.text?.match(/\b(\d{5,6})\b/);
              if (m) return { code: m[1], time: msg.date ? new Date(msg.date*1000).toLocaleTimeString('id-ID') : '-' };
            }
            return null;
          });
          try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
          if (!res.ok) return ctx.reply('❌ ' + res.msg);
          return ctx.reply(res.result ? '🔑 <b>𝗢𝗧𝗣</b>: <code>'+res.result.code+'</code>\n⏰ '+res.result.time : '⚠️ OTP belum masuk.', { parse_mode: 'HTML' });
        }
        if (action.startsWith('draft_to_stok_')) {
          const id = action.replace('draft_to_stok_', '');
          await ctx.answerCbQuery().catch(() => {});
          const d = await draft_accounts.findOne({ _id: new mongoose.Types.ObjectId(id) });
          if (!d) return ctx.reply('❌ Tidak ditemukan.');
          await products.insertOne({ real_id: d.real_id, phone: d.phone, price: d.price||5000, category: d.category||'no_limit', two_fa: d.two_fa||'', session_string: d.session_string, status: 'available', created_at: new Date() });
          await draft_accounts.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
          return ctx.reply('✅ Akun <code>'+d.phone+'</code> dipindah ke stok!', { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Database Akun', callback_data: 'admin_draft_db' , style: 'primary', icon_custom_emoji_id: '5472064286752775254' }]] }});
        }
        if (action.startsWith('draft_delete_')) {
          const id = action.replace('draft_delete_', '');
          await ctx.answerCbQuery().catch(() => {});
          await draft_accounts.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
          return ctx.reply('✅ Akun dihapus.', { reply_markup: { inline_keyboard: [[{ text: '◀️ Database Akun', callback_data: 'admin_draft_db' , style: 'primary', icon_custom_emoji_id: '5472064286752775254' }]] }});
        }
        if (action === 'draft_add') {
          if (!isAdmin(ctx.from.id)) return;
          userSessions[ctx.from.id] = { step: 'draft_add_phone' };
          await ctx.answerCbQuery().catch(() => {});
          return ctx.reply('➕ <b>Tambah Akun ke Database</b>\n\nMasukkan nomor HP akun (format: +62xxx):', { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_draft_db' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }});
        }

        if (action.startsWith('stortool_refresh_')) {
          const pid = action.replace('stortool_refresh_', '');
          await ctx.answerCbQuery('🔄 Loading...').catch(() => {});
          const lm = await ctx.reply('🔐 Mengambil info akun...');
          const res = await storToolConnect(pid, async (client) => {
            const { Api } = require('telegram/tl');
            const me = await client.getMe();
            let pwdStatus = '❌ Tidak Aktif', emailStatus = '-', devList = '';
            try {
              const pwd = await client.invoke(new Api.account.GetPassword());
              pwdStatus   = pwd.hasPassword ? '✅ Aktif' : '❌ Tidak Aktif';
              emailStatus = pwd.emailUnconfirmedPattern || pwd.loginEmailPattern || '-';
            } catch {}
            try {
              const auths = await client.invoke(new Api.account.GetAuthorizations());
              auths.authorizations.forEach((a, i) => {
                devList += `${i+1}. ${a.deviceModel||'-'}${a.current?' (AKTIF)':''} — ${a.country}\n`;
              });
            } catch {}
            return { me, pwdStatus, emailStatus, devList };
          });
          try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
          if (!res.ok) return ctx.reply(`❌ ${res.msg}`);
          const { me, pwdStatus, emailStatus, devList } = res.result;
          return ctx.reply(
            `🔐 <b>𝗜𝗡𝗙𝗢 𝗔𝗞𝗨𝗡 𝗦𝗘𝗧𝗢𝗥</b>\n${LINE}\n\n<blockquote>` +
            `👤 Nama   : ${me.firstName||''} ${me.lastName||''}\n` +
            `🏷️ User   : @${me.username||'-'}\n` +
            `🆔 ID     : <code>${me.id}</code>\n` +
            `🌟 Premium: ${me.premium?'✅':'❌'}\n\n` +
            `🔐 2FA    : ${pwdStatus}\n` +
            `📧 Email  : ${emailStatus}\n\n` +
            `📱 Device:\n${devList}</blockquote>`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'stor_pick_akun_' + pid , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
          );
        }
        if (action.startsWith('stortool_otp_')) {
          const pid = action.replace('stortool_otp_', '');
          await ctx.answerCbQuery().catch(() => {});
          const lm2 = await ctx.reply('🔍 Mengambil OTP...');
          const res = await storToolConnect(pid, async (client) => {
            for await (const msg of client.iterMessages(777000, { limit: 10 })) {
              const m = msg.text?.match(/\b(\d{5,6})\b/);
              if (m) return { code: m[1], time: msg.date ? new Date(msg.date * 1000).toLocaleTimeString('id-ID') : '-' };
            }
            return null;
          });
          try { await bot.telegram.deleteMessage(ctx.from.id, lm2.message_id); } catch {}
          if (!res.ok) return ctx.reply(`❌ ${res.msg}`);
          const otp2 = res.result;
          return ctx.reply(
            otp2
              ? `🔑 <b>𝗢𝗧𝗣 𝗧𝗘𝗥𝗕𝗔𝗥𝗨</b>\n\n<code>${otp2.code}</code>\n\n⏰ ${otp2.time}`
              : `⚠️ OTP belum masuk dari Telegram (777000).`,
            { parse_mode: 'HTML' }
          );
        }
        if (action.startsWith('stortool_kicklist_')) {
          const pid = action.replace('stortool_kicklist_', '');
          await ctx.answerCbQuery().catch(() => {});
          const lm = await ctx.reply('📱 Mengambil daftar device...');
          const res = await storToolConnect(pid, async (client) => {
            const { Api } = require('telegram/tl');
            const auths = await client.invoke(new Api.account.GetAuthorizations());
            return auths.authorizations;
          });
          try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
          if (!res.ok) return ctx.reply(`❌ ${res.msg}`);
          const all = res.result;
          if (!all.length) return ctx.reply('❌ Tidak ada device.');

          // Simpan device list ke session sementara untuk reference hash
          if (!global.storKickCache) global.storKickCache = {};
          global.storKickCache[ctx.from.id] = { pid, devices: all, ts: Date.now() };

          let msg = `📱 <b>𝗗𝗔𝗙𝗧𝗔𝗥 𝗗𝗘𝗩𝗜𝗖𝗘</b>
${LINE}

<blockquote>`;
          all.forEach((a, i) => {
            const curr = a.current ? ' ✅ (AKTIF)' : '';
            const tgl = a.dateActive ? new Date(a.dateActive * 1000).toLocaleDateString('id-ID') : '-';
            msg += `${i+1}.${curr}
  📱 ${a.deviceModel || '-'}
  💻 ${a.platform || '-'}
  📍 ${a.country || '-'}
  🕒 ${tgl}

`;
          });
          msg += '</blockquote>';

          // Tombol logout untuk device yang BUKAN current
          const rows = [];
          all.forEach((a, i) => {
            if (!a.current) {
              const label = `❌ ${i+1}. ${(a.deviceModel||'-').slice(0,20)} — ${a.country||'-'}`;
              rows.push([{ text: label, callback_data: `stortool_kick_${pid}_${i}` , style: 'danger', icon_custom_emoji_id: '5472291748220771063' }]);
            }
          });
          if (!rows.length) {
            msg += '\n⚠️ Tidak ada device lain (hanya device aktif saat ini).';
          }
          rows.push([{ text: '◀️ Kembali', callback_data: `stor_pick_akun_${pid}` , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]);
          return ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
        }
        if (action.startsWith('stortool_kick_')) {
          const parts = action.replace('stortool_kick_', '').split('_');
          const idx = parseInt(parts.pop()), pid = parts.join('_');
          await ctx.answerCbQuery().catch(() => {});
          // Ambil hash dari cache
          const cache = global.storKickCache?.[ctx.from.id];
          if (!cache || cache.pid !== pid) {
            return ctx.reply('❌ Session expired, tekan Logout Device lagi.');
          }
          const device = cache.devices[idx];
          if (!device) return ctx.reply('❌ Device tidak ditemukan.');
          // Konfirmasi dulu
          const devLabel = `${device.deviceModel || '-'} — ${device.country || '-'}`;
          return ctx.reply(
            `⚠️ <b>Konfirmasi Logout Device</b>

📱 ${devLabel}

Yakin logout device ini?`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
              [{ text: '✅ Ya, Logout', callback_data: `stortool_kick_confirm_${pid}_${idx}` , style: 'success', icon_custom_emoji_id: '5206607081334906820' }],
              [{ text: '❌ Batal',      callback_data: `stortool_kicklist_${pid}`             , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }],
            ]}}
          );
        }
        if (action.startsWith('stortool_kick_confirm_')) {
          const parts = action.replace('stortool_kick_confirm_', '').split('_');
          const idx = parseInt(parts.pop()), pid = parts.join('_');
          await ctx.answerCbQuery('❌ Logout device...').catch(() => {});
          const cache = global.storKickCache?.[ctx.from.id];
          if (!cache || cache.pid !== pid) return ctx.reply('❌ Session expired.');
          const device = cache.devices[idx];
          if (!device) return ctx.reply('❌ Device tidak ditemukan.');
          const lm = await ctx.reply(`⏳ Logout <b>${device.deviceModel || '-'}</b>...`, { parse_mode: 'HTML' });
          const res = await storToolConnect(pid, async (client) => {
            const { Api } = require('telegram/tl');
            await client.invoke(new Api.account.ResetAuthorization({ hash: device.hash }));
            return true;
          });
          try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
          if (!res.ok) return ctx.reply(`❌ Gagal: ${res.msg}`);
          // Hapus dari cache dan refresh list
          delete global.storKickCache[ctx.from.id];
          await ctx.reply(`✅ <b>Device berhasil dilogout!</b>
📱 ${device.deviceModel || '-'} — ${device.country || '-'}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
              [{ text: '🔄 Lihat Device Lagi', callback_data: `stortool_kicklist_${pid}` , style: 'primary', icon_custom_emoji_id: '6035353718684129368' }],
              [{ text: '◀️ Kembali ke Akun',   callback_data: `stor_pick_akun_${pid}`    , style: 'primary', icon_custom_emoji_id: '5472064286752775254' }],
            ]}}
          );
        }

        if (action.startsWith('stor_logout_'))       return handleStorLogout(ctx, action.replace('stor_logout_', ''));
        if (action.startsWith('stor_editprice_')) return startEditPrice(ctx, action.replace('stor_editprice_', ''));
        if (action === 'stor_pick_surel')         return handleStorSettingSurel(ctx);
        if (action.startsWith('stor_2fa_pick_')) {
          const pid = action.replace('stor_2fa_pick_', '');
          await ctx.answerCbQuery('⏳ Menghubungkan ke akun...').catch(() => {});
          const product = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
          if (!product) return ctx.answerCbQuery('❌ Produk tidak ditemukan!', { show_alert: true });
          if (!product.session_string) return bot.telegram.sendMessage(ctx.from.id, '❌ Akun ini tidak punya session string.');
          try { await ctx.deleteMessage(); } catch {}
          const lm = await bot.telegram.sendMessage(ctx.from.id, '🔌 Menghubungkan ke akun...');
          try {
            const client = new TelegramClient(new StringSession(product.session_string), API_ID, API_HASH, { connectionRetries: 5 });
            await client.connect();
            storSessions[ctx.from.id] = { step: 'stor_change_2fa_old', productId: pid, _client: client, old2fa: product.two_fa || '' };
            await bot.telegram.editMessageText(ctx.from.id, lm.message_id, undefined,
              `🔐 <b>Ubah 2FA</b>\n📱 ${product.phone}\n\nMasukkan password 2FA <b>𝗦𝗔𝗔𝗧 𝗜𝗡𝗜</b>:\n(ketik <code>-</code> jika belum punya 2FA)`,
              { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_stor_setting' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
            );
          } catch (e) {
            await bot.telegram.editMessageText(ctx.from.id, lm.message_id, undefined,
              `❌ Gagal connect ke akun: ${e.message?.slice(0,100)}`);
          }
          return;
        }
        if (action.startsWith('stor_surel_pick_')) {
          const pid = action.replace('stor_surel_pick_', '');
          await ctx.answerCbQuery('⏳ Menghubungkan ke akun...').catch(() => {});
          const product = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
          if (!product) return ctx.answerCbQuery('❌ Produk tidak ditemukan!', { show_alert: true });
          if (!product.session_string) return bot.telegram.sendMessage(ctx.from.id, '❌ Akun ini tidak punya session string.');
          try { await ctx.deleteMessage(); } catch {}
          const lm2 = await bot.telegram.sendMessage(ctx.from.id, '🔌 Menghubungkan ke akun...');
          try {
            const client = new TelegramClient(new StringSession(product.session_string), API_ID, API_HASH, { connectionRetries: 5 });
            await client.connect();
            storSessions[ctx.from.id] = { step: 'stor_change_surel_new', productId: pid, _client: client, two_fa: product.two_fa || '' };
            await bot.telegram.editMessageText(ctx.from.id, lm2.message_id, undefined,
              `📧 <b>Ubah Surel/Email</b>\n📱 ${product.phone}\n\nMasukkan <b>email baru</b> yang mau dipakai:`,
              { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_stor_setting' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
            );
          } catch (e) {
            await bot.telegram.editMessageText(ctx.from.id, lm2.message_id, undefined,
              `❌ Gagal connect ke akun: ${e.message?.slice(0,100)}`);
          }
          return;
        }
        if (action.startsWith('confirmscriptqris_')) return handleConfirmScriptQris(ctx, action.replace('confirmscriptqris_', ''));
        if (action.startsWith('rejectscriptqris_'))  return handleRejectScriptQris(ctx, action.replace('rejectscriptqris_', ''));
        if (action.startsWith('delscript_'))      return handleDelScript(ctx, action.replace('delscript_', ''));
        // ── GIFT ──
        }
        if (action.startsWith('tools_use_sess_'))  return handleToolsUseSession(ctx, action.replace('tools_use_sess_', ''));        if (action.startsWith('tools_kick_confirm_')) return handleToolsKickDeviceConfirm(ctx, action.replace('tools_kick_confirm_', ''));
        if (action.startsWith('tools_kick_'))          return handleToolsKickDevice(ctx, action.replace('tools_kick_', ''));
        if (action === 'tools_kickall')            return handleToolsKickAll(ctx);
        if (action === 'tools_otp')                return handleToolsOtp(ctx);
        if (action === 'tools_refresh')            return handleToolsRefresh(ctx);
        if (action === 'tools_logout')             return handleToolsLogout(ctx);
        if (action === 'tools_change_pwd') {
          const ts = toolsSessions[ctx.from.id];
          if (!ts?.client) return ctx.answerCbQuery('❌ Tidak ada sesi aktif.', { show_alert: true });
          await ctx.answerCbQuery().catch(() => {});
          try {
            const { Api } = require('telegram/tl');
            const pwdInfo = await ts.client.invoke(new Api.account.GetPassword());
            if (!pwdInfo.hasPassword) {
              userSessions[ctx.from.id] = { step: 'tools_set_pwd_new' };
              return bot.telegram.sendMessage(ctx.from.id,
                `⚠️ Akun ini belum punya 2FA.\n\n🔐 Masukkan password 2FA <b>𝗕𝗔𝗥𝗨</b> yang ingin diset:`,
                { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'tools_refresh' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
              );
            }
            ts.oldPwd = '';
            userSessions[ctx.from.id] = { step: 'tools_change_pwd_old' };
            return bot.telegram.sendMessage(ctx.from.id,
              `🔐 <b>Ubah Password 2FA</b>\n\nMasukkan password 2FA <b>𝗦𝗔𝗔𝗧 𝗜𝗡𝗜</b> untuk verifikasi:`,
              { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'tools_refresh' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
            );
          } catch (e) { return ctx.answerCbQuery(`❌ ${e.message?.slice(0,60)}`, { show_alert: true }); }
        }
        if (action === 'tools_change_email') {
          const ts = toolsSessions[ctx.from.id];
          if (!ts?.client) return ctx.answerCbQuery('❌ Tidak ada sesi aktif.', { show_alert: true });
          await ctx.answerCbQuery().catch(() => {});
          try {
            const { Api } = require('telegram/tl');
            const pwdInfo = await ts.client.invoke(new Api.account.GetPassword());
            ts.twoFa = pwdInfo.hasPassword ? (ts.twoFa || '') : '';
            // Kalau ada 2FA dan twoFa belum di-cache, minta password dulu
            if (pwdInfo.hasPassword && !ts.twoFaPre) {
              userSessions[ctx.from.id] = { step: 'tools_email_pwd_verify' };
              return bot.telegram.sendMessage(ctx.from.id,
                `📧 <b>Ubah Email Recovery</b>\n\nAkun ini punya 2FA.\nMasukkan password 2FA untuk verifikasi:`,
                { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'tools_refresh' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
              );
            }
            userSessions[ctx.from.id] = { step: 'tools_change_email' };
            return bot.telegram.sendMessage(ctx.from.id,
              `📧 <b>Ubah Email Recovery</b>\n\nMasukkan <b>email baru</b> yang mau dipakai:`,
              { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'tools_refresh' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
            );
          } catch (e) { return ctx.answerCbQuery(`❌ ${e.message?.slice(0,60)}`, { show_alert: true }); }
        }
        if (action === 'tools_email_menu') {
          const ts = toolsSessions[ctx.from.id];
          if (!ts?.client) return ctx.answerCbQuery('❌ Tidak ada sesi aktif.', { show_alert: true });
          await ctx.answerCbQuery().catch(() => {});
          await bot.telegram.sendMessage(ctx.from.id,
            `📧 <b>𝗠𝗔𝗡𝗔𝗝𝗘𝗠𝗘𝗡 𝗘𝗠𝗔𝗜𝗟 𝗥𝗘𝗖𝗢𝗩𝗘𝗥𝗬</b>\n${LINE}\n\nPilih opsi:`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
              [{ text: '➕ Set Email Baru',    callback_data: 'tools_set_email'    , style: 'success', icon_custom_emoji_id: '6032733629719777782' }],
              [{ text: '🔄 Update Email',      callback_data: 'tools_change_email' , style: 'success', icon_custom_emoji_id: '6035353718684129368' }],
              [{ text: '🗑️ Hapus Email',       callback_data: 'tools_remove_email' , style: 'danger', icon_custom_emoji_id: '5472291748220771063' }],
              [{ text: '⬅️ Kembali',           callback_data: 'tools_refresh'     , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
            ]}}
          );
          return;
        }
        if (action === 'tools_set_email') {
          const ts = toolsSessions[ctx.from.id];
          if (!ts?.client) return ctx.answerCbQuery('❌ Tidak ada sesi.', { show_alert: true });
          await ctx.answerCbQuery().catch(() => {});
          userSessions[ctx.from.id] = { step: 'tools_change_email' };
          return bot.telegram.sendMessage(ctx.from.id,
            `📧 <b>Set Email Recovery</b>\n\nMasukkan email baru:`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'tools_email_menu' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
          );
        }
        if (action === 'tools_remove_email') {
          const ts = toolsSessions[ctx.from.id];
          if (!ts?.client) return ctx.answerCbQuery('❌ Tidak ada sesi.', { show_alert: true });
          await ctx.answerCbQuery('🗑️ Menghapus email...').catch(() => {});
          try {
            const { Api } = require('telegram/tl');
            const { computeCheck } = require('telegram/Password');
            const pwdInfo = await ts.client.invoke(new Api.account.GetPassword());
            const oldCheck = pwdInfo.hasPassword
              ? await computeCheck(pwdInfo, ts.twoFa || '')
              : new Api.InputCheckPasswordEmpty();
            await ts.client.invoke(new Api.account.UpdatePasswordSettings({
              password: oldCheck,
              newSettings: new Api.account.PasswordInputSettings({
                newAlgo: new Api.PasswordKdfAlgoUnknown(),
                newPasswordHash: Buffer.from([]),
                hint: '',
                email: '',
              })
            }));
            ctx.answerCbQuery('✅ Email dihapus!', { show_alert: true });
            showToolsMain(ctx.from.id);
          } catch (e) { ctx.answerCbQuery(`❌ ${e.message?.slice(0,60)}`, { show_alert: true }); }
          return;
        }
        if (action === 'tools_delete_acc') {
          const ts = toolsSessions[ctx.from.id];
          if (!ts?.client) return ctx.answerCbQuery('❌ Tidak ada sesi.', { show_alert: true });
          await ctx.answerCbQuery().catch(() => {});
          return bot.telegram.sendMessage(ctx.from.id,
            `⚠️ <b>𝗛𝗔𝗣𝗨𝗦 𝗔𝗞𝗨𝗡 𝗧𝗘𝗟𝗘𝗚𝗥𝗔𝗠</b>\n\n🚨 <b>𝗧𝗜𝗡𝗗𝗔𝗞𝗔𝗡 𝗜𝗡𝗜 𝗣𝗘𝗥𝗠𝗔𝗡𝗘𝗡!</b>\nAkun akan dihapus dan tidak bisa dikembalikan.\n\nYakin?`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
              [{ text: '🗑️ YA, HAPUS AKUN', callback_data: 'tools_delete_acc_confirm' , style: 'danger', icon_custom_emoji_id: '5472291748220771063' }],
              [{ text: '❌ Batal',            callback_data: 'tools_refresh'            , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }],
            ]}}
          );
        }
        if (action === 'tools_delete_acc_confirm') {
          const ts = toolsSessions[ctx.from.id];
          if (!ts?.client) return ctx.answerCbQuery('❌ Tidak ada sesi.', { show_alert: true });
          await ctx.answerCbQuery('🗑️ Menghapus akun...').catch(() => {});
          try {
            const { Api } = require('telegram/tl');
            await ts.client.invoke(new Api.account.DeleteAccount({ reason: 'Deleted by user' }));
            delete toolsSessions[ctx.from.id];
            ctx.reply('✅ Akun berhasil dihapus.', { reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'admin_stor_setting' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }});
          } catch (e) { ctx.reply(`❌ Gagal hapus akun: ${e.message?.slice(0,80)}`); }
          return;
        }
        if (action === 'tools_email_menu') {
          const ts2 = toolsSessions[ctx.from.id];
          if (!ts2?.client) return ctx.answerCbQuery('❌ Tidak ada sesi aktif.', { show_alert: true });
          await ctx.answerCbQuery().catch(() => {});
          await bot.telegram.sendMessage(ctx.from.id,
            `📧 <b>𝗠𝗔𝗡𝗔𝗝𝗘𝗠𝗘𝗡 𝗘𝗠𝗔𝗜𝗟 𝗥𝗘𝗖𝗢𝗩𝗘𝗥𝗬</b>\n${LINE}\n\nPilih opsi:`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
              [{ text: '➕ Set / Update Email', callback_data: 'tools_change_email' , style: 'success', icon_custom_emoji_id: '6032733629719777782' }],
              [{ text: '🗑️ Hapus Email',        callback_data: 'tools_remove_email' , style: 'danger', icon_custom_emoji_id: '5472291748220771063' }],
              [{ text: '⬅️ Kembali',             callback_data: 'tools_refresh'      , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
            ]}}
          );
          return;
        }
        if (action === 'tools_remove_email') {
          const ts2 = toolsSessions[ctx.from.id];
          if (!ts2?.client) return ctx.answerCbQuery('❌ Tidak ada sesi.', { show_alert: true });
          await ctx.answerCbQuery('🗑️ Menghapus email...').catch(() => {});
          try {
            const { Api: Api2 } = require('telegram/tl');
            const { computeCheck: cc2 } = require('telegram/Password');
            const pi2 = await ts2.client.invoke(new Api2.account.GetPassword());
            const oc2 = pi2.hasPassword ? await cc2(pi2, ts2.twoFa||'') : new Api2.InputCheckPasswordEmpty();
            await ts2.client.invoke(new Api2.account.UpdatePasswordSettings({
              password: oc2,
              newSettings: new Api2.account.PasswordInputSettings({ newAlgo: new Api2.PasswordKdfAlgoUnknown(), newPasswordHash: Buffer.from([]), hint: '', email: '' })
            }));
            ctx.answerCbQuery('✅ Email dihapus!', { show_alert: true });
            showToolsMain(ctx.from.id);
          } catch (e) { ctx.answerCbQuery(`❌ ${e.message?.slice(0,60)}`, { show_alert: true }); }
          return;
        }
        if (action === 'tools_delete_acc') {
          const ts2 = toolsSessions[ctx.from.id];
          if (!ts2?.client) return ctx.answerCbQuery('❌ Tidak ada sesi.', { show_alert: true });
          await ctx.answerCbQuery().catch(() => {});
          return bot.telegram.sendMessage(ctx.from.id,
            `⚠️ <b>𝗛𝗔𝗣𝗨𝗦 𝗔𝗞𝗨𝗡 𝗧𝗘𝗟𝗘𝗚𝗥𝗔𝗠</b>\n\n🚨 𝗧𝗜𝗡𝗗𝗔𝗞𝗔𝗡 𝗜𝗡𝗜 𝗣𝗘𝗥𝗠𝗔𝗡𝗘𝗡!\nAkun akan dihapus dan tidak bisa dikembalikan.\n\nYakin?`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
              [{ text: '🗑️ YA, HAPUS AKUN', callback_data: 'tools_delete_acc_confirm' , style: 'danger', icon_custom_emoji_id: '5472291748220771063' }],
              [{ text: '❌ Batal',            callback_data: 'tools_refresh'            , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }],
            ]}}
          );
        }
        if (action === 'tools_delete_acc_confirm') {
          const ts2 = toolsSessions[ctx.from.id];
          if (!ts2?.client) return ctx.answerCbQuery('❌ Tidak ada sesi.', { show_alert: true });
          await ctx.answerCbQuery('🗑️ Menghapus akun...').catch(() => {});
          try {
            const { Api: Api2 } = require('telegram/tl');
            await ts2.client.invoke(new Api2.account.DeleteAccount({ reason: 'Deleted by user' }));
            delete toolsSessions[ctx.from.id];
            ctx.reply('✅ Akun berhasil dihapus.', { reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'admin_stor_setting' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }});
          } catch (e) { ctx.reply(`❌ Gagal hapus akun: ${e.message?.slice(0,80)}`); }
          return;
        }

        if (action === 'tools_kicklist') {
          const ts = toolsSessions[ctx.from.id];
          if (!ts?.client) return ctx.answerCbQuery('❌ Tidak ada sesi aktif.', { show_alert: true });
          await ctx.answerCbQuery().catch(() => {});
          const lm = await ctx.reply('📱 Mengambil daftar device...');
          try {
            const { Api } = require('telegram/tl');
            const auths = await ts.client.invoke(new Api.account.GetAuthorizations());
            const all   = auths.authorizations;
            try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}

            // Simpan ke cache
            if (!global.toolsKickCache) global.toolsKickCache = {};
            global.toolsKickCache[ctx.from.id] = { devices: all, ts: Date.now() };

            let msg = `📱 <b>𝗗𝗔𝗙𝗧𝗔𝗥 𝗗𝗘𝗩𝗜𝗖𝗘</b>
${LINE}

<blockquote>`;
            all.forEach((a, i) => {
              const curr = a.current ? ' ✅ (AKTIF)' : '';
              const tgl  = a.dateActive ? new Date(a.dateActive * 1000).toLocaleDateString('id-ID') : '-';
              msg += `${i+1}.${curr}
  📱 ${a.deviceModel||'-'}
  💻 ${a.platform||'-'}
  📍 ${a.country||'-'}
  🕒 ${tgl}

`;
            });
            msg += '</blockquote>';

            const rows = [];
            all.forEach((a, i) => {
              if (!a.current) {
                rows.push([{ text: `❌ ${i+1}. ${(a.deviceModel||'-').slice(0,20)} — ${a.country||'-'}`, callback_data: `tools_kick_${i}` , style: 'danger', icon_custom_emoji_id: '5382355635553739365' }]);
              }
            });
            if (!rows.length) msg += '\n⚠️ Tidak ada device lain selain yang aktif.';
            rows.push([{ text: '◀️ Kembali', callback_data: 'tools_refresh' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]);
            await bot.telegram.sendMessage(ctx.from.id, msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
          } catch (e) {
            try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
            ctx.reply(`❌ ${e.message?.slice(0,80)}`);
          }
          return;
        }
        if (action.startsWith('gcat_'))           return showGiftItems(ctx, action.replace('gcat_', ''));
        if (action.startsWith('gitem_'))          return showGiftTarget(ctx, action.replace('gitem_', ''));
        if (action.startsWith('gpaysaldo_'))      return processGiftSaldo(ctx, action.replace('gpaysaldo_', ''));
        if (action.startsWith('gpayqris_'))       return processGiftQris(ctx, action.replace('gpayqris_', ''));
        if (action.startsWith('giftacc_'))        return handleGiftAcc(ctx, action.replace('giftacc_', ''));
        if (action.startsWith('giftreject_'))     return handleGiftReject(ctx, action.replace('giftreject_', ''));
        if (action === 'gift_pending_list')       return showGiftPending(ctx);
        if (action === 'gift_login_status')       return showGiftLoginStatus(ctx);
        if (action === 'gift_do_login')           return startGiftLogin(ctx);
        // ── GIFT ADMIN ──
        if (action === 'gift_owner_menu')         return showGiftOwnerMenu(ctx);
        if (action === 'gift_toggle_all')         return handleGiftToggleAll(ctx);
        if (action.startsWith('gtoggle_'))        return handleGiftToggleCat(ctx, action.replace('gtoggle_', ''));
        if (action.startsWith('gsetprice_cat_'))  return handleGiftSetPriceCat(ctx, action.replace('gsetprice_cat_', ''));
        if (action.startsWith('gsetprice_item_')) return handleGiftSetPriceItem(ctx, action.replace('gsetprice_item_', ''));
        if (action.startsWith('gresetprice_'))    return handleGiftResetPrice(ctx, action.replace('gresetprice_', ''));
        // ── BELI NOKTEL QRIS ──
        if (action.startsWith('buywithqris_'))    return handleBuyWithQris(ctx, action.replace('buywithqris_', ''));
        // ── SUBDOMAIN ──
        if (action.startsWith('autocfg:'))        return handleAutoCfg(ctx, action);
        if (action === 'depo_custom')           return handleDepoCustom(ctx);
        if (action.startsWith('deposelect_'))   return handleDepoSelect(ctx, parseInt(action.replace('deposelect_', '')));
  } catch (err) {
    console.error('Callback error:', err);
    await ctx.reply(`❌ Terjadi kesalahan. Coba lagi.`).catch(() => {});
  }
});

// ══════════════════════════════════════════
//  SHOP
// ══════════════════════════════════════════


// ══════════════════════════════════════════════════════════
//  TOKO NOKTEL — Shop / Buy / Stock
// ══════════════════════════════════════════════════════════

async function showShop(ctx) {
  // Hitung stok per kategori
  const { stock } = await getStockData();

  // Hitung stok per prefix digit pertama ID
  const allAvail = await products.find({ status: 'available' }, { projection: { real_id: 1 } }).toArray();
  const prefixMap = {};
  for (const p of allAvail) {
    const id = String(p.real_id || '');
    if (!id) continue;
    const prefix = id[0]; // digit pertama
    prefixMap[prefix] = (prefixMap[prefix] || 0) + 1;
  }

  // Button per prefix ID (digit pertama real_id) — spasi bukan underscore
  const sortedPrefixes = Object.keys(prefixMap).sort();
  const prefixRows = [];
  let row = [];
  for (const prefix of sortedPrefixes) {
    row.push({
      text: `ID ${prefix} (${prefixMap[prefix]})`,
      callback_data: `cat_prefix_${prefix}`,
    style: 'primary', icon_custom_emoji_id: '6028497653799588476' });
    if (row.length === 3) { prefixRows.push(row); row = []; }
  }
  if (row.length) prefixRows.push(row);

  const totalAll = allAvail.length;
  const buttons = [
    ...(prefixRows.length ? prefixRows : [[{ text: 'Stok Kosong', callback_data: 'noop', style: 'danger', icon_custom_emoji_id: '5420323339723881652' }]]),
    [{ text: 'Kembali', callback_data: 'menu_noktel', style: 'success', icon_custom_emoji_id: '5258236805890710909' }],
  ];

  await editOrReply(ctx,
    `<tg-emoji emoji-id="5985472565508838112">🎁</tg-emoji> <b>𝗣𝗜𝗟𝗜𝗛 𝗔𝗞𝗨𝗡</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<blockquote>Silahkan anda pilih stock akun kami yang tersedia pada katalog di bawah anda\nTotal stok: <b>${totalAll} akun</b>\nSelamat berbelanja di toko noktel kami yaa <tg-emoji emoji-id="5417876320761696693">✈</tg-emoji></blockquote>`,
    { reply_markup: { inline_keyboard: buttons, style: 'primary', icon_custom_emoji_id: '5330237710655306682' } }
  );
}

// ══════════════════════════════════════════
//  BORONGAN
// ══════════════════════════════════════════
async function showBorongan(ctx) {
    await editOrReply(ctx,
    `<tg-emoji emoji-id="5258024802010026053">🛒</tg-emoji> <b>𝗕𝗘𝗟𝗜 𝗕𝗢𝗥𝗢𝗡𝗚𝗔𝗡</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<blockquote>Halo kak Untuk pembelian akun dalam jumlah besar / borongan kami belum bisa manual nih kak silahkan hubungi owner langsung ya kak.</blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: 'Chat Owner', url: `https://t.me/${DEV_NAME.replace('@', '')}`, style: 'primary', icon_custom_emoji_id: '5870692618244984670' }],
        [{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909' }],
      ]},
    }
  );
}

// ══════════════════════════════════════════
//  STOK
// ══════════════════════════════════════════
async function showStock(ctx) {
  const { stock, total } = await getStockData();
  const cats = [
    { name: '<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> No Limit - INDO',   val: stock.no_limit      },
    { name: '<tg-emoji emoji-id="5879585266426973039">🌐</tg-emoji> Other Country',      val: stock.other_country },
    { name: '<tg-emoji emoji-id="6008118472066732010">🔥</tg-emoji> Repe - Mixed',        val: stock.repe          },
    { name: '<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> Spam/Limit - INDO',  val: stock.spam_limit    },
    { name: '<tg-emoji emoji-id="6028530359975548369">💎</tg-emoji> 9 Digit',            val: stock.nine_digit    },
    { name: '⚠️ Tag Scam - INDO',                                                        val: stock.tag_scam      },
    { name: '🚫 Tag Fake - INDO',                                                        val: stock.tag_fake      },
  ];
  let msg = `<tg-emoji emoji-id="5931472654660800739">📊</tg-emoji> <b>𝗖𝗘𝗞 𝗦𝗧𝗢𝗞 𝗥𝗘𝗔𝗗𝗬</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n<blockquote>`;
  msg += `<tg-emoji emoji-id="5258024802010026053">🛒</tg-emoji> Total Tersedia: <b>${total} Akun</b>\n${LINE}\n\n`;
  for (const c of cats) {
    msg += `${c.name}\n  ${c.val > 0 ? `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>${c.val} Akun Ready</b>` : `<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> <b>Habis</b>`}\n\n`;
  }
  msg += `<tg-emoji emoji-id="5368295871131695793">⏰</tg-emoji> Update: <b>${getUptime()} uptime</b></blockquote>`;
  await ctx.reply(msg, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [
      [{ text: 'Refresh', callback_data: 'stock', style: 'danger', icon_custom_emoji_id: '5213452215527677338' }],
      [{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '6039539366177541657'  }],
    ]},
  });
}

// ══════════════════════════════════════════
//  STATISTIK
// ══════════════════════════════════════════
async function showStatistik(ctx) {
  const totalUser    = await users.countDocuments();
  const totalProduct = await products.countDocuments();
  const totalSold    = await products.countDocuments({ status: 'sold' });
  const rev = await products.aggregate([
    { $match: { status: 'sold' } }, { $group: { _id: null, total: { $sum: '$price' } } },
  ]).toArray();
  await editOrReply(ctx,
    `<tg-emoji emoji-id="5956148757899776734">⭐️</tg-emoji> <b>Statistik Bot</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<blockquote>` +
    `<tg-emoji emoji-id="5258362837411045098">👤</tg-emoji> Total User    : <b>${totalUser}</b>\n` +
    `<tg-emoji emoji-id="5985472565508838112">🎁</tg-emoji> Total Produk  : <b>${totalProduct}</b>\n` +
    `<tg-emoji emoji-id="5258024802010026053">🛒</tg-emoji> Total Terjual : <b>${totalSold}</b>\n` +
    `<tg-emoji emoji-id="5267484570558684122">📈</tg-emoji> Revenue       : <b>${formatRp(rev[0]?.total || 0)}</b>\n` +
    `<tg-emoji emoji-id="6044169027390017839">⏰</tg-emoji> Uptime        : <b>${getUptime()}</b>` +
    `</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] } }
  );
}

// ══════════════════════════════════════════
//  HISTORY / CEK TRANSAKSI
// ══════════════════════════════════════════
async function showHistory(ctx) {
  const list = await products.find({ buyer_id: ctx.from.id }).sort({ sold_at: -1 }).toArray();
  if (!list.length) {
    return ctx.reply(
      `<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> <b>𝗥𝗜𝗪𝗔𝗬𝗔𝗧 𝗞𝗢𝗦𝗢𝗡𝗚</b>\n${LINE}\n<blockquote>Kamu belum pernah beli akun di sini.</blockquote>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] } }
    );
  }
  const buttons = list.slice(0, 10).map(o => {
    const icon = o.status === 'finished' ? '<tg-emoji emoji-id="5879895758202735862">🔒</tg-emoji>' : '<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji>';
    return [{ text: `${icon} ${detectCountry(o.phone || '')} — ${(o.phone || '').replace('+', '')}`, callback_data: `opentx_${o._id}` , style: 'primary' }];
  });
  buttons.push([{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]);
  const total = list.reduce((s, o) => s + o.price, 0);
  await editOrReply(ctx,
    `<tg-emoji emoji-id="5346077597287589711">📝</tg-emoji> <b>Riwayat Transaksi</b>\n${LINE}\n\n` +
    `<blockquote><tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Total: <b>${list.length} transaksi</b>\n<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Spent: <b>${formatRp(total)}</b>\nPilih untuk lihat detail</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } }
  );
}

async function handleOpenTx(ctx, pid) {
  try { await ctx.deleteMessage(); } catch {}
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
  if (!product) return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Transaksi tidak ditemukan.');
  if (product.buyer_id !== ctx.from.id) return ctx.answerCbQuery('❌ Bukan milik kamu.', { show_alert: true });

  const has2fa = product.two_fa && product.two_fa.trim() !== '';
  const isDone = product.status === 'finished';

  const buttons = isDone ? [
    [{ text: 'Belanja Lagi', callback_data: 'shop', style: 'success', icon_custom_emoji_id: '5472367477084134145' }],
  ] : [
    [{ text: 'MINTA OTP', callback_data: `otp_${pid}`, style: 'primary', icon_custom_emoji_id: '5877318502947229960' }],
    ...(has2fa ? [[{ text: 'LIHAT PASSWORD 2FA', callback_data: `fa2_${pid}`, style: 'success', icon_custom_emoji_id: '6005570495603282482' }]] : []),
    [{ text: 'LOGOUT AKUN', callback_data: `logout_${pid}`, style: 'danger', icon_custom_emoji_id: '6043947089249964579' }],
  ];

  await editOrReply(ctx, `<tg-emoji emoji-id="5258500400918587241">📝</tg-emoji> <b>𝗗𝗘𝗧𝗔𝗜𝗟 𝗧𝗥𝗔𝗡𝗦𝗔𝗞𝗦𝗜</b>\n${LINE}\n\n` +
    `<blockquote>` +
    `<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> ID      : <code>${product.real_id}</code><b>${digitLabel(product.real_id)}</b>\n` +
    `<tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> No      : <code>${product.phone}</code>\n` +
    `<tg-emoji emoji-id="5879585266426973039">🌐</tg-emoji> Negara  : ${detectCountry(product.phone || '')}\n` +
    (has2fa ? `<tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> 2FA     : <code>${product.two_fa}</code>\n` : '') +
    `<tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> Harga   : ${formatRp(product.price)}\n` +
    `<tg-emoji emoji-id="5258105663359294787">🗓</tg-emoji> Tanggal : ${formatWIB(product.sold_at)}\n` +
    `${LINE}\n` +
    (isDone ? `<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> <b>Status : Sudah Logout</b>` : `<tg-emoji emoji-id="5967816500415827773">💻</tg-emoji> <b>Aktif — (Bot) Jakarta</b>`) +
    `</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } }
  );
}

// ══════════════════════════════════════════
//  PROFIL
// ══════════════════════════════════════════
async function showProfile(ctx) {
  const u = await getUser(ctx.from.id);
  const totalOrder = await products.countDocuments({ buyer_id: ctx.from.id });
  const status = isAdmin(ctx.from.id) ? '👑 ADMIN' : '🔷 Member';
  await editOrReply(ctx,
    `━━ <tg-emoji emoji-id="6044013678422921867">👤</tg-emoji> <b>Profile user</b> <tg-emoji emoji-id="6044013678422921867">👤</tg-emoji> ━━` +
    `<blockquote>` +
    `<tg-emoji emoji-id="6068610874522735901">⭐</tg-emoji> User ID  : <code>${ctx.from.id}</code>\n` +
    `<tg-emoji emoji-id="5447410659077661506">🌐</tg-emoji> Nama     : <b>${ctx.from.first_name}</b>\n` +
    `<tg-emoji emoji-id="5427168083074628963">💎</tg-emoji> Saldo    : <b>${formatRp(u.balance)}</b>\n` +
    `<tg-emoji emoji-id="5382164415019768638">🪙</tg-emoji> Spent    : <b>${formatRp(u.total_spent || 0)}</b>\n` +
    `<tg-emoji emoji-id="5377660214096974712">🛍</tg-emoji> Order    : <b>${totalOrder}x</b>\n` +
    `<tg-emoji emoji-id="5413879192267805083">🗓</tg-emoji> Join     : <b>${formatWIB(u.created_at)}</b>` +
    `</blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: 'Top Up Saldo',  callback_data: 'deposit', style: 'primary', icon_custom_emoji_id: '5258204546391351475' }],
        [{ text: 'Lihat Mutasi',  callback_data: 'mutasi', style: 'danger', icon_custom_emoji_id: '5444856076954520455'  }],
        [{ text: 'Kembali',       callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909'   }],
      ]},
    }
  );
}

// ══════════════════════════════════════════
//  DEPOSIT
// ══════════════════════════════════════════


// ══════════════════════════════════════════════════════════
//  DEPOSIT & SALDO
// ══════════════════════════════════════════════════════════

async function showDeposit(ctx) {
  const enabled = await getSetting('deposit_enabled');
  if (enabled !== '1') return ctx.answerCbQuery('❌ Deposit sedang dinonaktifkan!', { show_alert: true });
  const minDep = await getSetting('deposit_min') || 10000;
  const qrisName = await getSetting('qris_name') || 'QRIS - Lelen';

  const depoMenu = {
    inline_keyboard: [
      [{ text: 'Input Nominal Bebas', callback_data: 'depo_custom', style: 'danger', icon_custom_emoji_id: '5879841310902324730' }],
      [
        { text: 'Rp 10.000',  callback_data: 'deposelect_10000', style: 'primary' , icon_custom_emoji_id: '6030805455691846426' },
        { text: 'Rp 25.000',  callback_data: 'deposelect_25000', style: 'primary'  , icon_custom_emoji_id: '6030805455691846426' },
      ],
      [
        { text: 'Rp 50.000',  callback_data: 'deposelect_50000', style: 'success' , icon_custom_emoji_id: '6030805455691846426' },
        { text: 'Rp 100.000', callback_data: 'deposelect_100000', style: 'success' , icon_custom_emoji_id: '6030805455691846426' },
      ],
      [{ text: 'Batal', callback_data: 'home', style: 'danger', icon_custom_emoji_id: '5260293700088511294' }],
    ],
  };

  await editOrReply(ctx, `<tg-emoji emoji-id="5438496463044752972">⭐</tg-emoji> <b>Topup Saldo</b>\n━━━━━━━━━━━━━━━━━━━\n\n` +
    `<blockquote>` +
    `Saran : silahkan anda Topup saldo terlebih dahulu agar saat melakukan pembayaran lebih cepat dan tidak perlu generate Qr baru setiap order.\n\n` +
    `<tg-emoji emoji-id="5317013291602553603">💵</tg-emoji> Minimal  : ${formatRp(parseInt(minDep))}\n` +
    `<tg-emoji emoji-id="5258024802010026053">🛒</tg-emoji> Metode   : <b>Qris Otomatis</b>\n` +
    `<tg-emoji emoji-id="5269402556924180806">🤝</tg-emoji> Pilih nominal TopUp :</blockquote>`,
    { parse_mode: 'HTML', reply_markup: depoMenu }
  );
}

async function sendPayInvoice(ctx, userId, amount) {
  // Satu-satunya metode: NercPay QRIS (otomatis)
  return sendPayInvoiceNercPay(ctx, userId, amount);
}

async function buildNercPayCanvas(qrString, botName) {
  const canvasLib = getCanvas();
  if (!canvasLib) {
    // Fallback: kembalikan null, pakai QR biasa dari qrserver.com
    return null;
  }
  try {
    const { createCanvas, loadImage } = canvasLib;
    const canvas = createCanvas(800, 900);
    const g = canvas.getContext('2d');

    // Background gradient gelap
    const bg = g.createLinearGradient(0, 0, 0, 900);
    bg.addColorStop(0, '#0d1117');
    bg.addColorStop(1, '#161b22');
    g.fillStyle = bg;
    g.fillRect(0, 0, 800, 900);

    // Border glow
    g.strokeStyle = '#58a6ff';
    g.lineWidth = 3;
    g.shadowBlur = 20;
    g.shadowColor = '#58a6ff';
    g.strokeRect(15, 15, 770, 870);
    g.shadowBlur = 0;

    // Header
    g.fillStyle = '#58a6ff';
    g.font = 'bold 28px sans-serif';
    g.textAlign = 'center';
    g.fillText('🏦 QRIS PAYMENT GATEWAY', 400, 65);

    g.fillStyle = '#ffffff';
    g.font = 'bold 22px sans-serif';
    g.fillText(botName || 'AUTO ORDER BOT', 400, 100);

    // Divider
    g.strokeStyle = '#30363d';
    g.lineWidth = 1;
    g.shadowBlur = 0;
    g.beginPath();
    g.moveTo(40, 120); g.lineTo(760, 120);
    g.stroke();

    // QR Code di tengah
    const qrBuffer = await QRCode.toBuffer(qrString, {
      errorCorrectionLevel: 'M', width: 500, margin: 2,
      color: { dark: '#0d1117', light: '#ffffff' }
    });
    const qrImg = await loadImage(qrBuffer);

    // Kotak putih background QR
    g.fillStyle = '#ffffff';
    g.shadowBlur = 15;
    g.shadowColor = 'rgba(88,166,255,0.4)';
    g.beginPath();
    g.roundRect(140, 135, 520, 520, 18);
    g.fill();
    g.shadowBlur = 0;

    g.drawImage(qrImg, 150, 145, 500, 500);

    // Label scan
    g.fillStyle = '#8b949e';
    g.font = '18px sans-serif';
    g.textAlign = 'center';
    g.fillText('Scan dengan DANA / GoPay / OVO / M-Banking', 400, 685);

    // Divider bawah
    g.strokeStyle = '#30363d';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(40, 705); g.lineTo(760, 705);
    g.stroke();

    // Footer info
    g.fillStyle = '#58a6ff';
    g.font = 'bold 16px sans-serif';
    g.fillText('⚡ Proses Otomatis • Langsung Masuk • Tanpa Konfirmasi', 400, 740);

    g.fillStyle = '#3fb950';
    g.font = 'bold 18px sans-serif';
    g.fillText('✅ Pembayaran akan terdeteksi otomatis', 400, 775);

    g.fillStyle = '#f85149';
    g.font = '16px sans-serif';
    g.fillText('⏰ Berlaku 60 menit sejak diterbitkan', 400, 808);

    // Branding bawah
    g.fillStyle = '#ffffff';
    g.font = 'bold 20px sans-serif';
    g.fillText(botName || 'AUTO ORDER BOT', 400, 855);

    return canvas.toBuffer('image/png');
  } catch (e) {
    console.error('[CANVAS ERROR]', e.message);
    return null;
  }
}

// ── NercPay: deposit otomatis tanpa konfirmasi ─────────────────────

async function sendPayInvoiceNercPay(ctx, userId, amount) {
  if (!NERCPAY_CONFIG.apikey) {
    return bot.telegram.sendMessage(userId,
      '❌ NercPay belum dikonfigurasi. Isi <code>apikey</code> NercPay di config.json.',
      { parse_mode: 'HTML' }
    );
  }

  const lm = await bot.telegram.sendMessage(userId, '⏳ Menyiapkan QRIS pembayaran...', { parse_mode: 'HTML' });

  // NercPay menghitung fee otomatis di server, jadi cukup kirim nominal yang ingin diterima (amount)
  let qrisData = null;
  let lastErr = null;
  for (let i = 0; i < 2 && !qrisData; i++) {
    try {
      qrisData = await createdQris(amount, NERCPAY_CONFIG);
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  try { await bot.telegram.deleteMessage(userId, lm.message_id); } catch {}

  if (!qrisData) {
    return bot.telegram.sendMessage(userId,
      `❌ Gagal membuat QRIS.${lastErr ? ` (${lastErr.message})` : ''}\n\nCoba lagi atau hubungi admin.`,
      { parse_mode: 'HTML' }
    );
  }

  const orderId       = qrisData.idtransaksi;
  const qrString      = qrisData.qr_string;
  const totalBayar    = qrisData.jumlah;                     // total yang harus dibayar (sudah termasuk fee NercPay)
  const fee           = qrisData.fee || Math.max(0, totalBayar - amount);
  const amountReceived = qrisData.amount_received || amount; // nominal yang bakal masuk ke saldo
  const botInfo   = await bot.telegram.getMe().catch(() => ({ first_name: 'AUTO ORDER BOT' }));
  const botName   = botInfo.first_name || 'AUTO ORDER BOT';

  // Buat struk canvas (fallback ke qrserver.com jika canvas tidak tersedia)
  let photoSource = null;
  if (qrString) {
    const canvasBuf = await buildNercPayCanvas(qrString, botName);
    if (canvasBuf) {
      photoSource = { source: canvasBuf };
    } else {
      // Fallback: generate QR via API
      try {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrString)}`;
        const qrRes = await axios.get(qrUrl, { responseType: 'arraybuffer', timeout: 10000 });
        photoSource = { source: Buffer.from(qrRes.data) };
      } catch {}
    }
  }
  if (!photoSource && qrisData.imageqris instanceof Buffer) {
    photoSource = { source: qrisData.imageqris };
  }

  const caption =
    `🏦 <b>QRIS PAYMENT OTOMATIS (NERCPAY)</b>\n${LINE}\n\n` +
    `<blockquote>` +
    `🆔 ID Bayar  : <code>${orderId}</code>\n` +
    `💰 Saldo     : <b>${formatRp(amountReceived)}</b>\n` +
    `💸 Biaya     : <b>${formatRp(fee)}</b>\n` +
    `💳 Total     : <b>${formatRp(totalBayar)}</b>\n\n` +
    `📲 Metode    : QRIS Scan All Payment\n` +
    `⚡ Proses    : Otomatis (Tanpa Konfirmasi)\n` +
    `⏰ Berlaku   : 20 Menit\n\n` +
    `1. Screenshot QR di atas\n` +
    `2. Buka DANA / GoPay / OVO / M-Banking\n` +
    `3. Scan dari galeri foto</blockquote>`;

  const keyboard = { inline_keyboard: [[{ text: '❌ Batalkan', callback_data: 'cancel_deposit' , style: 'danger', icon_custom_emoji_id: '5382355635553739365' }]] };

  let msgQris;
  if (photoSource) {
    msgQris = await bot.telegram.sendPhoto(userId, photoSource, { caption, parse_mode: 'HTML', reply_markup: keyboard });
  } else {
    msgQris = await bot.telegram.sendMessage(userId,
      caption + `\n\n<code>${qrString || '-'}</code>`,
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
  }

  // Simpan order aktif
  nercpayActiveOrders[userId] = { orderId, amount: amountReceived, total: totalBayar, msgId: msgQris.message_id };

  // Polling cek status tiap 5 detik, max 240x (20 menit)
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    const order = nercpayActiveOrders[userId];
    if (!order || order.orderId !== orderId || attempts > 240) {
      clearInterval(interval);
      return;
    }
    try {
      const isPaid = await cekStatus(orderId, totalBayar, NERCPAY_CONFIG);
      if (isPaid) {
        clearInterval(interval);
        delete nercpayActiveOrders[userId];
        try { await bot.telegram.deleteMessage(userId, msgQris.message_id); } catch {}

        // Tambah saldo
        await users.updateOne(
          { user_id: userId },
          { $inc: { balance: amountReceived }, $push: { mutasi: `[${new Date().toLocaleString('id-ID')}] Masuk: ${formatRp(amountReceived)} (Deposit NercPay)` } }
        );
        const u = await users.findOne({ user_id: userId });
        await bot.telegram.sendMessage(userId,
          `✅ <b>𝗗𝗘𝗣𝗢𝗦𝗜𝗧 𝗕𝗘𝗥𝗛𝗔𝗦𝗜𝗟!</b>\n${LINE}\n\n` +
          `<blockquote>💰 Diterima  : <b>${formatRp(amountReceived)}</b>\n` +
          `🏦 Saldo    : <b>${formatRp(u?.balance || 0)}</b>\n\n` +
          `⚡ Terproses otomatis oleh NercPay.\nTerima kasih!</blockquote>`,
          { parse_mode: 'HTML' }
        );
      }
    } catch {}
  }, 5000);

  nercpayActiveOrders[userId].interval = interval;
}

async function handleDepoCustom(ctx) {
  const enabled = await getSetting('deposit_enabled');
  if (enabled !== '1') return ctx.answerCbQuery('❌ Deposit sedang dinonaktifkan!', { show_alert: true });
  userSessions[ctx.from.id] = { step: 'deposit_amount' };
  await editOrReply(ctx,
    `<tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> <b>𝗜𝗡𝗣𝗨𝗧 𝗡𝗢𝗠𝗜𝗡𝗔𝗟 𝗗𝗘𝗣𝗢𝗦𝗜𝗧</b>\n${LINE}\n\n` +
    `<blockquote>Ketik nominal yang ingin kamu depositkan.\n\n<i>Contoh: <code>75000</code></i></blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Batal', callback_data: 'cancel_deposit' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] },
    }
  );
}

async function handleDepoSelect(ctx, amount) {
  try { await ctx.deleteMessage(); } catch {}
  const enabled = await getSetting('deposit_enabled');
  if (enabled !== '1') return ctx.answerCbQuery('❌ Deposit sedang dinonaktifkan!', { show_alert: true });
  await sendPayInvoice(ctx, ctx.from.id, amount);
}

// ══════════════════════════════════════════
//  TOKO SCRIPT
// ══════════════════════════════════════════


// ══════════════════════════════════════════════════════════
//  TOKO LAIN — Script / Voucher / Other
// ══════════════════════════════════════════════════════════

async function showTokoScript(ctx) {
  try { await ctx.deleteMessage(); } catch {}
  const list = await scripts.find({ available: true }).toArray();
  if (!list.length) {
    return ctx.reply(
      `<tg-emoji emoji-id="5875206779196935950">📁</tg-emoji> <b>Toko Script</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n<blockquote>Belum ada script yang dijual saat ini.</blockquote>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] } }
    );
  }
  let msg = `<tg-emoji emoji-id="5875206779196935950">📁</tg-emoji> <b>Toko Script</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n<blockquote>`;
  const buttons = [];
  for (const s of list) {
    msg += `<tg-emoji emoji-id="5257969839313526622">📂</tg-emoji> <b>${s.name}</b>\n   <tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> ${formatRp(s.price)}  |  Terjual: ${s.sales || 0}x\n\n`;
    buttons.push([{ text: `Beli — ${s.name}`, callback_data: `buyscript_${s._id}`, style: 'primary' , icon_custom_emoji_id: '6028497653799588476' }]);
  }
  msg += `</blockquote>`;
  buttons.push([{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]);
  await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
}

// Helper: kirim file script ke pembeli
async function deliverScript(userId, script) {
  const timeNow = new Date().toLocaleString('id-ID');
  await users.updateOne({ user_id: userId }, { $inc: { total_spent: script.price } });
  await users.updateOne({ user_id: userId }, {
    $push: { mutasi: `[${timeNow}] Keluar: ${formatRp(script.price)} (Beli Script: ${script.name})` }
  });
  await scripts.updateOne({ _id: script._id }, { $inc: { sales: 1 } });
  await bot.telegram.sendMessage(userId,
    `<tg-emoji emoji-id="5875206779196935950">📁</tg-emoji> <b>Pembelian Berhasil</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<blockquote>Script <b>${script.name}</b> berhasil dibeli.\nFile dikirim di bawah ini.</blockquote>`,
    { parse_mode: 'HTML' }
  );
  await bot.telegram.sendDocument(userId, script.file_id, {
    caption: `<tg-emoji emoji-id="5875206779196935950">📁</tg-emoji> <b>${script.name}</b>\n\nTerima kasih sudah beli di <b>Rexzy Shop</b>!`,
    parse_mode: 'HTML',
  });
  await bcChannel(
    `─── 📦 <b><u>Script Terjual</u></b> ───\n\n` +
    `<blockquote>Nama: <b>${script.name}</b>\nHarga: ${formatRp(script.price)}\nBuyer: <code>${userId}</code></blockquote>`
  );
}

// Konfirmasi beli script — pilih metode bayar
async function showScriptConfirm(ctx, sid) {
  const script = await scripts.findOne({ _id: new mongoose.Types.ObjectId(sid) });
  if (!script || !script.available)
    return ctx.answerCbQuery('❌ Script tidak tersedia.', { show_alert: true });
  const u = await getUser(ctx.from.id);
  await editOrReply(ctx, `<tg-emoji emoji-id="5875206779196935950">📁</tg-emoji> <b>Konfirmasi Script</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<blockquote><tg-emoji emoji-id="5875206779196935950">📁</tg-emoji> <b>Nama</b>  : ${script.name}\n` +
    `<tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> <b>Harga</b> : ${formatRp(script.price)}\n` +
    `<tg-emoji emoji-id="5258204546391351475">💰</tg-emoji> <b>Saldo</b> : ${formatRp(u.balance)}\n\n` +
    `Pilih metode pembayaran:</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Bayar Saldo', callback_data: `scriptpaysaldo_${sid}`, style: 'primary', icon_custom_emoji_id: '5258204546391351475' }],
      [{ text: 'Bayar QRIS',  callback_data: `scriptpayqris_${sid}`, style: 'success', icon_custom_emoji_id: '5226513232549664618'  }],
      [{ text: 'Batal',        callback_data: 'tokoscript', style: 'danger', icon_custom_emoji_id: '5260293700088511294'     }],
    ]}}
  );
}

// Beli script pakai saldo
async function handleBuyScriptSaldo(ctx, sid) {
  const script = await scripts.findOne({ _id: new mongoose.Types.ObjectId(sid) });
  if (!script || !script.available)
    return ctx.answerCbQuery('❌ Script tidak tersedia.', { show_alert: true });
  const u = await getUser(ctx.from.id);
  if (u.balance < script.price)
    return ctx.answerCbQuery(`❌ Saldo kurang! Butuh ${formatRp(script.price)}`, { show_alert: true });
  await users.updateOne({ user_id: ctx.from.id }, { $inc: { balance: -script.price } });
  await deliverScript(ctx.from.id, script);
}

// Beli script pakai QRIS — kirim invoice+foto
async function handleBuyScriptQris(ctx, sid) {
  const script = await scripts.findOne({ _id: new mongoose.Types.ObjectId(sid) });
  if (!script || !script.available)
    return ctx.answerCbQuery('❌ Script tidak tersedia.', { show_alert: true });
  const qrisName = await getSetting('qris_name') || 'QRIS - Lelen';
  const refCode  = `SCRIPT-${Date.now()}-${Math.floor(Math.random()*1000)}`;
  userSessions[ctx.from.id] = { step: 'script_proof', refCode, scriptId: sid, price: script.price };
  const captionScript =
    `<tg-emoji emoji-id="5258204546391351475">💰</tg-emoji> <b>Bayar Script Anda</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<blockquote><tg-emoji emoji-id="5875206779196935950">📁</tg-emoji> Script : <b>${script.name}</b>\n` +
    `<tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> Harga  : <b>${formatRp(script.price)}</b>\n` +
    `<tg-emoji emoji-id="5444856076954520455">🧾</tg-emoji> <b>Ref</b> : <code>${refCode}</code>\n` +
    `Setelah bayar, kirim <b>foto bukti</b> di sini yaa <tg-emoji emoji-id="6203908941416504393">🥰</tg-emoji></blockquote>`;
  await sendQrisWithCaption(
    ctx.from.id,
    captionScript,
    { inline_keyboard: [[{ text: 'Batal', callback_data: 'tokoscript', style: 'danger', icon_custom_emoji_id: '5260293700088511294' }]] }
  );
}

// Admin ACC script QRIS
async function handleConfirmScriptQris(ctx, param) {
  if (!isAdmin(ctx.from.id)) return;
  const [sid, buyerId] = param.split('_');
  const buyerIdInt = parseInt(buyerId);
  const script = await scripts.findOne({ _id: new mongoose.Types.ObjectId(sid) });
  if (!script) return ctx.answerCbQuery('❌ Script tidak ditemukan!', { show_alert: true });
  await deliverScript(buyerIdInt, script);
  await ctx.answerCbQuery('✅ Script dikirim!');
  try { await ctx.editMessageCaption(`<blockquote><tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Script dikirim ke ${buyerId}</b></blockquote>`, { parse_mode: 'HTML' }); } catch {}
}

// Admin tolak script QRIS
async function handleRejectScriptQris(ctx, param) {
  if (!isAdmin(ctx.from.id)) return;
  const buyerId = parseInt(param.split('_')[1]);
  await bot.telegram.sendMessage(buyerId,
    `<blockquote><tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> <b>Pembayaran di tolak</b>\nBukti tidak valid. Hubungi admin untuk konfirmasi pembayaran nya</blockquote>`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
  await ctx.answerCbQuery('❌ Pembayaran ditolak!');
  try { await ctx.editMessageCaption(`<blockquote><tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> <b>Pembayaran ditolak</b></blockquote>`, { parse_mode: 'HTML' }); } catch {}
}

// Keep alias for backward compat
async function handleBuyScript(ctx, sid) { return showScriptConfirm(ctx, sid); }

// ══════════════════════════════════════════
//  VOUCHER
// ══════════════════════════════════════════
async function showVoucher(ctx) {
  userSessions[ctx.from.id] = { step: 'voucher_claim' };
  await editOrReply(ctx,
    `<tg-emoji emoji-id="5204242830687494041">🧾</tg-emoji> <b>Claim Vouchers</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<blockquote>Masukkan kode voucher kamu di bawah ini.\n\n<i>Contoh: <code>VD-A1B2C3D4</code></i></blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Batal', callback_data: 'home', style: 'danger', icon_custom_emoji_id: '5260293700088511294' }]] },
    }
  );
}

// ══════════════════════════════════════════
//  TRANSFER SALDO
// ══════════════════════════════════════════
async function showTransfer(ctx) {
  userSessions[ctx.from.id] = { step: 'transfer_id' };
  await editOrReply(ctx,
    `<tg-emoji emoji-id="5258073068852485953">✈️</tg-emoji> <b>Transfer Saldo</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<blockquote><tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Silahkan Masukkan <b>Telegram ID</b> penerima.\n<i>Kamu bisa lihat ID seseorang di menu Profil bot ini.</i></blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Batal', callback_data: 'home', style: 'danger', icon_custom_emoji_id: '5260293700088511294' }]] },
    }
  );
}

// ══════════════════════════════════════════
//  MUTASI
// ══════════════════════════════════════════
async function showMutasi(ctx) {
  const u = await getUser(ctx.from.id);
  const list = (u.mutasi || []).slice(-10).reverse();
  if (!list.length) {
    return ctx.reply(
      `<tg-emoji emoji-id="5444856076954520455">🧾</tg-emoji> <b>Mutasi Saldo</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n<blockquote>Belum ada riwayat mutasi, silahkan ada order terlebih dahulu <tg-emoji emoji-id="5260341314095947411">👀</tg-emoji></blockquote>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] } }
    );
  }
  const rows = list.map(m => `<blockquote>${m}</blockquote>`).join('\n');
  await editOrReply(ctx,
    `<tg-emoji emoji-id="5444856076954520455">🧾</tg-emoji> <b>Mutasi Saldo</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n<blockquote>${rows}</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] } }
  );
}

// ══════════════════════════════════════════
//  TOP SPENDER
// ══════════════════════════════════════════
async function showTopSpender(ctx) {
  try { await ctx.deleteMessage(); } catch {}
  // Leaderboard saldo terbanyak di bot
  const top = await users.find({})
    .sort({ balance: -1 })
    .limit(10)
    .toArray();

  const medals = ['<tg-emoji emoji-id="5794182096603847292">1⃣</tg-emoji>', '<tg-emoji emoji-id="5794303034292968945">2⃣</tg-emoji>', '<tg-emoji emoji-id="5794031944547178894">3⃣</tg-emoji>', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  let msg = `<tg-emoji emoji-id="5893376775781617954">🏆</tg-emoji> <b>Top10 Leaderboard</b>\n${LINE}\n\n<blockquote>`;
  if (!top.length || top.every(u => !u.balance)) {
    msg += 'Belum ada data saldo.';
  } else {
    top.forEach((u, i) => {
      if (!u.balance && u.balance !== 0) return;
      const uname = u.username ? `@${u.username}` : `<code>${u.user_id}</code>`;
      msg += `${medals[i]} ${uname}\n`;
      msg += `<tg-emoji emoji-id="5188481279963715781">🚀</tg-emoji> <b>${formatRp(u.balance || 0)}</b>\n\n`;
    });
  }
  msg += `</blockquote>`;
  await ctx.reply(msg, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: 'Refresh', callback_data: 'topspender', style: 'primary', icon_custom_emoji_id: '5258420634785947640' }, { text: 'Kembali', callback_data: 'home' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] },
  });
}

// ══════════════════════════════════════════
//  KALKULATOR PAJAK DEPOSIT
// ══════════════════════════════════════════
async function showKalkulator(ctx) {
  userSessions[ctx.from.id] = { step: 'kalkulator' };
  await editOrReply(ctx,
    `🧮 <b>𝗞𝗔𝗟𝗞𝗨𝗟𝗔𝗧𝗢𝗥 𝗗𝗘𝗣𝗢𝗦𝗜𝗧</b>\n${LINE}\n\n` +
    `<blockquote>Ketik nominal saldo yang kamu mau,\nbot akan hitung total yang perlu ditransfer.\n\n<i>Contoh: <code>50000</code></i></blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '❌ Tutup', callback_data: 'home' , style: 'primary', icon_custom_emoji_id: '5382355635553739365' }]] },
    }
  );
}

// ══════════════════════════════════════════
//  SYARAT & KETENTUAN
// ══════════════════════════════════════════
async function showSnK(ctx) {
    await editOrReply(ctx,
    `<tg-emoji emoji-id="5839380580080293813">🖋</tg-emoji> <b>SYARAT & KETENTUAN</b>\n${LINE}\n\n` +
    `<blockquote>` +
    `<b>1. Biaya Deposit</b>\n` +
    `Ada biaya layanan Rp 450 per deposit. Kekurangan transfer = dana tidak diproses.\n\n` +
    `<b>2. Garansi OTP</b>\n` +
    `Garansi OTP berlaku <b>15 menit</b> sejak pembelian.\n\n` +
    `<b>3. Tanggung Jawab Pengguna</b>\n` +
    `Kelalaian akses (lupa logout, kehilangan 2FA, dll) bukan tanggung jawab kami.\n\n` +
    `<b>4. Larangan</b>\n` +
    `Spam, manipulasi, atau abuse bot akan dikenai blacklist permanen.\n\n` +
    `<b>5. Persetujuan</b>\n` +
    `Dengan menggunakan bot ini, kamu menyetujui semua ketentuan di atas.` +
    `</blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: 'Hubungi CS', url: `https://t.me/${DEV_NAME.replace('@', '')}`, style: 'primary', icon_custom_emoji_id: '5870692618244984670' }],
        [{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909' }],
      ]},
    }
  );
}

// ══════════════════════════════════════════
//  PRODUK PER KATEGORI
// ══════════════════════════════════════════

// ── Filter stok by prefix digit pertama ID ─────────────────────
async function showProductsByPrefix(ctx, prefix) {
  try { await ctx.deleteMessage(); } catch {}
  await ctx.answerCbQuery().catch(() => {});

  // Cari semua produk available yang real_id-nya berawalan prefix
  const allItems = await products.find({ status: 'available' }).toArray();
  const items = allItems.filter(p => String(p.real_id||'').startsWith(prefix)).slice(0, 15);

  if (!items.length) {
    return ctx.reply(`<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Tidak ada stok dengan ID awalan <b>${prefix}</b>`, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'shop', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] },
    });
  }

  let msg = `<blockquote><tg-emoji emoji-id="5258024802010026053">🛒</tg-emoji> <b>Stok ID Awalan ${prefix}</b>\n${LINE}\n\n`;
  const buyRows = items.map((p, i) => {
    const baseLabel = p.category === 'no_limit' ? '<tg-emoji emoji-id="6008118472066732010">🔥</tg-emoji> NL' : '<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> SL'; const tagLabel2 = p.tag === 'tag_scam' ? ', ⚠️ TS' : p.tag === 'tag_fake' ? ', 🚫 TF' : ''; const noLimit = baseLabel + tagLabel2;
    msg += `${i+1}. <tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> <code>${p.real_id}</code><b>${digitLabel(p.real_id)}</b>  ${noLimit}\n• ${formatRp(p.price)}\n`;
    msg += `• <tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> ${p.phone}  |  ${detectCountry(p.phone)}\n`;
    if (p.two_fa) msg += `   <tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> 2FA: <tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji>\n`;
    msg += `\n`;
    return [{ text: `BELI — ${p.real_id}`, callback_data: `buy_${p._id}`, style: 'danger', icon_custom_emoji_id: '6028497653799588476' }];
  });
  msg += `</blockquote>`;
  const buttons = [...buyRows, [{ text: 'Kembali', callback_data: 'shop', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]];
  await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
}

// ── ADMIN: Database Akun (draft/limit/belum ready) ──────────────


// ══════════════════════════════════════════════════════════
//  ADMIN PANEL
// ══════════════════════════════════════════════════════════

async function showAdminDraftDB(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx.from.id)) return;

  const drafts = await draft_accounts.find({}).sort({ created_at: -1 }).toArray();

  const rows = [
    [{ text: 'Tambah Akun ke Database', callback_data: 'draft_add' , style: 'success', icon_custom_emoji_id: '6032733629719777782' }],
  ];

  drafts.forEach((d, i) => {
    const label = d.spam_limit ? '⚠️ Limit Spam' : '📦 Draft';
    rows.push([{
      text: `${i+1}. ${d.phone} [${label}]`,
      callback_data: `draft_view_${d._id}`,
    style: 'primary', icon_custom_emoji_id: '5472200252532464654' }]);
  });
  rows.push([{ text: 'Kembali', callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]);

  await ctx.reply(
    `🗄️ <b>𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘 𝗔𝗞𝗨𝗡</b>\n${LINE}\n\n` +
    `<blockquote>Total: <b>${drafts.length} akun</b> tersimpan\n\n` +
    `Akun di sini belum siap di-stok.\nBisa karena limit spam atau menunggu proses.</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } }
  );
}

// ── Draft: lihat detail akun + tools + banding ──────────────────
async function showDraftDetail(ctx, id) {
  await ctx.answerCbQuery().catch(() => {});
  const d = await draft_accounts.findOne({ _id: new mongoose.Types.ObjectId(id) });
  if (!d) return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Akun tidak ditemukan.');

  const statusLabel = d.spam_limit ? '⚠️ Limit Spam' : '📦 Draft';
  await editOrReply(ctx,
    `📋 <b>𝗗𝗘𝗧𝗔𝗜𝗟 𝗔𝗞𝗨𝗡 𝗗𝗥𝗔𝗙𝗧</b>\n${LINE}\n\n` +
    `<blockquote>📱 No       : <code>${d.phone}</code>\n` +
    `🆔 ID       : <code>${d.real_id || '-'}</code>\n` +
    `🏷️ Status   : ${statusLabel}\n` +
    `🔐 2FA      : ${d.two_fa || '-'}\n` +
    `📅 Ditambah : ${d.created_at ? new Date(d.created_at).toLocaleDateString('id-ID') : '-'}</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Refresh Info',      callback_data: `draft_tool_refresh_${id}`  , style: 'success', icon_custom_emoji_id: '6035353718684129368' }],
      [{ text: 'Cek OTP',           callback_data: `draft_tool_otp_${id}`      , style: 'success', icon_custom_emoji_id: '5472252840112037845' }],
      [{ text: 'Banding (Unlimit)', callback_data: `draft_spambot_${id}`       , style: 'primary', icon_custom_emoji_id: '6034834452843074121' }],
      [{ text: 'Pindah ke Stok',    callback_data: `draft_to_stok_${id}`       , style: 'success', icon_custom_emoji_id: '5472180551517477902' }],
      [{ text: 'Hapus dari DB',     callback_data: `draft_delete_${id}`        , style: 'danger', icon_custom_emoji_id: '5472291748220771063' }],
      [{ text: 'Kembali',           callback_data: 'admin_draft_db'            , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}}
  );
}

// ── Draft: Connect ke session akun draft ────────────────────────
async function draftToolConnect(id, action) {
  const d = await draft_accounts.findOne({ _id: new mongoose.Types.ObjectId(id) });
  if (!d?.session_string) return { ok: false, msg: 'Session tidak ada di database ini.' };
  try {
    const client = new TelegramClient(new StringSession(d.session_string), API_ID, API_HASH, { connectionRetries: 5 });
    await client.connect();
    const result = await action(client, d);
    await client.disconnect().catch(() => {});
    return { ok: true, result };
  } catch (e) { return { ok: false, msg: e.message?.slice(0, 150) }; }
}

// ── Draft: SpamBot banding flow ─────────────────────────────────
async function startSpambotBanding(ctx, id) {
  await ctx.answerCbQuery().catch(() => {});
  const lm = await ctx.reply('🤖 Menghubungkan ke @SpamBot...');

  const res = await draftToolConnect(id, async (client) => {
    // Kirim /start ke SpamBot
    await client.sendMessage('SpamBot', { message: '/start' });
    await new Promise(r => setTimeout(r, 3000));

    // Ambil pesan terbaru dari SpamBot
    for await (const msg of client.iterMessages('SpamBot', { limit: 3 })) {
      return { text: msg.text || '', buttons: msg.replyMarkup };
    }
    return { text: '', buttons: null };
  });

  try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}

  if (!res.ok) return ctx.reply(`❌ ${res.msg}`);
  const { text, buttons } = res.result;

  // Deteksi apakah ada pesan limit
  const isLimited = text.includes('dibatasi') || text.includes('restricted') || text.includes('anti-spam');
  const hasVerify = text.includes('verify') || text.includes('human') || text.includes('Please verify');

  if (hasVerify) {
    // Ada captcha/verify link - kirim ke admin
    const linkMatch = text.match(/https?:\/\/[^\s]+/);
    const link = linkMatch ? linkMatch[0] : null;
    const msg = `🔐 <b>𝗣𝗘𝗥𝗟𝗨 𝗩𝗘𝗥𝗜𝗙𝗜𝗞𝗔𝗦𝗜 𝗠𝗔𝗡𝗨𝗦𝗜𝗔</b>\n${LINE}\n\n` +
      `<blockquote>SpamBot meminta verifikasi Captcha.\n\n` +
      `${link ? `🔗 Link: ${link}` : 'Tidak ada link terdeteksi'}\n\n` +
      `Buka link tersebut dan selesaikan captcha,\nlalu klik Done.</blockquote>`;
    return ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      ...(link ? [[{ text: '🔗 Buka Link Verifikasi', url: link , style: 'primary', icon_custom_emoji_id: '5388658581664993142' }]] : []),
      [{ text: '✅ Done (Kirim Banding)', callback_data: `draft_spambot_appeal_${id}` , style: 'success', icon_custom_emoji_id: '5472180551517477902' }],
      [{ text: '◀️ Kembali', callback_data: `draft_view_${id}` , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}});
  }

  if (isLimited || text.length > 50) {
    // Pesan limit terdeteksi — tampilkan ke admin + tombol untuk klik button SpamBot
    let msg = `⚠️ <b>𝗔𝗞𝗨𝗡 𝗧𝗘𝗥𝗗𝗘𝗧𝗘𝗞𝗦𝗜 𝗟𝗜𝗠𝗜𝗧 𝗦𝗣𝗔𝗠</b>\n${LINE}\n\n` +
      `<blockquote>📩 Pesan dari @SpamBot:\n\n<i>${text.slice(0, 500)}</i></blockquote>\n\n`;

    // Parse inline buttons dari SpamBot jika ada
    const spambotBtns = [];
    if (buttons?.rows) {
      for (const row of buttons.rows) {
        const r = [];
        for (const btn of row.buttons) {
          const label = btn.text || '';
          r.push({ text: `📌 ${label}`, callback_data: `draft_spambot_btn_${id}_${encodeURIComponent(label)}` , style: 'primary', icon_custom_emoji_id: '5472145951260941641' });
        }
        if (r.length) spambotBtns.push(r);
      }
    }

    // Tandai akun sebagai limit spam
    await draft_accounts.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { spam_limit: true, spam_text: text } });

    return ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      ...spambotBtns,
      [{ text: '⚖️ Kirim Banding Otomatis', callback_data: `draft_spambot_appeal_${id}` , style: 'success', icon_custom_emoji_id: '6034834452843074121' }],
      [{ text: '◀️ Kembali', callback_data: `draft_view_${id}` , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}});
  }

  // Akun tidak kena limit
  await ctx.reply(
    `✅ <b>Akun tidak terdeteksi limit spam!</b>\n\n<blockquote>${text.slice(0,300)}</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Pindah ke Stok', callback_data: `draft_to_stok_${id}` , style: 'success', icon_custom_emoji_id: '5472180551517477902' }],
      [{ text: 'Kembali',        callback_data: `draft_view_${id}`   , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}}
  );
}

// ── Draft: Kirim banding ke SpamBot ─────────────────────────────
async function sendSpambotAppeal(ctx, id) {
  await ctx.answerCbQuery('⚖️ Mengirim banding...').catch(() => {});
  const lm = await ctx.reply('📨 Mengirim banding ke @SpamBot...');

  const res = await draftToolConnect(id, async (client, d) => {
    // Klik tombol banding di SpamBot (biasanya "This is a mistake")
    await client.sendMessage('SpamBot', { message: '/start' });
    await new Promise(r => setTimeout(r, 2000));

    let bandingDikirim = false;
    for await (const msg of client.iterMessages('SpamBot', { limit: 3 })) {
      if (msg.replyMarkup?.rows) {
        for (const row of msg.replyMarkup.rows) {
          for (const btn of row.buttons) {
            const label = (btn.text||'').toLowerCase();
            if (label.includes('mistake') || label.includes('appeal') || label.includes('keluhan') || label.includes('ajukan')) {
              // Klik button ini
              await client.invoke(new (require('telegram/tl').Api.messages.GetBotCallbackAnswer)({
                peer: await client.getInputEntity('SpamBot'),
                msgId: msg.id,
                data: btn.data,
              })).catch(() => {});
              bandingDikirim = true;
              break;
            }
          }
          if (bandingDikirim) break;
        }
      }
      if (bandingDikirim) break;
    }

    // Ambil respons setelah banding
    await new Promise(r => setTimeout(r, 3000));
    for await (const msg of client.iterMessages('SpamBot', { limit: 2 })) {
      return { text: msg.text || '', bandingDikirim };
    }
    return { text: '', bandingDikirim };
  });

  try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
  if (!res.ok) return ctx.reply(`❌ ${res.msg}`);

  const { text, bandingDikirim } = res.result;
  await draft_accounts.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { banding_sent: true, banding_at: new Date() } });

  await ctx.reply(
    `${bandingDikirim ? '✅' : '⚠️'} <b>Hasil Banding</b>\n${LINE}\n\n` +
    `<blockquote>${bandingDikirim ? 'Banding berhasil dikirim!' : 'Tidak menemukan tombol banding otomatis.'}\n\n` +
    `📩 Respons SpamBot:\n<i>${text.slice(0,400)||'(tidak ada respons)'}</i></blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Cek Status Lagi', callback_data: `draft_spambot_${id}` , style: 'success', icon_custom_emoji_id: '6035353718684129368' }],
      [{ text: 'Kembali',          callback_data: `draft_view_${id}`   , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}}
  );
}

async function showProductsByCategory(ctx, category) {
  try { await ctx.deleteMessage(); } catch {}
  const items = await products.find(itemQuery).limit(10).toArray();
  if (!items.length) {
    return ctx.reply(`<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> <b>Stok kategori ini habis :) </b>`, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'shop', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] },
    });
  }
  // Untuk nine_digit, juga tampilkan produk dengan real_id 9 digit dari kategori lain
  let itemQuery = { status: 'available', category };
  if (category === 'nine_digit') {
    itemQuery = { status: 'available', $or: [
      { category: 'nine_digit' },
      { $expr: { $eq: [{ $strLenCP: { $toString: '$real_id' } }, 9] } }
    ]};
  }
  const catLabel = {
    no_limit: '<tg-emoji emoji-id="6008118472066732010">🔥</tg-emoji> No Limit', other_country: '<tg-emoji emoji-id="5879585266426973039">🌐</tg-emoji> Other Country',
    repe: '<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> Repe', spam_limit: '<tg-emoji emoji-id="5956148757899776734">⭐️</tg-emoji> Spam/Limit', nine_digit: '<tg-emoji emoji-id="6028530359975548369">💎</tg-emoji> 9 Digit',
    tag_scam: '⚠️ Tag Scam', tag_fake: '🚫 Tag Fake',
  };
  let msg = `<blockquote><tg-emoji emoji-id="5373261557700509032">📱</tg-emoji> <b>${catLabel[category] || category}</b>\n${LINE}\n\n`;
  const buyRows = items.map((p, i) => {
    const baseLabel = p.category === 'no_limit' ? '<tg-emoji emoji-id="6008118472066732010">🔥</tg-emoji> NL' : '<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> SL'; const tagLabel2 = p.tag === 'tag_scam' ? ', ⚠️ TS' : p.tag === 'tag_fake' ? ', 🚫 TF' : ''; const noLimit = baseLabel + tagLabel2;
    msg += `${i+1}. <tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> <code>${p.real_id}</code><b>${digitLabel(p.real_id)}</b>  ${noLimit}\n• ${formatRp(p.price)}\n`;
    msg += `• <tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> ${p.phone}  |  ${detectCountry(p.phone)}\n`;
    if (p.two_fa) msg += `   <tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> 2FA: <tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji>\n`;
    msg += `\n`;
    return [{ text: `BELI — ${p.real_id}`, callback_data: `buy_${p._id}`, style: 'danger', icon_custom_emoji_id: '6028497653799588476' }];
  });
  msg += `</blockquote>`;
  const buttons = [...buyRows, [{ text: 'Kembali', callback_data: 'shop', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]];
  await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
}

// ══════════════════════════════════════════
//  KONFIRMASI & PROSES BELI
// ══════════════════════════════════════════
async function showBuyConfirm(ctx, productId) {
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(productId) });
  if (!product || product.status !== 'available')
    return ctx.answerCbQuery('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Produk sudah habis!', { show_alert: true });
  const u = await getUser(ctx.from.id);

  await editOrReply(ctx,
    `<tg-emoji emoji-id="5258024802010026053">🛒</tg-emoji> <b>Confirm Pembelian</b>\n${LINE}\n\n` +
    `<blockquote>` +
    `<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> ID     : <code>${product.real_id}</code><b>${digitLabel(product.real_id)}</b>\n` +
    `<tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> No     : <code>${product.phone}</code>\n` +
    `<tg-emoji emoji-id="5879585266426973039">🌐</tg-emoji> Negara : ${detectCountry(product.phone)}\n` +
    `<tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> Harga  : ${formatRp(product.price)}\n` +
    `<tg-emoji emoji-id="5258204546391351475">💰</tg-emoji> Saldo  : ${formatRp(u.balance)}\n` +
    `</blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: 'Bayar Saldo',  callback_data: `confirm_buy_${product._id}`, style: 'success', icon_custom_emoji_id: '5258204546391351475' }],
        [{ text: 'Bayar QRIS',   callback_data: `buywithqris_${product._id}`, style: 'primary', icon_custom_emoji_id: '5204242830687494041' }],
        [{ text: 'Batal',         callback_data: 'shop', style: 'danger', icon_custom_emoji_id: '5260293700088511294'       }],
      ]},
    }
  );
}

async function processBuy(ctx, productId) {
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(productId) });
  if (!product || product.status !== 'available')
    return ctx.answerCbQuery('❌ Produk sudah habis!', { show_alert: true });
  const u = await getUser(ctx.from.id);
  if (u.balance < product.price)
    return ctx.answerCbQuery('❌ Saldo kurang!', { show_alert: true });

  await users.updateOne({ user_id: ctx.from.id }, { $inc: { balance: -product.price, total_spent: product.price } });
  await products.updateOne({ _id: product._id }, { $set: { status: 'sold', buyer_id: ctx.from.id, sold_at: new Date() } });

  const timeNow = new Date().toLocaleString('id-ID');
  await users.updateOne({ user_id: ctx.from.id }, {
    $push: { mutasi: `[${timeNow}] Keluar: ${formatRp(product.price)} (Beli Akun: ${product.real_id})` }
  });

  const has2fa = product.two_fa && product.two_fa.trim() !== '';
  const pid    = product._id.toString();
  const orderButtons = [
    [{ text: 'MINTA OTP', callback_data: `otp_${pid}`, style: 'primary', icon_custom_emoji_id: '5877318502947229960' }],
    ...(has2fa ? [[{ text: 'LIHAT PASSWORD 2FA', callback_data: `fa2_${pid}`, style: 'success', icon_custom_emoji_id: '6005570495603282482' }]] : []),
    [{ text: 'LOGOUT AKUN', callback_data: `logout_${pid}`, style: 'danger', icon_custom_emoji_id: '6043947089249964579' }],
  ];

  await ctx.reply(
    `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>𝗣𝗘𝗠𝗕𝗘𝗟𝗜𝗔𝗡 𝗕𝗘𝗥𝗛𝗔𝗦𝗜𝗟!</b>\n${LINE}\n\n` +
    `<blockquote>` +
    `<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> ID     : <code>${product.real_id}</code><b>${digitLabel(product.real_id)}</b>\n` +
    `<tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> No     : <code>${product.phone}</code>\n` +
    `<tg-emoji emoji-id="5879585266426973039">🌐</tg-emoji> Negara : ${detectCountry(product.phone)}\n` +
    (has2fa ? `<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> 2FA    : <code>${product.two_fa}</code>\n` : '') +
    `<tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> Harga  : ${formatRp(product.price)}\n` +
    `${LINE}\n` +
    `<tg-emoji emoji-id="5967816500415827773">💻</tg-emoji> <b>Device aktif — (Bot) Jakarta</b>` +
    `</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: orderButtons } }
  );

  const catDisplay = {
    no_limit: '🔥 No Limit', other_country: '🌍 Other Country',
    repe: '⭐ Repe', spam_limit: '♻️ Spam/Limit', nine_digit: '💎 9 Digit',
  }[product.category] || product.category;
  const tagSuffix = product.tag === 'tag_scam' ? ', ⚠️ Tag Scam' : product.tag === 'tag_fake' ? ', 🚫 Tag Fake' : '';
  const catDisplayFull = catDisplay + tagSuffix;

  const orderNow = new Date(); orderNow.setHours(orderNow.getHours() + 7);
  const waktuStr = orderNow.toISOString().replace('T', ' ').slice(0, 19);
  await bcChannel(
    `─── 💰 <b><u>Transaksi Done</u></b> ───\n\n` +
    `<blockquote>` +
    `🧾 OID    : <code>ORDER-${product.real_id}</code>\n` +
    `👤 Buyer  : ${ctx.from.username ? '@' + ctx.from.username : '-'}\n` +
    `🆔 ID     : <code>${ctx.from.id}</code>\n` +
    `📦 Produk : <code>${product.real_id}</code><b>${digitLabel(product.real_id)}</b> ${catDisplayFull}\n` +
    `🌍 Negara : ${detectCountry(product.phone)}\n` +
    `✅ Status : LUNAS (AUTO)\n` +
    `🕒 Waktu  : ${waktuStr}` +
    `</blockquote>`,
    [[{ text: '🛍️ Beli Akun Lagi', url: `https://t.me/${bot.botInfo?.username || 'bot'}` , style: 'success', icon_custom_emoji_id: '5472401690793614752' }]]
  );
}

// ══════════════════════════════════════════
//  OTP, 2FA, LOGOUT
// ══════════════════════════════════════════
async function handleOTP(ctx, pid) {
  await ctx.answerCbQuery('⏳ Mengambil OTP...').catch(() => {});
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
  if (!product) return ctx.answerCbQuery('❌ Tidak ditemukan.', { show_alert: true });
  if (product.buyer_id !== ctx.from.id) return ctx.answerCbQuery('❌ Bukan milik kamu.', { show_alert: true });
  if (!product.session_string) return ctx.answerCbQuery('❌ Session tidak tersedia.', { show_alert: true });

  try {
    const cl = new TelegramClient(new StringSession(product.session_string), API_ID, API_HASH, { connectionRetries: 3 });
    await cl.connect();
    if (!await cl.isUserAuthorized()) {
      await cl.disconnect();
      return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Session expired / akun sudah logout.');
    }
    const otp = await fetchOTP(product.session_string);
    await cl.disconnect();
    if (otp) {
      await ctx.reply(`<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>OTP:</b> <code>${otp}</code>`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(
        `<tg-emoji emoji-id="5420323339723881652">⚠️</tg-emoji> <b>OTP belum ada.</b>\n\nMinta OTP dulu dari app yang mau login, lalu tekan tombol <b>Minta OTP</b> lagi.`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (err) {
    const m = err.message || '';
    if (m.includes('deactivated') || m.includes('deleted')) return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Akun sudah dihapus/dideaktivasi.');
    if (m.includes('AUTH') || m.includes('session')) return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Session expired.');
    return ctx.reply(`<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Gagal ambil OTP: ${m.slice(0, 100)}`);
  }
}

async function handleFA2(ctx, pid) {
  await ctx.answerCbQuery().catch(() => {});
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
  if (!product) return ctx.answerCbQuery('❌ Tidak ditemukan.', { show_alert: true });
  if (product.buyer_id !== ctx.from.id) return ctx.answerCbQuery('❌ Bukan milik kamu.', { show_alert: true });
  if (!product.two_fa?.trim()) return ctx.answerCbQuery('⚠️ Tidak ada 2FA.', { show_alert: true });
  await ctx.reply(`<tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> <b>Password 2FA:</b>\n<code>${product.two_fa}</code>`, { parse_mode: 'HTML' });
}

async function handleLogout(ctx, pid) {
  await ctx.answerCbQuery().catch(() => {});
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
  if (!product) return;
  if (product.buyer_id !== ctx.from.id) return ctx.answerCbQuery('❌ Bukan milik kamu.', { show_alert: true });
  if (product.status === 'finished') return ctx.answerCbQuery('⚠️ Sudah logout!', { show_alert: true });
  await ctx.reply(
    `<tg-emoji emoji-id="5420323339723881652">⚠️</tg-emoji> <b>Konfirmasi Logout</b>\n<blockquote>Pastikan kamu sudah berhasil login ke akun ini ya.\nSetelah logout, sesi bot dihapus.</blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: 'Ya, Logout', callback_data: `dologout_${pid}`, style: 'success', icon_custom_emoji_id: '5206607081334906820' }, { text: 'Batal', callback_data: `canclogout_${pid}`, style: 'danger', icon_custom_emoji_id: '5260293700088511294' }],
      ]},
    }
  );
}

async function handleCancLogout(ctx, pid) {
  await ctx.answerCbQuery('❌ Logout dibatalkan').catch(() => {});
  try { await ctx.deleteMessage(); } catch {}
}

async function handleDoLogout(ctx, pid) {
  await ctx.answerCbQuery('⏳ Logout...').catch(() => {});
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
  if (!product || product.buyer_id !== ctx.from.id) return;
  if (product.session_string) {
    try {
      const { Api } = require('telegram/tl');
      const cl = new TelegramClient(
        new StringSession(product.session_string), API_ID, API_HASH,
        { connectionRetries: 5, useWSS: false }
      );
      await cl.connect();
      if (await cl.isUserAuthorized()) {
        // Logout HANYA session bot ini saja, tidak semua device
        await cl.invoke(new Api.auth.LogOut()).catch(() => {});
      }
      await cl.disconnect().catch(() => {});
    } catch (e) {
      console.error('[Logout] Error:', e.message?.slice(0,80));
    }
  }
  await products.updateOne({ _id: product._id }, { $set: { status: 'finished' } });

  // Kirim notif ke channel saat transaksi done
  const doneNow = new Date(); doneNow.setHours(doneNow.getHours() + 7);
  const doneWaktu = doneNow.toISOString().replace('T', ' ').slice(0, 19);
  const u = await getUser(ctx.from.id);
  const catDoneMap = {
    no_limit: '🔥 No Limit', spam_limit: '♻️ Spam/Limit',
    other_country: '🌍 Other Country', repe: '⭐ Repe', nine_digit: '💎 9 Digit',
  };
  const catDoneTagSuffix = product.tag === 'tag_scam' ? ', ⚠️ Tag Scam' : product.tag === 'tag_fake' ? ', 🚫 Tag Fake' : '';
  const catDoneFull = (catDoneMap[product.category] || product.category) + catDoneTagSuffix;
  await bcChannel(
    `─── ✅ <b><u>Transaksi Selesai</u></b> ───\n\n` +
    `<blockquote>` +
    `🪪 ID       : <code>${product.real_id}</code><b>${digitLabel(product.real_id)}</b>\n` +
    `📱 No       : <code>${maskPhone(product.phone)}</code>\n` +
    `🌍 Negara   : ${detectCountry(product.phone)}\n` +
    `📂 Kategori : ${catDoneFull}\n` +
    `💰 Harga    : ${formatRp(product.price)}\n` +
    `👤 Buyer    : ${ctx.from.username ? '@' + ctx.from.username : String(ctx.from.id)}\n` +
    `🆔 User ID  : <code>${ctx.from.id}</code>\n` +
    `🔒 Status   : Akun sudah dilogout oleh buyer\n` +
    `🕒 Waktu    : ${doneWaktu}` +
    `</blockquote>`,
    [[{ text: '🛍️ Beli Akun', url: `https://t.me/${bot.botInfo?.username || 'bot'}` , style: 'danger', icon_custom_emoji_id: '5330237710655306682' }]]
  );

  await ctx.editMessageText(
    `<blockquote><tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Logout Sukses!</b>\nOrderan selesai. Jangan lupa amankan akun ya! Admin tidak bertanggung jawab setelah logout.</blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Belanja Lagi', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5346077597287589711' }]] },
    }
  );
}

// ══════════════════════════════════════════
//  ADMIN PANEL
// ══════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  SUB MENU UTAMA
// ═══════════════════════════════════════════════════════════════

async function showMenuNoktel(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const u = await getUser(ctx.from.id);
  await editOrReply(ctx,
    `<tg-emoji emoji-id="5956148757899776734">⭐️</tg-emoji> <b>Toko Noktel</b>\n━━━━━━━━━━━━━━━━━━━\n<blockquote><tg-emoji emoji-id="5854776233950188167">🏷</tg-emoji> Pilih account Telegram yang anda inginkan di tombol yang tersedia di bawah anda.\n\n<tg-emoji emoji-id="5373261557700509032">📱</tg-emoji> <b>Layanan Telegram</b>\n<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Deposit saldo terlebih dahulu agar pembayaran lebih cepat dan lebih praktis.\n<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Pilih akun yang tersedia dibawah anda.\n<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Setelah pembayaran berhasil , anda otomatis mendapatkan code untuk login\n\n<tg-emoji emoji-id="5931409969613116639">🛡</tg-emoji> Saldo yang saya miliki : <b>${formatRp(u?.balance||0)}</b></blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Beli Akun',     callback_data: 'shop', style: 'danger', icon_custom_emoji_id: '5330237710655306682' }, { text: 'Stor Akun',    callback_data: 'storAkun', style: 'primary', icon_custom_emoji_id: '6039420807900303010' }],
      [{ text: 'Cek Stok',      callback_data: 'stock', style: 'primary', icon_custom_emoji_id: '6008118472066732010'      }, { text: 'Beli Borongan', callback_data: 'borongan', style: 'danger', icon_custom_emoji_id: '5875180111744995604'   }],
      [{ text: 'Deposit',       callback_data: 'deposit', style: 'success', icon_custom_emoji_id: '5258204546391351475' }, { text: 'My Order',     callback_data: 'history', style: 'primary', icon_custom_emoji_id: '5258105663359294787'  }],
      [{ text: 'Transfer',      callback_data: 'transfer', style: 'danger', icon_custom_emoji_id: '5258362837411045098'  }, { text: 'Mutasi',       callback_data: 'mutasi', style: 'success', icon_custom_emoji_id: '5444856076954520455'   }],
      [{ text: 'Kembali',       callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909'  }],
    ]}}
  );
}

async function showMenuToko(ctx) {
  await ctx.answerCbQuery().catch(() => {});
    await editOrReply(ctx,
    `<tg-emoji emoji-id="5778423822940114949">🛡</tg-emoji> <b>Toko Lain</b>\n━━━━━━━━━━━━━━━━━━━\n<blockquote><tg-emoji emoji-id="5778423822940114949">🛡</tg-emoji> Pilih layanan kami yang anda inginkan di tombol yang tersedia di bawah anda.\n\n<tg-emoji emoji-id="5373261557700509032">📱</tg-emoji> <b>Layanan Lainnya</b>\n<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Harap deposit / pembayaran terlebih dahulu sebelum melakukan transaksi agar lebih mudah\n<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Setelah melakukan deposit anda bisa menggunakan layanan lain kami dengan cepat.\n<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Silahkan pilih layanan lain kami dengan tenang dan aman\n\n<tg-emoji emoji-id="5778423822940114949">🛡</tg-emoji> Silahkan berbelanja di Layanan Lain kami yaa kak.</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Toko Script',   callback_data: 'tokoscript', style: 'primary', icon_custom_emoji_id: '5875206779196935950'  }, { text: 'Toko Gift',     callback_data: 'tokogift', style: 'success', icon_custom_emoji_id: '5958413064658228696' }],
      [{ text: 'Voucher',       callback_data: 'voucher', style: 'primary', icon_custom_emoji_id: '5882200072581550212'   }],
      [{ text: 'Kembali',       callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909'    }],
    ]}}
  );
}

async function showMenuOther(ctx) {
  await ctx.answerCbQuery().catch(() => {});
    await editOrReply(ctx,
    `<tg-emoji emoji-id="5893161718179173515">⚙️</tg-emoji> <b>Other Menu</b>\n━━━━━━━━━━━━━━━━━━━\n<blockquote><tg-emoji emoji-id="5988023995125993550">🛠</tg-emoji> Pilih utilitys menu yang lagi kamu butuhkan di bawah ini silahkan anda pakai yaa.\n\n<tg-emoji emoji-id="6039573425268201570">📤</tg-emoji> <b>Utilitys Menu</b>\n<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Disini anda bisa melihat fitur fitur utility yang menarik dan mungkin penting.\n<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Kalian bisa check peringkat atau leaderboard pada button di bawah.\n\n<tg-emoji emoji-id="5893406892092297627">♥️</tg-emoji> Terima kasih atas perhatian nya selamat menggunakan ya.</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Leaderboard',   callback_data: 'topspender', style: 'danger', icon_custom_emoji_id: '5893376775781617954'  }, { text: 'Statistik',    callback_data: 'statistik', style: 'success', icon_custom_emoji_id: '5895444149699612825' }],
      [{ text: 'Profil',        callback_data: 'profile', style: 'danger', icon_custom_emoji_id: '5258011929993026890' }, { text: 'S&K',          callback_data: 'snk', style: 'primary', icon_custom_emoji_id: '5839380580080293813'  }],
      [{ text: 'Kembali',       callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909'      }],
    ]}}
  );
}

// ═══════════════════════════════════════════════════════════════
//  UBOT MENU - DB MongoDB khusus, gratis semua user
// ═══════════════════════════════════════════════════════════════


// ── ADMIN: MAINTENANCE ──────────────────────────────
async function showMaintenance(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery().catch(() => {});
  try { await ctx.deleteMessage(); } catch {}
  const maintBot  = (await getSetting('maintenance_bot'))  === '1';
  const maintStor = (await getSetting('maintenance_stor')) === '1';
  await bot.telegram.sendMessage(ctx.from.id,
    `🔧 <b>𝗠𝗔𝗜𝗡𝗧𝗘𝗡𝗔𝗡𝗖𝗘</b>\n${LINE}\n\n` +
    `<blockquote>` +
    `🤖 Maintenance Bot   : <b>${maintBot  ? '🔴 ON' : '🟢 OFF'}</b>\n` +
    `📤 Maintenance Stor  : <b>${maintStor ? '🔴 ON' : '🟢 OFF'}</b>` +
    `</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: '🤖 Maintenance Bot',       callback_data: 'maint_pick_bot',  style: 'primary' , icon_custom_emoji_id: '5255883984151276991' }],
      [{ text: '📤 Maintenance Stor Akun', callback_data: 'maint_pick_stor', style: 'primary' , icon_custom_emoji_id: '5472010685560921607' }],
      [{ text: '◀️ Kembali', callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}}
  );
}

async function toggleMaintenance(ctx, type, on) {
  if (!isAdmin(ctx.from.id)) return;
  const key   = type === 'bot' ? 'maintenance_bot' : 'maintenance_stor';
  const label = type === 'bot' ? 'Maintenance Bot' : 'Maintenance Stor Akun';
  await setSetting(key, on ? '1' : '0');
  await ctx.answerCbQuery(`${label} ${on ? 'ON ✅' : 'OFF ✅'}`, { show_alert: true });
  return showMaintenance(ctx);
}

async function showMaintenancePick(ctx, type) {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery().catch(() => {});
  const isStor  = type === 'stor';
  const key     = isStor ? 'maintenance_stor' : 'maintenance_bot';
  const label   = isStor ? '📤 Maintenance Stor Akun' : '🤖 Maintenance Bot';
  const current = (await getSetting(key)) === '1';
  await ctx.answerCbQuery().catch(() => {});
  await bot.telegram.sendMessage(ctx.from.id,
    `${label}\n\nStatus sekarang: <b>${current ? '🔴 ON' : '🟢 OFF'}</b>\n\nPilih aksi:`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [
        { text: `${isStor ? 'Maintenance Stor Acc On' : 'Maintenance Bot On'}`,  callback_data: isStor ? 'maint_stor_on'  : 'maint_bot_on',  style: 'danger'  , icon_custom_emoji_id: isStor ? '5472010685560921607' : '5255883984151276991' },
        { text: `${isStor ? 'Maintenance Stor Acc Off' : 'Maintenance Bot Off'}`, callback_data: isStor ? 'maint_stor_off' : 'maint_bot_off', style: 'success' , icon_custom_emoji_id: isStor ? '5472010685560921607' : '5255883984151276991' },
      ],
      [{ text: '◀️ Kembali', callback_data: 'admin_maintenance' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}}
  );
}

async function showAdmin(ctx) {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ Hanya admin!', { show_alert: true });
  const totalUser    = await users.countDocuments();
  const totalProduct = await products.countDocuments();
  const totalSold    = await products.countDocuments({ status: { $in: ['sold', 'finished'] } });
  const totalPending = await deposits.countDocuments({ status: 'pending' });
  const rev = await products.aggregate([
    { $match: { status: { $in: ['sold', 'finished'] } } },
    { $group: { _id: null, total: { $sum: '$price' } } },
  ]).toArray();

  await editOrReply(ctx,
    `👑 <b>𝗔𝗗𝗠𝗜𝗡 𝗣𝗔𝗡𝗘𝗟</b>\n${LINE2}\n\n` +
    `<blockquote>` +
    `<b>[ Statistik ]</b>\n` +
    `  ${DOT} User          : <b>${totalUser}</b>\n` +
    `  ${DOT} Produk        : <b>${totalProduct}</b>\n` +
    `  ${DOT} Terjual       : <b>${totalSold}</b>\n` +
    `  ${DOT} Dep. Pending  : <b>${totalPending}</b>\n` +
    `  ${DOT} Revenue       : <b>${formatRp(rev[0]?.total || 0)}</b>\n\n` +
    `<b>[ Sistem ]</b>\n` +
    `  ${DOT} Uptime        : <b>${getUptime()}</b>\n` +
    `  ${DOT} Dev           : <b>${DEV_NAME}</b>` +
    `</blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: '📦 Kelola Account',   callback_data: 'admin_menu_account'  , style: 'primary', icon_custom_emoji_id: '5472010685560921607' }],
        [{ text: '📝 Kelola Script',    callback_data: 'admin_scripts'       , style: 'primary', icon_custom_emoji_id: '5472010685560921607' }, { text: '🎁 Kelola Toko Gift', callback_data: 'admin_menu_gift'     , style: 'primary', icon_custom_emoji_id: '5472096095280569232' }],
        [{ text: '🗄️ Kelola Database',  callback_data: 'admin_menu_database' , style: 'primary', icon_custom_emoji_id: '5472010685560921607' }, { text: '📤 Kelola Stor Akun', callback_data: 'admin_menu_stor'     , style: 'primary', icon_custom_emoji_id: '5472010685560921607' }],
        [{ text: '⚙️ Control User & Bot',                                       callback_data: 'admin_menu_control'  , style: 'primary', icon_custom_emoji_id: '5472010685560921607' }],
        [{ text: '◀️ Kembali',                                                   callback_data: 'home'                , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
      ]},
    }
  );
}

// ── ADMIN: SHOW REMOVE STOK ────────────────────────────────────
async function showRemoveStok(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery().catch(() => {});
  try { await ctx.deleteMessage(); } catch {}

  const list = await products.find({ status: 'available' }).sort({ created_at: -1 }).limit(20).toArray();

  if (!list.length) {
    return bot.telegram.sendMessage(ctx.from.id,
      `<blockquote>📭 Stok kosong, tidak ada akun yang bisa dihapus.</blockquote>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'admin_menu_account' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
    );
  }

  const catLabel = { no_limit: '🔥NL', spam_limit: '🔒Lmt', other_country: '🌐OC', repe: '⭐Repe', nine_digit: '💎9D' };
  const tagLabel = { tag_scam: '⚠️TS', tag_fake: '🚫TF' };

  let msg = `🗑️ <b>𝗗𝗘𝗟𝗘𝗧𝗘 𝗣𝗥𝗢𝗗𝗨𝗖𝗧𝗦</b>\n${LINE}\n\n<blockquote>`;
  const rows = list.map((p, i) => {
    const cat = catLabel[p.category] || p.category || '?';
    const tag = tagLabel[p.tag] ? ` ${tagLabel[p.tag]}` : '';
    const country = detectCountry(p.phone);
    msg += `${i + 1}. <code>${p.phone}</code> | ${cat}${tag} | ${formatRp(p.price)} | ${country}\n`;
    return [{ text: `🗑️ ${i + 1}. ${p.phone} — ${formatRp(p.price)}`, callback_data: `remove_stok_${p._id}` , style: 'danger', icon_custom_emoji_id: '5472291748220771063' }];
  });
  msg += `</blockquote>`;

  await bot.telegram.sendMessage(ctx.from.id, msg, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [...rows, [{ text: '◀️ Kembali', callback_data: 'admin_menu_account' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }
  });
}

// ── ADMIN SUBMENU: Kelola Account ──────────────────────────────
async function showAdminMenuAccount(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  await editOrReply(ctx,
    `📦 <b>𝗞𝗘𝗟𝗢𝗟𝗔 𝗔𝗖𝗖𝗢𝗨𝗡𝗧</b>\n${LINE2}`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Add Products',    callback_data: 'admin_add'        , style: 'success', icon_custom_emoji_id: '6032733629719777782' }],
      [{ text: 'Delete Products', callback_data: 'admin_remove_stok', style: 'danger', icon_custom_emoji_id: '5472291748220771063' }],
      [{ text: 'Kembali',         callback_data: 'admin'            , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}}
  );
}

// ── ADMIN SUBMENU: Kelola Toko Gift ────────────────────────────
async function showAdminMenuGift(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  await editOrReply(ctx,
    `🎁 <b>𝗞𝗘𝗟𝗢𝗟𝗔 𝗧𝗢𝗞𝗢 𝗚𝗜𝗙𝗧</b>\n${LINE2}`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Set Harga Gift',  callback_data: 'gift_owner_menu'    , style: 'primary', icon_custom_emoji_id: '5422360266618707867' }],
      [{ text: 'Gift Pending',    callback_data: 'gift_pending_list'  , style: 'primary', icon_custom_emoji_id: '5915814406490427591' }, { text: '🔑 Login Gift', callback_data: 'gift_login_status' , style: 'primary', icon_custom_emoji_id: '5472193350520021357' }],
      [{ text: 'Kembali',         callback_data: 'admin'              , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}}
  );
}

// ── ADMIN SUBMENU: Kelola Database ─────────────────────────────
async function showAdminMenuDatabase(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  await editOrReply(ctx,
    `🗄️ <b>𝗞𝗘𝗟𝗢𝗟𝗔 𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘</b>\n${LINE2}`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Database Akun',  callback_data: 'admin_draft_db' , style: 'primary', icon_custom_emoji_id: '5472064286752775254' }, { text: '💾 Backup ZIP', callback_data: 'admin_backup' , style: 'primary', icon_custom_emoji_id: '5339181821135431228' }],
      [{ text: 'Management Akun', callback_data: 'admin_mgmt'    , style: 'primary', icon_custom_emoji_id: '5255883984151276991' }],
      [{ text: 'Kembali',         callback_data: 'admin'         , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}}
  );
}

// ── ADMIN SUBMENU: Kelola Stor Akun ────────────────────────────
async function showAdminMenuStor(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  await editOrReply(ctx,
    `📤 <b>𝗞𝗘𝗟𝗢𝗟𝗔 𝗦𝗧𝗢𝗥 𝗔𝗞𝗨𝗡</b>\n${LINE2}`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Setting Akun Setor', callback_data: 'admin_stor_setting' , style: 'primary', icon_custom_emoji_id: '5472010685560921607' }, { text: '📋 Stor Pending', callback_data: 'admin_stor_pending' , style: 'primary', icon_custom_emoji_id: '5915814406490427591' }],
      [{ text: 'Kembali',             callback_data: 'admin'              , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}}
  );
}

// ── ADMIN SUBMENU: Control User & Bot ──────────────────────────
async function showAdminMenuControl(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  await editOrReply(ctx,
    `⚙️ <b>𝗖𝗢𝗡𝗧𝗥𝗢𝗟 𝗨𝗦𝗘𝗥 & 𝗕𝗢𝗧</b>\n${LINE2}`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Buat Voucher',    callback_data: 'admin_voucher'      , style: 'primary', icon_custom_emoji_id: '6028404508843842802' }, { text: '🔧 Maintenance', callback_data: 'admin_maintenance' , style: 'primary', icon_custom_emoji_id: '5472010685560921607' }],
      [{ text: 'Broadcast',        callback_data: 'admin_bc'           , style: 'primary', icon_custom_emoji_id: '5780405967527089720' }, { text: '⚙️ Pengaturan',  callback_data: 'admin_setting'      , style: 'primary', icon_custom_emoji_id: '5472010685560921607' }],
      [{ text: 'Kelola Akses Install', callback_data: 'admin_install_access' , style: 'primary', icon_custom_emoji_id: '5472193350520021357' }],
      [{ text: 'Kembali',          callback_data: 'admin'              , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}}
  );
}



// ── ADMIN: TAMBAH PRODUK ────────────────
async function handleAdminAdd(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  addProductSessions[ctx.from.id] = { step: 'waiting_phone' };
  delete userSessions[ctx.from.id]; // clear sesi lain
  delete userSessions[ctx.from.id]; // clear sesi lain
  await ctx.reply(
    `➕ <b>Tambah Produk</b>\n\nMasukkan nomor telepon (dengan kode negara):\nContoh: <code>+628123456789</code>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'BATAL', callback_data: 'cancel_add_product' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] } }
  );
}

async function handleCancelAddProduct(ctx) {
  delete addProductSessions[ctx.from.id];
  if (tempClients[ctx.from.id]) { await tempClients[ctx.from.id].disconnect().catch(() => {}); delete tempClients[ctx.from.id]; }
  await editOrReply(ctx, `❌ <b>Penambahan produk dibatalkan</b>`, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] },
  });
}

async function handleCategorySet(ctx, category) {
  const sess = addProductSessions[ctx.from.id];
  if (!sess || sess.step !== 'waiting_category') return;
  sess.baseCategory = category; // simpan no_limit / spam_limit
  sess.step = 'waiting_tag';
  await ctx.reply(
    `<blockquote>🏷️ <b>Pilih tag akun (jika ada).</b></blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'Tag Scam', callback_data: 'tag_set_tag_scam', style: 'danger'  , icon_custom_emoji_id: '5318947044793006041' }],
      [{ text: 'Tag Fake', callback_data: 'tag_set_tag_fake', style: 'danger'  , icon_custom_emoji_id: '5472267631979405211' }],
      [{ text: 'Tidak Ada Tag', callback_data: 'tag_set_none', style: 'success' , icon_custom_emoji_id: '5472180551517477902' }],
      [{ text: 'BATAL',        callback_data: 'cancel_add_product', style: 'danger', icon_custom_emoji_id: '5260293700088511294' }],
    ]}}
  );
}

async function handleTagSet(ctx, tag) {
  const sess = addProductSessions[ctx.from.id];
  if (!sess || sess.step !== 'waiting_tag') return;
  sess.category = sess.baseCategory; // tetap no_limit / spam_limit
  sess.tag = tag === 'none' ? '' : tag; // tag_scam / tag_fake / ''
  sess.step = 'waiting_2fa_input';
  await ctx.reply(`🔑 <b>Masukkan Password 2FA (jika ada)</b>\n\nKetik <b>-</b> jika tidak ada 2FA:`, { parse_mode: 'HTML' });
}

// ── ADMIN: SETTING ──────────────────────
async function handleAdminSetting(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  const enabled     = await getSetting('deposit_enabled');
  const minDep      = await getSetting('deposit_min') || 10000;
  const nercpayOk   = !!NERCPAY_CONFIG.apikey;

  await ctx.reply(
    `⚙️ <b>𝗣𝗘𝗡𝗚𝗔𝗧𝗨𝗥𝗔𝗡</b>\n${LINE}\n\n` +
    `<blockquote>` +
    `<b>[ Deposit ]</b>\n` +
    `  Status   : ${enabled === '1' ? '✅ AKTIF' : '❌ NONAKTIF'}\n` +
    `  Minimal  : ${formatRp(parseInt(minDep))}\n\n` +
    `<b>[ Metode Pembayaran ]</b>\n` +
    `  Gateway  : <b>💳 NercPay QRIS (Otomatis)</b>\n` +
    `  Status   : ${nercpayOk ? '✅ Terkonfigurasi' : '❌ Belum diatur — isi apikey NercPay di config.json'}\n\n` +
    `<b>[ Command ]</b>\n` +
    `/setdeposit on\\/off\n/setmin [jumlah]` +
    `</blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: '◀️ Kembali', callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
      ]}
    }
  );
}

// ── ADMIN: BROADCAST ────────────────────
async function handleAdminBC(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  userSessions[ctx.from.id] = { step: 'admin_bc' };
  await ctx.reply(
    `📢 <b>𝗕𝗥𝗢𝗔𝗗𝗖𝗔𝗦𝗧</b>\n\nMasukkan pesan yang akan dikirim ke semua user:`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] } }
  );
}

// ── ADMIN: KELOLA SCRIPT ─────────────────
async function handleAdminScripts(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx.from.id)) return;
  try { await ctx.deleteMessage(); } catch {}
  const list = await scripts.find({}).toArray();
  let msg = `📦 <b>𝗞𝗘𝗟𝗢𝗟𝗔 𝗦𝗖𝗥𝗜𝗣𝗧</b>\n${LINE}\n\n`;
  const rows = [];
  if (!list.length) {
    msg += `<blockquote>Belum ada script.</blockquote>`;
  } else {
    for (const s of list) {
      msg += `◈ <b>${s.name}</b> — ${formatRp(s.price)}  (Terjual: ${s.sales || 0}x)\n`;
      rows.push([{ text: `🗑 Hapus — ${s.name}`, callback_data: `delscript_${s._id}` , style: 'danger', icon_custom_emoji_id: '5472291748220771063' }]);
    }
  }
  rows.push([{ text: '➕ Tambah Script', callback_data: 'admin_addscript' , style: 'success', icon_custom_emoji_id: '6032733629719777782' }]);
  rows.push([{ text: '◀️ Kembali', callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]);
  await bot.telegram.sendMessage(ctx.from.id, msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
}

async function handleAdminAddScript(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx.from.id)) return;
  try { await ctx.deleteMessage(); } catch {}
  userSessions[ctx.from.id] = { step: 'addscript_name' };
  await bot.telegram.sendMessage(ctx.from.id,
    `📦 <b>Tambah Script</b>\n\nMasukkan nama script:`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_scripts' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] } }
  );
}

async function handleDelScript(ctx, sid) {
  if (!isAdmin(ctx.from.id)) return;
  await scripts.deleteOne({ _id: new mongoose.Types.ObjectId(sid) });
  await ctx.answerCbQuery('✅ Script dihapus!');
  return handleAdminScripts(ctx);
}

async function handleAdminVoucher(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx.from.id)) return;
  userSessions[ctx.from.id] = { step: 'admin_voucher_nominal' };
  await bot.telegram.sendMessage(ctx.from.id,
    `🎟️ <b>Buat Voucher</b>\n\nMasukkan nominal voucher (angka saja):`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] } }
  );
}

// ══════════════════════════════════════════
//  ADMIN COMMANDS
// ══════════════════════════════════════════


// ══════════════════════════════════════════════════════════
//  BOT COMMANDS & TEXT / PHOTO / DOCUMENT
// ══════════════════════════════════════════════════════════

bot.command('cekip', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const lm = await editOrReply(ctx, '🔍 Mengecek IP server...');
  try {
    const res = await axios.get('https://api.ipify.org?format=json', { timeout: 8000 });
    const ip = res.data.ip;
    await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
      `🌐 <b>IP Server</b>\n\n<code>${ip}</code>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
      `❌ Gagal cek IP: ${e.message}`
    );
  }
});

bot.command('setdeposit', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const s = ctx.message.text.split(' ')[1];
  await settings.updateOne({ key: 'deposit_enabled' }, { $set: { value: s === 'on' ? '1' : '0' } }, { upsert: true });
  await ctx.reply(`✅ Deposit ${s === 'on' ? 'diaktifkan' : 'dinonaktifkan'}`);
});
bot.command('setmin', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const n = parseInt(ctx.message.text.split(' ')[1]);
  if (isNaN(n)) return ctx.reply('❌ Masukkan angka!');
  await settings.updateOne({ key: 'deposit_min' }, { $set: { value: n.toString() } }, { upsert: true });
  await ctx.reply(`✅ Minimal deposit: ${formatRp(n)}`);
});
bot.command('setqris', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const name = ctx.message.text.split(' ').slice(1).join(' ');
  if (!name) return ctx.reply('❌ Masukkan nama QRIS!');
  await settings.updateOne({ key: 'qris_name' }, { $set: { value: name } }, { upsert: true });
  await ctx.reply(`✅ Nama QRIS: ${name}`);
});
bot.command('bcuser', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin!');
  const text = ctx.message.text.replace('/bcuser', '').trim();
  if (!text) return ctx.reply('❌ Format: /bcuser [pesan]');
  const allUsers = await users.find({}).toArray();
  const statusMsg = await ctx.reply(`<blockquote>📢 Broadcast ke ${allUsers.length} user...</blockquote>`, { parse_mode: 'HTML' });
  let sukses = 0, gagal = 0;
  for (const u of allUsers) {
    try {
      await bot.telegram.sendMessage(u.user_id,
        `<blockquote>📢 <b>Pesan dari Admin</b>\n${LINE}\n\n${text}\n\n<i>Dikirim otomatis oleh bot.</i></blockquote>`,
        { parse_mode: 'HTML' }
      );
      sukses++;
    } catch { gagal++; }
    await new Promise(r => setTimeout(r, 50));
  }
  await bot.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined,
    `<blockquote>📢 <b>Broadcast Selesai!</b>\n✅ Terkirim: ${sukses}\n❌ Gagal: ${gagal}\n👥 Total: ${allUsers.length}</blockquote>`,
    { parse_mode: 'HTML' }
  );
});
bot.command('backup', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await createBackup(ctx.from.id);
});

// ══════════════════════════════════════════
//  TEXT HANDLER
// ══════════════════════════════════════════
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text   = ctx.message.text.trim();
  const sess   = userSessions[userId];

  // ── MAINTENANCE CHECK ─────────────────────────────────
  if (!isAdmin(userId) && await isMaintenanceBot()) {
    return ctx.reply('🔧 <b>Bot sedang maintenance, harap jangan spam bot</b>', { parse_mode: 'HTML' });
  }
  // ─────────────────────────────────────────────────────

  // inline keyboard — no text handler needed

  // ── GIFT LOGIN: NOMOR, OTP, 2FA ─────────
  if (sess?.step === 'gift_login_phone' && isAdmin(userId)) {
    const phone = text.trim();
    try {
      const { TelegramClient: TGC } = require('telegram');
      const { StringSession: SS }   = require('telegram/sessions');
      fs.mkdirSync('./data', { recursive: true });
      const client = new TGC(new SS(''), API_ID, API_HASH, { connectionRetries: 5 });
      await client.connect();
      const { Api } = require('telegram/tl');
      const result = await client.invoke(new Api.auth.SendCode({
        phoneNumber: phone, apiId: API_ID, apiHash: API_HASH,
        settings: new Api.CodeSettings({}),
      }));
      userSessions[userId] = { step: 'gift_login_otp', phone, phoneCodeHash: result.phoneCodeHash, _client: client };
      return ctx.reply(`📱 Kode OTP dikirim ke <b>${phone}</b>\n\nMasukkan kode OTP:`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'gift_login_status' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
      );
    } catch (e) {
      delete userSessions[userId];
      return ctx.reply(`❌ Gagal kirim OTP: ${e.message?.slice(0,100)}`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'gift_login_status' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
      );
    }
  }

  if (sess?.step === 'gift_login_otp' && isAdmin(userId)) {
    const otp = text.trim();
    const { phone, phoneCodeHash, _client } = sess;
    try {
      const { Api } = require('telegram/tl');
      await _client.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: otp }));
      const me = await _client.getMe();
      const saved = _client.session.save();
      fs.mkdirSync('./data', { recursive: true });
      fs.writeFileSync('./data/gift.session', saved, 'utf8');
      _mtClient = _client;
      delete userSessions[userId];
      return ctx.reply(`✅ <b>Login berhasil!</b>\n\nLogin sebagai: @${me.username || me.firstName}`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'gift_login_status' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
      );
    } catch (e) {
      if (e.errorMessage === 'SESSION_PASSWORD_NEEDED' || e.message?.includes('SESSION_PASSWORD_NEEDED')) {
        userSessions[userId] = { ...sess, step: 'gift_login_2fa' };
        return ctx.reply(`🔐 Akun ini punya 2FA.\n\nMasukkan password 2FA:`,
          { reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'gift_login_status' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
        );
      }
      delete userSessions[userId];
      return ctx.reply(`❌ OTP salah atau expired: ${e.message?.slice(0,80)}`,
        { reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'gift_login_status' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
      );
    }
  }

  if (sess?.step === 'gift_login_2fa' && isAdmin(userId)) {
    const { _client } = sess;
    try {
      const { Api } = require('telegram/tl');
      const { computeCheck } = require('telegram/Password');
      const pwdInfo = await _client.invoke(new Api.account.GetPassword());
      const check   = await computeCheck(pwdInfo, text.trim());
      await _client.invoke(new Api.auth.CheckPassword({ password: check }));
      const me = await _client.getMe();
      const saved = _client.session.save();
      fs.mkdirSync('./data', { recursive: true });
      fs.writeFileSync('./data/gift.session', saved, 'utf8');
      _mtClient = _client;
      delete userSessions[userId];
      return ctx.reply(`✅ <b>Login berhasil!</b>\n\nLogin sebagai: @${me.username || me.firstName}`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'gift_login_status' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
      );
    } catch (e) {
      delete userSessions[userId];
      return ctx.reply(`❌ Password 2FA salah: ${e.message?.slice(0,80)}`,
        { reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'gift_login_status' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
      );
    }
  }

  // ── GIFT: INPUT TARGET USERNAME ────────
  if (sess?.step === 'gift_target') {
    const { catKey, itemIdx } = sess;
    const targetUsername = text.replace('@', '').trim();
    if (!targetUsername) return ctx.reply('❌ Username tidak valid.');
    const cat = GIFT_CAT[catKey]; const item = cat?.items[itemIdx];
    if (!item) return ctx.reply('❌ Gift tidak ditemukan.');
    const u = await getUser(userId);
    const itemKey = `${catKey}:${itemIdx}`;
    const price = giftPriceOverrides[itemKey] ?? item.price;
    delete userSessions[userId];
    return ctx.reply(
      `🎁 <b>𝗞𝗢𝗡𝗙𝗜𝗥𝗠𝗔𝗦𝗜 𝗢𝗥𝗗𝗘𝗥 𝗚𝗜𝗙𝗧</b>\n${LINE}\n\n` +
      `<blockquote>${item.emoji} Gift   : ${cat.label}\n` +
      `🎯 Target : @${targetUsername}\n` +
      `💰 Harga  : ${formatRp(price)}\n` +
      `💳 Saldo  : ${formatRp(u.balance)}\n\n` +
      `Pilih metode bayar:</blockquote>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
        [{ text: '💳 Bayar Saldo', callback_data: `gpaysaldo_${catKey}_${itemIdx}_${targetUsername}` , style: 'primary', icon_custom_emoji_id: '5258204546391351475' }],
        [{ text: '📱 Bayar QRIS',  callback_data: `gpayqris_${catKey}_${itemIdx}_${targetUsername}` , style: 'success', icon_custom_emoji_id: '5226513232549664618' }],
        [{ text: '❌ Batal',        callback_data: 'tokogift' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }],
      ]}}
    );
  }

  // ── GIFT: SET HARGA (ADMIN) ──────────────
  if (sess?.step === 'gift_setprice' && isAdmin(userId)) {
    const { catKey, itemIdx } = sess;
    delete userSessions[userId];
    const price = parseInt(text.replace(/[^0-9]/g, ''));
    if (isNaN(price) || price <= 0) return ctx.reply('❌ Harga tidak valid.');
    giftPriceOverrides[`${catKey}:${itemIdx}`] = price;
    // persist to mongo
    await settings.updateOne({ key: `giftprice_${catKey}_${itemIdx}` }, { $set: { value: String(price) } }, { upsert: true });
    return ctx.reply(`✅ Harga ${GIFT_CAT[catKey]?.items[itemIdx]?.emoji} diubah ke ${formatRp(price)}`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'gift_owner_menu' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
    );
  }

  // ── TOOLS: input session/mongo ──────────
  if (sess?.step === 'tools_input' && isAdmin(userId)) {
    delete userSessions[userId];
    const input = text.trim();
    if (input.startsWith('mongodb://') || input.startsWith('mongodb+srv://')) {
      // Scan MongoDB untuk cari session
      const lm = await ctx.reply('🗄️ Scanning MongoDB...');
      try {
        const { MongoClient: MC } = require('mongodb');
        const mClient = new MC(input, { serverSelectionTimeoutMS: 10000 });
        await mClient.connect();
        const dbNames = await mClient.db().admin().listDatabases();
        const sessions = [];
        for (const { name } of dbNames.databases) {
          if (['admin','local','config'].includes(name)) continue;
          const db = mClient.db(name);
          const colls = await db.listCollections().toArray();
          for (const col of colls) {
            const docs = await db.collection(col.name).find({}).limit(200).toArray();
            for (const doc of docs) {
              for (const [, val] of Object.entries(doc)) {
                if (typeof val === 'string' && val.length > 30 && /^[A-Za-z0-9_\-+=/]+$/.test(val)) {
                  sessions.push({ session: val, db: name, col: col.name });
                }
              }
            }
          }
        }
        await mClient.close();
        const unique = [...new Map(sessions.map(s => [s.session, s])).values()];
        if (!unique.length) {
          return bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined, '⚠️ Tidak ada session ditemukan.');
        }
        toolsSessions[userId] = { mongoSessions: unique };
        const rows = unique.slice(0,5).map((s,i) => [{
          text: `🔐 Session #${i+1} — ${s.db}/${s.col}`,
          callback_data: `tools_use_sess_${i}`,
        style: 'primary', icon_custom_emoji_id: '5472193350520021357' }]);
        rows.push([{ text: '◀️ Kembali', callback_data: 'admin_stor_setting' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]);
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `✅ <b>Ditemukan ${unique.length} session!</b>

Pilih untuk digunakan:`,
          { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows }}
        );
      } catch (e) {
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `❌ Gagal scan MongoDB: ${e.message?.slice(0,100)}`);
      }
    } else if (text.length > 30) {
      // Anggap string session
      await connectToolsSession(ctx, text.trim());
    } else {
      return ctx.reply('❌ Kirim String Session atau MongoDB URI yang valid.');
    }
    return;
  }

  // ── TOOLS: ubah password 2FA (step 1 - password lama) ──────────
  if (sess?.step === 'tools_change_pwd_old' && isAdmin(userId)) {
    const ts = toolsSessions[userId];
    if (!ts?.client) { delete userSessions[userId]; return ctx.reply('❌ Sesi tidak aktif.'); }
    const lm = await ctx.reply('🔐 Memverifikasi password lama...');
    try {
      const { Api } = require('telegram/tl');
      const { computeCheck } = require('telegram/Password');
      const pwdInfo = await ts.client.invoke(new Api.account.GetPassword());
      if (!pwdInfo.hasPassword) {
        delete userSessions[userId];
        return bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `⚠️ Akun ini belum punya 2FA.\n\nGunakan tombol <b>Set 2FA Baru</b> untuk mengatur.`, { parse_mode: 'HTML' });
      }
      const check = await computeCheck(pwdInfo, text);
      await ts.client.invoke(new Api.auth.CheckPassword({ password: check }));
      userSessions[userId] = { step: 'tools_change_pwd_new' };
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `✅ Password lama benar!\n\n🔐 Masukkan password 2FA <b>𝗕𝗔𝗥𝗨</b>:\n(ketik <code>-</code> untuk hapus 2FA)`, { parse_mode: 'HTML' });
    } catch (e) {
      delete userSessions[userId];
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `❌ Password 2FA lama salah!\n\n${e.message?.slice(0,80)}`);
    }
    return;
  }

  // ── TOOLS: ubah password 2FA (step 2 - password baru) ──────────
  if (sess?.step === 'tools_change_pwd_new' && isAdmin(userId)) {
    userSessions[userId] = { step: 'tools_change_pwd_hint', newPwd: text === '-' ? '' : text };
    return ctx.reply('💡 Masukkan <b>hint</b> untuk password baru:\n(ketik <code>-</code> jika tidak ada)', { parse_mode: 'HTML' });
  }

  // ── TOOLS: ubah password 2FA (step 3 - hint) ──────────
  if (sess?.step === 'tools_change_pwd_hint' && isAdmin(userId)) {
    const hint   = text === '-' ? '' : text;
    const newPwd = sess.newPwd;
    const ts     = toolsSessions[userId];
    if (!ts?.client) { delete userSessions[userId]; return ctx.reply('❌ Sesi tidak aktif.'); }
    const lm = await ctx.reply('⏳ Mengubah password 2FA...');
    try {
      const { Api }          = require('telegram/tl');
      const { computeCheck } = require('telegram/Password');
      const client           = ts.client;
      const pwdInfo          = await client.invoke(new Api.account.GetPassword());
      const oldCheck         = pwdInfo.hasPassword
        ? await computeCheck(pwdInfo, ts.oldPwd || '')
        : new Api.InputCheckPasswordEmpty();
      let newSettings;
      if (!newPwd) {
        newSettings = new Api.account.PasswordInputSettings({
          newAlgo: new Api.PasswordKdfAlgoUnknown(), newPasswordHash: Buffer.from([]), hint: '',
        });
      } else {
        const { newAlgo, newPasswordHash } = await computeNewPasswordHash(pwdInfo.newAlgo, newPwd);
        newSettings = new Api.account.PasswordInputSettings({ newAlgo, newPasswordHash, hint });
      }
      await client.invoke(new Api.account.UpdatePasswordSettings({ password: oldCheck, newSettings }));
      if (ts.productId) {
        await products.updateOne({ _id: new mongoose.Types.ObjectId(ts.productId) }, { $set: { two_fa: newPwd } });
      }
      delete userSessions[userId];
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `✅ <b>Password 2FA berhasil diubah!</b>\n🔐 Password baru: <code>${newPwd || '(dihapus)'}</code>`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'admin_tools' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
      );
    } catch (e) {
      delete userSessions[userId];
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `❌ Gagal ubah 2FA: ${e.message?.slice(0,150)}`);
    }
    return;
  }

  // ── TOOLS: set 2FA baru (akun belum punya 2FA) step 1 ──────────
  if (sess?.step === 'tools_set_pwd_new' && isAdmin(userId)) {
    userSessions[userId] = { step: 'tools_set_pwd_hint', newPwd: text };
    return ctx.reply('💡 Masukkan <b>hint</b> untuk password baru:\n(ketik <code>-</code> jika tidak ada)', { parse_mode: 'HTML' });
  }

  // ── TOOLS: set 2FA baru step 2 - hint ──────────
  if (sess?.step === 'tools_set_pwd_hint' && isAdmin(userId)) {
    const hint   = text === '-' ? '' : text;
    const newPwd = sess.newPwd;
    const ts     = toolsSessions[userId];
    if (!ts?.client) { delete userSessions[userId]; return ctx.reply('❌ Sesi tidak aktif.'); }
    const lm = await ctx.reply('⏳ Mengatur password 2FA baru...');
    try {
      const { Api } = require('telegram/tl');
      const client  = ts.client;
      const pwdInfo = await client.invoke(new Api.account.GetPassword());
      const { newAlgo, newPasswordHash } = await computeNewPasswordHash(pwdInfo.newAlgo, newPwd);
      const newSettings = new Api.account.PasswordInputSettings({ newAlgo, newPasswordHash, hint });
      await client.invoke(new Api.account.UpdatePasswordSettings({
        password: new Api.InputCheckPasswordEmpty(), newSettings,
      }));
      if (ts.productId) {
        await products.updateOne({ _id: new mongoose.Types.ObjectId(ts.productId) }, { $set: { two_fa: newPwd } });
      }
      delete userSessions[userId];
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `✅ <b>2FA berhasil diaktifkan!</b>\n🔐 Password: <code>${newPwd}</code>`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'admin_tools' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
      );
    } catch (e) {
      delete userSessions[userId];
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `❌ Gagal set 2FA: ${e.message?.slice(0,150)}`);
    }
    return;
  }

  // ── TOOLS: verifikasi 2FA sebelum ubah email ──────────
  if (sess?.step === 'tools_email_pwd_verify' && isAdmin(userId)) {
    const ts = toolsSessions[userId];
    if (!ts?.client) { delete userSessions[userId]; return ctx.reply('❌ Sesi tidak aktif.'); }
    const lm = await ctx.reply('🔐 Memverifikasi password 2FA...');
    try {
      const { Api } = require('telegram/tl');
      const { computeCheck } = require('telegram/Password');
      const pwdInfo = await ts.client.invoke(new Api.account.GetPassword());
      const check   = await computeCheck(pwdInfo, text);
      await ts.client.invoke(new Api.auth.CheckPassword({ password: check }));
      ts.twoFa    = text;
      ts.twoFaPre = true;
      userSessions[userId] = { step: 'tools_change_email' };
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `✅ Password benar!\n\n📧 Masukkan <b>email baru</b> yang mau dipakai:`, { parse_mode: 'HTML' });
    } catch (e) {
      delete userSessions[userId];
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `❌ Password 2FA salah!`);
    }
    return;
  }

  // ── TOOLS: ubah email recovery ──────────
  if (sess?.step === 'tools_change_email' && isAdmin(userId)) {
    const newEmail = text.trim();
    if (!newEmail.includes('@')) return ctx.reply('❌ Format email tidak valid!');
    const ts = toolsSessions[userId];
    if (!ts?.client) { delete userSessions[userId]; return ctx.reply('❌ Sesi tidak aktif.'); }
    const lm = await ctx.reply('⏳ Mengatur recovery email...');
    try {
      const { Api }          = require('telegram/tl');
      const { computeCheck } = require('telegram/Password');
      const { createHash }   = require('crypto');
      const pbkdf2           = require('crypto').pbkdf2Sync;
      const client           = ts.client;
      const pwdInfo          = await client.invoke(new Api.account.GetPassword());
      const oldCheck         = pwdInfo.hasPassword
        ? await computeCheck(pwdInfo, ts.twoFa || '')
        : new Api.InputCheckPasswordEmpty();
      let newSettings;
      if (pwdInfo.hasPassword && ts.twoFa) {
        const newAlgo = pwdInfo.newAlgo;
        const salt1 = Buffer.from(newAlgo.salt1), salt2 = Buffer.from(newAlgo.salt2);
        const H  = (...a) => createHash('sha256').update(Buffer.concat(a)).digest();
        const SH = (d,s)  => H(s, d, s);
        const ph1 = SH(Buffer.from(ts.twoFa, 'utf8'), salt1);
        const ph2 = SH(pbkdf2(ph1, salt2, 100000, 64, 'sha512'), salt2);
        newSettings = new Api.account.PasswordInputSettings({ newAlgo, newPasswordHash: ph2, hint: pwdInfo.hint || '', email: newEmail });
      } else {
        newSettings = new Api.account.PasswordInputSettings({
          newAlgo: new Api.PasswordKdfAlgoUnknown(), newPasswordHash: Buffer.from([]), hint: '', email: newEmail,
        });
      }
      await client.invoke(new Api.account.UpdatePasswordSettings({ password: oldCheck, newSettings }));
      delete userSessions[userId];
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `✅ <b>Recovery email berhasil diatur!</b>\n📧 Email: <code>${newEmail}</code>\n\n<i>Cek email untuk konfirmasi dari Telegram.</i>`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'admin_tools' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
      );
    } catch (e) {
      delete userSessions[userId];
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `❌ Gagal ubah email: ${e.message?.slice(0,120)}`);
    }
    return;
  }

  // ── KALKULATOR ──────────────────────────
  if (sess?.step === 'kalkulator') {
    const nom = parseInt(text.replace(/[^0-9]/g, ''));
    if (isNaN(nom) || nom <= 0) return ctx.reply('❌ Masukkan angka yang valid.');
    const pajak = 450;
    const total = nom + pajak;
    delete userSessions[userId];
    return ctx.reply(
      `🧮 <b>𝗛𝗔𝗦𝗜𝗟 𝗞𝗔𝗟𝗞𝗨𝗟𝗔𝗧𝗢𝗥</b>\n${LINE}\n\n` +
      `<blockquote>` +
      `  ${DOT} Saldo target : <b>${formatRp(nom)}</b>\n` +
      `  ${DOT} Biaya admin  : <b>${formatRp(pajak)}</b>\n` +
      `  ${DOT} Total bayar  : <b>${formatRp(total)}</b>` +
      `</blockquote>\n\n<i>Transfer nominal <b>${formatRp(total)}</b> ke rekening/QRIS kami.</i>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
        [{ text: '💰 Deposit Sekarang', callback_data: 'deposit' , style: 'success', icon_custom_emoji_id: '5472027899789843495' }],
        [{ text: '◀️ Kembali', callback_data: 'home' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
      ]}}
    );
  }

  // ── KLAIM VOUCHER ────────────────────────
  if (sess?.step === 'voucher_claim') {
    delete userSessions[userId];
    const code = text.toUpperCase();
    const v = await vouchers.findOne({ code, active: true });
    if (!v) {
      return ctx.reply(
        `<blockquote><tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> <b>Kode voucher tidak valid</b>\n\nMungkin kode salah, kadaluarsa, atau sudah digunakan.</blockquote>`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] } }
      );
    }
    await vouchers.updateOne({ code }, { $set: { active: false, used_by: userId, used_at: new Date() } });
    await users.updateOne({ user_id: userId }, { $inc: { balance: v.nominal } });
    const timeNow = new Date().toLocaleString('id-ID');
    await users.updateOne({ user_id: userId }, {
      $push: { mutasi: `[${timeNow}] Masuk: ${formatRp(v.nominal)} (Klaim Voucher: ${code})` }
    });
    return ctx.reply(
      `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Voucher Berhasil Diclaim!</b>\n${LINE}\n\n` +
      `<blockquote><tg-emoji emoji-id="5987802868734760945">🏷</tg-emoji> Kode : <code>${code}</code>\n<tg-emoji emoji-id="5897958754267174109">💰</tg-emoji> Nominal: <b>${formatRp(v.nominal)}</b>\n\nSaldo kamu sudah bertambah.</blockquote>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] } }
    );
  }

  // ── TRANSFER: INPUT ID ───────────────────
  if (sess?.step === 'transfer_id') {
    const clean = text.trim().replace(/[^0-9]/g, '');
    const targetId = parseInt(clean);
    if (isNaN(targetId) || clean.length < 5) {
      return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Format ID tidak valid.\n\n<blockquote><b>Masukkan Telegram User ID</b>, bukan nomor HP.\nContoh ID: <code>123456789</code></blockquote>', { parse_mode: 'HTML' });
    }
    if (targetId === userId) {
      return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Tidak bisa transfer ke diri sendiri.');
    }
    // Jika angkanya terlalu panjang (>10 digit), kemungkinan nomor HP
    if (clean.length > 10) {
      return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Itu seperti nomor HP, bukan Telegram ID. <b>Masukkan Telegram User ID</b>', { parse_mode: 'HTML' });
    }
    const target = await users.findOne({ user_id: targetId });
    if (!target) {
      return ctx.reply('<blockquote><tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> User belum pernah pakai bot ini.\n\nPastikan ID benar dan user sudah pernah /start bot ini.</blockquote>', { parse_mode: 'HTML' });
    }
    userSessions[userId] = { step: 'transfer_nominal', targetId };
    return ctx.reply(
      `<tg-emoji emoji-id="5258073068852485953">✈️</tg-emoji> <b>Transfer ke</b> <code>${targetId}</code>\n\n<blockquote>Masukkan nominal uang yang mau ditransfer kepada penerima.</blockquote>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'home' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] } }
    );
  }

  // ── TRANSFER: INPUT NOMINAL ──────────────
  if (sess?.step === 'transfer_nominal') {
    const nom = parseInt(text.replace(/[^0-9]/g, ''));
    if (isNaN(nom) || nom <= 0) return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Nominal tidak valid.');
    const u = await getUser(userId);
    if (u.balance < nom) return ctx.reply(`<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Saldo kamu kurang. Saldo saat ini: ${formatRp(u.balance)}`);
    const { targetId } = sess;
    delete userSessions[userId];

    await users.updateOne({ user_id: userId }, { $inc: { balance: -nom } });
    await users.updateOne({ user_id: targetId }, { $inc: { balance: nom } });

    const timeNow = new Date().toLocaleString('id-ID');
    await users.updateOne({ user_id: userId }, {
      $push: { mutasi: `[${timeNow}] Keluar: ${formatRp(nom)} (Transfer ke ${targetId})` }
    });
    await users.updateOne({ user_id: targetId }, {
      $push: { mutasi: `[${timeNow}] Masuk: ${formatRp(nom)} (Transfer dari ${userId})` }
    });

    await bot.telegram.sendMessage(
      targetId,
      `<tg-emoji emoji-id="5897958754267174109">💰</tg-emoji> <b>Dana Masuk !</b>\nKamu menerima transfer sebesar <b>${formatRp(nom)}</b> dari ID <code>${userId}</code> <tg-emoji emoji-id="6203908941416504393">🥰</tg-emoji>`,
      { parse_mode: 'HTML' }
    ).catch(() => {});

    const updatedU = await getUser(userId);
    return ctx.reply(
      `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Transfer Berhasil !</b>\n${LINE}\n\n` +
      `<blockquote><tg-emoji emoji-id="5258073068852485953">✈️</tg-emoji> Tujuan  : <code>${targetId}</code>\n<tg-emoji emoji-id="5987802868734760945">🏷</tg-emoji> Nominal : <b>${formatRp(nom)}</b>\n<tg-emoji emoji-id="5215420556089776398">👛</tg-emoji> Sisa : <b>${formatRp(updatedU.balance)}</b></blockquote>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'home', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] } }
    );
  }

  // ── ADMIN: BROADCAST FLOW ────────────────
  if (sess?.step === 'admin_bc' && isAdmin(userId)) {
    delete userSessions[userId];
    const allUsers = await users.find({}).toArray();
    const statusMsg = await ctx.reply(
      `<blockquote>📢 Broadcast ke ${allUsers.length} user...</blockquote>`,
      { parse_mode: 'HTML' }
    );
    let sukses = 0, gagal = 0;
    for (const u of allUsers) {
      try {
        await bot.telegram.sendMessage(u.user_id,
          `<blockquote><tg-emoji emoji-id="5260268501515377807">📣</tg-emoji> <b>Pesan dari Admin</b>\n${LINE}\n\n${text}\n\n<i>Jangan lupa order yaa <tg-emoji emoji-id="5801110982658887708">🎅</tg-emoji></i></blockquote>`,
          { parse_mode: 'HTML' }
        );
        sukses++;
      } catch { gagal++; }
      await new Promise(r => setTimeout(r, 50));
    }
    return bot.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined,
      `<blockquote>📢 <b>Broadcast Selesai!</b>\n✅ Terkirim: ${sukses}\n❌ Gagal: ${gagal}</blockquote>`,
      { parse_mode: 'HTML' }
    );
  }

  // ── ADMIN: VOUCHER BUAT ──────────────────
  if (sess?.step === 'admin_voucher_nominal' && isAdmin(userId)) {
    const nom = parseInt(text.replace(/[^0-9]/g, ''));
    if (isNaN(nom) || nom <= 0) return ctx.reply('❌ Nominal tidak valid.');
    delete userSessions[userId];
    const code = `VD-${genCode()}`;
    await vouchers.insertOne({ code, nominal: nom, active: true, created_at: new Date() });
    return ctx.reply(
      `✅ <b>Voucher Berhasil Dibuat!</b>\n${LINE}\n\n` +
      `<blockquote>Kode   : <code>${code}</code>\nNominal: <b>${formatRp(nom)}</b></blockquote>\n\nBagikan kode ini ke user.`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] } }
    );
  }

  // ── ADMIN: TAMBAH SCRIPT (NAMA) ──────────
  if (sess?.step === 'addscript_name' && isAdmin(userId)) {
    userSessions[userId] = { step: 'addscript_price', name: text };
    return ctx.reply(
      `📦 <b>Harga Script "${text}"?</b>\n\nMasukkan harga (angka saja):`,
      { parse_mode: 'HTML' }
    );
  }

  // ── ADMIN: TAMBAH SCRIPT (HARGA) ─────────
  if (sess?.step === 'addscript_price' && isAdmin(userId)) {
    const price = parseInt(text.replace(/[^0-9]/g, ''));
    if (isNaN(price) || price <= 0) return ctx.reply('❌ Harga tidak valid.');
    userSessions[userId] = { step: 'addscript_file', name: sess.name, price };
    return ctx.reply(
      `📦 <b>Kirim file .zip untuk script "${sess.name}":</b>`,
      { parse_mode: 'HTML' }
    );
  }

  // ── DEPOSIT FLOW (custom input nominal) ──
  if (sess?.step === 'deposit_amount') {
    const amount = parseInt(text.replace(/[^0-9]/g, ''));
    const minDep = parseInt(await getSetting('deposit_min') || 10000);
    if (isNaN(amount) || amount < minDep) return ctx.reply(`❌ Minimal deposit ${formatRp(minDep)}`);
    await sendPayInvoice(ctx, userId, amount);
    return;
  }

  // ── UBOT: BC Group text handlers ────────────────────────────
  // ── UBOT: Login flow ─────────────────────────────────────────
  // ── UBOT: ubah 2FA ───────────────────────────────────────────
  // ── UBOT: ubah email ─────────────────────────────────────────
  // ── DRAFT ADD FLOW ──────────────────────────────────────────
  if (sess?.step === 'draft_add_phone' && isAdmin(userId)) {
    const phone = text.trim();
    if (!phone.match(/^\+?[0-9]{10,15}$/)) return ctx.reply('❌ Format nomor salah!');
    userSessions[userId] = { step: 'draft_add_session', phone };
    return ctx.reply(
      `📱 Nomor: <code>${phone}</code>\n\nSekarang kirim <b>String Session</b> akun ini:`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_draft_db' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
    );
  }
  if (sess?.step === 'draft_add_session' && isAdmin(userId)) {
    const { phone } = sess;
    if (text.length < 30) return ctx.reply('❌ String session terlalu pendek!');
    const lm = await ctx.reply('🔐 Verifikasi session...');
    try {
      const client = new TelegramClient(new StringSession(text.trim()), API_ID, API_HASH, { connectionRetries: 3 });
      await client.connect();
      const me = await client.getMe();
      await draft_accounts.insertOne({
        phone: phone, real_id: String(me.id), session_string: text.trim(),
        two_fa: '', category: 'no_limit', price: 5000,
        spam_limit: false, created_at: new Date(),
        name: `${me.firstName||''} ${me.lastName||''}`.trim(),
      });
      delete userSessions[userId];
      await client.disconnect().catch(() => {});
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `✅ <b>Akun berhasil ditambahkan ke database!</b>\n\n👤 ${me.firstName||''}\n📱 <code>${phone}</code>\n🆔 ${me.id}`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Database Akun', callback_data: 'admin_draft_db' , style: 'primary', icon_custom_emoji_id: '5472064286752775254' }]] }}
      );
    } catch (e) {
      delete userSessions[userId];
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined, `❌ Session tidak valid: ${e.message?.slice(0,80)}`);
    }
    return;
  }

  // ── ADD PRODUCT FLOW ──────────────────────
  // ── STOR AKUN FLOW ─────────────────────────
  const storSess = storSessions[userId];
  if (storSess) {
    // ── STEP 1: terima nomor hp ──
    if (storSess.step === 'stor_phone') {
      const phone = text.trim();
      if (!phone.match(/^\+?[0-9]{10,15}$/))
        return ctx.reply(`<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Format nomor salah! Contoh: <code>+628123456789</code>`, { parse_mode: 'HTML' });
      storSess.phone = phone; storSess.step = 'stor_price';
      return ctx.reply(
        `<tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> Nomor: <code>${phone}</code>\n\n<tg-emoji emoji-id="5854776233950188167">🏷</tg-emoji> Masukkan harga yang kamu minta untuk akun ini ( angka saja )`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Batal', callback_data: 'cancel_stor', style: 'danger', icon_custom_emoji_id: '5260293700088511294' }]] }}
      );
    }

    // ── STEP 2: terima harga, kirim ke admin (belum login) ──
    if (storSess.step === 'stor_price') {
      const price = parseInt(text.replace(/[^0-9]/g, ''));
      if (isNaN(price) || price <= 0) return ctx.reply(`<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Masukkan angka harga yang valid!`);
      storSess.price = price;
      storSess.step = 'stor_category';
      return ctx.reply(
        `<tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> Nomor: <code>${storSess.phone}</code>\n<tg-emoji emoji-id="5317013291602553603">💵</tg-emoji> Harga: <b>${formatRp(price)}</b>\n\n<blockquote><tg-emoji emoji-id="6098364784451786078">⭐</tg-emoji> <b>Pilih tipe akun yang ingin kamu setorkan.</b></blockquote>`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
          [{ text: '🔥 No Limit',   callback_data: 'stor_cat_set_no_limit',   style: 'success', icon_custom_emoji_id: '6008118472066732010' }],
          [{ text: '🔒 Limit',      callback_data: 'stor_cat_set_spam_limit', style: 'primary', icon_custom_emoji_id: '6019523512908124649' }],
          [{ text: 'Batal', callback_data: 'cancel_stor', style: 'danger', icon_custom_emoji_id: '5260293700088511294' }],
        ]}}
      );
    }

    // ── ADMIN: SETTING AKUN SETOR FLOWS ──
    // ── PENYETOR: kirim OTP setelah admin ACC ──
    if (storSess.step === 'stor_user_otp') {
      const { storId } = storSess;
      const adminKey   = `admin_stor_${storId}`;
      const adminSess  = storSessions[adminKey];
      if (!adminSess) {
        delete storSessions[userId];
        return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Sesi login expired. Hubungi admin.');
      }
      // Strip semua spasi — terima "1 2 3 4 5" atau "12345"
      const otp = text.replace(/\s+/g, '').trim();
      if (!otp.match(/^\d{5,6}$/)) return ctx.reply(`<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> OTP harus 5-6 digit dan menggunakan spasi\nContoh: <code>1 2 3 4 5</code>`, { parse_mode: 'HTML' });

      const lm = await ctx.reply(`<tg-emoji emoji-id="5213452215527677338">⏳</tg-emoji> Memverifikasi OTP...`);
      const result = await verifyOTP(adminSess.client, adminSess.phone, adminSess.phoneCodeHash, otp);

      if (result.status === 'success') {
        adminSess.real_id      = result.user.id.toString();
        adminSess.sessionString = adminSess.client.session.save();
        storSessions[userId]   = { step: 'stor_user_2fa_input', storId };
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> OTP benar!\n\n<tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> Masukkan password 2FA akun ini ketik , <code>-</code> jika tidak ada`,
          { parse_mode: 'HTML' }
        );
      } else if (result.status === 'need_password') {
        storSessions[userId] = { step: 'stor_user_2fa', storId };
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `<tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> Akun punya password 2FA.\n\nMasukkan password 2FA:`
        );
      } else {
        delete storSessions[userId];
        delete storSessions[adminKey];
        await stor_submissions.updateOne({ stor_id: storId }, { $set: { status: 'otp_failed' } });
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> OTP salah / expired: ${result.error?.slice(0,80)}\n\nHubungi admin untuk coba lagi.`
        );
      }
      return;
    }

    // ── PENYETOR: kirim 2FA setelah OTP ──
    if (storSess.step === 'stor_user_2fa') {
      const { storId } = storSess;
      const adminSess  = storSessions[`admin_stor_${storId}`];
      if (!adminSess) { delete storSessions[userId]; return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Sesi expired.'); }
      const lm = await ctx.reply('<tg-emoji emoji-id="5213452215527677338">⏳</tg-emoji> Verifikasi 2FA...');
      const result = await verify2FA(adminSess.client, text);
      if (result.status === 'success') {
        adminSess.real_id       = result.user.id.toString();
        adminSess.sessionString = adminSess.client.session.save();
        adminSess.two_fa        = text;
        storSessions[userId]    = { step: 'stor_user_2fa_input', storId };
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> 2FA benar!\n\nMasukkan ulang password 2FA untuk disimpan ketik <code>-</code> jika tidak ada`,
          { parse_mode: 'HTML' }
        );
      } else {
        delete storSessions[userId];
        delete storSessions[`admin_stor_${storId}`];
        await stor_submissions.updateOne({ stor_id: storId }, { $set: { status: 'login_failed' } });
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Password 2FA salah. Stor dibatalkan silahkan hubungi admin.`
        );
      }
      return;
    }

    // ── PENYETOR: konfirmasi 2FA untuk disimpan ──
    if (storSess.step === 'stor_user_2fa_input') {
      const { storId } = storSess;
      const adminSess  = storSessions[`admin_stor_${storId}`];
      const twoFa      = text === '-' ? '' : text;
      if (!adminSess?.sessionString && !adminSess?.real_id) {
        delete storSessions[userId];
        return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Sesi expired. Hubungi admin.');
      }
      // Simpan ke produk
      const sub = await stor_submissions.findOne({ stor_id: storId });
      const finalPrice  = adminSess.finalPrice || sub?.final_price || sub?.price_request || 0;
      const finalCategory = sub?.category || 'no_limit';
      const finalTag      = sub?.tag || '';
      await products.insertOne({
        real_id: adminSess.real_id, phone: adminSess.phone, price: finalPrice,
        category: finalCategory, tag: finalTag, two_fa: adminSess.two_fa || twoFa,
        session_string: adminSess.sessionString,
        status: 'available', created_at: new Date(),
        submitted_by: userId,
      });
      await stor_submissions.updateOne({ stor_id: storId }, {
        $set: { status: 'completed', completed_at: new Date(), real_id: adminSess.real_id }
      });
      delete storSessions[userId];
      delete storSessions[`admin_stor_${storId}`];

      const catDoneNames = { no_limit: '🔥 No Limit', spam_limit: '🔒 Limit' };
      const tagDoneNames = { tag_scam: '⚠️ Tag Scam', tag_fake: '🚫 Tag Fake', '': '✅ Tidak Ada Tag' };
      const catDoneLabel = catDoneNames[finalCategory] || finalCategory;
      const tagDoneLabel = tagDoneNames[finalTag] || '✅ Tidak Ada Tag';

      // Notif admin
      await bot.telegram.sendMessage(ADMIN_ID,
        `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Stor Account Selesai</b>\n\n` +
        `<tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> ${adminSess.phone}\n` +
        `<tg-emoji emoji-id="5444856076954520455">🧾</tg-emoji> ID : <code>${adminSess.real_id}</code>\n` +
        `<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> Tipe : <b>${catDoneLabel}</b>\n` +
        `🏷️ Tag  : <b>${tagDoneLabel}</b>\n` +
        `<tg-emoji emoji-id="5317013291602553603">💵</tg-emoji> Harga : ${formatRp(finalPrice)}\n\nAkun sudah masuk stok!`,
        { parse_mode: 'HTML' }
      ).catch(() => {});

      // Notif channel
      const storUsername = ctx.from.username ? `@${ctx.from.username}` : '-';
      const storName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'User';
      await bcChannel(
        `─── ✔️ <b>Stor Akun Masuk Stok</u></b> ───\n\n` +
        `<blockquote>` +
        `<tg-emoji emoji-id="5883964170268840032">👤</tg-emoji> Penyetor  : <b>${storName}</b> (${storUsername})\n` +
        `<tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> Nomor     : <code>${maskPhone(adminSess.phone)}</code>\n` +
        `<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> Tipe      : <b>${catDoneLabel}</b>\n` +
        `🏷️ Tag       : <b>${tagDoneLabel}</b>\n` +
        `<tg-emoji emoji-id="5317013291602553603">💵</tg-emoji> Harga     : <b>${formatRp(finalPrice)}</b>` +
        `</blockquote>`
      );

      return ctx.reply(
        `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>𝗦𝗧𝗢𝗥 𝗔𝗞𝗨𝗡 𝗦𝗘𝗟𝗘𝗦𝗔𝗜!</b>\n${LINE}\n\n` +
        `<blockquote><tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> Nomor  : <code>${adminSess.phone}</code>\n` +
        `<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> Tipe   : <b>${catDoneLabel}</b>\n` +
        `🏷️ Tag   : <b>${tagDoneLabel}</b>\n` +
        `<tg-emoji emoji-id="5317013291602553603">💵</tg-emoji> Harga  : <b>${formatRp(finalPrice)}</b>\n\n` +
        `Akun sudah masuk stok. Admin akan menghubungi kamu untuk transfer bayaran <tg-emoji emoji-id="5438496463044752972">⭐</tg-emoji></blockquote>`,
        { parse_mode: 'HTML' }
      );
    }

    if (storSess.step === 'stor_edit_price' && isAdmin(userId)) {
      const price = parseInt(text.replace(/[^0-9]/g, ''));
      if (isNaN(price) || price <= 0) return ctx.reply(' Masukkan angka valid!');
      await products.updateOne({ _id: new mongoose.Types.ObjectId(storSess.productId) }, { $set: { price } });
      delete storSessions[userId];
      return ctx.reply(`<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> Harga diubah menjadi <b>${formatRp(price)}</b>`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'stor_editprice_list', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] }}
      );
    }

    if (storSess.step === 'stor_set_price' && isAdmin(userId)) {
      const price = parseInt(text.replace(/[^0-9]/g, ''));
      if (isNaN(price) || price <= 0) return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Masukkan angka valid!');
      delete storSessions[userId];
      await settings.updateOne({ key: 'stor_price_fixed' }, { $set: { value: String(price) } }, { upsert: true });
      return ctx.reply(`<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> Harga stor akun ditetapkan: <b>${formatRp(price)}</b>\n\n0 = harga bebas dari penyetor`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'admin_stor_setting', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] }}
      );
    }

    if (storSess.step === 'stor_change_2fa_old' && isAdmin(userId)) {
      const { productId } = storSess;
      const product = await products.findOne({ _id: new mongoose.Types.ObjectId(productId) });
      if (!product) { delete storSessions[userId]; return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Produk tidak ditemukan.'); }
      const lm = await ctx.reply('<tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> Memverifikasi 2FA lama...');
      try {
        // Pakai client yang sudah connect dari storSess, kalau belum ada baru bikin
        let client = storSess._client;
        if (!client) {
          client = new TelegramClient(new StringSession(product.session_string), API_ID, API_HASH, { connectionRetries: 5 });
          await client.connect();
        }
        const { Api } = require('telegram/tl');
        const { computeCheck } = require('telegram/Password');
        const pwdInfo = await client.invoke(new Api.account.GetPassword());
        // Jika user ketik "-" berarti belum ada 2FA, skip verifikasi
        if (text.trim() === '-' || !pwdInfo.hasPassword) {
          storSess._client = client;
          storSess.step    = 'stor_change_2fa_new';
          storSess.old2fa  = '';
          await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
            `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> Lanjut!\n\n<tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> Masukkan password 2FA <b>Baru</b>:\nketik <code>-</code> untuk hapus/kosongkan`,
            { parse_mode: 'HTML' }
          );
          return;
        }
        const check = await computeCheck(pwdInfo, text);
        await client.invoke(new Api.auth.CheckPassword({ password: check }));
        storSess._client = client;
        storSess.step    = 'stor_change_2fa_new';
        storSess.old2fa  = text;
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> Password lama benar!\n\n<tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> Masukkan password 2FA <b>Baru</b>:\nketik <code>-</code> untuk hapus 2FA`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        delete storSessions[userId];
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Password 2FA salah atau gagal connect!\n\n${e.message?.slice(0,100)}`);
      }
      return;
    }

    if (storSess.step === 'stor_change_2fa_new' && isAdmin(userId)) {
      storSess.new2fa = text === '-' ? '' : text;
      storSess.step = 'stor_change_2fa_hint';
      return ctx.reply('<tg-emoji emoji-id="6044268631976578825">💡</tg-emoji> Masukkan hint untuk 2FA baru ketik - jika tidak ada');
    }

    if (storSess.step === 'stor_change_2fa_hint' && isAdmin(userId)) {
      const hint   = text === '-' ? '' : text;
      const lm     = await ctx.reply('<tg-emoji emoji-id="5438496463044752972">⭐</tg-emoji> Mengubah password 2FA...');
      try {
        const { Api }          = require('telegram/tl');
        const { computeCheck } = require('telegram/Password');
        const client           = storSess._client;
        const newPwd           = storSess.new2fa || '';

        const pwdInfo  = await client.invoke(new Api.account.GetPassword());
        const oldCheck = storSess.old2fa
          ? await computeCheck(pwdInfo, storSess.old2fa)
          : new Api.InputCheckPasswordEmpty();

        let newSettings;
        if (!newPwd) {
          newSettings = new Api.account.PasswordInputSettings({
            newAlgo: new Api.PasswordKdfAlgoUnknown(), newPasswordHash: Buffer.from([]), hint: '',
          });
        } else {
          const { newAlgo, newPasswordHash } = await computeNewPasswordHash(pwdInfo.newAlgo, newPwd);
          newSettings = new Api.account.PasswordInputSettings({ newAlgo, newPasswordHash, hint });
        }

        await client.invoke(new Api.account.UpdatePasswordSettings({ password: oldCheck, newSettings }));
        await products.updateOne(
          { _id: new mongoose.Types.ObjectId(storSess.productId) },
          { $set: { two_fa: newPwd } }
        );
        delete storSessions[userId];
        await client.disconnect().catch(() => {});
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Password 2FA berhasil diubah!</b>\n<tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> Password baru: <code>${newPwd || 'dihapus'}</code>`,
          { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'admin_stor_setting', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] }}
        );
      } catch (e) {
        delete storSessions[userId];
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Gagal ubah 2FA: ${e.message?.slice(0,150)}`
        );
      }
      return;
    }

    if (storSess.step === 'stor_change_surel_new' && isAdmin(userId)) {
      const newEmail = text.trim();
      if (!newEmail.includes('@')) return ctx.reply('<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Format email tidak valid!');
      storSess.newEmail = newEmail;
      const lm = await ctx.reply('<tg-emoji emoji-id="5438496463044752972">⭐</tg-emoji> Mengatur recovery email...');
      try {
        const { Api }          = require('telegram/tl');
        const { computeCheck } = require('telegram/Password');
        const { createHash }   = require('crypto');
        const pbkdf2           = require('crypto').pbkdf2Sync;

        let client = storSess._client;
        if (!client) {
          const product = await products.findOne({ _id: new mongoose.Types.ObjectId(storSess.productId) });
          if (!product?.session_string) { delete storSessions[userId]; return bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined, '❌ Session tidak ditemukan.'); }
          client = new TelegramClient(new StringSession(product.session_string), API_ID, API_HASH, { connectionRetries: 5 });
          await client.connect();
          storSess._client = client;
        }

        const pwdInfo  = await client.invoke(new Api.account.GetPassword());
        const twoFa    = storSess.two_fa || '';
        const oldCheck = pwdInfo.hasPassword
          ? await computeCheck(pwdInfo, twoFa)
          : new Api.InputCheckPasswordEmpty();

        let newSettings;
        if (pwdInfo.hasPassword && twoFa) {
          const newAlgo = pwdInfo.newAlgo;
          const salt1   = Buffer.from(newAlgo.salt1);
          const salt2   = Buffer.from(newAlgo.salt2);
          const H       = (...args) => createHash('sha256').update(Buffer.concat(args)).digest();
          const SH      = (data, salt) => H(salt, data, salt);
          const ph1     = SH(Buffer.from(twoFa, 'utf8'), salt1);
          const ph2     = SH(pbkdf2(ph1, salt2, 100000, 64, 'sha512'), salt2);
          newSettings   = new Api.account.PasswordInputSettings({
            newAlgo, newPasswordHash: ph2, hint: pwdInfo.hint || '', email: newEmail,
          });
        } else {
          newSettings = new Api.account.PasswordInputSettings({
            newAlgo: new Api.PasswordKdfAlgoUnknown(),
            newPasswordHash: Buffer.from([]),
            hint: '', email: newEmail,
          });
        }

        await client.invoke(new Api.account.UpdatePasswordSettings({ password: oldCheck, newSettings }));
        delete storSessions[userId];
        await client.disconnect().catch(() => {});
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Recovery email berhasil diatur!</b>\n<tg-emoji emoji-id="6044268631976578825">💡</tg-emoji> Email: <code>${newEmail}</code>\n\n<i>Cek email untuk konfirmasi dari Telegram.</i>`,
          { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'admin_stor_setting', style: 'success', icon_custom_emoji_id: '5258236805890710909' }]] }}
        );
      } catch (e) {
        delete storSessions[userId];
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Gagal ubah email: ${e.message?.slice(0,120)}`
        );
      }
      return;
    }

    if (storSess.step === 'stor_change_surel_code' && isAdmin(userId)) {
      const code = text.trim();
      const lm   = await ctx.reply('<tg-emoji emoji-id="5438496463044752972">⭐</tg-emoji> Memverifikasi email baru...');
      try {
        const { Api } = require('telegram/tl');
        const client  = storSess._client;
        await client.invoke(new Api.account.VerifyEmail({
          email: storSess.newEmail,
          code: new Api.EmailVerifyPurposePassport(),
        }));
        delete storSessions[userId];
        await client.disconnect().catch(() => {});
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
          `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Email/Surel berhasil diubah!</b>\n<tg-emoji emoji-id="5884510167986343350">💬</tg-emoji> Email baru: <code>${storSess.newEmail}</code>`, { parse_mode: 'HTML' });
      } catch (e) {
        delete storSessions[userId];
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined, `❌ Gagal verifikasi email: ${e.message?.slice(0,80)}`);
      }
      return;
    }

    return; // exit if stor session handled
  }

  const apSess = addProductSessions[userId];
  if (!apSess) return;

  if (apSess.step === 'waiting_phone') {
    const phone = text.trim();
    if (!phone.match(/^\+?[0-9]{10,15}$/))
      return ctx.reply(`<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> <b>Format nomor salah!</b>\nContoh : <code>+628123456789</code>`, { parse_mode: 'HTML' });
    apSess.phone = phone; apSess.step = 'waiting_login';
    const lm = await ctx.reply(`<blockquote><tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> Login ke ${phone}...</blockquote>`, { parse_mode: 'HTML' });
    const result = await loginAccount(phone);
    if (result.status === 'need_code') {
      tempClients[userId] = result.client; apSess.client = result.client; apSess.phoneCodeHash = result.phoneCodeHash; apSess.step = 'waiting_otp';
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `<blockquote><tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>OTP dikirim ke ${phone}</b>\n\nMasukkan kode OTP :</blockquote>`, { parse_mode: 'HTML' });
    } else if (result.status === 'success') {
      const me = await result.client.getMe();
      apSess.sessionString = result.client.session.save(); apSess.real_id = me.id.toString(); apSess.step = 'waiting_price';
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Login berhasil!</b>\n<tg-emoji emoji-id="6068610874522735901">⭐</tg-emoji> ID : ${me.id}\n<tg-emoji emoji-id="5463172695132745432">📦</tg-emoji> Nama: ${me.firstName}\n\n<tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> Masukkan harga jual :`, { parse_mode: 'HTML' });
    } else {
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined, `<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> <b>Gagal login:</b> ${result.error}`, { parse_mode: 'HTML' });
      delete addProductSessions[userId];
    }
    return;
  }

  if (apSess.step === 'waiting_otp') {
    const otp = text.replace(/\s+/g, '').trim();
    if (!otp.match(/^\d{5}$/)) return ctx.reply(`<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> OTP harus 5 digit.`, { parse_mode: 'HTML' });
    const lm = await ctx.reply(`<tg-emoji emoji-id="5884510167986343350">💬</tg-emoji> <b>Verifikasi OTP...</b>`, { parse_mode: 'HTML' });
    const result = await verifyOTP(apSess.client, apSess.phone, apSess.phoneCodeHash, otp);
    if (result.status === 'success') {
      apSess.sessionString = apSess.client.session.save(); apSess.real_id = result.user.id.toString(); apSess.step = 'waiting_price';
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Login berhasil!</b>\n<tg-emoji emoji-id="6068610874522735901">⭐</tg-emoji> ID: ${result.user.id}\n<tg-emoji emoji-id="5463172695132745432">📦</tg-emoji> ${result.user.firstName}\n\n<tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> Masukkan harga jual :`, { parse_mode: 'HTML' });
    } else if (result.status === 'need_password') {
      apSess.step = 'waiting_2fa';
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined, `<tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> <b>Akun punya 2FA</b>\n\nMasukkan password 2FA :`, { parse_mode: 'HTML' });
    } else {
      const e = result.error || '';
      if (e.includes('PHONECODEEXPIRED') || e.includes('PHONE_CODE_EXPIRED')) {
        try {
          const newR = await apSess.client.sendCode({ apiId: API_ID, apiHash: API_HASH }, apSess.phone);
          apSess.phoneCodeHash = newR.phoneCodeHash;
          await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
            `<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> OTP kadaluarsa! Kode baru sudah dikirim ke ${apSess.phone}\nMasukkan kode baru:`, { parse_mode: 'HTML' });
        } catch {
          await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined, `<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> OTP expired, gagal kirim ulang. Ulangi dari awal.`, { parse_mode: 'HTML' });
          delete addProductSessions[userId];
          if (tempClients[userId]) { await tempClients[userId].disconnect().catch(() => {}); delete tempClients[userId]; }
        }
      } else {
        await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined, `<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Verifikasi gagal: ${e}`, { parse_mode: 'HTML' });
        delete addProductSessions[userId];
        if (tempClients[userId]) { await tempClients[userId].disconnect().catch(() => {}); delete tempClients[userId]; }
      }
    }
    return;
  }

  if (apSess.step === 'waiting_2fa') {
    const lm = await ctx.reply(`<tg-emoji emoji-id="6044268631976578825">💡</tg-emoji> <b>Verifikasi 2FA...</b>`, { parse_mode: 'HTML' });
    const result = await verify2FA(apSess.client, text);
    if (result.status === 'success') {
      apSess.sessionString = apSess.client.session.save(); apSess.real_id = result.user.id.toString(); apSess.two_fa = text; apSess.step = 'waiting_price';
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined,
        `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Login berhasil!</b>\n<tg-emoji emoji-id="6068610874522735901">⭐</tg-emoji> ID : ${result.user.id}\n<tg-emoji emoji-id="5463172695132745432">📦</tg-emoji> ${result.user.firstName}\n<tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> 2FA <tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji>\n\n<tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> Masukkan harga jual :`, { parse_mode: 'HTML' });
    } else {
      await bot.telegram.editMessageText(ctx.chat.id, lm.message_id, undefined, `<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> 2FA gagal : ${result.error}`, { parse_mode: 'HTML' });
      delete addProductSessions[userId];
      if (tempClients[userId]) { await tempClients[userId].disconnect().catch(() => {}); delete tempClients[userId]; }
    }
    return;
  }

  if (apSess.step === 'waiting_price') {
    const price = parseInt(text);
    if (isNaN(price) || price <= 0) return ctx.reply(`<tg-emoji emoji-id="6084880262179588505">❌</tg-emoji> Harga harus angka positif!`, { parse_mode: 'HTML' });
    apSess.price = price; apSess.step = 'waiting_category';
    await ctx.reply(
      `<blockquote><tg-emoji emoji-id="6098364784451786078">⭐</tg-emoji> <b>Pilih tipe akun yang anda ingin setorkan.</b></blockquote>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
        [{ text: 'No Limit',  callback_data: 'cat_set_no_limit',   style: 'success', icon_custom_emoji_id: '6008118472066732010'  }],
        [{ text: 'Limit',     callback_data: 'cat_set_spam_limit', style: 'primary', icon_custom_emoji_id: '6019523512908124649' }],
        [{ text: 'BATAL',     callback_data: 'cancel_add_product', style: 'danger', icon_custom_emoji_id: '5260293700088511294' }],
      ]}}
    );
    return;
  }

  if (apSess.step === 'waiting_2fa_input') {
    const twoFa = text === '-' ? '' : text;
    const categoryName = apSess.category || apSess.baseCategory || 'no_limit';
    const tagName = apSess.tag || '';
    const catNames = {
      no_limit: '<tg-emoji emoji-id="6008118472066732010">🔥</tg-emoji> No Limit - INDO', other_country: '<tg-emoji emoji-id="5879585266426973039">🌐</tg-emoji> Other Country',
      repe: '<tg-emoji emoji-id="5956148757899776734">⭐️</tg-emoji> Repe - Mixed', spam_limit: '<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> Spam/Limit - INDO', nine_digit: '<tg-emoji emoji-id="6028530359975548369">💎</tg-emoji> 9 Digit',
    };
    const tagLabel = tagName === 'tag_scam' ? ', ⚠️ Tag Scam' : tagName === 'tag_fake' ? ', 🚫 Tag Fake' : '';
    const catDisplay = (catNames[categoryName] || categoryName) + tagLabel;
    await products.insertOne({
      real_id: apSess.real_id, phone: apSess.phone, price: apSess.price,
      category: categoryName, tag: tagName, two_fa: twoFa,
      session_string: apSess.sessionString, status: 'available', created_at: new Date(),
    });
    delete addProductSessions[userId];
    if (tempClients[userId]) { await tempClients[userId].disconnect().catch(() => {}); delete tempClients[userId]; }

    const country = detectCountry(apSess.phone);
    const { total } = await getStockData();

    await ctx.reply(
      `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Product Berhasil Ditambahkan</b>\n${LINE}\n\n` +
      `<blockquote>` +
      `<tg-emoji emoji-id="6068610874522735901">⭐</tg-emoji> ID       : <code>${apSess.real_id}</code>\n` +
      `<tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> Nomor      : ${apSess.phone}\n` +
      `<tg-emoji emoji-id="5879585266426973039">🌐</tg-emoji> Negara   : ${country}\n` +
      `<tg-emoji emoji-id="6005570495603282482">🔑</tg-emoji> 2FA      : ${twoFa ? `<code>${twoFa}</code>` : '❌ Tidak ada'}\n` +
      `<tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> Harga    : ${formatRp(apSess.price)}\n` +
      `<tg-emoji emoji-id="5257969839313526622">📂</tg-emoji> Kategori : ${catDisplay}` +
      `</blockquote>`,
      { parse_mode: 'HTML' }
    );
    await bcChannel(
      `─── 📦 <b><u>Stok Terbaru !</u></b> ───\n\n` +
      `<blockquote>` +
      `🪪 ID       : <code>${apSess.real_id}</code><b>${digitLabel(apSess.real_id)}</b>\n` +
      `🌍 Negara   : ${country}\n` +
      `📂 Kategori : ${catDisplay}\n` +
      `💰 Harga    : ${formatRp(apSess.price)}\n` +
      `🔐 2FA      : ${twoFa ? '✅ Ada' : '❌ Tidak ada'}\n\n` +
      `📦 Total Stok: <b>${total} akun</b>` +
      `</blockquote>`,
      [[{ text: '🛍️ Beli Sekarang', url: `https://t.me/${bot.botInfo?.username || 'bot'}?start=start` , style: 'success', icon_custom_emoji_id: '5472401690793614752' }]]
    );
  }
});

// ══════════════════════════════════════════
//  DOCUMENT HANDLER — file .zip script
// ══════════════════════════════════════════
bot.on('document', async (ctx) => {
  const userId = ctx.from.id;
  const sess   = userSessions[userId];
  if (!isAdmin(userId) || sess?.step !== 'addscript_file') return;

  const doc = ctx.message.document;
  if (!doc.file_name?.endsWith('.zip')) {
    return ctx.reply('❌ File harus berformat .zip!');
  }
  delete userSessions[userId];
  await scripts.insertOne({
    name: sess.name, price: sess.price,
    file_id: doc.file_id, sales: 0, available: true, created_at: new Date(),
  });
  await ctx.reply(
    `✅ <b>Script "${sess.name}" berhasil ditambahkan!</b>\n\n` +
    `<blockquote>Harga: ${formatRp(sess.price)}</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'admin_scripts' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] } }
  );
});

// ══════════════════════════════════════════
//  PHOTO HANDLER — bukti deposit
// ══════════════════════════════════════════
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const sess   = userSessions[userId];
  if (!sess) return;
  const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

  // ── BUKTI BELI SCRIPT QRIS ──────────────────
  if (sess.step === 'script_proof') {
    const { refCode, scriptId, price } = sess;
    delete userSessions[userId];
    const script = await scripts.findOne({ _id: new mongoose.Types.ObjectId(scriptId) });
    if (!script) return ctx.reply('❌ Script tidak ditemukan, hubungi admin.');
    await bot.telegram.sendPhoto(ADMIN_ID, photoId, {
      caption:
        `<tg-emoji emoji-id="5257969839313526622">📂</tg-emoji> <b>BELI SCRIPT</b>\n${LINE}\n\n` +
        `<blockquote><tg-emoji emoji-id="5920090136627908485">➕</tg-emoji> User   : ${userId}\n` +
        `<tg-emoji emoji-id="5875206779196935950">📁</tg-emoji> Script : <b>${script.name}</b>\n` +
        `<tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> Harga  : ${formatRp(price)}\n` +
        `<tg-emoji emoji-id="5444856076954520455">🧾</tg-emoji> Ref    : <code>${refCode}</code></blockquote>`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[
        { text: 'KIRIM SCRIPT', callback_data: `confirmscriptqris_${scriptId}_${userId}`, style: 'success', icon_custom_emoji_id: '5206607081334906820' },
        { text: 'TOLAK',         callback_data: `rejectscriptqris_${scriptId}_${userId}`, style: 'danger', icon_custom_emoji_id: '6084880262179588505'  },
      ]]},
    }).catch(() => {});
    return ctx.reply(`<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>Bukti diterima!</b>\n\nAdmin akan segera konfirmasi dan kirim script.`, { parse_mode: 'HTML' });
  }

  // ── BUKTI GIFT QRIS ──────────────────────────
  if (sess.step === 'gift_proof') {
    const { orderId, price, targetUsername, catKey, itemIdx } = sess;
    delete userSessions[userId];
    const cat  = GIFT_CAT[catKey]; const item = cat?.items[itemIdx];
    await gift_orders.updateOne({ order_id: orderId }, { $set: { proof: photoId, status: 'pending', proof_at: new Date() } });
    await bot.telegram.sendPhoto(ADMIN_ID, photoId, {
      caption:
        `🎁 <b>ORDER GIFT (QRIS)</b>\n${LINE}\n\n` +
        `<blockquote>👤 User    : ${userId}\n🎯 Target  : @${targetUsername}\n` +
        `${item?.emoji} Gift    : ${cat?.label}\n💰 Harga   : ${formatRp(price)}\n` +
        `🆔 OID     : <code>${orderId}</code></blockquote>`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[
        { text: '✅ KIRIM GIFT', callback_data: `giftacc_${orderId}`    , style: 'success', icon_custom_emoji_id: '5472180551517477902' },
        { text: '❌ TOLAK',      callback_data: `giftreject_${orderId}` , style: 'danger', icon_custom_emoji_id: '6084880262179588505' },
      ]]},
    }).catch(() => {});
    return ctx.reply(`✅ <b>Bukti diterima!</b>\n\nGift akan dikirim setelah admin konfirmasi.`, { parse_mode: 'HTML' });
  }
});


// ════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════
//  TOKO GIFT & INSTALL ACCESS
// ══════════════════════════════════════════════════════════

//  TOKO GIFT — USER FLOW
// ════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════
//  GIFT ADMIN PANEL — KELOLA TOKO GIFT
// ════════════════════════════════════════════════════════
async function showGiftOwnerMenu(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  const catRows = Object.keys(GIFT_CAT).map(k => [{
    text: `${GIFT_CAT[k].enabled ? '🟢' : '🔴'} ${GIFT_CAT[k].label}`,
    callback_data: `gtoggle_${k}`,
  style: GIFT_CAT[k].enabled ? 'danger' : 'success' }]);
  const rows = [
    [{ text: '✏️ Set Harga Gift',    callback_data: 'gsetprice_cat_menu' , style: 'primary', icon_custom_emoji_id: '5422360266618707867' }],
    ...catRows,
    [{ text: '🔑 Status Login Gift',  callback_data: 'gift_login_status' , style: 'primary', icon_custom_emoji_id: '5472193350520021357' }],
    [{ text: '◀️ Kembali',           callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
  ];
  await editOrReply(ctx,
    `🎁 <b>𝗞𝗘𝗟𝗢𝗟𝗔 𝗧𝗢𝗞𝗢 𝗚𝗜𝗙𝗧</b>\n${LINE2}\n\n` +
    `<blockquote>🟢 = Kategori aktif | 🔴 = Nonaktif\nKlik kategori untuk toggle.</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } }
  );
}

async function handleGiftToggleCat(ctx, catKey) {
  if (!isAdmin(ctx.from.id)) return;
  if (!GIFT_CAT[catKey]) return ctx.answerCbQuery('❌ Kategori tidak ditemukan.', { show_alert: true });
  GIFT_CAT[catKey].enabled = !GIFT_CAT[catKey].enabled;
  await settings.updateOne({ key: `giftcat_${catKey}` }, { $set: { value: GIFT_CAT[catKey].enabled ? '1' : '0' } }, { upsert: true });
  await ctx.answerCbQuery(`${GIFT_CAT[catKey].enabled ? '🟢 Aktif' : '🔴 Nonaktif'}`);
  await showGiftOwnerMenu(ctx);
}

async function handleGiftSetPriceCat(ctx, catKey) {
  if (!isAdmin(ctx.from.id)) return;
  if (catKey === 'menu') {
    // show category selection
    try { await ctx.deleteMessage(); } catch {}
    const rows = Object.keys(GIFT_CAT).map(k => [{ text: GIFT_CAT[k].label, callback_data: `gsetprice_cat_${k}` , style: 'primary', icon_custom_emoji_id: '5422360266618707867' }]);
    rows.push([{ text: '◀️ Kembali', callback_data: 'gift_owner_menu' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]);
    return ctx.reply(`💵 <b>Set Harga Gift</b>\n\nPilih kategori:`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
  }
  const cat = GIFT_CAT[catKey];
  if (!cat) return ctx.answerCbQuery('❌ Kategori tidak ditemukan.', { show_alert: true });
  const rows = cat.items.map((item, idx) => {
    const itemKey = `${catKey}:${idx}`;
    const price = giftPriceOverrides[itemKey] ?? item.price;
    return [
      { text: `${item.emoji} ${formatRp(price)}`, callback_data: `gsetprice_item_${catKey}_${idx}` , style: 'primary' },
      { text: '🔄 Reset', callback_data: `gresetprice_${catKey}_${idx}` , style: 'success', icon_custom_emoji_id: '6035353718684129368' },
    ];
  });
  rows.push([{ text: '◀️ Kembali', callback_data: 'gsetprice_cat_menu' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]);
  await editOrReply(ctx, `💵 <b>${cat.label}</b>\n\nPilih item untuk ubah harga:`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
}

async function handleGiftSetPriceItem(ctx, param) {
  if (!isAdmin(ctx.from.id)) return;
  const [catKey, idxStr] = param.split('_');
  const idx = parseInt(idxStr);
  const cat = GIFT_CAT[catKey]; const item = cat?.items[idx];
  if (!item) return ctx.answerCbQuery('❌ Item tidak ditemukan.', { show_alert: true });
  userSessions[ctx.from.id] = { step: 'gift_setprice', catKey, itemIdx: idx };
  const itemKey = `${catKey}:${idx}`;
  const currentPrice = giftPriceOverrides[itemKey] ?? item.price;
    await editOrReply(ctx,
    `✏️ <b>Ubah Harga ${item.emoji}</b>\n\nHarga saat ini: <b>${formatRp(currentPrice)}</b>\n\nKirim angka harga baru:`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: `gsetprice_cat_${catKey}` , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] } }
  );
}

async function handleGiftResetPrice(ctx, param) {
  if (!isAdmin(ctx.from.id)) return;
  const [catKey, idxStr] = param.split('_');
  const idx = parseInt(idxStr);
  const itemKey = `${catKey}:${idx}`;
  delete giftPriceOverrides[itemKey];
  await settings.deleteOne({ key: `giftprice_${catKey}_${idx}` });
  await ctx.answerCbQuery('✅ Harga direset ke default!');
  await handleGiftSetPriceCat(ctx, catKey);
}

async function startGiftLogin(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  // Reset client supaya bisa login ulang
  _mtClient = null;
  userSessions[ctx.from.id] = { step: 'gift_login_phone' };
  await editOrReply(ctx,
    `🔑 <b>𝗟𝗢𝗚𝗜𝗡 𝗔𝗞𝗨𝗡 𝗚𝗜𝗙𝗧</b>\n${LINE}\n\n` +
    `<blockquote>Masukkan nomor Telegram akun yang akan digunakan untuk kirim gift.\n\n` +
    `Format: <code>+628xxxxxxxx</code></blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'gift_login_status' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
  );
}

async function showGiftLoginStatus(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  let status = '❓ Belum login';
  try {
    const client = await getMtClient();
    const me = await client.getMe();
    status = `✅ Login sebagai: @${me.username || me.firstName || me.id}`;
  } catch (e) {
    status = `❌ Belum login / session invalid`;
  }
  await editOrReply(ctx,
    `🔑 <b>𝗦𝗧𝗔𝗧𝗨𝗦 𝗟𝗢𝗚𝗜𝗡 𝗧𝗢𝗞𝗢 𝗚𝗜𝗙𝗧</b>\n${LINE}\n\n<blockquote>${status}</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: '🔑 Login / Ganti Akun', callback_data: 'gift_do_login' , style: 'primary', icon_custom_emoji_id: '5472193350520021357' }],
      [{ text: '🔄 Cek Ulang Status',   callback_data: 'gift_login_status' , style: 'success', icon_custom_emoji_id: '6035353718684129368' }],
      [{ text: '◀️ Kembali',            callback_data: 'gift_owner_menu' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}}
  );
}

// ════════════════════════════════════════════════════════
//  BELI NOKTEL DENGAN QRIS STATIS
// ════════════════════════════════════════════════════════
// ── Deliver produk noktel setelah bayar otomatis ──────────
async function deliverNoktelProduct(ctx, userId, productId, method) {
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(productId) });
  if (!product || product.status !== 'available') {
    await bot.telegram.sendMessage(userId, '❌ Produk sudah tidak tersedia.', { parse_mode: 'HTML' });
    return;
  }
  await products.updateOne({ _id: product._id }, { $set: { status: 'sold', buyer_id: userId, sold_at: new Date() } });
  const timeNow = new Date().toLocaleString('id-ID');
  await users.updateOne({ user_id: userId }, {
    $inc: { total_spent: product.price },
    $push: { mutasi: `[${timeNow}] Keluar: ${formatRp(product.price)} (Beli Akun QRIS ${method}: ${product.real_id})` },
  });
  const has2fa = product.two_fa?.trim() !== '';
  const pid    = product._id.toString();
  const orderButtons = [
    [{ text: 'MINTA OTP',         callback_data: `otp_${pid}`,    style: 'primary', icon_custom_emoji_id: '5877318502947229960' }],
    ...(has2fa ? [[{ text: 'LIHAT PASSWORD 2FA', callback_data: `fa2_${pid}`, style: 'success', icon_custom_emoji_id: '6005570495603282482' }]] : []),
    [{ text: 'LOGOUT AKUN',       callback_data: `logout_${pid}`, style: 'danger',  icon_custom_emoji_id: '6043947089249964579' }],
  ];
  await bot.telegram.sendMessage(userId,
    `✅ <b>𝗣𝗘𝗠𝗕𝗘𝗟𝗜𝗔𝗡 𝗕𝗘𝗥𝗛𝗔𝗦𝗜𝗟!</b>\n${LINE}\n\n` +
    `<blockquote>📌 ID     : <code>${product.real_id}</code><b>${digitLabel(product.real_id)}</b>\n` +
    `☎️ No     : <code>${product.phone}</code>\n` +
    `🌍 Negara : ${detectCountry(product.phone)}\n` +
    (has2fa ? `🔒 2FA    : <code>${product.two_fa}</code>\n` : '') +
    `💰 Harga  : ${formatRp(product.price)}\n` +
    `💳 Metode : ${method} QRIS\n${LINE}\n` +
    `💻 <b>Device aktif — (Bot) Jakarta</b></blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: orderButtons } }
  );
  const catDisplay = {
    no_limit: '🔥 No Limit', other_country: '🌍 Other Country',
    repe: '⭐ Repe', spam_limit: '♻️ Spam/Limit', nine_digit: '💎 9 Digit',
  }[product.category] || product.category;
  const tagSuffix = product.tag === 'tag_scam' ? ', ⚠️ Tag Scam' : product.tag === 'tag_fake' ? ', 🚫 Tag Fake' : '';
  const orderNow = new Date(); orderNow.setHours(orderNow.getHours() + 7);
  await bcChannel(
    `💰 <b>TRANSAKSI DONE (QRIS ${method})</b>\n${LINE}\n` +
    `<blockquote>🧾 OID    : <code>ORDER-${product.real_id}</code>\n` +
    `👤 Buyer  : ${ctx.from?.username ? '@' + ctx.from.username : String(userId)}\n` +
    `🆔 ID     : <code>${userId}</code>\n` +
    `📦 Produk : <code>${product.real_id}</code> ${catDisplay + tagSuffix}\n` +
    `✅ Status : LUNAS (${method})\n` +
    `🕒 Waktu  : ${orderNow.toISOString().replace('T', ' ').slice(0, 19)}</blockquote>`
  );
}

async function handleBuyWithQris(ctx, productId) {
  try { await ctx.deleteMessage(); } catch {}
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(productId) });
  if (!product || product.status !== 'available')
    return ctx.answerCbQuery('❌ Produk sudah habis!', { show_alert: true });

  const userId  = ctx.from.id;

  // Tandai sesi beli via QRIS otomatis agar setelah bayar langsung kirim produk
  userSessions[userId] = { step: 'noktel_qris_auto', productId: productId.toString(), price: product.price };

  // NercPay: buat QRIS sejumlah harga produk, deliver otomatis setelah lunas
  if (!NERCPAY_CONFIG.apikey) {
    return ctx.reply(`<blockquote>❌ NercPay belum dikonfigurasi.</blockquote>`, { parse_mode: 'HTML' });
  }
  let qrisData;
  try {
    qrisData = await createdQris(product.price, NERCPAY_CONFIG);
    if (!qrisData?.qr_string) throw new Error('QR tidak tersedia');
  } catch (err) {
    return ctx.reply(`<blockquote>❌ Gagal buat QRIS NercPay: ${err.message}</blockquote>`, { parse_mode: 'HTML' });
  }
  const orderId    = qrisData.idtransaksi; // qris_id asli dari NercPay, dipakai untuk cek status
  const totalBayar = qrisData.jumlah;      // total yang harus dibayar (harga produk + fee NercPay)
  const caption =
    `🛒 <b>BAYAR QRIS — BELI NOKTEL</b>\n${LINE}\n\n` +
    `<blockquote>📦 ID     : <code>${product.real_id}</code>\n` +
    `☎️ No     : <code>${product.phone}</code>\n` +
    `🌍 Negara : ${detectCountry(product.phone)}\n` +
    `💰 Harga Produk : <b>${formatRp(product.price)}</b>\n` +
    `💳 Total Bayar  : <b>${formatRp(totalBayar)}</b>\n\n` +
    `⏱️ Berlaku <b>20 menit</b>. Scan QR di atas.</blockquote>`;
  let qrBuf2;
  try { qrBuf2 = await QRCode.toBuffer(qrisData.qr_string, { width: 512, margin: 2 }); } catch {}
  let msgQ;
  try {
    if (qrBuf2) {
      msgQ = await bot.telegram.sendPhoto(userId, { source: qrBuf2 }, { caption, parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'shop' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }
      });
    } else {
      msgQ = await ctx.reply(caption, { parse_mode: 'HTML' });
    }
  } catch { return; }

  nercpayActiveOrders[userId] = { orderId, amount: product.price, msgQris: msgQ, productId: productId.toString(), isBuy: true };
  let att2 = 0;
  const intv2 = setInterval(async () => {
    att2++;
    const ord = nercpayActiveOrders[userId];
    if (!ord || ord.orderId !== orderId || att2 > 240) { clearInterval(intv2); return; }
    try {
      const isPaid = await cekStatus(orderId, totalBayar, NERCPAY_CONFIG);
      if (isPaid) {
        clearInterval(intv2);
        delete nercpayActiveOrders[userId];
        delete userSessions[userId];
        try { await bot.telegram.deleteMessage(userId, ord.msgQris?.message_id); } catch {}
        await deliverNoktelProduct(ctx, userId, productId.toString(), 'NercPay');
      }
    } catch {}
  }, 5000);
  nercpayActiveOrders[userId].interval = intv2;
}

// ════════════════════════════════════════════════════════
//  MENU INSTALL
// ════════════════════════════════════════════════════════
async function showMenuInstall(ctx) {
    await editOrReply(ctx,
    `🛠️ <b>𝗠𝗘𝗡𝗨 𝗜𝗡𝗦𝗧𝗔𝗟𝗟</b>\n${LINE}\n\n` +
    `<blockquote><b>Perintah instalasi otomatis panel hosting:</b>\n\n` +
    `🔹 <code>/installpanel ip|pass|domainpanel|domainnode|ram</code>\n` +
    `🔹 <code>/uninstallpanel ip|pass</code>\n` +
    `🔹 <code>/installreviactly ip|pass</code>\n` +
    `🔹 <code>/installtemanightcore ip,pass</code>\n` +
    `🔹 <code>/swings ip|pass|token</code>\n` +
    `🔹 <code>/subdo nama|ip</code> — buat subdomain otomatis\n\n` +
    `<b>Contoh:</b>\n<code>/installpanel 1.2.3.4|pass|panel.domain.com|node.domain.com|8000</code>\n\n` +
    `<b>Subdomain:</b>\n<code>/subdo LelenHost|1.2.3.4</code>\n→ Pilih domain → DNS dibuat otomatis</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'home' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] } }
  );
}

async function showAdminInstallAccess(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  const list = await install_access.find({}).toArray();
  let msg = `🔑 <b>𝗞𝗘𝗟𝗢𝗟𝗔 𝗔𝗞𝗦𝗘𝗦 𝗜𝗡𝗦𝗧𝗔𝗟𝗟</b>\n${LINE}\n\n`;
  if (!list.length) msg += `<blockquote>Belum ada user yang diberi akses.</blockquote>\n\n`;
  else list.forEach((a, i) => { msg += `${i+1}. <code>${a.user_id}</code>\n`; });
  msg += `\n/addinstall <code>user_id</code> — beri akses\n/removeinstall <code>user_id</code> — cabut akses`;
  await editOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] } });
}

async function hasInstallAccess(userId) {
  if (isAdmin(userId)) return true;
  return !!(await install_access.findOne({ user_id: userId }));
}



// ══════════════════════════════════════════════════════════
//  INSTALL BOT COMMANDS
// ══════════════════════════════════════════════════════════

bot.command('addinstall', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const uid = parseInt(ctx.payload?.trim());
  if (!uid) return ctx.reply('❌ Format: /addinstall user_id');
  await install_access.updateOne({ user_id: uid }, { $set: { user_id: uid, added_at: new Date() } }, { upsert: true });
  await ctx.reply(`✅ User <code>${uid}</code> diberi akses install!`, { parse_mode: 'HTML' });
});

bot.command('removeinstall', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const uid = parseInt(ctx.payload?.trim());
  if (!uid) return ctx.reply('❌ Format: /removeinstall user_id');
  await install_access.deleteOne({ user_id: uid });
  await ctx.reply(`✅ Akses install user <code>${uid}</code> dicabut!`, { parse_mode: 'HTML' });
});

// ════════════════════════════════════════════════════════
//  SSH INSTALL COMMANDS
// ════════════════════════════════════════════════════════
bot.command('installpanel', async (ctx) => {
  if (!await hasInstallAccess(ctx.from.id))
    return ctx.replyWithHTML(`<blockquote>❌ <b>𝗔𝗞𝗦𝗘𝗦 𝗗𝗜𝗧𝗢𝗟𝗔𝗞</b>\nKamu belum punya akses. Hubungi admin.</blockquote>`);
  const text = ctx.payload;
  if (!text) return ctx.replyWithHTML(
    `📖 <b>FORMAT:</b>\n<code>/installpanel ip|password|domain_panel|domain_node|ram</code>\n\nContoh:\n<code>/installpanel 1.1.1.1|pass123|panel.domain.com|node.domain.com|8000</code>`
  );
  const t = text.split('|');
  if (t.length < 5) return ctx.reply('❌ Kurang lengkap. Gunakan pemisah |');
  const [ipvps, passwd, subdomain, domainnode, ramvps] = t;
  const chatId = ctx.chat.id;
  const conn = new SSHClient();
  let lastMsgId = null;
  conn.on('ready', async () => {
    const m1 = await ctx.reply('🚀 INSTALL PANEL BERLANGSUNG... (5-10 menit)');
    lastMsgId = m1.message_id;
    conn.exec('bash <(curl -s https://pterodactyl-installer.se)', (err, stream) => {
      if (err) return ctx.reply(`❌ SSH Error: ${err.message}`);
      stream.on('close', async () => {
        await bot.telegram.deleteMessage(chatId, lastMsgId).catch(() => {});
        const m2 = await ctx.reply('🛠️ INSTALL WINGS... (5 menit)');
        lastMsgId = m2.message_id;
        installWings();
      }).on('data', d => {
        const s = d.toString();
        if (s.includes('Input')) stream.write(`0\n\n\n1248\nAsia/Jakarta\nadmin@gmail.com\nadmin@gmail.com\nadmin\nadmin\nadmin\nadmin\n${subdomain}\ny\ny\ny\ny\ny\n\n1\n`);
        if (s.includes('Select the appropriate number')) stream.write('1\n');
        if (s.includes('Still assume SSL')) stream.write('y\n');
        if (s.includes('Please read the Terms of Service')) stream.write('y\n');
      }).stderr.on('data', () => {});
    });
  }).on('error', err => ctx.reply(`❌ Koneksi Gagal: ${err.message}`))
    .connect({ host: ipvps, port: 22, username: 'root', password: passwd });

  function installWings() {
    conn.exec('bash <(curl -s https://pterodactyl-installer.se)', (err, stream) => {
      if (err) throw err;
      stream.on('close', async () => {
        await bot.telegram.deleteMessage(chatId, lastMsgId).catch(() => {});
        const m3 = await ctx.reply('📡 CREATE NODE & LOCATION...');
        lastMsgId = m3.message_id;
        createNode();
      }).on('data', d => {
        const s = d.toString();
        if (s.includes('Input')) stream.write(`1\ny\ny\ny\n${subdomain}\ny\nuser\n1248\ny\n${domainnode}\ny\nadmin@gmail.com\ny\n`);
        if (s.includes("automatically configure HTTPS")) stream.write('y\n');
        if (s.includes('Proceed with installation?')) stream.write('y\n');
      }).stderr.on('data', () => {});
    });
  }
  function createNode() {
    conn.exec(config.bash || 'echo no-bash', (err, stream) => {
      if (err) throw err;
      stream.on('close', async () => {
        await bot.telegram.deleteMessage(chatId, lastMsgId).catch(() => {});
        const m4 = await ctx.reply('⚙️ GENERATE CONFIG & START WINGS...');
        lastMsgId = m4.message_id;
        conn.exec(`cd /var/www/pterodactyl && php artisan p:node:configuration 1 > /etc/pterodactyl/config.yml && chmod 600 /etc/pterodactyl/config.yml && systemctl restart wings`, async (err3, s2) => {
          if (err3) { await bot.telegram.deleteMessage(chatId, lastMsgId).catch(() => {}); return ctx.reply(`❌ ${err3.message}`); }
          s2.on('exit', async () => {
            await bot.telegram.deleteMessage(chatId, lastMsgId).catch(() => {});
            ctx.replyWithHTML(`✅ <b>𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗣𝗔𝗡𝗘𝗟 𝗦𝗘𝗟𝗘𝗦𝗔𝗜!</b>\n\n<blockquote>🌐 IP: <code>${ipvps}</code>\n👤 User Panel: <code>admin</code>\n🔐 Pass Panel: <code>admin</code>\n🌐 Domain: <code>${subdomain}</code>\n🖥️ Node: <code>${domainnode}</code></blockquote>`);
            bot.telegram.sendMessage(ADMIN_ID, `🔔 𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗣𝗔𝗡𝗘𝗟\nUser: ${ctx.from.first_name}\nIP: ${ipvps}\nDomain: ${subdomain}`, { parse_mode: 'HTML' });
            conn.end();
          });
        });
      }).on('data', () => { stream.write(`${config.tokeninstall||''}\n4\nSGP\nLelen Host\n${domainnode}\nNODES\n${ramvps}\n${ramvps}\n1\n`); })
      .stderr.on('data', () => {});
    });
  }
});

bot.command('uninstallpanel', async (ctx) => {
  if (!await hasInstallAccess(ctx.from.id))
    return ctx.replyWithHTML(`<blockquote>❌ <b>𝗔𝗞𝗦𝗘𝗦 𝗗𝗜𝗧𝗢𝗟𝗔𝗞</b></blockquote>`);
  const text = ctx.payload;
  if (!text || !text.includes('|')) return ctx.reply('❌ Format: /uninstallpanel ip|password');
  const [ip, password] = text.split('|');
  const chatId = ctx.chat.id;
  const conn = new SSHClient();
  let sm = await ctx.reply(`📡 Menghubungkan ke ${ip}...`);
  conn.on('ready', () => {
    bot.telegram.editMessageText(chatId, sm.message_id, null, '⏳ UNINSTALL BERJALAN...').catch(() => {});
    conn.exec('bash <(curl -s https://pterodactyl-installer.se)', (err, stream) => {
      if (err) { conn.end(); return ctx.reply('❌ Gagal menjalankan uninstaller.'); }
      stream.on('close', () => {
        conn.end();
        bot.telegram.deleteMessage(chatId, sm.message_id).catch(() => {});
        ctx.replyWithHTML(`✅ <b>𝗨𝗡𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗦𝗘𝗟𝗘𝗦𝗔𝗜</b>\n\n<blockquote>🌐 IP: <code>${ip}</code>\nPanel & Wings telah dihapus.</blockquote>`);
        bot.telegram.sendMessage(ADMIN_ID, `🗑️ UNINSTALL\nUser: ${ctx.from.first_name}\nIP: ${ip}`, { parse_mode: 'HTML' });
      }).on('data', d => {
        const o = d.toString();
        if (o.includes('Input 0-6')) stream.write('6\n');
        if (o.includes('Do you want to remove panel?')) stream.write('y\n');
        if (o.includes('Do you want to remove Wings')) stream.write('y\n');
        if (o.includes('Continue with uninstallation?')) stream.write('y\n');
        if (o.includes('Is it the pterodactyl database?')) stream.write('y\n');
        if (o.includes('Is it the pterodactyl user?')) stream.write('y\n');
      });
    });
  }).on('error', err => ctx.reply(`❌ Koneksi Gagal: ${err.message}`))
    .connect({ host: ip, port: 22, username: 'root', password, readyTimeout: 20000 });
});

bot.command('installreviactly', async (ctx) => {
  if (!await hasInstallAccess(ctx.from.id))
    return ctx.replyWithHTML(`<blockquote>❌ <b>𝗔𝗞𝗦𝗘𝗦 𝗗𝗜𝗧𝗢𝗟𝗔𝗞</b></blockquote>`);
  const text = ctx.payload;
  if (!text || !text.includes('|')) return ctx.replyWithHTML(`📖 Format: <code>/installreviactly ip|password</code>`);
  let [ipvps, passwd] = text.split('|').map(a => a.trim());
  let port = 22;
  if (ipvps.includes(':')) { const [h, p] = ipvps.split(':'); ipvps = h; port = parseInt(p) || 22; }
  const chatId = ctx.chat.id;
  let sm = await ctx.replyWithHTML(`🌀 <b>Install Tema Reviactly</b>\n📡 <code>${ipvps}:${port}</code>\n⏳ Tunggu...`);
  const conn = new SSHClient();
  conn.on('ready', () => {
    conn.exec('bash <(curl -s -k -L https://theme.sisherif.codes/install.sh)', (err, stream) => {
      if (err) { conn.end(); return ctx.reply('❌ Gagal menjalankan script.'); }
      stream.on('data', () => { try { stream.write('2\n'); } catch {} });
      stream.on('close', () => {
        conn.end();
        bot.telegram.deleteMessage(chatId, sm.message_id).catch(() => {});
        ctx.replyWithHTML(`✅ <b>𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗥𝗘𝗩𝗜𝗔𝗖𝗧𝗟𝗬 𝗦𝗘𝗟𝗘𝗦𝗔𝗜</b>\n\n<blockquote>IP: <code>${ipvps}</code>\nTema Reviactly terpasang.</blockquote>`);
        bot.telegram.sendMessage(ADMIN_ID, `🔔 𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗥𝗘𝗩𝗜𝗔𝗖𝗧𝗟𝗬\nUser: ${ctx.from.first_name}\nIP: ${ipvps}`, { parse_mode: 'HTML' });
      });
      stream.stderr.on('data', () => {});
    });
  }).on('error', err => ctx.reply(`❌ Koneksi Gagal: ${err.message}`))
    .connect({ host: ipvps, port, username: 'root', password: passwd, readyTimeout: 20000 });
});

bot.command('installtemanightcore', async (ctx) => {
  if (!await hasInstallAccess(ctx.from.id))
    return ctx.replyWithHTML(`<blockquote>❌ <b>𝗔𝗞𝗦𝗘𝗦 𝗗𝗜𝗧𝗢𝗟𝗔𝗞</b></blockquote>`);
  const text = ctx.payload;
  if (!text || !text.includes(',')) return ctx.replyWithHTML(`📖 Format: <code>/installtemanightcore ip,password</code>`);
  const [ipvps, passwd] = text.split(',').map(a => a.trim());
  const chatId = ctx.chat.id;
  let sm = await ctx.reply(`🔄 Menghubungkan ke ${ipvps}...`);
  const conn = new SSHClient();
  conn.on('ready', () => {
    bot.telegram.editMessageText(chatId, sm.message_id, null, '⏳ Install Tema Nightcore...').catch(() => {});
    conn.exec('bash <(curl -s https://raw.githubusercontent.com/XieTyyOfc/themeinstaller/master/install.sh)', (err, stream) => {
      if (err) { conn.end(); return ctx.reply('❌ Gagal eksekusi script.'); }
      stream.on('data', d => {
        const o = d.toString();
        if (o.includes('Masukkan token:')) stream.write('xietyofc\n');
        if (o.includes('Pilih aksi:')) stream.write('1\n');
        if (o.includes('Pilih tema')) stream.write('7\n');
      });
      stream.on('close', () => {
        conn.end();
        bot.telegram.deleteMessage(chatId, sm.message_id).catch(() => {});
        ctx.replyWithHTML(`✅ <b>𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗡𝗜𝗚𝗛𝗧𝗖𝗢𝗥𝗘 𝗦𝗘𝗟𝗘𝗦𝗔𝗜</b>\n\n<blockquote>IP: <code>${ipvps}</code>\nTema Nightcore (Stellar) terpasang.</blockquote>`);
        bot.telegram.sendMessage(ADMIN_ID, `🔔 𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗧𝗛𝗘𝗠𝗘\nUser: ${ctx.from.first_name}\nIP: ${ipvps}`, { parse_mode: 'HTML' });
      });
      stream.stderr.on('data', () => {});
    });
  }).on('error', err => ctx.reply(`❌ Koneksi Gagal: ${err.message}`))
    .connect({ host: ipvps, port: 22, username: 'root', password: passwd, readyTimeout: 30000 });
});

bot.command('swings', async (ctx) => {
  if (!await hasInstallAccess(ctx.from.id))
    return ctx.replyWithHTML(`<blockquote>❌ <b>𝗔𝗞𝗦𝗘𝗦 𝗗𝗜𝗧𝗢𝗟𝗔𝗞</b></blockquote>`);
  const text = ctx.payload;
  if (!text) return ctx.replyWithHTML(`📖 Format: <code>/swings ip|password|token</code>`);
  const t = text.split('|');
  if (t.length < 3) return ctx.reply('❌ Format salah! Gunakan pemisah |');
  const [ipvps, passwd, token] = t.map(x => x.trim());
  const chatId = ctx.chat.id;
  let sm = await ctx.reply('⚙️ Menghubungkan...');
  const conn = new SSHClient();
  conn.on('ready', () => {
    bot.telegram.editMessageText(chatId, sm.message_id, null, '⏳ Configure Wings...').catch(() => {});
    conn.exec(config.bash || 'echo no-bash', (err, stream) => {
      if (err) { conn.end(); return ctx.reply('❌ Error SSH.'); }
      stream.on('close', () => {
        conn.end();
        bot.telegram.deleteMessage(chatId, sm.message_id).catch(() => {});
        ctx.replyWithHTML(`✅ <b>𝗪𝗜𝗡𝗚𝗦 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗘𝗗!</b>\n\n<blockquote>IP: <code>${ipvps}</code>\nNode berhasil dikonfigurasi.</blockquote>`);
        bot.telegram.sendMessage(ADMIN_ID, `🔔 𝗦𝗪𝗜𝗡𝗚𝗦\nUser: ${ctx.from.first_name}\nIP: ${ipvps}`, { parse_mode: 'HTML' });
      }).on('data', () => { stream.write(`${config.tokeninstall||''}\n3\n${token}\n`); });
    });
  }).on('error', err => ctx.reply(`❌ Koneksi Gagal: ${err.message}`))
    .connect({ host: ipvps, port: 22, username: 'root', password: passwd, readyTimeout: 20000 });
});

// ════════════════════════════════════════════════════════
//  SUBDO COMMAND — with inline domain buttons
// ════════════════════════════════════════════════════════
bot.command('subdo', async (ctx) => {
  if (!await hasInstallAccess(ctx.from.id))
    return ctx.replyWithHTML(`<blockquote>❌ <b>𝗔𝗞𝗦𝗘𝗦 𝗗𝗜𝗧𝗢𝗟𝗔𝗞</b></blockquote>`);
  const text = ctx.payload;
  if (!text || !text.includes('|')) return ctx.reply(
    '❌ Format: /subdo name|ipvps\n\nContoh:\n/subdo LelenHost|1.2.3.4\n\nBot akan buat:\n• lelenhost.domain.com (Panel)\n• node-lelenhost.domain.com (Node)'
  );
  const [name, ip] = text.split('|').map(i => i.trim());
  const dom = Object.keys(global.subdomain || {});
  if (!dom.length) return ctx.reply('❌ Tidak ada domain tersedia.');
  const inlineKeyboard = [];
  for (let i = 0; i < dom.length; i += 2) {
    inlineKeyboard.push(
      dom.slice(i, i + 2).map((d, offset) => ({
        text: d,
        callback_data: `autocfg:${i + offset}:${name}:${ip}`
      , style: 'primary' }))
    );
  }
  inlineKeyboard.push([{ text: '❌ Batal', callback_data: 'menuinstall' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]);
  await ctx.replyWithHTML(
    `✨ <b>𝗔𝗨𝗧𝗢 𝗗𝗡𝗦 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗧𝗜𝗢𝗡</b>\n\n<blockquote>Name : <code>${name}</code>\nIP   : <code>${ip}</code>\n\nPilih domain:</blockquote>`,
    { reply_markup: { inline_keyboard: inlineKeyboard } }
  );
});



// ══════════════════════════════════════════════════════════
//  STOR AKUN
// ══════════════════════════════════════════════════════════

async function handleAutoCfg(ctx, action) {
  await ctx.answerCbQuery('🚀 Memproses DNS...').catch(() => {});
  const parts  = action.split(':');
  const domIdx = parseInt(parts[1]);
  const name   = parts[2].replace(/[^a-z0-9]/gi, '').toLowerCase();
  const ip     = parts[3];
  const dom    = Object.keys(global.subdomain || {});
  const tld    = dom[domIdx];
  const cfg    = global.subdomain[tld];
  if (!cfg) return ctx.editMessageText('❌ Domain tidak ditemukan.').catch(() => {});
  await ctx.editMessageText('⏳ <i>Generating DNS Records...</i>', { parse_mode: 'HTML' }).catch(() => {});
  const addDNS = sub => axios.post(
    `https://api.cloudflare.com/client/v4/zones/${cfg.zone}/dns_records`,
    { type: 'A', name: `${sub}.${tld}`, content: ip, ttl: 1, proxied: false },
    { headers: { 'Authorization': `Bearer ${cfg.apitoken}`, 'Content-Type': 'application/json' } }
  );
  try {
    const [rPanel, rNode] = await Promise.all([addDNS(name), addDNS(`node-${name}`)]);
    if (rPanel.data.success && rNode.data.success) {
      await ctx.editMessageText(
        `✨ <b>𝗦𝗨𝗕𝗗𝗢𝗠𝗔𝗜𝗡 𝗕𝗘𝗥𝗛𝗔𝗦𝗜𝗟 𝗗𝗜𝗕𝗨𝗔𝗧!</b>\n\n<blockquote>◈ Panel : <code>${rPanel.data.result.name}</code>\n◈ Node  : <code>${rNode.data.result.name}</code>\n◈ IP    : <code>${ip}</code>\n\n<i>Gunakan untuk /installpanel</i></blockquote>`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
      bot.telegram.sendMessage(ADMIN_ID, `LOG 𝗦𝗨𝗕𝗗𝗢𝗠𝗔𝗜𝗡\nUser: ${ctx.from.id}\nPanel: ${rPanel.data.result.name}\nNode: ${rNode.data.result.name}\nIP: ${ip}`, { parse_mode: 'HTML' });
    }
  } catch (e) {
    const em = e.response?.data?.errors?.[0]?.message || e.message;
    ctx.editMessageText(`❌ <b>𝗚𝗔𝗚𝗔𝗟 𝗕𝗨𝗔𝗧 𝗗𝗡𝗦</b>\n<code>${em}</code>`, { parse_mode: 'HTML' }).catch(() => {});
  }
}


// ════════════════════════════════════════════════════════
//  STOR AKUN — USER FLOW
// ════════════════════════════════════════════════════════
// ── STOR AKUN USER: pilih kategori ──
async function handleStorCatSet(ctx, category) {
  await ctx.answerCbQuery().catch(() => {});
  const sess = storSessions[ctx.from.id];
  if (!sess || sess.step !== 'stor_category') return;
  sess.category = category;
  sess.step = 'stor_tag';
  await editOrReply(ctx,
    `<tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> Nomor: <code>${sess.phone}</code>\n` +
    `<tg-emoji emoji-id="5317013291602553603">💵</tg-emoji> Harga: <b>${formatRp(sess.price)}</b>\n` +
    `<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> Tipe: <b>${category === 'no_limit' ? '🔥 No Limit' : '🔒 Limit'}</b>\n\n` +
    `<blockquote>🏷️ <b>Pilih tag akun (jika ada).</b></blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: '⚠️ Tag Scam', callback_data: 'stor_tag_set_tag_scam', style: 'danger'  , icon_custom_emoji_id: '5318947044793006041' }],
      [{ text: '🚫 Tag Fake', callback_data: 'stor_tag_set_tag_fake', style: 'danger'  , icon_custom_emoji_id: '5472267631979405211' }],
      [{ text: '✅ Tidak Ada Tag', callback_data: 'stor_tag_set_none', style: 'success' , icon_custom_emoji_id: '5472180551517477902' }],
      [{ text: 'Batal', callback_data: 'cancel_stor', style: 'danger', icon_custom_emoji_id: '5260293700088511294' }],
    ]}}
  );
}

// ── STOR AKUN USER: pilih tag → insert submission & kirim ke admin ──
async function handleStorTagSet(ctx, tag) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;
  const sess = storSessions[userId];
  if (!sess || sess.step !== 'stor_tag') return;

  const category = sess.category || 'no_limit';
  const tagVal   = tag === 'none' ? '' : tag;

  const catNames = { no_limit: '🔥 No Limit', spam_limit: '🔒 Limit' };
  const tagNames = { tag_scam: '⚠️ Tag Scam', tag_fake: '🚫 Tag Fake', '': '✅ Tidak Ada Tag' };

  const storId = `STOR-${Date.now()}-${Math.floor(Math.random()*1000)}`;
  await stor_submissions.insertOne({
    stor_id: storId,
    user_id: userId,
    phone: sess.phone,
    price_request: sess.price,
    category: category,
    tag: tagVal,
    status: 'pending_acc',
    created_at: new Date(),
  });
  delete storSessions[userId];

  const storSetting = await getSetting('stor_price_fixed');
  const adminPrice  = storSetting && parseInt(storSetting) >= 500 ? parseInt(storSetting) : sess.price;
  const catLabel = catNames[category] || category;
  const tagLabel = tagNames[tagVal] || tagVal;

  await bot.telegram.sendMessage(ADMIN_ID,
    `<tg-emoji emoji-id="5258024802010026053">🛒</tg-emoji> <b>Stor Account Baru</b>\n${LINE}\n\n` +
    `<blockquote><tg-emoji emoji-id="5883964170268840032">👤</tg-emoji> Penyetor     : <code>${userId}</code>\n` +
    `<tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> No           : <code>${sess.phone}</code>\n` +
    `<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> Tipe         : <b>${catLabel}</b>\n` +
    `🏷️ Tag          : <b>${tagLabel}</b>\n` +
    `<tg-emoji emoji-id="6039641775377748623">👛</tg-emoji> Harga Minta  : <b>${formatRp(sess.price)}</b>\n` +
    `<tg-emoji emoji-id="6044376336871461902">💰</tg-emoji> Harga Admin  : <b>${formatRp(adminPrice)}</b>\n` +
    `<tg-emoji emoji-id="5444856076954520455">🧾</tg-emoji> STOR ID      : <code>${storId}</code>\n\n` +
    `<tg-emoji emoji-id="5420323339723881652">⚠️</tg-emoji> Jika ACC, bot akan minta penyetor login akun.</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: 'ACC — Minta Login', callback_data: `stor_acc_${storId}`, style: 'success', icon_custom_emoji_id: '5206607081334906820' }],
      [{ text: 'TOLAK',             callback_data: `stor_reject_${storId}`, style: 'danger', icon_custom_emoji_id: '6084880262179588505' }],
    ]}}
  ).catch(() => {});

  await editOrReply(ctx,
    `<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji> <b>𝗣𝗘𝗡𝗔𝗪𝗔𝗥𝗔𝗡 𝗗𝗜𝗞𝗜𝗥𝗜𝗠!</b>\n${LINE}\n\n` +
    `<blockquote><tg-emoji emoji-id="6039398100408209720">☎️</tg-emoji> Nomor  : <code>${sess.phone}</code>\n` +
    `<tg-emoji emoji-id="6019523512908124649">🔒</tg-emoji> Tipe   : <b>${catLabel}</b>\n` +
    `🏷️ Tag   : <b>${tagLabel}</b>\n` +
    `<tg-emoji emoji-id="5317013291602553603">💵</tg-emoji> Harga  : <b>${formatRp(sess.price)}</b>\n` +
    `<tg-emoji emoji-id="5444856076954520455">🧾</tg-emoji> STOR ID: <code>${storId}</code>\n\n` +
    `<tg-emoji emoji-id="5368295871131695793">⏰</tg-emoji> Tunggu konfirmasi admin. Setelah di-ACC, kamu akan dihubungi untuk proses pembayaran.</blockquote>`,
    { parse_mode: 'HTML' }
  );
}

async function showStorAkun(ctx) {
  const storPrice = await getSetting('stor_price_fixed');
  const priceInfo = storPrice && parseInt(storPrice) >= 500
    ? `💰 Harga bayar    : <b>${formatRp(parseInt(storPrice))}</b> per akun (ditetapkan admin)`
    : `💰 Harga bayar    : Sesuai harga yang kamu tawarkan`;
  storSessions[ctx.from.id] = { step: 'stor_phone' };
  delete userSessions[ctx.from.id]; // clear sesi lain agar tidak bentrok
  await editOrReply(ctx,
    `<tg-emoji emoji-id="6039573425268201570">📤</tg-emoji> <b>Stor Akun Kalian</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<blockquote>Setor akun Telegram kamu untuk dijual di toko kami <tg-emoji emoji-id="6253696043397944888">🐰</tg-emoji>\n\n` +
    `<tg-emoji emoji-id="5260726538302660868">✅</tg-emoji> <b>Tutorial :</b>\n` +
    `<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Masukkan nomor akun\n` +
    `<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Tentukan harga yang kamu minta\n` +
    `<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Tunggu konfirmasi admin\n` +
    `<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Jika di - ACC, kamu akan diminta login akun\n` +
    `<tg-emoji emoji-id="5215480011322042129">➡️</tg-emoji> Selesai — admin transfer bayaran ke kamu\n\n` +
    `<tg-emoji emoji-id="5956148757899776734">⭐️</tg-emoji> Masukan nomor yang anda ingin setorkan kepada kami <i>Contoh: <code>+628123456789</code></i></blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Batal', callback_data: 'cancel_stor', style: 'danger', icon_custom_emoji_id: '5260293700088511294' }]] } }
  );
}

// ════════════════════════════════════════════════════════
//  STOR AKUN — ADMIN PANEL
// ════════════════════════════════════════════════════════
async function showStorPending(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx.from.id)) return;
  try { await ctx.deleteMessage(); } catch {}
  const pending = await stor_submissions.find({ status: 'pending' }).sort({ created_at: -1 }).limit(10).toArray();
  if (!pending.length) {
    return bot.telegram.sendMessage(ctx.from.id,
      `📭 <b>Tidak ada stor akun pending</b>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
    );
  }
  const pendingCatNames = { no_limit: '🔥 NL', spam_limit: '🔒 Limit' };
  const pendingTagNames = { tag_scam: ' ⚠️TS', tag_fake: ' 🚫TF', '': '' };
  let msg = `📤 <b>𝗦𝗧𝗢𝗥 𝗔𝗞𝗨𝗡 𝗣𝗘𝗡𝗗𝗜𝗡𝗚</b>\n${LINE}\n\n`;
  const rows = pending.map((s, i) => {
    const catLbl = pendingCatNames[s.category] || (s.category ? s.category : '🔥 NL');
    const tagLbl = pendingTagNames[s.tag] || '';
    msg += `${i+1}. 📱 <code>${s.phone}</code> | ${catLbl}${tagLbl} | 💰 ${formatRp(s.price_request)}\n   👤 <code>${s.user_id}</code>\n   🆔 <code>${s.stor_id}</code>\n\n`;
    return [
      { text: `✅ ACC`, callback_data: `stor_acc_${s.stor_id}` , style: 'success', icon_custom_emoji_id: '5472180551517477902' },
      { text: `❌ TOLAK`, callback_data: `stor_reject_${s.stor_id}` , style: 'danger', icon_custom_emoji_id: '6084880262179588505' },
    ];
  });
  await bot.telegram.sendMessage(ctx.from.id, msg,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [...rows, [{ text: '◀️ Kembali', callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
  );
}

async function showStorSetting(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx.from.id)) return;
  try { await ctx.deleteMessage(); } catch {}
  const storPrice = await getSetting('stor_price_fixed');
  const list = await products.find({ status: 'available' }).sort({ created_at: -1 }).limit(20).toArray();
  const accountRows = list.map((p, i) => [{
    text: `${i+1}. ${detectCountry(p.phone)} ${p.phone} — ${formatRp(p.price)}`,
    callback_data: `stor_pick_akun_${p._id}`,
  style: 'primary', icon_custom_emoji_id: '6028497653799588476' }]);
  await bot.telegram.sendMessage(ctx.from.id,
    `⚙️ <b>𝗦𝗘𝗧𝗧𝗜𝗡𝗚 𝗔𝗞𝗨𝗡 𝗦𝗘𝗧𝗢𝗥</b>\n${LINE}\n\n` +
    `<blockquote>💰 Harga Default: <b>${storPrice && parseInt(storPrice) > 0 ? formatRp(parseInt(storPrice)) : 'Bebas'}</b>\n\n` +
    `Pilih akun untuk setting 2FA/email/logout,\natau gunakan Tools Akun untuk manage via Session/MongoDB.</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: '🔧 Tools Akun (Session/MongoDB)', callback_data: 'admin_tools'         , style: 'primary', icon_custom_emoji_id: '5472010685560921607' }],
      [{ text: '💰 Atur Harga Default Stor',      callback_data: 'stor_setprice'       , style: 'primary', icon_custom_emoji_id: '5472027899789843495' }],
      [{ text: '✏️ Ubah Harga Produk di Stok',    callback_data: 'stor_editprice_list' , style: 'primary', icon_custom_emoji_id: '5422360266618707867' }],
      ...accountRows,
      [{ text: '◀️ Kembali', callback_data: 'admin' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}},
  );
}

// Tampil menu setting untuk 1 akun spesifik
async function showStorAkunMenu(ctx, pid) {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx.from.id)) return;
  try { await ctx.deleteMessage(); } catch {}
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
  if (!product) return bot.telegram.sendMessage(ctx.from.id, '❌ Akun tidak ditemukan.');

  // Cek apakah sudah ada session aktif di toolsSessions untuk akun ini
  const sessionAvail = !!product.session_string;

  await bot.telegram.sendMessage(ctx.from.id,
    `⚙️ <b>𝗦𝗘𝗧𝗧𝗜𝗡𝗚 𝗔𝗞𝗨𝗡 𝗦𝗘𝗧𝗢𝗥</b>\n${LINE}\n\n` +
    `<blockquote>📱 No     : <code>${product.phone}</code>\n` +
    `🌍 Negara : ${detectCountry(product.phone)}\n` +
    `💰 Harga  : ${formatRp(product.price)}\n` +
    `🔐 2FA    : ${product.two_fa ? `<code>${product.two_fa}</code>` : '❌ Tidak ada'}\n` +
    `💾 Session: ${sessionAvail ? '✅ Ada' : '❌ Tidak ada'}</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: '🔄 Refresh Info',        callback_data: `stortool_refresh_${pid}`  , style: 'success', icon_custom_emoji_id: '6035353718684129368' }],
      [{ text: '🔍 Cek OTP',             callback_data: `stortool_otp_${pid}`      , style: 'success', icon_custom_emoji_id: '5472252840112037845' }],
      [{ text: '🔐 Ubah 2FA',            callback_data: `stor_2fa_pick_${pid}`     , style: 'primary', icon_custom_emoji_id: '5472193350520021357' }],
      [{ text: '📧 Ubah Surel/Email',    callback_data: `stor_surel_pick_${pid}`   , style: 'primary', icon_custom_emoji_id: '5474371208176737086' }],
      [{ text: '❌ Logout Device',        callback_data: `stortool_kicklist_${pid}` , style: 'danger', icon_custom_emoji_id: '5382355635553739365' }],
      [{ text: '🚪 Logout Semua Device', callback_data: `stor_logout_${pid}`       , style: 'danger', icon_custom_emoji_id: '5458669860009554206' }],
      [{ text: '◀️ Kembali',             callback_data: 'admin_stor_setting'       , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
    ]}},
  );
}

// Helper: connect ke session produk dan lakukan aksi
async function storToolConnect(pid, action) {
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
  if (!product?.session_string) return { ok: false, msg: 'Session tidak ditemukan di produk ini.' };
  try {
    const client = new TelegramClient(new StringSession(product.session_string), API_ID, API_HASH, { connectionRetries: 5 });
    await client.connect();
    const result = await action(client, product);
    await client.disconnect().catch(() => {});
    return { ok: true, result };
  } catch (e) {
    return { ok: false, msg: e.message?.slice(0, 150) };
  }
}

// ── ACC stor akun — masuk ke stok ────────
async function handleStorAcc(ctx, storId) {
  if (!isAdmin(ctx.from.id)) return;
  const sub = await stor_submissions.findOne({ stor_id: storId });
  if (!sub) return ctx.answerCbQuery('❌ Tidak ditemukan!', { show_alert: true });
  if (sub.status !== 'pending_acc') return ctx.answerCbQuery('⚠️ Sudah diproses!', { show_alert: true });

  const storPriceSetting = await getSetting('stor_price_fixed');
  const finalPrice = storPriceSetting && parseInt(storPriceSetting) >= 500
    ? parseInt(storPriceSetting)
    : sub.price_request;

  // Update status jadi waiting_login
  await stor_submissions.updateOne({ stor_id: storId }, { $set: { status: 'waiting_login', final_price: finalPrice } });

  // Login ke nomor hp penyetor
  const lm = await bot.telegram.sendMessage(ctx.from.id, `⏳ Menginisiasi login ke ${sub.phone}...`);
  const result = await loginAccount(sub.phone);

  if (result.status === 'need_code') {
    // Simpan client ke memory sementara pakai storId sebagai key
    storSessions[`admin_stor_${storId}`] = {
      client: result.client,
      phoneCodeHash: result.phoneCodeHash,
      storId, finalPrice,
      userId: sub.user_id,
      phone: sub.phone,
    };
    // Beritahu penyetor untuk kirim OTP
    await bot.telegram.sendMessage(sub.user_id,
      `✅ <b>STOR AKUN DI-ACC!</b>\n${LINE}\n\n` +
      `<blockquote>📱 No    : <code>${sub.phone}</code>\n` +
      `💰 Harga : <b>${formatRp(finalPrice)}</b>\n\n` +
      `📩 Cek SMS/Telegram kamu — kode OTP sudah dikirim ke nomor ini.\n\n` +
      `Kirim kode OTP di sini (boleh pakai spasi, misal: <code>1 2 3 4 5</code>):</blockquote>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'cancel_stor' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
    ).catch(() => {});
    // Set session penyetor untuk tunggu OTP
    storSessions[sub.user_id] = { step: 'stor_user_otp', storId };
    await bot.telegram.editMessageText(ctx.from.id, lm.message_id, undefined,
      `✅ OTP dikirim ke <code>${sub.phone}</code>\nMenunggu penyetor masukkan kode...`, { parse_mode: 'HTML' }
    ).catch(() => {});
  } else if (result.status === 'success') {
    // Langsung berhasil tanpa OTP (jarang terjadi)
    const me = await result.client.getMe();
    storSessions[`admin_stor_${storId}`] = {
      client: result.client,
      storId, finalPrice,
      userId: sub.user_id,
      phone: sub.phone,
      real_id: me.id.toString(),
      sessionString: result.client.session.save(),
    };
    storSessions[sub.user_id] = { step: 'stor_user_2fa_input', storId };
    await bot.telegram.sendMessage(sub.user_id,
      `✅ <b>STOR AKUN DI-ACC!</b>\n\n🔐 Masukkan password 2FA akun ini (ketik <code>-</code> jika tidak ada):`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
    await bot.telegram.editMessageText(ctx.from.id, lm.message_id, undefined,
      `✅ Login langsung berhasil! Menunggu penyetor input 2FA...`
    ).catch(() => {});
  } else {
    await stor_submissions.updateOne({ stor_id: storId }, { $set: { status: 'login_failed' } });
    await bot.telegram.editMessageText(ctx.from.id, lm.message_id, undefined,
      `❌ Gagal login ke ${sub.phone}: ${result.error}`
    ).catch(() => {});
  }

  await ctx.answerCbQuery('✅ ACC! Menunggu OTP dari penyetor...');
  try { await ctx.editMessageText(`✅ ACC — ${sub.phone} | Menunggu OTP penyetor`, { parse_mode: 'HTML' }); } catch {}
}

// ── TOLAK stor akun ───────────────────────
async function handleStorReject(ctx, storId) {
  if (!isAdmin(ctx.from.id)) return;
  const sub = await stor_submissions.findOne({ stor_id: storId });
  if (!sub) return ctx.answerCbQuery('❌ Tidak ditemukan!', { show_alert: true });
  // Status bisa pending_acc (belum login) atau waiting_login
  const rejectableStatuses = ['pending_acc', 'pending', 'waiting_login'];
  if (!rejectableStatuses.includes(sub.status))
    return ctx.answerCbQuery('⚠️ Sudah diproses!', { show_alert: true });

  await stor_submissions.updateOne({ stor_id: storId }, { $set: { status: 'rejected', rejected_at: new Date() } });

  // Bersihkan sesi admin kalau ada
  delete storSessions[`admin_stor_${storId}`];
  // Bersihkan sesi user kalau masih nunggu OTP
  if (storSessions[sub.user_id]?.storId === storId) {
    delete storSessions[sub.user_id];
  }

  await bot.telegram.sendMessage(sub.user_id,
    `❌ <b>𝗦𝗧𝗢𝗥 𝗔𝗞𝗨𝗡 𝗗𝗜𝗧𝗢𝗟𝗔𝗞</b>\n\n📱 No: <code>${sub.phone}</code>\n\nHubungi admin untuk info lebih lanjut.`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
  await ctx.answerCbQuery('❌ Stor ditolak!');
  try { await ctx.editMessageCaption(`❌ TOLAK — ${sub.phone}`, { parse_mode: 'HTML' }); } catch {
    try { await ctx.editMessageText(`❌ TOLAK — ${sub.phone}`, { parse_mode: 'HTML' }); } catch {}
  }
}

// ── Handle stor_setting callbacks ─────────
// handleStorSetting2FA & handleStorSettingSurel sudah digantikan oleh showStorAkunMenu
async function handleStorSetting2FA(ctx) { return showStorSetting(ctx); }
async function handleStorSettingSurel(ctx) { return showStorSetting(ctx); }


// ── Tampilkan list produk untuk ganti harga ──
async function showEditPriceList(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx.from.id)) return;
  try { await ctx.deleteMessage(); } catch {}
  const list = await products.find({ status: 'available' }).sort({ created_at: -1 }).limit(20).toArray();
  if (!list.length) return bot.telegram.sendMessage(ctx.from.id,
    `❌ Tidak ada produk di stok.`,
    { reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'admin_stor_setting' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
  );
  let msg = `✏️ <b>𝗨𝗕𝗔𝗛 𝗛𝗔𝗥𝗚𝗔 𝗣𝗥𝗢𝗗𝗨𝗞</b>\n${LINE}\n\nPilih produk:\n\n`;
  const rows = list.map((p, i) => {
    msg += `${i+1}. ${detectCountry(p.phone)} <code>${p.phone}</code> — ${formatRp(p.price)}\n`;
    return [{
      text: `${i+1}. ${p.phone} — ${formatRp(p.price)}`,
      callback_data: `stor_editprice_${p._id}`,
    style: 'primary', icon_custom_emoji_id: '5472200252532464654' }];
  });
  rows.push([{ text: '◀️ Kembali', callback_data: 'admin_stor_setting' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]);
  await bot.telegram.sendMessage(ctx.from.id, msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
}

async function startEditPrice(ctx, pid) {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx.from.id)) return;
  try { await ctx.deleteMessage(); } catch {}
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
  if (!product) return bot.telegram.sendMessage(ctx.from.id, '❌ Produk tidak ditemukan.');
  storSessions[ctx.from.id] = { step: 'stor_edit_price', productId: pid };
  await bot.telegram.sendMessage(ctx.from.id,
    `✏️ <b>Ubah Harga</b>\n\n📱 ${product.phone}\n💰 Harga sekarang: <b>${formatRp(product.price)}</b>\n\nMasukkan harga baru:`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'stor_editprice_list' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
  );
}


// ── Logout semua device kecuali current session ──
async function handleStorLogout(ctx, pid) {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx.from.id)) return;
  try { await ctx.deleteMessage(); } catch {}
  const product = await products.findOne({ _id: new mongoose.Types.ObjectId(pid) });
  if (!product) return bot.telegram.sendMessage(ctx.from.id, '❌ Akun tidak ditemukan.');
  const lm = await bot.telegram.sendMessage(ctx.from.id,
    `⏳ Logout semua device untuk <code>${product.phone}</code>...`, { parse_mode: 'HTML' }
  );
  try {
    const { Api } = require('telegram/tl');
    const client  = new TelegramClient(new StringSession(product.session_string), API_ID, API_HASH, { connectionRetries: 3 });
    await client.connect();
    // Ambil semua authorizations
    const auths = await client.invoke(new Api.account.GetAuthorizations());
    let terminated = 0;
    for (const auth of auths.authorizations) {
      // Skip yang current (hash = 0 adalah current session)
      if (auth.current) continue;
      try {
        await client.invoke(new Api.account.ResetAuthorization({ hash: auth.hash }));
        terminated++;
      } catch {}
    }
    // Simpan session terbaru
    const newSession = client.session.save();
    await products.updateOne({ _id: product._id }, { $set: { session_string: newSession } });
    await client.disconnect();
    await bot.telegram.editMessageText(ctx.from.id, lm.message_id, undefined,
      `✅ <b>Logout Selesai!</b>\n\n` +
      `<blockquote>📱 No       : <code>${product.phone}</code>\n` +
      `🚪 Terminated: <b>${terminated} device</b>\n` +
      `✅ Session bot tetap aktif</blockquote>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: `stor_pick_akun_${pid}` , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
    );
  } catch (e) {
    await bot.telegram.editMessageText(ctx.from.id, lm.message_id, undefined,
      `❌ Gagal logout: ${e.message?.slice(0, 100)}`,
      { reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: `stor_pick_akun_${pid}` , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]] }}
    );
  }
}

// ══════════════════════════════════════════════════════════
//  ADMIN TOOLS — Session / Device Manager
// ══════════════════════════════════════════════════════════

async function computeNewPasswordHash(algo, newPassword) {
  const { createHash, randomBytes, pbkdf2Sync } = require('crypto');
  // Tambah random 32 bytes ke salt1 (WAJIB sesuai spec Telegram SRP)
  const clientSalt = randomBytes(32);
  const salt1 = Buffer.concat([Buffer.from(algo.salt1), clientSalt]);
  const salt2 = Buffer.from(algo.salt2);
  const H  = (...a) => createHash('sha256').update(Buffer.concat(a)).digest();
  const SH = (d, s) => H(s, d, s);
  const ph1 = SH(Buffer.from(newPassword, 'utf8'), salt1);
  const ph2 = SH(pbkdf2Sync(ph1, salt2, 100000, 64, 'sha512'), salt2);
  // SRP verifier: v = g^x mod p
  const bigP = BigInt('0x' + Buffer.from(algo.p).toString('hex'));
  const bigG = BigInt(algo.g);
  const x    = BigInt('0x' + ph2.toString('hex'));
  const modPow = (base, exp, mod) => {
    let r = 1n; base = base % mod;
    while (exp > 0n) {
      if (exp % 2n === 1n) r = r * base % mod;
      exp = exp / 2n; base = base * base % mod;
    }
    return r;
  };
  const v    = modPow(bigG, x, bigP);
  const vBuf = Buffer.from(v.toString(16).padStart(512, '0'), 'hex');
  const { Api } = require('telegram/tl');
  const newAlgo = new Api.PasswordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow({
    salt1, salt2, p: Buffer.from(algo.p), g: algo.g,
  });
  return { newAlgo, newPasswordHash: vBuf };
}

// ════════════════════════════════════════════════════════
//  TOOLS AKUN (dari tools.py) — session manager
// ════════════════════════════════════════════════════════
const toolsSessions = {}; // userId → { client, me, sessionStr }

async function showAdminTools(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx.from.id)) return;
  try { await ctx.deleteMessage(); } catch {}
  await bot.telegram.sendMessage(ctx.from.id,
    `🔧 <b>𝗧𝗢𝗢𝗟𝗦 𝗔𝗞𝗨𝗡</b>\n${LINE}\n\n` +
    `<blockquote><b>Cara pakai:</b>\n` +
    `1. Kirim <b>String Session</b> Telegram\n   (min. 30 karakter, format base64)\n\n` +
    `2. Kirim <b>MongoDB URI</b>\n   <code>mongodb+srv://user:pass@cluster/db</code>\n   → Bot akan scan semua session di dalamnya\n\n` +
    `<b>Fitur setelah login:</b>\n` +
    `🔄 Refresh info & device list\n` +
    `🔍 Cek OTP terbaru dari Telegram\n` +
    `🔑 Ubah / Hapus Password 2FA\n` +
    `📧 Set / Ubah / Hapus Email Recovery\n` +
    `❌ Logout Device Tertentu\n` +
    `🚪 Logout Semua Device\n` +
    `🗑️ Hapus Akun Telegram\n\n` +
    `Kirim sekarang:</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: '◀️ Kembali', callback_data: 'admin_stor_setting' , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }]
    ]}}
  );
  userSessions[ctx.from.id] = { step: 'tools_input' };
}

async function handleToolsUseSession(ctx, idx) {
  await ctx.answerCbQuery('⏳ Memproses...').catch(() => {});
  const ts = toolsSessions[ctx.from.id];
  if (!ts?.mongoSessions) return;
  const sessData = ts.mongoSessions[parseInt(idx)];
  if (!sessData) return;
  await connectToolsSession(ctx, sessData.session);
}

async function connectToolsSession(ctx, sessionStr) {
  const lm = await bot.telegram.sendMessage(ctx.from.id, '🔐 Login ke akun...');
  try {
    const client = new TelegramClient(new StringSession(sessionStr), API_ID, API_HASH, { connectionRetries: 3 });
    await client.connect();
    const me = await client.getMe();
    toolsSessions[ctx.from.id] = { client, me, sessionStr };
    await showToolsMain(ctx.from.id, lm.message_id);
  } catch (e) {
    await bot.telegram.editMessageText(ctx.from.id, lm.message_id, undefined,
      `❌ Session tidak valid: ${e.message?.slice(0,80)}`);
  }
}

async function showToolsMain(userId, msgId = null) {
  const ts = toolsSessions[userId];
  if (!ts?.me) return;
  const { Api } = require('telegram/tl');
  const client = ts.client;
  const me     = ts.me;

  let pwdStatus = '❌ Tidak Aktif', emailStatus = '-', devList = '', devRaw = [];
  try {
    const pwd = await client.invoke(new Api.account.GetPassword());
    pwdStatus = pwd.hasPassword ? '✅ Aktif' : '❌ Tidak Aktif';
    emailStatus = pwd.emailUnconfirmedPattern || pwd.loginEmailPattern || '-';
  } catch {}
  try {
    const auths = await client.invoke(new Api.account.GetAuthorizations());
    devRaw = auths.authorizations;
    devRaw.forEach((a, i) => {
      const curr = a.current ? ' (AKTIF/BOT)' : '';
      devList += `${i+1}. ${a.deviceModel || '-'}${curr}\n   📍 ${a.country} | ${new Date(a.dateActive*1000).toLocaleDateString('id-ID')}\n\n`;
    });
  } catch {}

  const text =
    `🔐 <b>TOOLS — DETAIL AKUN</b>\n${LINE}\n\n` +
    `<blockquote>👤 Nama  : ${me.firstName || ''} ${me.lastName || ''}\n` +
    `🏷️ Username: @${me.username || '-'}\n` +
    `🆔 ID      : <code>${me.id}</code>\n` +
    `🌟 Premium : ${me.premium ? '✅' : '❌'}\n\n` +
    `🔐 2FA     : ${pwdStatus}\n` +
    `📧 Email   : ${emailStatus}\n\n` +
    `📱 <b>DEVICE (${devRaw.length}):</b>\n${devList}</blockquote>`;

  const kb = { inline_keyboard: [
    [{ text: '🔄 Refresh',             callback_data: 'tools_refresh'       , style: 'danger', icon_custom_emoji_id: '5213452215527677338' }, { text: '🔍 Cek OTP',       callback_data: 'tools_otp'          , style: 'success', icon_custom_emoji_id: '5472252840112037845' }],
    [{ text: '🔑 Ubah 2FA',            callback_data: 'tools_change_pwd'    , style: 'primary', icon_custom_emoji_id: '6028551194861899805' }, { text: '📧 Email Menu',    callback_data: 'tools_email_menu'   , style: 'primary', icon_custom_emoji_id: '5474371208176737086' }],
    [{ text: '❌ Logout Device',        callback_data: 'tools_kicklist'      , style: 'danger', icon_custom_emoji_id: '5382355635553739365' }, { text: '🚪 Logout All',    callback_data: 'tools_kickall'      , style: 'danger', icon_custom_emoji_id: '5458669860009554206' }],
    [{ text: '🗑️ Hapus Akun Telegram', callback_data: 'tools_delete_acc'                                                                       , style: 'danger', icon_custom_emoji_id: '5472291748220771063' }],
    [{ text: '🔒 Keluar dari Tools',    callback_data: 'tools_logout'        , style: 'primary', icon_custom_emoji_id: '5458669860009554206' }],
    [{ text: '◀️ Kembali',              callback_data: 'admin_stor_setting'  , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
  ]};

  if (msgId) {
    await bot.telegram.editMessageText(userId, msgId, undefined, text, { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await bot.telegram.sendMessage(userId, text, { parse_mode: 'HTML', reply_markup: kb });
  }
}

async function handleToolsRefresh(ctx) {
  await ctx.answerCbQuery('🔄 Refresh...').catch(() => {});
  if (!isAdmin(ctx.from.id)) return;
  await showToolsMain(ctx.from.id, ctx.callbackQuery.message.message_id);
}

async function handleToolsOtp(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const ts = toolsSessions[ctx.from.id];
  if (!ts?.client) return ctx.reply('❌ Tidak ada sesi aktif.');
  const lm = await ctx.reply('🔍 Mengambil OTP...');
  try {
    for await (const msg of ts.client.iterMessages(777000, { limit: 10 })) {
      const match = msg.text?.match(/\b(\d{5,6})\b/);
      if (match) {
        const t = msg.date ? new Date(msg.date * 1000).toLocaleTimeString('id-ID') : '-';
        try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
        return ctx.reply(`🔑 <b>𝗢𝗧𝗣 𝗧𝗘𝗥𝗕𝗔𝗥𝗨</b>\n\n<code>${match[1]}</code>\n\n⏰ ${t}`, { parse_mode: 'HTML' });
      }
    }
    try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
    await ctx.reply('⚠️ OTP belum masuk dari Telegram (777000).');
  } catch (e) {
    try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
    ctx.reply(`❌ ${e.message?.slice(0,80)}`);
  }
}

async function handleToolsKickAll(ctx) {
  await ctx.answerCbQuery('🚪 Logout semua...').catch(() => {});
  const ts = toolsSessions[ctx.from.id];
  if (!ts?.client) return ctx.answerCbQuery('❌ Tidak ada sesi aktif.', { show_alert: true });
  try {
    const { Api } = require('telegram/tl');
    const auths   = await ts.client.invoke(new Api.account.GetAuthorizations());
    let n = 0;
    for (const a of auths.authorizations) {
      if (a.current) continue;
      try { await ts.client.invoke(new Api.account.ResetAuthorization({ hash: a.hash })); n++; } catch {}
    }
    await ctx.answerCbQuery(`✅ ${n} device dilogout!`, { show_alert: true });
    await showToolsMain(ctx.from.id, ctx.callbackQuery.message.message_id);
  } catch (e) { await ctx.answerCbQuery(`❌ ${e.message?.slice(0,60)}`, { show_alert: true }); }
}

async function handleToolsKickDevice(ctx, idxStr) {
  const ts = toolsSessions[ctx.from.id];
  if (!ts?.client) return ctx.answerCbQuery('❌ Tidak ada sesi aktif.', { show_alert: true });
  await ctx.answerCbQuery().catch(() => {});
  const cache = global.toolsKickCache?.[ctx.from.id];
  if (!cache) return ctx.reply('❌ Session expired, tekan Logout Device lagi.');
  const device = cache.devices[parseInt(idxStr)];
  if (!device) return ctx.reply('❌ Device tidak ditemukan.');
  const devLabel = `${device.deviceModel||'-'} — ${device.country||'-'}`;
  return ctx.reply(
    `⚠️ <b>Konfirmasi Logout Device</b>

📱 ${devLabel}

Yakin logout device ini?`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: '✅ Ya, Logout', callback_data: `tools_kick_confirm_${idxStr}` , style: 'success', icon_custom_emoji_id: '5206607081334906820' }],
      [{ text: '❌ Batal',      callback_data: 'tools_kicklist'               , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }],
    ]}}
  );
}

async function handleToolsKickDeviceConfirm(ctx, idxStr) {
  const ts = toolsSessions[ctx.from.id];
  if (!ts?.client) return ctx.reply('❌ Tidak ada sesi aktif.');
  const cache = global.toolsKickCache?.[ctx.from.id];
  if (!cache) return ctx.reply('❌ Session expired. Tekan Logout Device lagi.');
  const device = cache.devices[parseInt(idxStr)];
  if (!device) return ctx.reply('❌ Device tidak ditemukan.');
  const lm = await ctx.reply(`⏳ Logout <b>${device.deviceModel||'-'}</b>...`, { parse_mode: 'HTML' });
  try {
    const { Api } = require('telegram/tl');
    await ts.client.invoke(new Api.account.ResetAuthorization({ hash: device.hash }));
    delete global.toolsKickCache[ctx.from.id];
    try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
    await ctx.reply(
      `✅ <b>Device berhasil dilogout!</b>
📱 ${device.deviceModel||'-'} — ${device.country||'-'}`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
        [{ text: '🔄 Lihat Device Lagi', callback_data: 'tools_kicklist' , style: 'primary', icon_custom_emoji_id: '6035353718684129368' }],
        [{ text: '◀️ Kembali',           callback_data: 'tools_refresh'  , style: 'danger', icon_custom_emoji_id: '6039539366177541657' }],
      ]}}
    );
  } catch (e) {
    try { await bot.telegram.deleteMessage(ctx.from.id, lm.message_id); } catch {}
    ctx.reply(`❌ Gagal: ${e.message?.slice(0,80)}`);
  }
}

async function handleToolsLogout(ctx) {
  if (toolsSessions[ctx.from.id]?.client) {
    await toolsSessions[ctx.from.id].client.disconnect().catch(() => {});
  }
  delete toolsSessions[ctx.from.id];
  await ctx.answerCbQuery('✅ Keluar dari Tools.').catch(() => {});
}

async function handleToolsScanMongo(ctx) {
  await ctx.answerCbQuery('⏳ Scanning...').catch(() => {});
  if (!isAdmin(ctx.from.id)) return;
  userSessions[ctx.from.id] = { step: 'tools_mongo' };
  await editOrReply(ctx, '🗄️ Kirim MongoDB URI untuk scan session:',
    { reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'admin_stor_setting' , style: 'danger', icon_custom_emoji_id: '6084880262179588505' }]] }}
  );
}

// ══════════════════════════════════════════
//  START BOT
// ══════════════════════════════════════════


async function startBot() {
  try {
    let mongoStatus = 'Disconnect';
    try {
      await connectDB();
      // Set DB collections ke global setelah connect
      global.users            = () => users;
      global.products         = () => products;
      global.deposits         = () => deposits;
      global.settings         = () => settings;
      global.vouchers         = () => vouchers;
      global.scripts          = () => scripts;
      global.gift_orders      = () => gift_orders;
      global.install_access   = () => install_access;
      global.stor_submissions = () => stor_submissions;
      global.draft_accounts   = () => draft_accounts;
      mongoStatus = 'Connect';
    } catch (dbErr) {
      console.error(chalk.red('❌ MongoDB Error:'), dbErr.message);
      process.exit(1);
    }

    await bot.launch();
    await bot.telegram.getMe().then(info => { bot.botInfo = info; }).catch(() => {});

    await new Promise(r => setTimeout(r, 500));

    const ownerRaw = DEV_NAME || '@inheler1';
    const owner    = ownerRaw.startsWith('@') ? ownerRaw : `@${ownerRaw}`;
    const SEP      = '━'.repeat(42);
    const BLUE     = '\x1b[34m';
    const GREEN    = '\x1b[32m';
    const YELLOW   = '\x1b[33m';
    const CYAN     = '\x1b[36m';
    const BOLD     = '\x1b[1m';
    const RESET    = '\x1b[0m';

    process.stdout.write('\n');
    process.stdout.write(BOLD + BLUE + SEP + RESET + '\n');
    process.stdout.write(BOLD + BLUE + '  ███╗   ██╗ ██████╗ ██╗  ██╗████████╗███████╗██╗  ' + RESET + '\n');
    process.stdout.write(BOLD + BLUE + '  ████╗  ██║██╔═══██╗██║ ██╔╝╚══██╔══╝██╔════╝██║  ' + RESET + '\n');
    process.stdout.write(BOLD + BLUE + '  ██╔██╗ ██║██║   ██║█████╔╝    ██║   █████╗  ██║  ' + RESET + '\n');
    process.stdout.write(BOLD + BLUE + '  ██║╚██╗██║██║   ██║██╔═██╗    ██║   ██╔══╝  ██║  ' + RESET + '\n');
    process.stdout.write(BOLD + BLUE + '  ██║ ╚████║╚██████╔╝██║  ██╗   ██║   ███████╗███████╗' + RESET + '\n');
    process.stdout.write(BOLD + BLUE + '  ╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚══════╝' + RESET + '\n');
    process.stdout.write(BLUE + '                                    B O T S' + RESET + '\n');
    process.stdout.write(BOLD + BLUE + SEP + RESET + '\n');
    process.stdout.write(`  Mongodb  : ${mongoStatus === 'Connect' ? GREEN + '✔  Connect' : '\x1b[31m✘  Disconnect'}${RESET}\n`);
    process.stdout.write(`  Runtime  : ${CYAN}${getUptime()}${RESET}\n`);
    process.stdout.write(`  Owner    : ${YELLOW}${owner}${RESET}\n`);
    process.stdout.write(BOLD + BLUE + SEP + RESET + '\n\n');

  } catch (err) {
    console.error(chalk.red('❌ Error starting bot:'), err);
    process.exit(1);
  }
}

startBot();
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
