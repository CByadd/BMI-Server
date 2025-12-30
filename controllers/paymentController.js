const Razorpay = require('razorpay');
const crypto = require('crypto');

// Validate Razorpay credentials
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error('[RAZORPAY] WARNING: Razorpay credentials not configured!');
  console.error('[RAZORPAY] RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? 'SET' : 'MISSING');
  console.error('[RAZORPAY] RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? 'SET' : 'MISSING');
}

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
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
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('[RAZORPAY] Missing credentials');
      return res.status(500).json({
        error: 'Payment configuration error',
        details: 'Razorpay credentials not configured'
      });
    }

    const options = {
      amount: amountInPaise,
      currency: currency,
      receipt: receipt || `receipt_${Date.now()}`,
      notes: notes || {},
    };

    console.log('[RAZORPAY] Creating order with options:', { ...options, notes: '***' });

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

    // Handle Razorpay API errors
    if (error.statusCode) {
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
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

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
    const keyId = process.env.RAZORPAY_KEY_ID;
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

