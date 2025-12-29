const axios = require('axios');

/**
 * Route Mobile Bulk SMS Service for OTP
 * Handles OTP generation, sending via Bulk SMS API, and local verification
 */

// Get configuration from environment variables
const SMS_API_BASE_URL = process.env.OTP_API_BASE_URL || 'http://sms6.rmlconnect.net:8080';
const SMS_USERNAME = process.env.OTP_USERNAME || '';
const SMS_PASSWORD = process.env.OTP_PASSWORD || '';
const SMS_SOURCE = process.env.OTP_SOURCE || '';
const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || '6', 10);
const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY || '300', 10); // Default 5 minutes
const OTP_MESSAGE_TEMPLATE = process.env.OTP_MESSAGE_TEMPLATE || 'Your OTP is %m. Valid for 5 minutes.';

// In-memory OTP store: mobile -> { otp, expiresAt, attempts }
const otpStore = new Map();

// Cleanup expired OTPs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [mobile, data] of otpStore.entries()) {
    if (data.expiresAt < now) {
      otpStore.delete(mobile);
    }
  }
}, 5 * 60 * 1000);

// Log configuration on module load (without sensitive data)
console.log('[OTP] Service initialized:', {
  hasBaseUrl: !!SMS_API_BASE_URL,
  baseUrl: SMS_API_BASE_URL,
  hasUsername: !!SMS_USERNAME,
  hasPassword: !!SMS_PASSWORD,
  hasSource: !!SMS_SOURCE,
  otplen: OTP_LENGTH,
  exptime: OTP_EXPIRY,
  messageTemplate: OTP_MESSAGE_TEMPLATE
});

/**
 * Generate a random numeric OTP
 * @param {number} length - Length of OTP
 * @returns {string} Generated OTP
 */
function generateRandomOTP(length) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

/**
 * Generate and send OTP to mobile number using Bulk SMS API
 * @param {string} msisdn - Mobile number (10 digits, without country code)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string, errorCode?: string}>}
 */
async function generateOTP(msisdn) {
  try {
    // Validate required configuration
    if (!SMS_API_BASE_URL || !SMS_USERNAME || !SMS_PASSWORD || !SMS_SOURCE) {
      console.error('[OTP] Missing SMS API configuration');
      return {
        success: false,
        error: 'SMS service not configured',
        errorCode: 'CONFIG_ERROR'
      };
    }

    // Validate mobile number (should be 10 digits)
    const cleanMsisdn = msisdn.replace(/\D/g, ''); // Remove non-digits
    if (cleanMsisdn.length !== 10) {
      return {
        success: false,
        error: 'Invalid mobile number. Must be 10 digits.',
        errorCode: 'INVALID_MSISDN'
      };
    }

    // Generate OTP
    const otp = generateRandomOTP(OTP_LENGTH);
    const expiresAt = Date.now() + (OTP_EXPIRY * 1000);

    // Store OTP in memory
    otpStore.set(cleanMsisdn, {
      otp: otp,
      expiresAt: expiresAt,
      attempts: 0,
      createdAt: Date.now()
    });

    // Create message with OTP
    const message = OTP_MESSAGE_TEMPLATE.replace('%m', otp);

    // URL encode the message (UTF-8 encoding)
    const encodedMessage = encodeURIComponent(message);

    // Build the Bulk SMS API URL
    // Format: http://<server>:8080/bulksms/bulksms?username=XXXX&password=YYYYY&type=0&dlr=0&destination=QQQQQQQQQ&source=RRRR&message=SSSSSSSS
    const apiUrl = `${SMS_API_BASE_URL}/bulksms/bulksms`;
    
    // Build query parameters
    const queryParams = [
      `username=${encodeURIComponent(SMS_USERNAME)}`,
      `password=${encodeURIComponent(SMS_PASSWORD)}`,
      `type=0`, // Plain text (GSM 3.38 Character encoding)
      `dlr=0`, // No delivery report required
      `destination=${encodeURIComponent(cleanMsisdn)}`,
      `source=${encodeURIComponent(SMS_SOURCE)}`,
      `message=${encodedMessage}`
    ];

    const fullUrl = `${apiUrl}?${queryParams.join('&')}`;

    console.log('[OTP] Sending SMS:', {
      url: apiUrl,
      msisdn: cleanMsisdn,
      messageLength: message.length,
      otpLength: otp.length
    });
    console.log('[OTP] Full URL (password hidden):', fullUrl.replace(/password=[^&]*/, 'password=***'));

    // Make API request
    const response = await axios.get(fullUrl, {
      timeout: 15000 // 15 second timeout
    });

    const responseText = response.data?.toString().trim() || '';
    console.log('[OTP] API Response:', responseText);

    // Parse response
    // Success format: "1701|<CELL_NO>|<MESSAGE ID>"
    // Error format: Error code (e.g., "1702", "1703", etc.)
    
    if (responseText.startsWith('1701|')) {
      // Success
      const parts = responseText.split('|');
      const messageId = parts[2] || '';
      
      console.log('[OTP] OTP sent successfully:', {
        msisdn: cleanMsisdn,
        messageId: messageId,
        expiresAt: new Date(expiresAt).toISOString()
      });

      return {
        success: true,
        messageId: messageId,
        msisdn: cleanMsisdn
      };
    } else {
      // Error response - remove OTP from store on error
      otpStore.delete(cleanMsisdn);
      
      const errorCode = responseText.split('|')[0] || responseText;
      const errorMessages = {
        '1702': 'Invalid URL or missing parameter',
        '1703': 'Invalid username or password',
        '1704': 'Invalid value in type parameter',
        '1705': 'Invalid message',
        '1706': 'Invalid destination',
        '1707': 'Invalid source (Sender)',
        '1708': 'Invalid value for dlr parameter',
        '1709': 'User validation failed',
        '1710': 'Internal error',
        '1025': 'Insufficient credit',
        '1715': 'Response timeout',
        '1032': 'DND reject',
        '1028': 'Spam message'
      };

      return {
        success: false,
        error: errorMessages[errorCode] || 'Unknown error occurred',
        errorCode: errorCode
      };
    }
  } catch (error) {
    console.error('[OTP] Generate OTP error:', error.message);
    
    // Remove OTP from store on error
    const cleanMsisdn = msisdn.replace(/\D/g, '');
    otpStore.delete(cleanMsisdn);
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        success: false,
        error: 'Request timeout. Please try again.',
        errorCode: 'TIMEOUT'
      };
    }

    if (error.response) {
      // API returned error response
      return {
        success: false,
        error: 'SMS service error',
        errorCode: 'API_ERROR'
      };
    }

    return {
      success: false,
      error: 'Failed to send OTP. Please try again.',
      errorCode: 'NETWORK_ERROR'
    };
  }
}

