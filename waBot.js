// ╔══════════════════════════════════════════════════════════════╗
// ║        🟢 ARABS UBOT — BOT WHATSAPP (Green API)             ║
// ║   Polling via receiveNotification — FIX: reply berfungsi    ║
// ╚══════════════════════════════════════════════════════════════╝
'use strict';

const axios  = require('axios');
const config = require('../config/config');
const db     = require('./database');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

// ── State ────────────────────────────────────────────────────────
let isRunning  = false;
let pollTimer  = null;
const waSess   = new Map(); // chatId → { state, phone }

// ── Green API base ────────────────────────────────────────────────
const G = config.GREEN_API;
function gaUrl(ep) {
  return `${G.apiUrl}/waInstance${G.idInstance}/${ep}/${G.apiToken}`;
}
async function gaPost(ep, body) {
  const r = await axios.post(gaUrl(ep), body, { timeout: 15000 });
  return r.data;
}
async function gaGet(ep) {
  const r = await axios.get(gaUrl(ep), { timeout: 15000 });
  return r.data;
}

async function sendText(chatId, text) {
  try {
    await gaPost('sendMessage', { chatId, message: String(text).slice(0, 4096) });
  } catch (e) { console.error('[WaBot] sendText error:', e.message); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Format helpers ────────────────────────────────────────────────
function box(icon, title, rows) {
  let o = `╭──「 ${icon} *${title}* 」\n│\n`;
  for (const [k, v] of rows) o += k ? `│ *${k}:* ${v}\n` : `│ ${v}\n`;
  return o + `│\n╰────────────────────────\n✦ Arabs UBot WA Edition ✦`;
}
function uptime() {
  const s = Math.floor(process.uptime());
  return `${Math.floor(s/86400)}d ${Math.floor((s%86400)/3600)}h ${Math.floor((s%3600)/60)}m`;
}
function getWaSess(chatId) {
  if (!waSess.has(chatId)) waSess.set(chatId, { state: null, phone: null });
  return waSess.get(chatId);
}

// ═══════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════
async function cmdHelp(chatId) {
  await sendText(chatId,
    `╔══════════════════════════╗\n` +
    `║  ⚡ *ARABS UBOT v4.0* ⚡  ║\n` +
    `╚══════════════════════════╝\n\n` +
    `*[ 🖥 SISTEM ]*\n` +
    `.help  .ping  .alive  .sysinfo  .uptime\n\n` +
    `*[ 🛠 TOOLS ]*\n` +
    `.tr <lang> <teks>  .calc <expr>\n` +
    `.kurs <USD>  .cuaca <kota>  .wiki <query>\n` +
    `.short <url>  .password <len>  .uuid\n\n` +
    `*[ 📱 WA TOOLS ]*\n` +
    `.cekbio 628xx 628yy — Cek nomor WA\n\n` +
    `*[ 📥 DOWNLOADER ]*\n` +
    `.ytdlp .ttdlp .igdlp <link>\n\n` +
    `*[ 📝 NOTES ]*\n` +
    `.note <key> <isi>  .notes  .delnote <key>\n` +
    `.remind <mnt> <teks>\n\n` +
    `*[ 💰 BISNIS ]*\n` +
    `.invoice Nama|Produk|Harga|Qty\n` +
    `.diskon <harga> <persen>  .laba <modal> <jual>\n\n` +
    `*[ 😂 FUN ]*\n` +
    `.joke  .fakta  .ramalan  .katakata\n\n` +
    `*[ 👤 MANAGE USERBOT TELEGRAM ]*\n` +
    `.addubot  .listubot  .restartubot  .outubot\n\n` +
    `*[ 🚀 PANEL CREATOR ]*\n` +
    `.1gb .2gb .4gb .8gb .16gb .unlimited .adminpanel <nama>\n\n` +
    `✦ Arabs UBot Premium v4.0 — WhatsApp Edition ✦`
  );
}

async function cmdPing(chatId) {
  const t = Date.now();
  await sendText(chatId, '🏓 Pong!\n⚡ Latency: ' + (Date.now() - t) + 'ms');
}

async function cmdAlive(chatId) {
  await sendText(chatId, box('✅', 'ARABS UBOT AKTIF', [
    ['Status',   '🟢 Online'],
    ['Uptime',   uptime()],
    ['RAM',      (process.memoryUsage().heapUsed/1024/1024).toFixed(1) + ' MB'],
    ['Platform', 'WhatsApp via Green API'],
    ['Version',  'v4.0 Premium'],
  ]));
}

async function cmdSysinfo(chatId) {
  await sendText(chatId, box('🖥', 'SYSTEM INFO', [
    ['OS',       os.type() + ' ' + os.release()],
    ['CPU',      (os.cpus()[0]?.model||'-').slice(0,35)],
    ['RAM',      `${(os.freemem()/1024/1024).toFixed(0)}MB / ${(os.totalmem()/1024/1024).toFixed(0)}MB`],
    ['Uptime',   uptime()],
  ]));
}

async function cmdCalc(chatId, expr) {
  if (!expr) return sendText(chatId, '❌ Format: .calc 10*5+2');
  try {
    const result = Function('"use strict"; return (' + expr.replace(/[^0-9+\-*/.()%\s]/g,'') + ')')();
    await sendText(chatId, box('🧮', 'KALKULATOR', [['Ekspresi', expr], ['Hasil', String(result)]]));
  } catch(_) { await sendText(chatId, '❌ Ekspresi tidak valid!'); }
}

async function cmdTr(chatId, args) {
  const [lang, ...rest] = args.split(' '); const text = rest.join(' ');
  if (!lang || !text) return sendText(chatId, '❌ Format: .tr en Halo dunia');
  try {
    const r   = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: { client:'gtx', sl:'auto', tl:lang, dt:'t', q:text }, timeout:10000
    });
    const out = r.data[0].map(x => x[0]).join('');
    await sendText(chatId, box('🌐', 'TRANSLATE', [['Asal', text.slice(0,80)], ['Hasil', out], ['Lang', '→ '+lang.toUpperCase()]]));
  } catch(e) { await sendText(chatId, '❌ Gagal: ' + e.message); }
}

