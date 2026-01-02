const { generateOTP, validateOTP } = require('../services/routeMobileService');
const prisma = require('../db');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '60d';

// Helper function to generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      mobile: user.mobile,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
};

/**
 * Check OTP configuration (for debugging)
 * GET /api/otp/config
 */
exports.checkConfig = async (req, res) => {
  try {
    const config = {
      hasBaseUrl: !!process.env.OTP_API_BASE_URL,
      baseUrl: process.env.OTP_API_BASE_URL || 'NOT SET',
      hasUsername: !!process.env.OTP_USERNAME,
      username: process.env.OTP_USERNAME ? 'SET' : 'NOT SET',
      hasPassword: !!process.env.OTP_PASSWORD,
      password: process.env.OTP_PASSWORD ? 'SET' : 'NOT SET',
      hasSource: !!process.env.OTP_SOURCE,
      source: process.env.OTP_SOURCE || 'NOT SET',
      otplen: process.env.OTP_LENGTH || 'NOT SET',
      exptime: process.env.OTP_EXPIRY || 'NOT SET',
      messageTemplate: process.env.OTP_MESSAGE_TEMPLATE || 'NOT SET'
    };

    res.json({
      success: true,
      config: config,
      allConfigured: config.hasBaseUrl && config.hasUsername && config.hasPassword && config.hasSource
    });
  } catch (error) {
    console.error('Check config error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check configuration' 
    });
  }
};

/**
 * Test SMS sending directly (for debugging)
 * POST /api/otp/test
 * Body: { mobile: string, message?: string }
 */
exports.testSMS = async (req, res) => {
  try {
    const SMS_API_BASE_URL = process.env.OTP_API_BASE_URL || 'http://sms6.rmlconnect.net:8080';
    const SMS_USERNAME = process.env.OTP_USERNAME || '';
    const SMS_PASSWORD = process.env.OTP_PASSWORD || '';
    const SMS_SOURCE = process.env.OTP_SOURCE || '';
    
    const { mobile, message: customMessage } = req.body;

    if (!mobile) {
      return res.status(400).json({ 
        success: false,
        error: 'Mobile number is required' 
      });
    }

    let cleanMobile = mobile.replace(/\D/g, '');
    
    // Remove country code if present (91 for India)
    if (cleanMobile.startsWith('91') && cleanMobile.length === 12) {
      cleanMobile = cleanMobile.substring(2);
    }
    
    if (cleanMobile.length !== 10) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid mobile number. Must be 10 digits.' 
      });
    }

    // Add country code 91 (India) for Route Mobile API
    const destinationWithCountryCode = `91${cleanMobile}`;

    // Use custom message or default test message
    const message = customMessage || 'Test SMS from Well2Day API. Please ignore.';
    const encodedMessage = encodeURIComponent(message);

    // Build URL exactly like PHP example
    const baseUrl = SMS_API_BASE_URL.replace(/\/$/, '');
    const apiUrl = `${baseUrl}/bulksms/bulksms`;
    
    // Build query parameters exactly as per BMI Stock app implementation
    // Format matches SerialConsoleActivity.java (lines 3125-3133)
    const queryParams = [
      `username=${SMS_USERNAME}`, // Not URL encoded in BMI app
      `password=${SMS_PASSWORD}`, // Not URL encoded in BMI app
      `type=0`, // Plain text
      `dlr=1`, // Delivery report required (BMI app uses dlr=1)
      `destination=${destinationWithCountryCode}`, // With country code, not URL encoded
      `source=${SMS_SOURCE}`, // Sender ID, not URL encoded
      `message=${encodedMessage}` // Only message is URL encoded
    ];
    
    // Add DLT parameters if configured (Required for India commercial SMS)
    const OTP_ENTITY_ID = process.env.OTP_ENTITY_ID || '';
    const OTP_TEMPLATE_ID = process.env.OTP_TEMPLATE_ID || '';
    if (OTP_ENTITY_ID && OTP_TEMPLATE_ID) {
      queryParams.push(`entityid=${OTP_ENTITY_ID}`); // Not URL encoded in BMI app
      queryParams.push(`tempid=${OTP_TEMPLATE_ID}`); // Not URL encoded in BMI app
    }
    
    const fullUrl = `${apiUrl}?${queryParams.join('&')}`;

    console.log('[TEST SMS] Sending test message:', {
      mobile: cleanMobile,
      message: message,
      url: fullUrl.replace(/password=[^&]*/, 'password=***')
    });

    try {
      const response = await axios.get(fullUrl, {
        timeout: 25000,
        headers: {
          'Accept': '*/*',
          'User-Agent': 'Node.js/SMS-Test'
        },
        validateStatus: (status) => status >= 200 && status < 500
      });

      const responseText = (response.data?.toString() || response.data || '').trim();
      
      console.log('[TEST SMS] Response:', responseText);

      if (responseText.startsWith('1701|')) {
        const parts = responseText.split('|');
        const cellAndId = parts[1] ? parts[1].split(':') : [];
        
        res.json({
          success: true,
          message: 'SMS sent successfully',
          response: responseText,
          messageId: cellAndId[1] || '',
          cellNumber: cellAndId[0] || destinationWithCountryCode,
          destinationUsed: destinationWithCountryCode,
          note: 'SMS sent with country code (91). If still not received, check: 1) Sender ID approval, 2) DND status, 3) Account credits, 4) Network connectivity'
        });
      } else {
        const errorMessages = {
          '1702': 'Invalid URL or missing parameter',
          '1703': 'Invalid username or password',
          '1706': 'Invalid destination (mobile number)',
          '1707': 'Invalid source (sender ID not approved)',
          '1025': 'Insufficient credit',
          '1032': 'DND reject (Do Not Disturb - number blocked)',
          '1028': 'Spam message detected',
          '1709': 'User validation failed'
        };

        res.status(400).json({
          success: false,
          error: errorMessages[responseText] || 'Unknown error',
          errorCode: responseText,
          note: 'Check Route Mobile account settings and sender ID approval'
        });
      }
    } catch (error) {
      console.error('[TEST SMS] Error:', error.message);
      res.status(500).json({
        success: false,
        error: error.response ? error.response.data : error.message
      });
    }
  } catch (error) {
    console.error('Test SMS error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to test SMS' 
    });
  }
};