/**
 * Validate OTP (local verification against stored OTP)
 * @param {string} msisdn - Mobile number (10 digits, without country code)
 * @param {string} otp - OTP to validate
 * @returns {Promise<{success: boolean, error?: string, errorCode?: string}>}
 */
async function validateOTP(msisdn, otp) {
  try {
    // Validate mobile number
    const cleanMsisdn = msisdn.replace(/\D/g, '');
    if (cleanMsisdn.length !== 10) {
      return {
        success: false,
        error: 'Invalid mobile number',
        errorCode: 'INVALID_MSISDN'
      };
    }

    // Validate OTP (should be numeric)
    if (!/^\d+$/.test(otp)) {
      return {
        success: false,
        error: 'OTP must be numeric',
        errorCode: 'INVALID_OTP'
      };
    }

    // Get stored OTP data
    const otpData = otpStore.get(cleanMsisdn);

    if (!otpData) {
      return {
        success: false,
        error: 'OTP not found. Please request a new OTP.',
        errorCode: 'OTP_NOT_FOUND'
      };
    }

    // Check if OTP has expired
    if (Date.now() > otpData.expiresAt) {
      otpStore.delete(cleanMsisdn);
      return {
        success: false,
        error: 'OTP has expired. Please request a new OTP.',
        errorCode: 'OTP_EXPIRED'
      };
    }

    // Check attempts (prevent brute force)
    if (otpData.attempts >= 5) {
      otpStore.delete(cleanMsisdn);
      return {
        success: false,
        error: 'Too many failed attempts. Please request a new OTP.',
        errorCode: 'TOO_MANY_ATTEMPTS'
      };
    }

    // Validate OTP
    if (otpData.otp !== otp) {
      otpData.attempts += 1;
      return {
        success: false,
        error: 'Invalid OTP. Please try again.',
        errorCode: 'INVALID_OTP'
      };
    }

    // OTP is valid - remove from store
    otpStore.delete(cleanMsisdn);

    console.log('[OTP] OTP validated successfully:', {
      msisdn: cleanMsisdn
    });

    return {
      success: true
    };
  } catch (error) {
    console.error('[OTP] Validate OTP error:', error.message);
    
    return {
      success: false,
      error: 'Failed to validate OTP. Please try again.',
      errorCode: 'VALIDATION_ERROR'
    };
  }
}

module.exports = {
  generateOTP,
  validateOTP
};
