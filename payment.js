// lib/payment.js — Integrasi NercPay QRIS
// Dipakai untuk: Deposit saldo & Beli produk via QRIS otomatis.
//
// config yang dibutuhkan (config.nercpay di config.json):
// {
//   "apikey": "nrcp_xxxxxxxxxxxxxxxx"   <-- API key dari akun NercPay kamu
// }
//
// Dapatkan API key di: https://nercpay.vercel.app -> Generate API Key

const axios = require('axios');

const BASE_URL = 'https://nercpay.vercel.app/api/v1';

/**
 * Buat QRIS baru.
 * @param {number} harga - nominal yang ingin diterima (net, sebelum fee NercPay)
 * @param {object} config - { apikey }
 * @returns {object|null} {
 *   idtransaksi, jumlah (total harus dibayar), fee, amount_received,
 *   qr_string, imageqris (Buffer|null), nominal, expired_at
 * }
 */
async function createdQris(harga, config = {}) {
  const apikey = config.apikey;
  if (!apikey) throw new Error('NercPay apikey belum diatur');

  try {
    const res = await axios.post(
      `${BASE_URL}/qris/create`,
      { amount: Math.round(Number(harga)) },
      {
        headers: {
          'x-api-key': apikey,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const data = res.data?.data;
    if (!res.data?.success || !data) {
      throw new Error(res.data?.error || 'Response NercPay tidak valid');
    }

    // Coba download gambar QR-nya jadi Buffer (opsional, ada fallback qrcode di index.js)
    let imageqris = null;
    if (data.qr_image) {
      try {
        const imgRes = await axios.get(data.qr_image, { responseType: 'arraybuffer', timeout: 10000 });
        imageqris = Buffer.from(imgRes.data);
      } catch {
        imageqris = null;
      }
    }

    return {
      idtransaksi: data.qris_id,
      jumlah: data.amount,               // total yang harus dibayar (sudah termasuk fee NercPay)
      fee: data.fee,
      amount_received: data.amount_received,
      qr_string: data.qr_string,
      imageqris,
      nominal: data.amount,
      expired_at: data.expired_at,
    };
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error('[NercPay] createdQris error:', msg);
    throw new Error(msg);
  }
}

/**
 * Cek status pembayaran QRIS.
 * @param {string} id - qris_id (dari hasil createdQris.idtransaksi)
 * @param {number} amount - tidak dipakai NercPay, disisakan untuk kompatibilitas signature lama
 * @param {object} config - { apikey }
 * @returns {boolean} true jika sudah lunas (status === 'success')
 */
async function cekStatus(id, amount, config = {}) {
  const apikey = config.apikey;
  if (!apikey || !id) return false;

  try {
    const res = await axios.get(`${BASE_URL}/qris/status`, {
      params: { qris_id: id },
      headers: { 'x-api-key': apikey },
      timeout: 15000,
    });

    const data = res.data?.data;
    if (!res.data?.success || !data) return false;

    return data.status === 'success';
  } catch (err) {
    console.error('[NercPay] cekStatus error:', err.response?.data?.error || err.message);
    return false;
  }
}

/**
 * Batalkan QRIS yang masih pending (opsional, dipakai kalau ada tombol "Batal").
 * @param {string} id - qris_id
 * @param {object} config - { apikey }
 */
async function cancelQris(id, config = {}) {
  const apikey = config.apikey;
  if (!apikey || !id) return false;

  try {
    const res = await axios.post(
      `${BASE_URL}/qris/cancel`,
      { qris_id: id },
      { headers: { 'x-api-key': apikey, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return !!res.data?.success;
  } catch (err) {
    console.error('[NercPay] cancelQris error:', err.response?.data?.error || err.message);
    return false;
  }
}

module.exports = { createdQris, cekStatus, cancelQris };
