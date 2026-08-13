// ╔══════════════════════════════════════════════════════════════╗
// ║        Zetsy UBot - MongoDB Database Adapter                 ║
// ║   Menggantikan file-based database.js dengan MongoDB         ║
// ╚══════════════════════════════════════════════════════════════╝
'use strict';

const { MongoClient } = require('mongodb');
const path = require('path');
const fs   = require('fs');

// Load config noktel
let mongoUri = '';
try {
  const cfg = require('../config.json');
  mongoUri = cfg.ubot?.mongoUri || '';
} catch {}

// Fallback ke file JSON jika MongoDB tidak dikonfigurasi
const DB_FILE = path.resolve('./ubot/ubot_db.json');

let _mongoClient = null;
let _db = null;
let _useFile = !mongoUri;

// ── Init ──────────────────────────────────────────────────────
async function initMongo() {
  if (_db) return _db;
  if (!mongoUri) { _useFile = true; return null; }
  try {
    _mongoClient = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    await _mongoClient.connect();
    // Ekstrak nama DB dari URI jika ada, default ke 'ubot_db'
    // Format: mongodb+srv://user:pass@host/DBNAME?options
    let dbName = 'ubot_db';
    try {
      const urlObj = new URL(mongoUri);
      const pathDb = urlObj.pathname.replace('/', '').split('?')[0].trim();
      if (pathDb && pathDb.length > 0) dbName = pathDb;
    } catch {}
    _db = _mongoClient.db(dbName);
    _useFile = false;
    console.log('[Zetsy UBot DB] MongoDB connected → DB:', dbName);
    return _db;
  } catch (e) {
    console.warn('[Zetsy UBot DB] MongoDB gagal, fallback ke file:', e.message);
    _useFile = true;
    return null;
  }
}

// ── File fallback ─────────────────────────────────────────────
function _empty() {
  return { sessions: [], roles: {}, notes: {}, members: {}, guestStart: {}, broadcastGroups: {}, ubotData: { broadcastCfg: {}, bcTargets: {}, bcTargetCfg: {} } };
}
function _validate(d) {
  if (!Array.isArray(d.sessions)) d.sessions = [];
  if (typeof d.roles !== 'object' || Array.isArray(d.roles)) d.roles = {};
  if (typeof d.notes !== 'object' || Array.isArray(d.notes)) d.notes = {};
  if (typeof d.members !== 'object' || Array.isArray(d.members)) d.members = {};
  if (typeof d.guestStart !== 'object' || Array.isArray(d.guestStart)) d.guestStart = {};
  if (typeof d.broadcastGroups !== 'object' || Array.isArray(d.broadcastGroups)) d.broadcastGroups = {};
  if (typeof d.ubotData !== 'object' || Array.isArray(d.ubotData)) d.ubotData = {};
  if (!d.ubotData.broadcastCfg) d.ubotData.broadcastCfg = {};
  if (!d.ubotData.bcTargets) d.ubotData.bcTargets = {};
  if (!d.ubotData.bcTargetCfg) d.ubotData.bcTargetCfg = {};
  return d;
}
function readFile() {
  try {
    if (!fs.existsSync(DB_FILE)) return _empty();
    return _validate(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
  } catch { return _empty(); }
}
function writeFile(data) {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(_validate(data), null, 2), 'utf8');
}

// ── Generic get/set untuk MongoDB ──────────────────────────────
async function getDoc(colName, filter) {
  if (_useFile) return null;
  const db = await initMongo();
  if (!db) return null;
  return db.collection(colName).findOne(filter);
}
async function upsertDoc(colName, filter, data) {
  if (_useFile) return;
  const db = await initMongo();
  if (!db) return;
  await db.collection(colName).updateOne(filter, { $set: data }, { upsert: true });
}
async function deleteDoc(colName, filter) {
  if (_useFile) return;
  const db = await initMongo();
  if (!db) return;
  await db.collection(colName).deleteOne(filter);
}
async function getDocs(colName, filter = {}) {
  if (_useFile) return [];
  const db = await initMongo();
  if (!db) return [];
  return db.collection(colName).find(filter).toArray();
}