async function cmdKurs(chatId, kode) {
  if (!kode) return sendText(chatId, '❌ Format: .kurs USD');
  try {
    const r    = await axios.get('https://open.er-api.com/v6/latest/IDR', { timeout:8000 });
    const rate = r.data.rates[kode.toUpperCase()];
    if (!rate) return sendText(chatId, '❌ Kode tidak valid!');
    await sendText(chatId, box('💱', 'KURS', [
      ['1 IDR', (1/rate).toFixed(6) + ' ' + kode.toUpperCase()],
      ['1 '+kode.toUpperCase(), 'Rp ' + (1/rate).toLocaleString('id-ID')],
    ]));
  } catch(e) { await sendText(chatId, '❌ Gagal: ' + e.message); }
}

async function cmdCuaca(chatId, kota) {
  if (!kota) return sendText(chatId, '❌ Format: .cuaca Jakarta');
  try {
    const r   = await axios.get(`https://wttr.in/${encodeURIComponent(kota)}?format=j1`, { timeout:8000 });
    const cur = r.data.current_condition?.[0];
    await sendText(chatId, box('🌤', 'CUACA', [
      ['Kota',       kota],
      ['Suhu',       cur?.temp_C + '°C'],
      ['Kondisi',    cur?.weatherDesc?.[0]?.value||'-'],
      ['Kelembaban', cur?.humidity + '%'],
    ]));
  } catch(e) { await sendText(chatId, '❌ Gagal: ' + e.message); }
}

async function cmdWiki(chatId, query) {
  if (!query) return sendText(chatId, '❌ Format: .wiki Indonesia');
  try {
    const r = await axios.get(`https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`, { timeout:10000 });
    await sendText(chatId, `📖 *${r.data.title}*\n\n${(r.data.extract||'').slice(0,400)}\n\n🔗 ${r.data.content_urls?.desktop?.page||''}`);
  } catch(_) { await sendText(chatId, '❌ Tidak ditemukan!'); }
}

async function cmdShorten(chatId, url) {
  if (!url) return sendText(chatId, '❌ Format: .short https://example.com');
  try {
    const r = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout:8000 });
    await sendText(chatId, box('🔗', 'SHORT URL', [['Short', r.data], ['Asli', url.slice(0,60)]]));
  } catch(e) { await sendText(chatId, '❌ Gagal: ' + e.message); }
}

async function cmdPassword(chatId, args) {
  const len   = Math.min(parseInt(args)||16, 64);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const pass  = Array.from({length:len}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  await sendText(chatId, box('🔐', 'PASSWORD', [['Panjang', len], ['Password', pass]]));
}

async function cmdUuid(chatId) {
  const u = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8); return v.toString(16);
  });
  await sendText(chatId, box('🆔', 'UUID', [['UUID', u]]));
}

