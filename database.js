// ╔══════════════════════════════════════════════════════════════╗
// ║           Zetsy UBot - DATABASE MODULE v4.0                  ║
// ║   + Member system: seller/reseller/pt/owner                  ║
// ║   + Guest expiry 1 hari                                      ║
// ╚══════════════════════════════════════════════════════════════╝
'use strict';

const path = require('path');
const fs   = require('fs');

const DB_FILE = path.resolve('./database/ubot.json');

// ── Read / Write ────────────────────────────────────────────────
function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return _empty();
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return _validate(parsed);
  } catch (_) { return _empty(); }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(_validate(data), null, 2), 'utf8');
}

function _empty() {
  return {
    sessions: [],
    roles: {},
    notes: {},
    members: {},
    guestStart: {},
    broadcastGroups: {},
    ubotData: { broadcastCfg: {}, bcTargets: {}, bcTargetCfg: {} },
  };
}

function _validate(d) {
  if (!Array.isArray(d.sessions))                                       d.sessions        = [];
  if (typeof d.roles      !== 'object' || Array.isArray(d.roles))      d.roles           = {};
  if (typeof d.notes      !== 'object' || Array.isArray(d.notes))      d.notes           = {};
  if (typeof d.members    !== 'object' || Array.isArray(d.members))    d.members         = {};
  if (typeof d.guestStart !== 'object' || Array.isArray(d.guestStart)) d.guestStart      = {};
  if (typeof d.broadcastGroups !== 'object' || Array.isArray(d.broadcastGroups)) d.broadcastGroups = {};
  if (typeof d.ubotData !== 'object' || Array.isArray(d.ubotData)) d.ubotData = {};
  if (typeof d.ubotData.broadcastCfg !== 'object' || Array.isArray(d.ubotData.broadcastCfg)) d.ubotData.broadcastCfg = {};
  if (typeof d.ubotData.bcTargets !== 'object' || Array.isArray(d.ubotData.bcTargets)) d.ubotData.bcTargets = {};
  if (typeof d.ubotData.bcTargetCfg !== 'object' || Array.isArray(d.ubotData.bcTargetCfg)) d.ubotData.bcTargetCfg = {};
  return d;
}

// ── Init ────────────────────────────────────────────────────────
function init() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_FILE)) writeDB(_empty());
  const data = readDB();
  writeDB(data);
  console.log('[Zetsy DB] Initialized | Sessions:', data.sessions.length, '| Members:', Object.keys(data.members).length);
}

// ── Sessions ────────────────────────────────────────────────────
function getSessions()      { return readDB().sessions; }
function getSession(phone)  { return getSessions().find(s => s.phone === phone) || null; }

function addSession(phone, ownerId = null) {
  const data = readDB();
  if (data.sessions.find(s => s.phone === phone)) return;
  data.sessions.push({
    phone,
    ownerId: ownerId != null ? String(ownerId) : null,
    session: '',
    created_at: Date.now(),
  });
  writeDB(data);
}

