const axios = require('axios');

/**
 * Route Mobile – SMSPLUS – Bulk HTTP API
 * Ref: SmsPlus_BulkHttp PDF (Route Mobile Limited, Version 1.0.1, January 2018)
 *
 * API URL: http://<server>:8080/bulksms/bulksms?
 *   username=XXXX&password=YYYYY&type=Y&dlr=Z&destination=QQQQQQQQQ&source=RRRR&message=SSSSSSSS[&url=KKKK]
 *
 * All parameters (especially message and url) must be URL-UTF-8 encoded.
 *
 * Request Parameters:
 *   1. username  - HTTP account username
 *   2. password  - HTTP account password
 *   3. type      - 0=Plain text GSM 3.38, 1=Flash GSM, 2=Unicode, 3=Reserved, 4=WAP Push, 5=Plain ISO-8859-1, 6=Unicode Flash, 7=Flash ISO-8859-1
 *   4. dlr       - 0=No delivery report, 1=Delivery report required
 *   5. destination - Mobile number (may include +; multiple comma-separated, comma URL-encoded)
 *   6. source    - Sender address (max 18 numeric, max 11 alphanumeric); + prefix URL-encoded if used
 *   7. message   - Message text (URL-UTF-8 encoded)
 *   8. url       - For WAP Push (type=4) only; URL-UTF-8 encoded
 *
 * Success: 1701|<CELL_NO>|<MESSAGE ID>
 * Error codes: 1702 Invalid URL, 1703 Invalid username/password, 1704 Invalid type, 1705 Invalid message,
 *   1706 Invalid destination, 1707 Invalid source, 1708 Invalid dlr, 1709 User validation failed,
 *   1710 Internal error, 1025 Insufficient credit, 1715 Response timeout, 1032 DND reject, 1028 Spam.
 */

// Configuration from environment (per SMSPLUS Bulk HTTP API)
// Base URL = http://<server>:8080 (e.g. http://sms6.rmlconnect.net:8080)
const SMS_API_BASE_URL = (process.env.SMS_API_BASE_URL || process.env.OTP_API_BASE_URL || 'http://sms6.rmlconnect.net:8080').replace(/\/$/, '');
const SMS_USERNAME = process.env.SMS_USERNAME || process.env.OTP_USERNAME || '';
const SMS_PASSWORD = process.env.SMS_PASSWORD || process.env.OTP_PASSWORD || '';
const SMS_SOURCE = process.env.SMS_SOURCE || process.env.OTP_SOURCE || '';
const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || '6', 10);
const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY || '300', 10); // Default 5 minutes
const OTP_MESSAGE_TEMPLATE = process.env.OTP_MESSAGE_TEMPLATE || 'Your OTP is %m. Valid for 5 minutes.';
// DLT (India) – not in base SMSPLUS spec; add if operator requires
const OTP_ENTITY_ID = process.env.OTP_ENTITY_ID || process.env.SMS_ENTITY_ID || '';
const OTP_TEMPLATE_ID = process.env.OTP_TEMPLATE_ID || process.env.SMS_TEMPLATE_ID || '';
const OTP_MOCK_MODE = process.env.OTP_MOCK_MODE === 'true' || process.env.OTP_MOCK_MODE === '1';
const MOCK_OTP = '000000';

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
  messageTemplate: OTP_MESSAGE_TEMPLATE,
  hasEntityId: !!OTP_ENTITY_ID,
  hasTemplateId: !!OTP_TEMPLATE_ID,
  dltEnabled: !!(OTP_ENTITY_ID && OTP_TEMPLATE_ID),
  mockMode: OTP_MOCK_MODE,
  mockOtp: OTP_MOCK_MODE ? MOCK_OTP : 'N/A'
});

if (OTP_MOCK_MODE) {
  console.log('[OTP] ⚠️  MOCK MODE ENABLED - Using fixed OTP "000000" for testing');
  console.log('[OTP] ⚠️  No actual SMS will be sent. Use OTP: 000000');
}

if (OTP_MOCK_MODE) {
  console.log('[OTP] ⚠️  MOCK MODE ENABLED - Using fixed OTP "000000" for testing');
  console.log('[OTP] ⚠️  No actual SMS will be sent. Use OTP: 000000');
  console.log('[OTP] ⚠️  Set OTP_MOCK_MODE=false to use real SMS sending');
}

