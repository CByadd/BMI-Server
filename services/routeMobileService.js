const axios = require('axios');

// Route Mobile API Configuration
const ROUTE_MOBILE_CONFIG = {
  username: 'kaapistr',
  password: '1L(d!i2O',
  source: process.env.ROUTE_MOBILE_SOURCE || 'WELL2D', // Default sender ID
  otpLength: 6,
  otpExpiry: 300, // 5 minutes in seconds
  baseUrl: process.env.ROUTE_MOBILE_BASE_URL || 'http://api.route-mobile.com', // Update with actual Route Mobile API URL
};

/**
 * Generate OTP and send via Route Mobile SMS
 * @param {string} msisdn - Mobile number (10-15 digits)
 * @param {string} messageTemplate - Message template with %m for OTP placeholder
 * @returns {Promise<{success: boolean, messageId?: string, otp?: string, error?: string}>}
 */
async function generateOTP(msisdn, messageTemplate = null) {
  try {
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Default message template
    const msg = messageTemplate || `Your Well2Day verification code is %m. Valid for 5 minutes.`;
    
    // URL encode the message
    const encodedMsg = encodeURIComponent(msg);
    
    // Clean mobile number (remove + and spaces)
    const cleanMsisdn = msisdn.replace(/[\s\+\-]/g, '');
    
    // Build API URL
    const apiUrl = `${ROUTE_MOBILE_CONFIG.baseUrl}/OtpApi/otpgenerate?username=${ROUTE_MOBILE_CONFIG.username}&password=${encodeURIComponent(ROUTE_MOBILE_CONFIG.password)}&msisdn=${cleanMsisdn}&msg=${encodedMsg}&source=${ROUTE_MOBILE_CONFIG.source}&otplen=${ROUTE_MOBILE_CONFIG.otpLength}&exptime=${ROUTE_MOBILE_CONFIG.otpExpiry}`;
    
    console.log('[ROUTE_MOBILE] Sending OTP request:', { msisdn: cleanMsisdn, url: apiUrl.replace(ROUTE_MOBILE_CONFIG.password, '***') });
    
    // Make API call
    const response = await axios.get(apiUrl, {
      timeout: 10000, // 10 second timeout
    });
    
    const responseText = response.data;
    console.log('[ROUTE_MOBILE] OTP Response:', responseText);
    
    // Parse response
    // Success format: "1701|MSISDN:MessageID"
    if (responseText && responseText.startsWith('1701|')) {
      const parts = responseText.split('|');
      const messageId = parts[1] ? parts[1].split(':')[1] : null;
      
      return {
        success: true,
        messageId: messageId,
        otp: otp, // Return OTP for server-side validation
      };
    } else {
      // Error codes
      const errorCode = responseText.split('|')[0] || responseText;
      const errorMessage = getErrorMessage(errorCode);
      
      return {
        success: false,
        error: errorMessage || `Error code: ${errorCode}`,
      };
    }
  } catch (error) {
    console.error('[ROUTE_MOBILE] OTP Generation Error:', error.message);
    
    // Handle axios errors
    if (error.response) {
      return {
        success: false,
        error: `API Error: ${error.response.status} - ${error.response.statusText}`,
      };
    } else if (error.request) {
      return {
        success: false,
        error: 'Network Error: Unable to reach Route Mobile API',
      };
    } else {
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  }
}

/**
 * Validate OTP using Route Mobile API
 * @param {string} msisdn - Mobile number
 * @param {string} otp - OTP to validate
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function validateOTP(msisdn, otp) {
  try {
    // Clean mobile number
    const cleanMsisdn = msisdn.replace(/[\s\+\-]/g, '');
    
    // Build API URL
    const apiUrl = `${ROUTE_MOBILE_CONFIG.baseUrl}/OtpApi/checkotp?username=${ROUTE_MOBILE_CONFIG.username}&password=${encodeURIComponent(ROUTE_MOBILE_CONFIG.password)}&msisdn=${cleanMsisdn}&otp=${otp}`;
    
    console.log('[ROUTE_MOBILE] Validating OTP:', { msisdn: cleanMsisdn });
    
    // Make API call
    const response = await axios.get(apiUrl, {
      timeout: 10000, // 10 second timeout
    });
    
    const responseText = String(response.data).trim();
    console.log('[ROUTE_MOBILE] OTP Validation Response:', responseText);
    
    // Success response: "101"
    if (responseText === '101') {
      return {
        success: true,
        message: 'OTP validated successfully',
      };
    } else {
      // Error codes
      const errorMessage = getValidationErrorMessage(responseText);
      
      return {
        success: false,
        error: errorMessage || `Validation failed: ${responseText}`,
      };
    }
  } catch (error) {
    console.error('[ROUTE_MOBILE] OTP Validation Error:', error.message);
    
    if (error.response) {
      return {
        success: false,
        error: `API Error: ${error.response.status} - ${error.response.statusText}`,
      };
    } else if (error.request) {
      return {
        success: false,
        error: 'Network Error: Unable to reach Route Mobile API',
      };
    } else {
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  }
}

/**
 * Get error message for OTP generation error codes
 */
function getErrorMessage(errorCode) {
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
    '1042': 'Explicit DND reject',
  };
  
  return errorMessages[errorCode] || `Error code: ${errorCode}`;
}

/**
 * Get error message for OTP validation error codes
 */
function getValidationErrorMessage(errorCode) {
  const errorMessages = {
    '102': 'OTP has expired',
    '103': 'Entry for OTP not found',
    '104': 'MSISDN not found',
    '1702': 'One of the parameter missing or OTP is not numeric',
    '1703': 'Authentication failed',
    '1706': 'Given destination is invalid',
  };
  
  return errorMessages[errorCode] || `Validation error: ${errorCode}`;
}

module.exports = {
  generateOTP,
  validateOTP,
};

