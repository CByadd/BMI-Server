/**
 * Convobox WhatsApp service – send template messages via webhook
 * Template "well": placeholders {{1}} name, {{2}} weight, {{3}} height, {{4}} BMI, {{5}} fortune, {{6}} health tip
 */

const axios = require('axios');

const WELL_WEBHOOK_URL = process.env.WHATSAPP_WELL_WEBHOOK_URL || '';

/**
 * Normalize mobile for WhatsApp (receiver): ensure country code. Expects 10-digit or 91+10.
 * @param {string} mobile - From DB (e.g. 9876543210 or 919876543210)
 * @returns {string} - E.g. 919876543210
 */
function normalizeReceiverMobile(mobile) {
  const s = String(mobile || '').replace(/\D/g, '');
  if (s.length === 10) return '91' + s;
  if (s.length === 12 && s.startsWith('91')) return s;
  return s || '';
}

/**
 * Send WhatsApp "well" template via Convobox webhook
 * @param {Object} opts
 * @param {string} opts.receiver - Customer mobile (10 digits or with country code)
 * @param {string} [opts.name] - {{1}} User name
 * @param {string|number} [opts.weightKg] - {{2}} Weight in Kg
 * @param {string|number} [opts.heightCm] - {{3}} Height in Cm
 * @param {string|number} [opts.bmi] - {{4}} BMI value
 * @param {string} [opts.fortune] - {{5}} Fortune for today
 * @param {string} [opts.healthTip] - {{6}} Health tip
 * @returns {Promise<{ success: boolean, error?: string, errorCode?: string }>}
 */
async function sendWellTemplate(opts) {
  const {
    receiver,
    name = '',
    weightKg = '',
    heightCm = '',
    bmi = '',
    fortune = '',
    healthTip = ''
  } = opts || {};

  if (!WELL_WEBHOOK_URL) {
    console.error('[WHATSAPP_WELL] Missing WHATSAPP_WELL_WEBHOOK_URL');
    return { success: false, error: 'WhatsApp well webhook not configured', errorCode: 'CONFIG_ERROR' };
  }

  const toNumber = normalizeReceiverMobile(receiver);
  if (!toNumber || toNumber.length < 12) {
    return { success: false, error: 'Invalid receiver mobile', errorCode: 'INVALID_RECEIVER' };
  }

  const payload = {
    receiver: toNumber,
    values: {
      'Body_{{1}}': String(name ?? ''),
      'Body_{{2}}': String(weightKg ?? ''),
      'Body_{{3}}': String(heightCm ?? ''),
      'Body_{{4}}': String(bmi ?? ''),
      'Body_{{5}}': String(fortune ?? ''),
      'Body_{{6}}': String(healthTip ?? '')
    }
  };

  try {
    console.log('[WHATSAPP_WELL] Sending:', { receiver: toNumber, template: 'well' });
    const response = await axios.post(WELL_WEBHOOK_URL, payload, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: (s) => s >= 200 && s < 500
    });

    if (response.status >= 200 && response.status < 300) {
      console.log('[WHATSAPP_WELL] Sent successfully to', toNumber);
      return { success: true };
    }

    const errMsg = response.data?.message || response.data?.error || response.statusText || String(response.status);
    console.warn('[WHATSAPP_WELL] Webhook error:', response.status, errMsg);
    return { success: false, error: errMsg, errorCode: 'WEBHOOK_ERROR' };
  } catch (err) {
    console.error('[WHATSAPP_WELL] Request error:', err.message);
    return {
      success: false,
      error: err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' ? 'Request timeout' : err.message,
      errorCode: err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'NETWORK_ERROR'
    };
  }
}

module.exports = {
  sendWellTemplate,
  normalizeReceiverMobile
};