// FUN
const JOKES   = ['Kenapa programer pakai kacamata? Karena tidak bisa C#!','Bug dan feature bedanya apa? Bug ketahuan, feature direncanakan!','Programmer mati karena apa? Stack overflow!'];
const FAKTAS  = ['Madu tidak pernah basi — madu 3000 tahun masih bisa dimakan!','Octopus punya 3 jantung, darahnya berwarna biru.','Semut tidak pernah tidur sepanjang hidupnya.'];
const RAMALAN = ['Hari ini keberuntunganmu tinggi!','Hati-hati dalam mengambil keputusan.','Rezeki sedang menunggumu di depan.'];
const KATA    = ['Jangan takut gagal, takutlah tidak pernah mencoba.','Kesuksesan adalah perjalanan, bukan tujuan.','Setiap hari adalah kesempatan baru menjadi lebih baik.'];
const pick = arr => arr[Math.floor(Math.random()*arr.length)];

// NOTES
async function cmdNoteSet(chatId, sender, args) {
  const [key,...val] = args.split(' '); const value = val.join(' ');
  if (!key||!value) return sendText(chatId, '❌ Format: .note <key> <isi>');
  db.saveNote(sender, key, value);
  await sendText(chatId, `✅ Catatan *${key}* disimpan!`);
}
async function cmdNoteList(chatId, sender) {
  const notes = db.getAllNotes(sender)||{}; const keys = Object.keys(notes);
  if (!keys.length) return sendText(chatId, 'ℹ️ Belum ada catatan!');
  let t = `📝 *CATATAN KAMU*\n\n`;
  for (const k of keys) t += `• *${k}* → ${(notes[k].value||'').slice(0,60)}\n`;
  await sendText(chatId, t);
}
async function cmdNoteDel(chatId, sender, key) {
  if (!key) return sendText(chatId, '❌ Format: .delnote <key>');
  db.deleteNote(sender, key);
  await sendText(chatId, `✅ Catatan *${key}* dihapus!`);
}
async function cmdRemind(chatId, args) {
  const [mnt,...rest] = args.split(' '); const teks = rest.join(' ');
  const menit = parseInt(mnt);
  if (!menit||!teks) return sendText(chatId, '❌ Format: .remind 5 meeting');
  await sendText(chatId, `✅ Reminder diset — ${menit} menit lagi!`);
  setTimeout(async () => { await sendText(chatId, `⏰ *REMINDER!*\n${teks}`); }, menit*60000);
}

// BISNIS
async function cmdInvoice(chatId, args) {
  const p = args.split('|').map(s=>s.trim());
  if (p.length<4) return sendText(chatId, '❌ Format: .invoice Nama|Produk|Harga|Qty');
  const [buyer,produk,harga,qty] = p;
  const id    = 'INV-' + Date.now().toString().slice(-6);
  const total = parseInt(harga.replace(/\D/g,'')) * parseInt(qty);
  await sendText(chatId,
    `🧾 *INVOICE*\nNo: ${id}\nTgl: ${new Date().toLocaleDateString('id-ID')}\nBuyer: ${buyer}\nProduk: ${produk}\nQty: ${qty}x\nHarga: Rp ${parseInt(harga.replace(/\D/g,'')).toLocaleString('id-ID')}\nTotal: Rp ${total.toLocaleString('id-ID')}\n\nTerima kasih telah berbelanja! ✦`
  );
}
async function cmdDiskon(chatId, args) {
  const [h,p] = args.trim().split(/\s+/);
  const harga = parseFloat(h?.replace(/\D/g,'')), pct = parseFloat(p);
  if (isNaN(harga)||isNaN(pct)) return sendText(chatId, '❌ Format: .diskon 100000 20');
  const disc = harga*(pct/100);
  await sendText(chatId, box('🏷', 'DISKON', [
    ['Harga Asal',  'Rp '+harga.toLocaleString('id-ID')],
    ['Diskon',      pct+'% = Rp '+disc.toLocaleString('id-ID')],
    ['Harga Akhir', 'Rp '+(harga-disc).toLocaleString('id-ID')],
  ]));
}
async function cmdLaba(chatId, args) {
  const [m,j] = args.trim().split(/\s+/);
  const modal = parseFloat(m?.replace(/\D/g,'')), jual = parseFloat(j?.replace(/\D/g,''));
  if (isNaN(modal)||isNaN(jual)) return sendText(chatId, '❌ Format: .laba 50000 80000');
  const laba = jual-modal;
  await sendText(chatId, box('💰', 'HITUNG LABA', [
    ['Modal',  'Rp '+modal.toLocaleString('id-ID')],
    ['Jual',   'Rp '+jual.toLocaleString('id-ID')],
    ['Laba',   'Rp '+laba.toLocaleString('id-ID')],
    ['Margin', ((laba/modal)*100).toFixed(1)+'%'],
  ]));
}