/**
 * Normalize mobile number to 10 digits (removes country code if present)
 * @param {string} msisdn - Mobile number (any format)
 * @returns {string} Normalized 10-digit mobile number
 */
function normalizeMobileNumber(msisdn) {
  // Remove all non-digits
  let cleaned = msisdn.replace(/\D/g, '');
  
  // Remove country code if present (91 for India)
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  }
  
  return cleaned;
}

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

    // Normalize mobile number to 10 digits
    const cleanMsisdn = normalizeMobileNumber(msisdn);
    
    if (cleanMsisdn.length !== 10) {
      console.log('[OTP] Generate OTP - Invalid mobile number:', { original: msisdn, cleaned: cleanMsisdn, length: cleanMsisdn.length });
      return {
        success: false,
        error: 'Invalid mobile number. Must be 10 digits.',
        errorCode: 'INVALID_MSISDN'
      };
    }
    
    console.log('[OTP] Generate OTP - Mobile number normalized:', { original: msisdn, normalized: cleanMsisdn });
    
    // Add country code 91 (India) for Route Mobile API
    // Some carriers require country code prefix
    const destinationWithCountryCode = `91${cleanMsisdn}`;

    // Generate OTP (use mock OTP if mock mode is enabled)
    const otp = OTP_MOCK_MODE ? MOCK_OTP : generateRandomOTP(OTP_LENGTH);
    const expiresAt = Date.now() + (OTP_EXPIRY * 1000);

    // Store OTP in memory
    otpStore.set(cleanMsisdn, {
      otp: otp,
      expiresAt: expiresAt,
      attempts: 0,
      createdAt: Date.now(),
      isMock: OTP_MOCK_MODE
    });
    
    console.log('[OTP] Generate OTP - OTP stored:', {
      mobile: cleanMsisdn,
      otp: otp,
      isMock: OTP_MOCK_MODE,
      expiresAt: new Date(expiresAt).toISOString(),
      storeSize: otpStore.size,
      allKeys: Array.from(otpStore.keys())
    });

    // If mock mode, skip SMS sending and return success immediately
    if (OTP_MOCK_MODE) {
      console.log('[OTP] 🧪 MOCK MODE: Skipping SMS sending');
      console.log('[OTP] 🧪 MOCK OTP generated:', otp);
      console.log('[OTP] 🧪 MOCK MODE: OTP stored for mobile:', cleanMsisdn);
      console.log('[OTP] 🧪 MOCK MODE: OTP expires at:', new Date(expiresAt).toISOString());
      console.log('[OTP] 🧪 Use OTP "000000" to verify');
      
      return {
        success: true,
        messageId: 'MOCK-' + Date.now(),
        msisdn: cleanMsisdn,
        response: `1701|${destinationWithCountryCode}:MOCK-MESSAGE-ID`,
        cellNumber: destinationWithCountryCode,
        verified: true,
        mockMode: true,
        isMock: true,
        mockOtp: MOCK_OTP
      };
    }

    // Create message with OTP
    const message = OTP_MESSAGE_TEMPLATE.replace('%m', otp);

    // URL encode the message (UTF-8 encoding) - exactly like PHP urlencode()
    // encodeURIComponent is JavaScript equivalent of PHP urlencode()
    const encodedMessage = encodeURIComponent(message);

    // Build the Bulk SMS API URL
    // Format: http://<server>:8080/bulksms/bulksms?username=XXXX&password=YYYYY&type=0&dlr=0&destination=QQQQQQQQQ&source=RRRR&message=SSSSSSSS
    // Ensure base URL doesn't have trailing slash
    const baseUrl = SMS_API_BASE_URL.replace(/\/$/, '');
    const apiUrl = `${baseUrl}/bulksms/bulksms`;
    
    // Build query parameters exactly as per BMI Stock app implementation
    // Format matches: http://sms6.rmlconnect.net:8080/bulksms/bulksms?username=...&password=...&type=0&dlr=1&destination=...&source=...&message=...&entityid=...&tempid=...
    // This matches the exact format used in SerialConsoleActivity.java (lines 3125-3133)
    // Note: Password has special characters (1L(d!i2O) - need to encode only special chars, not the whole param
    // In Java, they use string concatenation, but URL special chars should be encoded
    const queryParams = [
      `username=${encodeURIComponent(SMS_USERNAME)}`, // Encode to handle any special chars
      `password=${encodeURIComponent(SMS_PASSWORD)}`, // Encode password with special chars: 1L(d!i2O
      `type=0`, // Plain text (GSM 3.38 Character encoding)
      `dlr=1`, // Delivery report required (BMI app uses dlr=1)
      `destination=${destinationWithCountryCode}`, // With country code
      `source=${encodeURIComponent(SMS_SOURCE)}`, // Sender ID
      `message=${encodedMessage}` // URL encoded message only
    ];
    
    // Add DLT parameters if configured (Required for India commercial SMS)
    // BMI Stock app uses: entityid=1201161725113535191&tempid=1207164389681675936
    if (OTP_ENTITY_ID && OTP_TEMPLATE_ID) {
      queryParams.push(`entityid=${OTP_ENTITY_ID}`); // Numbers don't need encoding
      queryParams.push(`tempid=${OTP_TEMPLATE_ID}`); // Numbers don't need encoding
      console.log('[OTP] Using DLT registration:', {
        entityId: OTP_ENTITY_ID,
        templateId: OTP_TEMPLATE_ID
      });
    }

    const fullUrl = `${apiUrl}?${queryParams.join('&')}`;

    console.log('[OTP] Sending SMS:', {
      url: apiUrl,
      msisdn: cleanMsisdn,
      destination: destinationWithCountryCode, // With country code
      message: message, // Log original message
      messageLength: message.length,
      otpLength: otp.length,
      encodedMessage: encodedMessage
    });
    console.log('[OTP] Full URL (password hidden):', fullUrl.replace(/password=[^&]*/, 'password=***'));

    // Make API request using GET method (as per Route Mobile documentation)
    // BMI Stock app uses URLConnection with GET request
    let response;
    let responseText;
    
    try {
      console.log('[OTP] Making HTTP GET request to Route Mobile API...');
      response = await axios.get(fullUrl, {
        timeout: 30000, // 30 second timeout
        headers: {
          'Accept': '*/*',
          'User-Agent': 'Node.js/OTP-Service',
          'Connection': 'keep-alive'
        },
        validateStatus: function (status) {
          // Accept any status code as Route Mobile returns error codes in response body
          return status >= 200 && status < 500;
        },
        maxRedirects: 0 // Don't follow redirects
      });

      // Route Mobile API returns plain text response
      responseText = (response.data?.toString() || response.data || '').trim();
      console.log('[OTP] ========== API RESPONSE ==========');
      console.log('[OTP] Response Status Code:', response.status);
      console.log('[OTP] Response Body (Raw):', responseText);
      console.log('[OTP] Response Length:', responseText.length);
      console.log('[OTP] Response Type:', typeof responseText);
      console.log('[OTP] ===================================');
      
      // Log response headers for debugging
      if (response.headers) {
        console.log('[OTP] Response Headers:', JSON.stringify(response.headers, null, 2));
      }
    } catch (axiosError) {
      // Handle axios errors
      console.error('[OTP] ========== API ERROR ==========');
      if (axiosError.response) {
        responseText = (axiosError.response.data?.toString() || axiosError.response.data || '').trim();
        console.error('[OTP] Error Status:', axiosError.response.status);
        console.error('[OTP] Error Response:', responseText);
        console.error('[OTP] Error Headers:', axiosError.response.headers);
      } else if (axiosError.request) {
        console.error('[OTP] No response received');
        console.error('[OTP] Request URL:', fullUrl.replace(/password=[^&]*/, 'password=***'));
        console.error('[OTP] Error:', axiosError.message);
      } else {
        console.error('[OTP] Request setup error:', axiosError.message);
      }
      console.error('[OTP] =================================');
      
      if (!axiosError.response) {
        throw axiosError; // Re-throw if not a response error
      }
    }

    // Parse response
    // Success format: "1701|<CELL_NO>|<MESSAGE ID>" or "1701|<CELL_NO>|<MESSAGE ID>,1701|<CELL_NO>|<MESSAGE ID>"
    // Error format: Error code (e.g., "1702", "1703", etc.)
    
    if (!responseText) {
      console.error('[OTP] Empty response from API');
      otpStore.delete(cleanMsisdn);
      return {
        success: false,
        error: 'Empty response from SMS service',
        errorCode: 'EMPTY_RESPONSE'
      };
    }
    
    if (responseText.startsWith('1701|')) {
      // Success - parse the response
      // Format: 1701|<CELL_NO>:<MESSAGE ID> or 1701|<CELL_NO>|<MESSAGE ID>
      const parts = responseText.split('|');
      const cellNoAndMessageId = parts[1] || '';
      
      // Handle both formats: "919443932288:4bb43bc6-..." or separate parts
      let cellNo = cleanMsisdn;
      let messageId = '';
      
      if (cellNoAndMessageId.includes(':')) {
        // Format: CELL_NO:MESSAGE_ID
        const cellParts = cellNoAndMessageId.split(':');
        cellNo = cellParts[0] || cleanMsisdn;
        messageId = cellParts.slice(1).join(':'); // Join in case message ID contains colons
      } else {
        // Format: separate parts (parts[1] = cellNo, parts[2] = messageId)
        cellNo = cellNoAndMessageId;
        messageId = parts[2] || '';
      }
      
      console.log('[OTP] OTP sent successfully:', {
        msisdn: cleanMsisdn,
        cellNo: cellNo,
        messageId: messageId,
        expiresAt: new Date(expiresAt).toISOString()
      });

      return {
        success: true,
        messageId: messageId,
        msisdn: cleanMsisdn,
        response: responseText, // Include full server response for verification
        cellNumber: cellNo,
        verified: true // Indicates server confirmed message submission
      };
    } else {
      // Error response - remove OTP from store on error
      otpStore.delete(cleanMsisdn);
      
      const errorCode = responseText.split('|')[0] || responseText.trim();
      const errorMessages = {
        '1702': 'Invalid URL or missing parameter. Check all required parameters are present.',
        '1703': 'Invalid username or password. Verify credentials are correct.',
        '1704': 'Invalid value in type parameter. Should be 0 for plain text.',
        '1705': 'Invalid message. Message format or content is invalid.',
        '1706': 'Invalid destination. Mobile number format is incorrect.',
        '1707': 'Invalid source (Sender ID). Sender ID "WELTDY" may not be approved.',
        '1708': 'Invalid value for dlr parameter. Should be 0 or 1.',
        '1709': 'User validation failed. Account may be suspended or invalid.',
        '1710': 'Internal error at Route Mobile. Please try again later.',
        '1025': 'Insufficient credit. Account balance is low.',
        '1715': 'Response timeout. Request took too long.',
        '1032': 'DND reject. Mobile number is on Do Not Disturb list.',
        '1028': 'Spam message detected. Message content flagged as spam.'
      };

      const errorMessage = errorMessages[errorCode] || `Unknown error occurred. Error code: ${errorCode}`;
      
      console.error('[OTP] ❌ ERROR:', {
        errorCode: errorCode,
        errorMessage: errorMessage,
        rawResponse: responseText
      });

      return {
        success: false,
        error: errorMessage,
        errorCode: errorCode,
        rawResponse: responseText
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
    // Normalize mobile number to 10 digits (same as generateOTP)
    const finalMsisdn = normalizeMobileNumber(msisdn);
    
    if (finalMsisdn.length !== 10) {
      console.log('[OTP] Validate OTP - Invalid mobile number length:', { original: msisdn, normalized: finalMsisdn, length: finalMsisdn.length });
      return {
        success: false,
        error: 'Invalid mobile number',
        errorCode: 'INVALID_MSISDN'
      };
    }
    
    console.log('[OTP] Validate OTP - Mobile number normalized:', { original: msisdn, normalized: finalMsisdn });

    // Validate OTP (should be numeric)
    if (!/^\d+$/.test(otp)) {
      console.log('[OTP] Validate OTP - Invalid OTP format:', { otp });
      return {
        success: false,
        error: 'OTP must be numeric',
        errorCode: 'INVALID_OTP'
      };
    }

    // MOCK MODE BYPASS: If mock mode is enabled and OTP is "000000", accept it immediately
    // This works even if OTP wasn't stored (useful for serverless environments where in-memory store doesn't persist)
    if (OTP_MOCK_MODE && otp === MOCK_OTP) {
      console.log('[OTP] 🧪 MOCK MODE: Bypassing OTP store check - accepting mock OTP "000000"');
      console.log('[OTP] 🧪 MOCK MODE: OTP validated successfully for mobile:', finalMsisdn);
      return {
        success: true,
        isMock: true
      };
    }

    // Debug: Log all stored OTPs
    console.log('[OTP] Validate OTP - Looking for OTP:', { 
      msisdn: finalMsisdn, 
      otp: otp,
      storedKeys: Array.from(otpStore.keys()),
      storeSize: otpStore.size,
      mockMode: OTP_MOCK_MODE
    });

    // Get stored OTP data
    const otpData = otpStore.get(finalMsisdn);

    if (!otpData) {
      // If mock mode is enabled, suggest using 000000
      const errorMessage = OTP_MOCK_MODE 
        ? 'OTP not found. In mock mode, use OTP "000000" to verify.'
        : 'OTP not found. Please request a new OTP.';
      
      console.log('[OTP] Validate OTP - OTP not found in store:', { 
        lookupKey: finalMsisdn,
        allKeys: Array.from(otpStore.keys()),
        storeSize: otpStore.size,
        mockMode: OTP_MOCK_MODE,
        providedOtp: otp
      });
      return {
        success: false,
        error: errorMessage,
        errorCode: 'OTP_NOT_FOUND'
      };
    }
    
    console.log('[OTP] Validate OTP - Found OTP data:', {
      storedOtp: otpData.otp,
      providedOtp: otp,
      match: otpData.otp === otp,
      isMock: otpData.isMock,
      expiresAt: new Date(otpData.expiresAt).toISOString(),
      now: new Date().toISOString(),
      expired: Date.now() > otpData.expiresAt
    });

    // Check if OTP has expired
    if (Date.now() > otpData.expiresAt) {
      otpStore.delete(finalMsisdn);
      console.log('[OTP] Validate OTP - OTP expired');
      return {
        success: false,
        error: 'OTP has expired. Please request a new OTP.',
        errorCode: 'OTP_EXPIRED'
      };
    }

    // Check attempts (prevent brute force)
    if (otpData.attempts >= 5) {
      otpStore.delete(finalMsisdn);
      console.log('[OTP] Validate OTP - Too many attempts');
      return {
        success: false,
        error: 'Too many failed attempts. Please request a new OTP.',
        errorCode: 'TOO_MANY_ATTEMPTS'
      };
    }

    // Validate OTP
    if (otpData.otp !== otp) {
      otpData.attempts += 1;
      console.log('[OTP] Validate OTP - OTP mismatch:', {
        storedOtp: otpData.otp,
        providedOtp: otp,
        attempts: otpData.attempts
      });
      return {
        success: false,
        error: 'Invalid OTP. Please try again.',
        errorCode: 'INVALID_OTP'
      };
    }

    // OTP is valid - remove from store
    otpStore.delete(finalMsisdn);

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

// SMSPLUS Bulk HTTP API error codes (from doc)
const BULK_SMS_ERROR_MESSAGES = {
  '1702': 'Invalid URL. One of the parameters was not provided or left blank.',
  '1703': 'Invalid value in username or password parameter.',
  '1704': 'Invalid value in type parameter.',
  '1705': 'Invalid message.',
  '1706': 'Invalid destination.',
  '1707': 'Invalid source (Sender).',
  '1708': 'Invalid value in dlr parameter.',
  '1709': 'User validation failed.',
  '1710': 'Internal error.',
  '1025': 'Insufficient credit.',
  '1715': 'Response timeout. Do NOT re-submit the same message.',
  '1032': 'DND reject.',
  '1028': 'Spam message.'
};

/**
 * Send a single bulk SMS via Route Mobile SMSPLUS Bulk HTTP API
 * API: http://<server>:8080/bulksms/bulksms?username=...&password=...&type=Y&dlr=Z&destination=...&source=...&message=...
 * All parameters (message, url) must be URL-UTF-8 encoded.
 * Success response: 1701|<CELL_NO>|<MESSAGE ID>
 *
 * @param {Object} opts
 * @param {string} opts.destination - Mobile number (10 digits or with country code; doc: may include +)
 * @param {string} opts.message - Message text (URL-UTF-8 encoded per doc)
 * @param {number} [opts.type=0] - 0=Plain GSM 3.38, 1=Flash, 2=Unicode, 4=WAP Push, 5=Plain ISO-8859-1, 6=Unicode Flash, 7=Flash ISO-8859-1
 * @param {number} [opts.dlr=0] - 0=No delivery report, 1=Delivery report required
 * @param {string} [opts.source] - Sender ID (max 18 numeric, max 11 alphanumeric)
 * @param {string} [opts.url] - For WAP Push (type=4) only; URL-UTF-8 encoded
 * @returns {Promise<{success: boolean, messageId?: string, error?: string, errorCode?: string}>}
 */
async function sendBulkSms(opts) {
  const {
    destination,
    message,
    type = 0,
    dlr = 0,
    source = SMS_SOURCE,
    url
  } = opts || {};

  try {
    if (!SMS_API_BASE_URL || !SMS_USERNAME || !SMS_PASSWORD || !source) {
      console.error('[BULK_SMS] Missing SMS API configuration (per SMSPLUS doc: username, password, source required)');
      return { success: false, error: 'SMS service not configured', errorCode: 'CONFIG_ERROR' };
    }
    const dest = normalizeMobileNumber(String(destination || ''));
    if (dest.length !== 10) {
      return { success: false, error: 'Invalid destination. Must be 10 digits.', errorCode: 'INVALID_MSISDN' };
    }
    // Destination: with country code 91; optional + prefix per doc (URL-encoded as %2B)
    const destinationWithCountryCode = `91${dest}`;
    const destinationParam = process.env.SMS_DESTINATION_WITH_PLUS === 'true' ? `%2B${destinationWithCountryCode}` : destinationWithCountryCode;
    // Message: URL-UTF-8 encoded per doc
    const encodedMessage = encodeURIComponent(message || '');
    const apiPath = '/bulksms/bulksms';
    const apiUrl = `${SMS_API_BASE_URL}${apiPath}`;
    const queryParams = [
      `username=${encodeURIComponent(SMS_USERNAME)}`,
      `password=${encodeURIComponent(SMS_PASSWORD)}`,
      `type=${Number(type)}`,
      `dlr=${Number(dlr)}`,
      `destination=${destinationParam}`,
      `source=${encodeURIComponent(source)}`,
      `message=${encodedMessage}`
    ];
    if (type === 4 && url) {
      queryParams.push(`url=${encodeURIComponent(url)}`);
    }
    if (OTP_ENTITY_ID && OTP_TEMPLATE_ID) {
      queryParams.push(`entityid=${OTP_ENTITY_ID}`);
      queryParams.push(`tempid=${OTP_TEMPLATE_ID}`);
    }
    const fullUrl = `${apiUrl}?${queryParams.join('&')}`;
    console.log('[BULK_SMS] Sending (SMSPLUS Bulk HTTP):', { destination: dest, type, dlr, messageLength: (message || '').length });
    const response = await axios.get(fullUrl, {
      timeout: 30000,
      headers: { 'Accept': '*/*', 'User-Agent': 'Node.js/BulkSMS' },
      validateStatus: (s) => s >= 200 && s < 500,
      maxRedirects: 0
    });
    const responseText = (response.data?.toString() || response.data || '').trim();
    if (responseText.startsWith('1701|')) {
      const parts = responseText.split('|');
      const cellNo = (parts[1] || '').trim();
      const messageId = (parts[2] || '').trim() || (cellNo.includes(':') ? cellNo.split(':').slice(1).join(':') : '');
      console.log('[BULK_SMS] Success 1701:', { destination: dest, cellNo, messageId });
      return { success: true, messageId: messageId || cellNo };
    }
    const errorCode = String(responseText.split('|')[0] || responseText.trim());
    const errorMessage = BULK_SMS_ERROR_MESSAGES[errorCode] || `SMS API error: ${errorCode}`;
    console.error('[BULK_SMS] API error:', { errorCode, errorMessage, rawResponse: responseText });
    return { success: false, error: errorMessage, errorCode, rawResponse: responseText };
  } catch (err) {
    console.error('[BULK_SMS] sendBulkSms error:', err.message);
    return {
      success: false,
      error: err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' ? 'Request timeout' : 'Failed to send SMS',
      errorCode: err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'NETWORK_ERROR'
    };
  }
}

module.exports = {
  generateOTP,
  validateOTP,
  sendBulkSms,
  normalizeMobileNumber
};