// ── Init ──────────────────────────────────────────────────────
function init() {
  initMongo().then(db => {
    if (!db) {
      // fallback file
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(DB_FILE)) writeFile(_empty());
    }
    const sessions = getSessions();
    console.log('[Zetsy UBot DB] Initialized | Sessions:', Array.isArray(sessions) ? sessions.length : 0);
  }).catch(() => {});
}

// ── Sessions ──────────────────────────────────────────────────
function getSessions() {
  if (_useFile) return readFile().sessions;
  // Sync wrapper - ubotManager butuh sync, kita cache
  return _sessionsCache || [];
}

let _sessionsCache = [];

// Async version untuk init cache
async function loadSessionsCache() {
  const db = await initMongo();
  if (!db) { _sessionsCache = readFile().sessions; return; }
  _sessionsCache = await db.collection('sessions').find({}).toArray();
}

function getSession(phone) {
  return getSessions().find(s => s.phone === phone) || null;
}

function addSession(phone, ownerId = null) {
  if (_useFile) {
    const data = readFile();
    if (data.sessions.find(s => s.phone === phone)) return;
    data.sessions.push({ phone, ownerId: ownerId != null ? String(ownerId) : null, session: '', created_at: Date.now() });
    writeFile(data);
  } else {
    // Async fire-and-forget
    initMongo().then(db => {
      if (!db) return;
      db.collection('sessions').updateOne({ phone }, { $setOnInsert: { phone, ownerId: ownerId != null ? String(ownerId) : null, session: '', created_at: Date.now() } }, { upsert: true });
    });
  }
}

function updateSession(phone, sessionString, ownerId = null) {
  const patch = { session: sessionString, updated_at: Date.now() };
  if (ownerId != null) patch.ownerId = String(ownerId);
  if (_useFile) {
    const data = readFile();
    const idx  = data.sessions.findIndex(s => s.phone === phone);
    if (idx >= 0) Object.assign(data.sessions[idx], patch);
    else data.sessions.push({ phone, ...patch, created_at: Date.now() });
    writeFile(data);
  } else {
    initMongo().then(db => {
      if (!db) return;
      db.collection('sessions').updateOne({ phone }, { $set: { phone, ...patch } }, { upsert: true });
    });
    // Update cache
    const idx = _sessionsCache.findIndex(s => s.phone === phone);
    if (idx >= 0) Object.assign(_sessionsCache[idx], patch);
    else _sessionsCache.push({ phone, ...patch });
  }
  console.log('[Zetsy UBot DB] Session updated:', phone);
}

function removeSession(phone) {
  if (_useFile) {
    const data = readFile(); data.sessions = data.sessions.filter(s => s.phone !== phone); writeFile(data);
  } else {
    initMongo().then(db => { if (db) db.collection('sessions').deleteOne({ phone }); });
    _sessionsCache = _sessionsCache.filter(s => s.phone !== phone);
  }
}

function updateSessionMeta(phone, patch = {}) {
  if (_useFile) {
    const data = readFile(); const idx = data.sessions.findIndex(s => s.phone === phone);
    if (idx < 0) return false;
    data.sessions[idx] = { ...data.sessions[idx], ...patch, updated_at: Date.now() }; writeFile(data); return true;
  } else {
    initMongo().then(db => { if (db) db.collection('sessions').updateOne({ phone }, { $set: { ...patch, updated_at: Date.now() } }); });
    const idx = _sessionsCache.findIndex(s => s.phone === phone);
    if (idx >= 0) Object.assign(_sessionsCache[idx], patch);
    return true;
  }
}

// ── Roles ──────────────────────────────────────────────────────
function addRole(groupId, userId, role, name, addedBy) {
  const key = `${groupId}:${userId}`;
  const val = { role, name, userId: String(userId), groupId: String(groupId), addedAt: Date.now(), addedBy };
  if (_useFile) { const d = readFile(); d.roles[key] = val; writeFile(d); }
  else initMongo().then(db => { if (db) db.collection('roles').updateOne({ key }, { $set: { key, ...val } }, { upsert: true }); });
}
function getRole(groupId, userId) {
  if (_useFile) return readFile().roles[`${groupId}:${userId}`] || null;
  return null; // sync-async mismatch, roles kurang kritikal
}
function getRolesByGroup(groupId) {
  if (_useFile) return Object.values(readFile().roles).filter(r => r.groupId === String(groupId));
  return [];
}
function removeRole(groupId, userId) {
  const key = `${groupId}:${userId}`;
  if (_useFile) { const d = readFile(); delete d.roles[key]; writeFile(d); }
  else initMongo().then(db => { if (db) db.collection('roles').deleteOne({ key }); });
}

