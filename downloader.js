// ╔══════════════════════════════════════════════════════════════╗
// ║                  🤖 UBOT - DOWNLOADER MODULE                 ║
// ╚══════════════════════════════════════════════════════════════╝

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const DOWNLOAD_PATH = path.resolve('./downloads');
if (!fs.existsSync(DOWNLOAD_PATH)) fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });

// Axios instance yang ignore SSL error (untuk Termux)
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 20000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  },
});

// ═══════════════════════════════════════════════════════════════
//                    GENERIC DOWNLOADER (yt-dlp)
// ═══════════════════════════════════════════════════════════════
async function download(platform, url) {
  const before = new Set(fs.readdirSync(DOWNLOAD_PATH));
  const outputTemplate = path.join(DOWNLOAD_PATH, '%(title).60s.%(ext)s');

  const cmd = [
    'yt-dlp',
    '--no-playlist',
    '--merge-output-format mp4',
    '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"',
    `--output "${outputTemplate}"`,
    `"${url}"`,
  ].join(' ');

  console.log(`[DL] Command: ${cmd}`);

  try {
    execSync(cmd, { timeout: 120000, stdio: 'pipe' });
  } catch (e) {
    console.warn(`[DL] yt-dlp exit non-zero:`, e.stderr?.toString()?.slice(0, 300));
  }

  const after = fs.readdirSync(DOWNLOAD_PATH);
  const newFiles = after.filter(f => !before.has(f));

  if (newFiles.length === 0) {
    const allFiles = fs.readdirSync(DOWNLOAD_PATH)
      .map(f => ({ name: f, time: fs.statSync(path.join(DOWNLOAD_PATH, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (allFiles.length === 0 || Date.now() - allFiles[0].time > 3 * 60 * 1000) {
      throw new Error('Gagal download. Cek link atau pastikan yt-dlp terinstall!');
    }

    const filePath = path.join(DOWNLOAD_PATH, allFiles[0].name);
    return {
      path: filePath,
      title: path.basename(allFiles[0].name, path.extname(allFiles[0].name)),
      type: isAudio(filePath) ? 'audio' : 'video',
    };
  }

  const picked = newFiles
    .map(f => ({ name: f, size: fs.statSync(path.join(DOWNLOAD_PATH, f)).size }))
    .sort((a, b) => b.size - a.size)[0];

  const filePath = path.join(DOWNLOAD_PATH, picked.name);
  console.log(`[DL] Downloaded: ${filePath} (${Math.round(picked.size / 1024)}KB)`);

  return {
    path: filePath,
    title: path.basename(picked.name, path.extname(picked.name)),
    type: isAudio(filePath) ? 'audio' : 'video',
  };
}

function isAudio(filePath) {
  return /\.(mp3|m4a|opus|ogg|wav|flac|aac)$/i.test(filePath);
}

// ═══════════════════════════════════════════════════════════════
//                    XNXX SEARCH - Multi method
// ═══════════════════════════════════════════════════════════════
async function searchXnxx(query) {
  // Method 1: Coba lewat xnxx.com langsung dengan SSL disabled
  try {
    return await searchXnxxDirect(query);
  } catch (e) {
    console.warn('[XNXX] Direct failed:', e.message);
  }

  // Method 2: Fallback lewat xvideos (sama owner, konten mirip)
  try {
    return await searchXvideos(query);
  } catch (e) {
    console.warn('[XNXX] Xvideos fallback failed:', e.message);
  }

  // Method 3: Fallback lewat eporner (tidak kena SSL block)
  try {
    return await searchEporner(query);
  } catch (e) {
    console.warn('[XNXX] Eporner fallback failed:', e.message);
    throw new Error('Semua sumber gagal. Coba lagi nanti atau gunakan VPN!');
  }
}

async function searchXnxxDirect(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://www.xnxx.com/search/${encoded}/1`;

  const res = await axiosInstance.get(url);
  const $ = cheerio.load(res.data);
  const results = [];

  $('.mozaique .thumb-block, .thumb-block').each((i, el) => {
    if (i >= 8) return false;
    const title = $(el).find('a').attr('title') || $(el).find('p a').text().trim();
    const href = $(el).find('a').first().attr('href');
    const duration = $(el).find('.duration').text().trim();
    const views = $(el).find('.metadata').text().trim();

    if (href && title && href.includes('/video')) {
      results.push({
        title: title.trim().slice(0, 80),
        url: href.startsWith('http') ? href : `https://www.xnxx.com${href}`,
        duration,
        views,
        source: 'XNXX',
      });
    }
  });

  if (results.length === 0) throw new Error('Tidak ada hasil');
  return results;
}

async function searchXvideos(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://www.xvideos.com/?k=${encoded}`;

  const res = await axiosInstance.get(url);
  const $ = cheerio.load(res.data);
  const results = [];

  $('.thumb-block, #list-videos .thumb').each((i, el) => {
    if (i >= 8) return false;
    const title = $(el).find('a').attr('title') || $(el).find('.title').text().trim();
    const href = $(el).find('a').first().attr('href');
    const duration = $(el).find('.duration').text().trim();

    if (href && title) {
      results.push({
        title: title.trim().slice(0, 80),
        url: href.startsWith('http') ? href : `https://www.xvideos.com${href}`,
        duration,
        views: '-',
        source: 'XVideos',
      });
    }
  });

  if (results.length === 0) throw new Error('Tidak ada hasil dari xvideos');
  return results;
}

async function searchEporner(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://www.eporner.com/search/${encoded}/`;

  const res = await axiosInstance.get(url);
  const $ = cheerio.load(res.data);
  const results = [];

  $('#thumbs .mb, .video-item, article').each((i, el) => {
    if (i >= 8) return false;
    const title = $(el).find('a').attr('title') || $(el).find('h2, h3, .title').text().trim();
    const href = $(el).find('a').first().attr('href');
    const duration = $(el).find('.duration, .mnd').text().trim();
    const views = $(el).find('.mvi, .views').text().trim();

    if (href && title) {
      results.push({
        title: title.trim().slice(0, 80),
        url: href.startsWith('http') ? href : `https://www.eporner.com${href}`,
        duration,
        views,
        source: 'EPorner',
      });
    }
  });

  if (results.length === 0) throw new Error('Tidak ada hasil dari eporner');
  return results;
}

module.exports = { download, searchXnxx };
