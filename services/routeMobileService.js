const axios = require('axios');

/**
 * Route Mobile OTP Service
 * Handles OTP generation and validation using Route Mobile API
 */

// Get configuration from environment variables
const OTP_API_BASE_URL = process.env.OTP_API_BASE_URL || '';
const OTP_USERNAME = process.env.OTP_USERNAME || '';
const OTP_PASSWORD = process.env.OTP_PASSWORD || '';
const OTP_SOURCE = process.env.OTP_SOURCE || '';
const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || '6', 10);
const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY || '300', 10); // Default 5 minutes
const OTP_MESSAGE_TEMPLATE = process.env.OTP_MESSAGE_TEMPLATE || 'Your OTP is %m. Valid for 5 minutes.';

/**
 * Generate and send OTP to mobile number
 * @param {string} msisdn - Mobile number (10 digits, without country code)
 * @param {string} tagname - Optional tag name for batch identification
 * @returns {Promise<{success: boolean, messageId?: string, error?: string, errorCode?: string}>}
 */
async function generateOTP(msisdn, tagname = '') {
  try {
    // Validate required configuration
    if (!OTP_API_BASE_URL || !OTP_USERNAME || !OTP_PASSWORD || !OTP_SOURCE) {
      console.error('[OTP] Missing OTP API configuration');
      return {
        success: false,
        error: 'OTP service not configured',
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

    // URL encode the message template
    const encodedMessage = encodeURIComponent(OTP_MESSAGE_TEMPLATE);

    // Build the API URL
    const apiUrl = `${OTP_API_BASE_URL}/OtpApi/otpgenerate`;
    
    // Build query parameters
    const params = new URLSearchParams({
      username: OTP_USERNAME,
      password: OTP_PASSWORD,
      msisdn: cleanMsisdn,
      msg: encodedMessage,
      source: OTP_SOURCE,
      otplen: OTP_LENGTH.toString(),
      exptime: OTP_EXPIRY.toString()
    });

    // Add optional tagname if provided
    if (tagname) {
      params.append('tagname', tagname);
    }

    const fullUrl = `${apiUrl}?${params.toString()}`;

    console.log('[OTP] Sending OTP request:', {
      url: apiUrl,
      msisdn: cleanMsisdn,
      otplen: OTP_LENGTH,
      exptime: OTP_EXPIRY
    });

    // Make API request
    const response = await axios.get(fullUrl, {
      timeout: 10000 // 10 second timeout
    });

    const responseText = response.data?.toString().trim() || '';
    console.log('[OTP] API Response:', responseText);

    // Parse response
    // Success format: "1701|MSISDN:MessageID"
    // Error format: Error code (e.g., "1702", "1703", etc.)
    
    if (responseText.startsWith('1701|')) {
      // Success
      const parts = responseText.split('|');
      const messageId = parts[1]?.split(':')[1] || '';
      
      return {
        success: true,
        messageId: messageId,
        msisdn: cleanMsisdn
      };
    } else {
      // Error response
      const errorCode = responseText.split('|')[0] || responseText;
      const errorMessages = {
        '1702': 'One of the parameter is missing or OTP is not numeric',
        '1703': 'Authentication failed',
        '1706': 'Invalid destination',
        '1705': 'Message does not contain %m',
        '1707': 'Invalid source',
        '1710': 'Some error occurred',
        '1715': 'Response time out',
        '1025': 'Insufficient user credit',
        '1032': 'DND destination',
        '1033': 'Source template mismatch',
        '1035': 'User opt out',
        '1042': 'Explicit DND reject'
      };

      return {
        success: false,
        error: errorMessages[errorCode] || 'Unknown error occurred',
        errorCode: errorCode
      };
    }
  } catch (error) {
    console.error('[OTP] Generate OTP error:', error.message);
    
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
        error: 'OTP service error',
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
 * Validate OTP
 * @param {string} msisdn - Mobile number (10 digits, without country code)
 * @param {string} otp - OTP to validate
 * @returns {Promise<{success: boolean, error?: string, errorCode?: string}>}
 */
async function validateOTP(msisdn, otp) {
  try {
    // Validate required configuration
    if (!OTP_API_BASE_URL || !OTP_USERNAME || !OTP_PASSWORD) {
      console.error('[OTP] Missing OTP API configuration');
      return {
        success: false,
        error: 'OTP service not configured',
        errorCode: 'CONFIG_ERROR'
      };
    }

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

    // Build the API URL
    const apiUrl = `${OTP_API_BASE_URL}/OtpApi/checkotp`;
    
    // Build query parameters
    const params = new URLSearchParams({
      username: OTP_USERNAME,
      password: OTP_PASSWORD,
      msisdn: cleanMsisdn,
      otp: otp
    });

    const fullUrl = `${apiUrl}?${params.toString()}`;

    console.log('[OTP] Validating OTP:', {
      url: apiUrl,
      msisdn: cleanMsisdn
    });

    // Make API request
    const response = await axios.get(fullUrl, {
      timeout: 10000 // 10 second timeout
    });

    const responseText = response.data?.toString().trim() || '';
    console.log('[OTP] Validation Response:', responseText);

    // Parse response
    // Success: "101"
    // Errors: "102" (expired), "103" (not found), "104" (MSISDN not found), etc.
    
    if (responseText === '101') {
      return {
        success: true
      };
    } else {
      const errorMessages = {
        '102': 'OTP has expired',
        '103': 'Entry for OTP not found',
        '104': 'MSISDN not found',
        '1702': 'One of the parameter missing or OTP is not numeric',
        '1703': 'Authentication failed',
        '1706': 'Given destination is invalid'
      };

      const errorCode = responseText;
      return {
        success: false,
        error: errorMessages[errorCode] || 'OTP validation failed',
        errorCode: errorCode
      };
    }
  } catch (error) {
    console.error('[OTP] Validate OTP error:', error.message);
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        success: false,
        error: 'Request timeout. Please try again.',
        errorCode: 'TIMEOUT'
      };
    }

    if (error.response) {
      return {
        success: false,
        error: 'OTP service error',
        errorCode: 'API_ERROR'
      };
    }

    return {
      success: false,
      error: 'Failed to validate OTP. Please try again.',
      errorCode: 'NETWORK_ERROR'
    };
  }
}

module.exports = {
  generateOTP,
  validateOTP
};