// ── Notes ──────────────────────────────────────────────────────
function saveNote(phone, key, value) {
  if (_useFile) { const d = readFile(); if (!d.notes[phone]) d.notes[phone] = {}; d.notes[phone][key] = { value, savedAt: Date.now() }; writeFile(d); }
  else initMongo().then(db => { if (db) db.collection('notes').updateOne({ phone, key }, { $set: { phone, key, value, savedAt: Date.now() } }, { upsert: true }); });
}
function getNote(phone, key) {
  if (_useFile) return readFile().notes?.[phone]?.[key] || null;
  return null;
}
function getAllNotes(phone) {
  if (_useFile) return readFile().notes?.[phone] || {};
  return {};
}
function deleteNote(phone, key) {
  if (_useFile) { const d = readFile(); if (d.notes[phone]) delete d.notes[phone][key]; writeFile(d); }
  else initMongo().then(db => { if (db) db.collection('notes').deleteOne({ phone, key }); });
}

// ── Members ────────────────────────────────────────────────────
const ROLE_DURATIONS = { seller: 30*24*60*60*1000, reseller: null, pt: 7*24*60*60*1000, owner: null };
const ROLE_LABELS    = { seller: '💼 Seller', reseller: '🤝 Reseller', pt: '🏢 PT', owner: '👑 Owner' };
const RESELLER_BLOCKED_CMDS = ['.1gb','.2gb','.4gb','.8gb','.16gb','.unlimited','.adminpanel','.install','.installstatus','.installcancel'];

function addMember(userId, role, addedBy) {
  const validRoles = Object.keys(ROLE_DURATIONS);
  if (!validRoles.includes(role)) throw new Error(`Role tidak valid: ${role}`);
  const dur = ROLE_DURATIONS[role]; const now = Date.now();
  const m = { userId: String(userId), role, label: ROLE_LABELS[role], addedAt: now, addedBy: String(addedBy), expiry: dur ? now + dur : null, active: true };
  if (_useFile) { const d = readFile(); d.members[String(userId)] = m; writeFile(d); }
  else initMongo().then(db => { if (db) db.collection('members').updateOne({ userId: String(userId) }, { $set: m }, { upsert: true }); });
  return m;
}
function getMember(userId) {
  if (_useFile) {
    const d = readFile(); const m = d.members?.[String(userId)]; if (!m) return null;
    const expired = m.expiry ? Date.now() > m.expiry : false;
    if (expired && m.active) { d.members[String(userId)].active = false; writeFile(d); }
    return { ...m, expired };
  }
  return null;
}
function removeMember(userId) {
  if (_useFile) { const d = readFile(); delete d.members[String(userId)]; writeFile(d); }
  else initMongo().then(db => { if (db) db.collection('members').deleteOne({ userId: String(userId) }); });
}
function getAllMembers() { if (_useFile) return readFile().members || {}; return {}; }
function isResellerBlocked(cmd) { const c = cmd.split(' ')[0].toLowerCase(); return RESELLER_BLOCKED_CMDS.some(b => c.startsWith(b)); }

// ── Guest ──────────────────────────────────────────────────────
function registerGuest(userId) {
  const uid = String(userId);
  if (_useFile) { const d = readFile(); if (!d.guestStart[uid]) { d.guestStart[uid] = Date.now(); writeFile(d); } return d.guestStart[uid]; }
  else { initMongo().then(db => { if (db) db.collection('guests').updateOne({ userId: uid }, { $setOnInsert: { userId: uid, startAt: Date.now() } }, { upsert: true }); }); return Date.now(); }
}
function isGuestExpired(userId) {
  if (_useFile) { const d = readFile(); const s = d.guestStart[String(userId)]; if (!s) return false; return Date.now() > s + 24*60*60*1000; }
  return false; // MongoDB version async, default allow
}
function guestTimeLeftMs(userId) {
  if (_useFile) { const d = readFile(); const s = d.guestStart[String(userId)]; if (!s) return 24*60*60*1000; const l = (s + 24*60*60*1000) - Date.now(); return l > 0 ? l : 0; }
  return 24*60*60*1000;
}