function updateSession(phone, sessionString, ownerId = null) {
  const data = readDB();
  const idx  = data.sessions.findIndex(s => s.phone === phone);
  if (idx >= 0) {
    data.sessions[idx].session    = sessionString;
    data.sessions[idx].updated_at = Date.now();
    if (ownerId != null) data.sessions[idx].ownerId = String(ownerId);
  } else {
    data.sessions.push({
      phone,
      ownerId: ownerId != null ? String(ownerId) : null,
      session: sessionString,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  }
  writeDB(data);
  console.log('[Zetsy DB] Session updated:', phone);
}

function removeSession(phone) {
  const data = readDB();
  data.sessions = data.sessions.filter(s => s.phone !== phone);
  writeDB(data);
}

function updateSessionMeta(phone, patch = {}) {
  const data = readDB();
  const idx  = data.sessions.findIndex(s => s.phone === phone);
  if (idx < 0) return false;
  data.sessions[idx] = { ...data.sessions[idx], ...patch, updated_at: Date.now() };
  writeDB(data);
  return true;
}

// ── Roles (per group) ───────────────────────────────────────────
function addRole(groupId, userId, role, name, addedBy) {
  const data = readDB();
  const key  = `${groupId}:${userId}`;
  data.roles[key] = { role, name, userId: String(userId), groupId: String(groupId), addedAt: Date.now(), addedBy };
  writeDB(data);
}
function getRole(groupId, userId)  { return readDB().roles[`${groupId}:${userId}`] || null; }
function getRolesByGroup(groupId)  { return Object.values(readDB().roles).filter(r => r.groupId === String(groupId)); }
function removeRole(groupId, userId) {
  const data = readDB();
  delete data.roles[`${groupId}:${userId}`];
  writeDB(data);
}

// ── Notes (per user) ────────────────────────────────────────────
function saveNote(phone, key, value) {
  const data = readDB();
  if (!data.notes[phone]) data.notes[phone] = {};
  data.notes[phone][key] = { value, savedAt: Date.now() };
  writeDB(data);
}
function getNote(phone, key)   { return readDB().notes?.[phone]?.[key] || null; }
function getAllNotes(phone)     { return readDB().notes?.[phone] || {}; }
function deleteNote(phone, key) {
  const data = readDB();
  if (data.notes[phone]) delete data.notes[phone][key];
  writeDB(data);
}

// ═══════════════════════════════════════════════════════════════
// MEMBER SYSTEM
// Role:     seller   = 30 hari,  full akses
//           reseller = permanen, TERBATAS (no panel/installer)
//           pt       = 7 hari,   full akses
//           owner    = permanen, full akses
// ═══════════════════════════════════════════════════════════════
const ROLE_DURATIONS = {
  seller   : 30 * 24 * 60 * 60 * 1000,  // 30 hari
  reseller : null,                        // permanen
  pt       : 7  * 24 * 60 * 60 * 1000,  // 7 hari
  owner    : null,                        // permanen
};

const ROLE_LABELS = {
  seller   : '💼 Seller',
  reseller : '🤝 Reseller',
  pt       : '🏢 PT',
  owner    : '👑 Owner',
};

// Perintah yang DIBLOKIR untuk reseller
const RESELLER_BLOCKED_CMDS = ['.1gb','.2gb','.4gb','.8gb','.16gb','.unlimited','.adminpanel','.install','.installstatus','.installcancel'];

function addMember(userId, role, addedBy) {
  const validRoles = Object.keys(ROLE_DURATIONS);
  if (!validRoles.includes(role)) throw new Error(`Role tidak valid: ${role}. Gunakan: ${validRoles.join(', ')}`);
  const data   = readDB();
  const durMs  = ROLE_DURATIONS[role];
  const now    = Date.now();
  data.members[String(userId)] = {
    userId  : String(userId),
    role,
    label   : ROLE_LABELS[role],
    addedAt : now,
    addedBy : String(addedBy),
    expiry  : durMs ? now + durMs : null,
    active  : true,
  };
  writeDB(data);
  return data.members[String(userId)];
}

function getMember(userId) {
  const data = readDB();
  const m    = data.members?.[String(userId)];
  if (!m) return null;
  const expired = m.expiry ? Date.now() > m.expiry : false;
  if (expired && m.active) {
    // Auto-set inactive
    data.members[String(userId)].active = false;
    writeDB(data);
  }
  return { ...m, expired };
}

function removeMember(userId) {
  const data = readDB();
  delete data.members[String(userId)];
  writeDB(data);
}

function getAllMembers() {
  return readDB().members || {};
}

function isResellerBlocked(cmd) {
  const c = cmd.split(' ')[0].toLowerCase();
  return RESELLER_BLOCKED_CMDS.some(b => c.startsWith(b));
}

// ═══════════════════════════════════════════════════════════════
// GUEST EXPIRY — 1 hari akses gratis
// ═══════════════════════════════════════════════════════════════
function registerGuest(userId) {
  const data = readDB();
  const uid  = String(userId);
  if (!data.guestStart[uid]) {
    data.guestStart[uid] = Date.now();
    writeDB(data);
  }
  return data.guestStart[uid];
}

function isGuestExpired(userId) {
  const data  = readDB();
  const start = data.guestStart[String(userId)];
  if (!start) return false;
  return Date.now() > start + (24 * 60 * 60 * 1000);
}

function guestTimeLeftMs(userId) {
  const data  = readDB();
  const start = data.guestStart[String(userId)];
  if (!start) return 24 * 60 * 60 * 1000; // belum pernah start
  const left = (start + 24 * 60 * 60 * 1000) - Date.now();
  return left > 0 ? left : 0;
}

// ═══════════════════════════════════════════════════════════════
// BROADCAST GROUPS — daftar grup target broadcast
// ═══════════════════════════════════════════════════════════════
function addBroadcastGroup(groupId, label, addedBy) {
  const data = readDB();
  data.broadcastGroups[String(groupId)] = {
    groupId  : String(groupId),
    label    : label || String(groupId),
    addedBy  : String(addedBy),
    addedAt  : Date.now(),
  };
  writeDB(data);
}

function removeBroadcastGroup(groupId) {
  const data = readDB();
  delete data.broadcastGroups[String(groupId)];
  writeDB(data);
}

function getBroadcastGroups() {
  return Object.values(readDB().broadcastGroups || {});
}

function getBroadcastGroup(groupId) {
  return readDB().broadcastGroups?.[String(groupId)] || null;
}

// ── UBOT IMPORTANT SETTINGS (persistent) ───────────────────────
function getUbotBroadcastCfg(phone) {
  const data = readDB();
  return data.ubotData?.broadcastCfg?.[String(phone)] || {};
}

function saveUbotBroadcastCfg(phone, cfg) {
  const data = readDB();
  if (!data.ubotData) data.ubotData = {};
  if (!data.ubotData.broadcastCfg) data.ubotData.broadcastCfg = {};
  data.ubotData.broadcastCfg[String(phone)] = { ...(cfg || {}) };
  writeDB(data);
}

function getUbotBcTargets(phone) {
  const data = readDB();
  return data.ubotData?.bcTargets?.[String(phone)] || {};
}

function saveUbotBcTargets(phone, targetsObj) {
  const data = readDB();
  if (!data.ubotData) data.ubotData = {};
  if (!data.ubotData.bcTargets) data.ubotData.bcTargets = {};
  data.ubotData.bcTargets[String(phone)] = { ...(targetsObj || {}) };
  writeDB(data);
}

function getUbotBcTargetCfg(phone) {
  const data = readDB();
  return data.ubotData?.bcTargetCfg?.[String(phone)] || {};
}

function saveUbotBcTargetCfg(phone, cfg) {
  const data = readDB();
  if (!data.ubotData) data.ubotData = {};
  if (!data.ubotData.bcTargetCfg) data.ubotData.bcTargetCfg = {};
  data.ubotData.bcTargetCfg[String(phone)] = { ...(cfg || {}) };
  writeDB(data);
}

module.exports = {
  init, readDB, writeDB,
  getSessions, getSession, addSession, updateSession, removeSession,
  updateSessionMeta,
  saveSession: updateSession,   // ← alias untuk ubotManager.js (db.saveSession)
  addRole, getRole, getRolesByGroup, removeRole,
  saveNote, getNote, getAllNotes, deleteNote,
  // Member system
  addMember, getMember, removeMember, getAllMembers, isResellerBlocked,
  ROLE_DURATIONS, ROLE_LABELS,
  // Guest expiry
  registerGuest, isGuestExpired, guestTimeLeftMs,
  // Broadcast groups
  addBroadcastGroup, removeBroadcastGroup, getBroadcastGroups, getBroadcastGroup,
  // UBot important settings
  getUbotBroadcastCfg, saveUbotBroadcastCfg,
  getUbotBcTargets, saveUbotBcTargets,
  getUbotBcTargetCfg, saveUbotBcTargetCfg,
};