// CEKBIO
async function cmdCekBio(chatId, args) {
  const nums = args.split(/[\s,\n]+/).map(n=>n.trim().replace(/[^0-9]/g,'')).filter(n=>n.length>=8);
  if (!nums.length) return sendText(chatId, '❌ Format: .cekbio 628xxx 628yyy');
  const numbers = [...new Set(nums)].slice(0,50);
  await sendText(chatId, `⏳ Mengecek ${numbers.length} nomor...`);
  const results = [];
  for (let i=0; i<numbers.length; i+=10) {
    const batch = numbers.slice(i,i+10);
    const bRes  = await Promise.allSettled(batch.map(async num => {
      try {
        const chk  = await gaPost('checkWhatsapp', { phoneNumber: num });
        const ok   = chk?.existsWhatsapp === true;
        let bio = '', name = '';
        if (ok) {
          const info = await gaPost('getContactInfo', { chatId: num+'@c.us' });
          bio  = info?.description || '(tidak ada bio)';
          name = info?.name || info?.contactName || '';
        }
        return { num, aktif:ok, bio, name };
      } catch(_) { return { num, aktif:false, bio:'', name:'' }; }
    }));
    bRes.forEach(r => results.push(r.status==='fulfilled' ? r.value : { num:batch[0], aktif:false }));
    if (i+10<numbers.length) await sleep(40);
  }
  const aktif = results.filter(r=>r.aktif);
  const nonWa = results.filter(r=>!r.aktif);
  let txt = `📊 *HASIL CEK BIO WA*\n\nTotal: ${numbers.length} nomor\n✅ Aktif: ${aktif.length}\n❌ Tidak Aktif: ${nonWa.length}\n\n`;
  if (aktif.length) {
    txt += `*── ✅ AKTIF WA ──*\n`;
    aktif.slice(0,10).forEach((r,i) => { txt += `${i+1}. +${r.num}\n   Bio: ${r.bio.slice(0,60)}\n`; });
    if (aktif.length>10) txt += `... +${aktif.length-10} lainnya\n`;
  }
  txt += '\n✦ Arabs UBot CekBio ✦';
  await sendText(chatId, txt);
}

// UBOT MANAGEMENT VIA WA
async function cmdListUbot(chatId) {
  const list = db.getSessions();
  if (!list.length) return sendText(chatId, 'ℹ️ Belum ada akun userbot aktif!');
  let t = `📋 *DAFTAR USERBOT TELEGRAM*\n\n`;
  list.forEach((s,i) => { t += `${i+1}. ${s.phone} — 🟢 Aktif\n`; });
  await sendText(chatId, t + `\nTotal: ${list.length} akun\n✦ Arabs UBot ✦`);
}
async function cmdRestartUbot(chatId) {
  await sendText(chatId, '🔄 Merestart semua userbot...');
  try {
    await require('./ubotManager').restartAll();
    await sendText(chatId, '✅ Semua userbot berhasil direstart!');
  } catch(e) { await sendText(chatId, '❌ Gagal: ' + e.message); }
}