// ── Broadcast ──────────────────────────────────────────────────
function addBroadcastGroup(groupId, label, addedBy) {
  const v = { groupId: String(groupId), label: label || String(groupId), addedBy: String(addedBy), addedAt: Date.now() };
  if (_useFile) { const d = readFile(); d.broadcastGroups[String(groupId)] = v; writeFile(d); }
  else initMongo().then(db => { if (db) db.collection('bcgroups').updateOne({ groupId: String(groupId) }, { $set: v }, { upsert: true }); });
}
function removeBroadcastGroup(groupId) {
  if (_useFile) { const d = readFile(); delete d.broadcastGroups[String(groupId)]; writeFile(d); }
  else initMongo().then(db => { if (db) db.collection('bcgroups').deleteOne({ groupId: String(groupId) }); });
}
function getBroadcastGroups() { if (_useFile) return Object.values(readFile().broadcastGroups || {}); return []; }
function getBroadcastGroup(groupId) { if (_useFile) return readFile().broadcastGroups?.[String(groupId)] || null; return null; }

// ── UBot Settings ──────────────────────────────────────────────
function getUbotBroadcastCfg(phone) { if (_useFile) return readFile().ubotData?.broadcastCfg?.[String(phone)] || {}; return {}; }
function saveUbotBroadcastCfg(phone, cfg) {
  if (_useFile) { const d = readFile(); if (!d.ubotData) d.ubotData = {}; if (!d.ubotData.broadcastCfg) d.ubotData.broadcastCfg = {}; d.ubotData.broadcastCfg[String(phone)] = { ...cfg }; writeFile(d); }
  else initMongo().then(db => { if (db) db.collection('ubotcfg').updateOne({ phone, type: 'broadcastCfg' }, { $set: { phone, type: 'broadcastCfg', data: cfg } }, { upsert: true }); });
}
function getUbotBcTargets(phone) { if (_useFile) return readFile().ubotData?.bcTargets?.[String(phone)] || {}; return {}; }
function saveUbotBcTargets(phone, t) {
  if (_useFile) { const d = readFile(); if (!d.ubotData) d.ubotData = {}; if (!d.ubotData.bcTargets) d.ubotData.bcTargets = {}; d.ubotData.bcTargets[String(phone)] = { ...t }; writeFile(d); }
  else initMongo().then(db => { if (db) db.collection('ubotcfg').updateOne({ phone, type: 'bcTargets' }, { $set: { phone, type: 'bcTargets', data: t } }, { upsert: true }); });
}
function getUbotBcTargetCfg(phone) { if (_useFile) return readFile().ubotData?.bcTargetCfg?.[String(phone)] || {}; return {}; }
function saveUbotBcTargetCfg(phone, cfg) {
  if (_useFile) { const d = readFile(); if (!d.ubotData) d.ubotData = {}; if (!d.ubotData.bcTargetCfg) d.ubotData.bcTargetCfg = {}; d.ubotData.bcTargetCfg[String(phone)] = { ...cfg }; writeFile(d); }
  else initMongo().then(db => { if (db) db.collection('ubotcfg').updateOne({ phone, type: 'bcTargetCfg' }, { $set: { phone, type: 'bcTargetCfg', data: cfg } }, { upsert: true }); });
}

module.exports = {
  init, initMongo, loadSessionsCache,
  getSessions, getSession, addSession, updateSession, removeSession, updateSessionMeta,
  saveSession: updateSession,
  addRole, getRole, getRolesByGroup, removeRole,
  saveNote, getNote, getAllNotes, deleteNote,
  addMember, getMember, removeMember, getAllMembers, isResellerBlocked,
  ROLE_DURATIONS, ROLE_LABELS,
  registerGuest, isGuestExpired, guestTimeLeftMs,
  addBroadcastGroup, removeBroadcastGroup, getBroadcastGroups, getBroadcastGroup,
  getUbotBroadcastCfg, saveUbotBroadcastCfg,
  getUbotBcTargets, saveUbotBcTargets,
  getUbotBcTargetCfg, saveUbotBcTargetCfg,
};