/**
 * Generate and send OTP
 * POST /api/otp/generate
 * Body: { mobile: string }
 */
exports.generateOTP = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ 
        success: false,
        error: 'Mobile number is required' 
      });
    }

    // Clean mobile number (remove spaces, dashes, etc.)
    const cleanMobile = mobile.replace(/\D/g, '');

    // Validate mobile number format (should be 10 digits for India)
    if (cleanMobile.length !== 10) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid mobile number. Must be 10 digits.' 
      });
    }

    // Generate and send OTP
    const result = await generateOTP(cleanMobile);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        rawResponse: result.rawResponse || result.response, // Include raw API response for debugging
        note: 'Check server logs for detailed error information'
      });
    }

    // Return success response with server confirmation
    // Server response format: "1701|919443932288:message-id" means message was submitted successfully
    const isMock = result.mockMode || result.isMock || false;
    res.json({
      success: true,
      message: isMock ? 'OTP generated (Mock Mode - use 000000)' : 'OTP sent successfully',
      messageId: result.messageId,
      serverResponse: result.response, // Full server response: "1701|919443932288:message-id"
      verified: result.verified || false, // Server confirmed message submission
      cellNumber: result.cellNumber,
      mockMode: isMock, // Indicates if mock mode was used
      otp: isMock ? '000000' : undefined, // Show OTP in mock mode for testing
      note: isMock 
        ? '🧪 MOCK MODE: Use OTP "000000" to verify. No SMS was sent.'
        : (result.response 
          ? `Server confirmed: ${result.response}. If SMS not received, check: 1) Sender ID approval, 2) DND status, 3) Network connectivity`
          : 'SMS submitted. If not received, check sender ID approval and DND status.')
    });
  } catch (error) {
    console.error('Generate OTP error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate OTP' 
    });
  }
};

/**
 * Validate OTP and login/register user
 * POST /api/otp/verify
 * Body: { mobile: string, otp: string, name?: string }
 */
exports.verifyOTP = async (req, res) => {
  try {
    const { mobile, otp, name } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({ 
        success: false,
        error: 'Mobile number and OTP are required' 
      });
    }

    // Clean mobile number
    const cleanMobile = mobile.replace(/\D/g, '');

    // Validate mobile number format
    if (cleanMobile.length !== 10) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid mobile number. Must be 10 digits.' 
      });
    }

    // Validate OTP
    const validationResult = await validateOTP(cleanMobile, otp);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error,
        errorCode: validationResult.errorCode
      });
    }

    // OTP is valid, now handle user login/registration
    try {
      // Try to find existing user by mobile
      let user = await prisma.user.findFirst({
        where: { 
          mobile: cleanMobile 
        }
      });

      // If user doesn't exist and name is provided, create new user
      if (!user && name) {
        user = await prisma.user.create({
          data: {
            name: name.trim(),
            mobile: cleanMobile
          }
        });
      } else if (!user) {
        // User doesn't exist and no name provided
        return res.status(400).json({
          success: false,
          error: 'User not found. Please provide name for registration.'
        });
      } else if (user && name && name.trim()) {
        // User exists - update name if provided and different
        const trimmedName = name.trim();
        if (user.name !== trimmedName) {
          const oldName = user.name;
          user = await prisma.user.update({
            where: { id: user.id },
            data: { name: trimmedName }
          });
          console.log('[OTP] Updated user name:', { userId: user.id, oldName, newName: trimmedName });
        }
      }

      // Generate JWT token
      const token = generateToken(user);

      // Return user data and token
      res.json({
        success: true,
        message: 'OTP verified successfully',
        token,
        user: {
          id: user.id,
          name: user.name,
          mobile: user.mobile,
          userId: user.id // For compatibility with existing client code
        }
      });
    } catch (dbError) {
      console.error('Database error during OTP verification:', dbError);
      res.status(500).json({
        success: false,
        error: 'Failed to process login'
      });
    }
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to verify OTP' 
    });
  }
};