// PANEL CREATOR via WA (pakai fungsi sama dari ubotManager)
async function cmdPanelWa(chatId, ramTier, namaPanel) {
  const cfg = config.PANEL_API;
  if (!cfg?.url||!cfg?.apiKey) return sendText(chatId, '❌ PANEL_API belum dikonfigurasi!');
  const nama = namaPanel.replace(/['"]/g,'').trim();
  if (!nama||nama.length<2) return sendText(chatId, `❌ Format: .${ramTier} namaPanel`);
  const ramMap = cfg.ramLimits||{'1gb':1024,'2gb':2048,'4gb':4096,'8gb':8192,'16gb':16384,'unlimited':0,'admin':0};
  const ramMb  = ramMap[ramTier]??1024;
  const username = nama.toLowerCase().replace(/[^a-z0-9_]/g,'_');
  const password = nama;
  const email    = `${username}@${cfg.emailDomain||'arabsubot.local'}`;
  const isAdmin  = ramTier==='admin';
  await sendText(chatId, `⏳ Membuat panel *${nama}*...\nRAM: ${ramMb===0?'Unlimited':ramMb+' MB'}`);
  const panelUrl = cfg.url.replace(/\/$/,'');
  const headers  = {'Authorization':`Bearer ${cfg.apiKey}`,'Content-Type':'application/json','Accept':'application/json'};
  try {
    // Buat user
    let userId;
    try {
      const uR = await axios.post(`${panelUrl}/api/application/users`,{username,email,first_name:nama,last_name:'Arabs',password,root_admin:isAdmin},{headers,timeout:15000});
      userId   = uR.data?.attributes?.id;
    } catch(ue) {
      if (ue.response?.status===422) {
        const fR = await axios.get(`${panelUrl}/api/application/users?filter[username]=${username}`,{headers,timeout:10000});
        userId   = fR.data?.data?.[0]?.attributes?.id;
        if (!userId) throw new Error('Gagal buat user!');
      } else throw ue;
    }
    // Buat server
    let serverId = null;
    if (!isAdmin) {
      const nestId=cfg.nestId||5, eggId=cfg.eggId||3;
      let eggStartup=cfg.startup||'node index.js', eggEnv={}, eggImage=cfg.dockerImage||'ghcr.io/pterodactyl/yolks:nodejs_20';
      try {
        const eR    = await axios.get(`${panelUrl}/api/application/nests/${nestId}/eggs/${eggId}?include=variables`,{headers,timeout:10000});
        const eD    = eR.data?.attributes;
        if (!cfg.startup&&eD?.startup) eggStartup = eD.startup;
        if (!cfg.dockerImage&&eD?.docker_image) eggImage = eD.docker_image;
        for (const v of (eD?.relationships?.variables?.data||[])) eggEnv[v.attributes.env_variable] = v.attributes.default_value??'';
      } catch(_) {}
      if (cfg.environment) eggEnv = {...eggEnv,...cfg.environment};
      // Auto-detect allocation
      let allocId = cfg.allocationId||1;
      try {
        const nodesR = await axios.get(`${panelUrl}/api/application/nodes?per_page=100`,{headers,timeout:10000});
        for (const node of (nodesR.data?.data||[])) {
          const aR   = await axios.get(`${panelUrl}/api/application/nodes/${node.attributes.id}/allocations?per_page=100`,{headers,timeout:10000});
          const free = (aR.data?.data||[]).find(a=>!a.attributes?.assigned);
          if (free) { allocId = free.attributes.id; break; }
        }
      } catch(_) {}
      const sR = await axios.post(`${panelUrl}/api/application/servers`,{name:nama,user:userId,egg:eggId,docker_image:eggImage,startup:eggStartup,environment:eggEnv,limits:{memory:ramMb,swap:cfg.swap??0,disk:cfg.disk??5120,io:cfg.io??500,cpu:cfg.cpu??100},feature_limits:{databases:cfg.databases??1,backups:cfg.backups??2,allocations:cfg.allocations??1},allocation:{default:allocId}},{headers,timeout:20000});
      serverId = sR.data?.attributes?.identifier;
    }
    await sendText(chatId,
      `✅ *PANEL BERHASIL DIBUAT!*\n\n` +
      `🌐 URL: ${panelUrl}\n\n` +
      `👤 Login:\n   Username: ${username}\n   Password: ${password}\n   Email: ${email}\n\n` +
      `🖥️ Server:\n   Nama: ${nama}\n   RAM: ${ramMb===0?'♾️ Unlimited':ramMb+' MB'}\n` +
      (serverId?`   ID: ${serverId}\n`:'') +
      `\n✦ Arabs UBot Panel Creator ✦`
    );
  } catch(e) {
    const msg = e.response?.data?.errors?.[0]?.detail||e.response?.data?.message||e.message;
    await sendText(chatId, `❌ *GAGAL BUAT PANEL*\n${msg}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN MESSAGE HANDLER — FIX: parse notifikasi dengan benar
// ═══════════════════════════════════════════════════════════════
async function handleMessage(notif) {
  try {
    if (!notif) return;

    // Green API mengirim notifikasi dalam format:
    // { receiptId, body: { typeWebhook, senderData, messageData } }
    const body = notif.body;
    if (!body) return;
    if (body.typeWebhook !== 'incomingMessageReceived') return;

    const chatId  = body.senderData?.chatId;
    const sender  = body.senderData?.sender || chatId;

    // Ambil teks pesan
    const text = (
      body.messageData?.textMessageData?.textMessage ||
      body.messageData?.extendedTextMessageData?.text ||
      ''
    ).trim();

    if (!chatId) return;
    if (!text || !text.startsWith('.')) return;

    const low  = text.toLowerCase();
    const args = text.includes(' ') ? text.slice(text.indexOf(' ')+1).trim() : '';
    const sess = getWaSess(chatId);

    // ── STATE MACHINE: addubot flow ──────────────────────────────
    if (sess.state === 'wa_phone') {
      if (low === '.cancel') { sess.state=null; return sendText(chatId, '❌ Dibatalkan.'); }
      if (!/^\+\d{7,15}$/.test(text.trim())) return sendText(chatId, '❌ Format: +628xxx');
      sess.phone = text.trim(); sess.state = 'wa_otp';
      await sendText(chatId, `⏳ Mengirim OTP ke ${sess.phone}...`);
      try {
        await require('./ubotManager').sendCode(sess.phone);
        await sendText(chatId, `📱 OTP dikirim ke ${sess.phone}\n\nMasukkan kode OTP dengan spasi:\nContoh: 1 2 3 4 5\n\nKetik .cancel untuk batal`);
      } catch(e) { sess.state=null; sess.phone=null; await sendText(chatId, '❌ Gagal: '+e.message); }
      return;
    }
    if (sess.state === 'wa_otp') {
      if (low === '.cancel') { sess.state=null; sess.phone=null; return sendText(chatId,'❌ Dibatalkan.'); }
      if (!/^\d(\s\d){4,}$/.test(text.trim())) return sendText(chatId, '❌ Format OTP: 1 2 3 4 5');
      const otp=text.replace(/\s/g,''), phone=sess.phone;
      await sendText(chatId, '⏳ Memverifikasi OTP...');
      try {
        db.addSession(phone);
        await require('./ubotManager').signIn(phone, otp);
        sess.state=null; sess.phone=null;
        await sendText(chatId, `✅ Berhasil! Userbot aktif!\n📱 Akun ${phone} terhubung.`);
      } catch(e) { await sendText(chatId, '❌ OTP salah/expired: '+e.message); }
      return;
    }
    if (sess.state === 'wa_out') {
      if (low === '.cancel') { sess.state=null; return sendText(chatId, '❌ Dibatalkan.'); }
      const idx  = parseInt(text)-1;
      const list = db.getSessions();
      if (isNaN(idx)||idx<0||idx>=list.length) return sendText(chatId, '❌ Nomor tidak valid!');
      const phone = list[idx].phone;
      await require('./ubotManager').signOut(phone);
      db.removeSession(phone); sess.state=null;
      await sendText(chatId, `✅ Akun ${phone} berhasil dikeluarkan!`);
      return;
    }

    // ── COMMAND ROUTER ───────────────────────────────────────────
    if (low === '.help')                  return cmdHelp(chatId);
    if (low === '.ping')                  return cmdPing(chatId);
    if (low === '.alive')                 return cmdAlive(chatId);
    if (low === '.sysinfo')               return cmdSysinfo(chatId);
    if (low === '.uptime')                return sendText(chatId, `⏱ Uptime: ${uptime()}`);
    if (low === '.uuid')                  return cmdUuid(chatId);
    if (low === '.joke')                  return sendText(chatId, '😂 '+pick(JOKES));
    if (low === '.fakta')                 return sendText(chatId, '🔬 '+pick(FAKTAS));
    if (low === '.ramalan')               return sendText(chatId, '🔮 '+pick(RAMALAN));
    if (low === '.katakata')              return sendText(chatId, '💬 "'+pick(KATA)+'"');
    if (low === '.notes')                 return cmdNoteList(chatId, sender);
    if (low === '.listubot')              return cmdListUbot(chatId);
    if (low === '.restartubot')           return cmdRestartUbot(chatId);
    if (low === '.addubot') {
      sess.state='wa_phone'; sess.phone=null;
      return sendText(chatId, `➕ *TAMBAH USERBOT TELEGRAM*\n\nKirim nomor format internasional:\nContoh: +62812345678\n\nKetik .cancel untuk batal`);
    }
    if (low === '.outubot') {
      const list = db.getSessions();
      if (!list.length) return sendText(chatId, 'ℹ️ Tidak ada akun aktif!');
      sess.state='wa_out';
      let t = `🚪 *KELUAR USERBOT*\n\nAkun aktif:\n`;
      list.forEach((s,i) => { t += `${i+1}. ${s.phone}\n`; });
      return sendText(chatId, t+'\nKirim nomor urut:\nKetik .cancel untuk batal');
    }
    if (low.startsWith('.calc '))         return cmdCalc(chatId, args);
    if (low.startsWith('.tr '))           return cmdTr(chatId, args);
    if (low.startsWith('.kurs '))         return cmdKurs(chatId, args.toUpperCase());
    if (low.startsWith('.cuaca '))        return cmdCuaca(chatId, args);
    if (low.startsWith('.wiki '))         return cmdWiki(chatId, args);
    if (low.startsWith('.short '))        return cmdShorten(chatId, args);
    if (low.startsWith('.password'))      return cmdPassword(chatId, args);
    if (low.startsWith('.note '))         return cmdNoteSet(chatId, sender, args);
    if (low.startsWith('.delnote '))      return cmdNoteDel(chatId, sender, args);
    if (low.startsWith('.remind '))       return cmdRemind(chatId, args);
    if (low.startsWith('.cekbio '))       return cmdCekBio(chatId, args);
    if (low.startsWith('.invoice '))      return cmdInvoice(chatId, args);
    if (low.startsWith('.diskon '))       return cmdDiskon(chatId, args);
    if (low.startsWith('.laba '))         return cmdLaba(chatId, args);
    if (low.startsWith('.1gb '))          return cmdPanelWa(chatId,'1gb',args);
    if (low.startsWith('.2gb '))          return cmdPanelWa(chatId,'2gb',args);
    if (low.startsWith('.4gb '))          return cmdPanelWa(chatId,'4gb',args);
    if (low.startsWith('.8gb '))          return cmdPanelWa(chatId,'8gb',args);
    if (low.startsWith('.16gb '))         return cmdPanelWa(chatId,'16gb',args);
    if (low.startsWith('.unlimited '))    return cmdPanelWa(chatId,'unlimited',args);
    if (low.startsWith('.adminpanel '))   return cmdPanelWa(chatId,'admin',args);

  } catch(err) { console.error('[WaBot] handleMessage error:', err.message); }
}

// ═══════════════════════════════════════════════════════════════
// POLLING LOOP — FIX: hapus notifikasi setelah diproses
// ═══════════════════════════════════════════════════════════════
async function pollLoop() {
  if (!isRunning) return;
  try {
    const r = await axios.get(gaUrl('receiveNotification'), { timeout: 20000 });
    if (r.data && r.data.receiptId != null) {
      // Proses pesan
      await handleMessage(r.data);
      // Hapus dari queue agar tidak diterima lagi
      await axios.delete(
        `${G.apiUrl}/waInstance${G.idInstance}/deleteNotification/${G.apiToken}/${r.data.receiptId}`,
        { timeout: 10000 }
      ).catch(() => {});
    }
  } catch(e) {
    if (!e.message.includes('timeout')) console.error('[WaBot] Poll error:', e.message);
  }
  if (isRunning) pollTimer = setTimeout(pollLoop, 300);
}

// ═══════════════════════════════════════════════════════════════
// START / STOP
// ═══════════════════════════════════════════════════════════════
async function start() {
  if (isRunning) { console.log('[WaBot] Already running'); return; }
  try {
    const state = await gaGet('getStateInstance');
    if (state?.stateInstance !== 'authorized') {
      console.log('[WaBot] ⚠️  Green API belum authorized! Buka console.green-api.com');
      console.log('[WaBot] State:', state?.stateInstance);
      return;
    }
    isRunning = true;
    console.log('[WaBot] ✅ WhatsApp Bot aktif! Instance:', G.idInstance);
    pollLoop();
  } catch(e) { console.error('[WaBot] Start error:', e.message); }
}

function stop() {
  isRunning = false;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  console.log('[WaBot] 🛑 WhatsApp Bot dihentikan.');
}

module.exports = { start, stop };
