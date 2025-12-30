const Razorpay = require('razorpay');
const crypto = require('crypto');

// Validate Razorpay credentials
const keyId = process.env.RAZORPAY_KEY_ID?.trim();
const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

if (!keyId || !keySecret) {
  console.error('[RAZORPAY] WARNING: Razorpay credentials not configured!');
  console.error('[RAZORPAY] RAZORPAY_KEY_ID:', keyId ? 'SET' : 'MISSING');
  console.error('[RAZORPAY] RAZORPAY_KEY_SECRET:', keySecret ? 'SET' : 'MISSING');
} else {
  // Log key info without exposing secrets
  console.log('[RAZORPAY] Credentials loaded:');
  console.log('[RAZORPAY] Key ID:', keyId.substring(0, 10) + '...' + keyId.substring(keyId.length - 4));
  console.log('[RAZORPAY] Key Secret:', keySecret.substring(0, 4) + '...' + keySecret.substring(keySecret.length - 4));
  console.log('[RAZORPAY] Key Type:', keyId.startsWith('rzp_live_') ? 'LIVE' : keyId.startsWith('rzp_test_') ? 'TEST' : 'UNKNOWN');
}

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});

/**
 * POST /api/payment/create-order
 * Create a Razorpay order
 */
exports.createOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    console.log('[RAZORPAY] Create order request:', { amount, currency, receipt, notes });

    // Validate amount
    if (amount === null || amount === undefined || amount === '') {
      return res.status(400).json({ 
        error: 'Amount is required',
        details: 'Please provide a valid payment amount'
      });
    }

    // Convert to number and validate
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ 
        error: 'Invalid amount',
        details: `Amount must be a positive number. Received: ${amount}`
      });
    }

    // Razorpay minimum amount is 1 INR (100 paise)
    if (amountNum < 1) {
      return res.status(400).json({ 
        error: 'Amount too small',
        details: 'Minimum payment amount is ₹1'
      });
    }

    // Convert amount to paise (smallest currency unit for INR)
    const amountInPaise = Math.round(amountNum * 100);

    // Validate Razorpay credentials
    if (!keyId || !keySecret) {
      console.error('[RAZORPAY] Missing credentials');
      return res.status(500).json({
        error: 'Payment configuration error',
        details: 'Razorpay credentials not configured'
      });
    }

    // Validate and truncate receipt to max 40 characters (Razorpay requirement)
    let receiptValue = receipt || `rcpt${Date.now()}`;
    if (receiptValue.length > 40) {
      console.warn(`[RAZORPAY] Receipt too long (${receiptValue.length} chars), truncating to 40 chars`);
      receiptValue = receiptValue.substring(0, 40);
    }

    const options = {
      amount: amountInPaise,
      currency: currency,
      receipt: receiptValue,
      notes: notes || {},
    };

    console.log('[RAZORPAY] Creating order with options:', { ...options, notes: '***' });
    console.log('[RAZORPAY] Using Key ID:', keyId ? (keyId.substring(0, 10) + '...' + keyId.substring(keyId.length - 4)) : 'MISSING');
    console.log('[RAZORPAY] Key Secret length:', keySecret ? keySecret.length : 0);

    const order = await razorpay.orders.create(options);

    console.log('[RAZORPAY] Order created successfully:', order.id);

    res.json({
      ok: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
      },
    });
  } catch (error) {
    console.error('[RAZORPAY] Create order error:', error);
    console.error('[RAZORPAY] Error details:', {
      message: error.message,
      statusCode: error.statusCode,
      error: error.error,
      description: error.description
    });
    
    // Additional diagnostic info
    console.error('[RAZORPAY] Diagnostic info:');
    console.error('[RAZORPAY] - Key ID present:', !!keyId);
    console.error('[RAZORPAY] - Key Secret present:', !!keySecret);
    console.error('[RAZORPAY] - Key ID length:', keyId ? keyId.length : 0);
    console.error('[RAZORPAY] - Key Secret length:', keySecret ? keySecret.length : 0);
    console.error('[RAZORPAY] - Key ID prefix:', keyId ? keyId.substring(0, 8) : 'N/A');

    // Handle Razorpay API errors
    if (error.statusCode) {
      // Provide more helpful error message for authentication failures
      if (error.statusCode === 401) {
        return res.status(401).json({
          error: 'Razorpay authentication failed',
          message: 'Invalid Razorpay credentials. Please check your RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the .env file.',
          details: 'The provided credentials do not match or are incorrect. Ensure you are using the correct key_id and key_secret from your Razorpay dashboard.',
          hint: 'Make sure the key_id and key_secret are from the same Razorpay account and match (test keys with test keys, live keys with live keys).'
        });
      }
      
      return res.status(error.statusCode).json({
        error: 'Razorpay API error',
        message: error.description || error.message,
        details: error.error || 'Failed to create payment order'
      });
    }

    res.status(500).json({
      error: 'Failed to create order',
      message: error.message,
      details: 'An unexpected error occurred while creating the payment order'
    });
  }
};

/**
 * POST /api/payment/verify
 * Verify Razorpay payment signature
 */
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        error: 'Missing required payment verification fields',
      });
    }

    // Create the signature string
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;

    // Generate the expected signature
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(text)
      .digest('hex');

    // Compare signatures
    const isSignatureValid = generatedSignature === razorpay_signature;

    if (isSignatureValid) {
      res.json({
        ok: true,
        verified: true,
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
      });
    } else {
      res.status(400).json({
        ok: false,
        verified: false,
        error: 'Invalid payment signature',
      });
    }
  } catch (error) {
    console.error('[RAZORPAY] Verify payment error:', error);
    res.status(500).json({
      error: 'Failed to verify payment',
      message: error.message,
    });
  }
};

/**
 * GET /api/payment/key
 * Get Razorpay key ID for frontend
 */
exports.getKey = (req, res) => {
  try {
    if (!keyId) {
      return res.status(500).json({
        error: 'Razorpay key not configured',
      });
    }
    res.json({
      ok: true,
      key_id: keyId,
    });
  } catch (error) {
    console.error('[RAZORPAY] Get key error:', error);
    res.status(500).json({
      error: 'Failed to get Razorpay key',
      message: error.message,
    });
  }
};

