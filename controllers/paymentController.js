const Razorpay = require('razorpay');
const crypto = require('crypto');

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

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // Convert amount to paise (smallest currency unit for INR)
    const amountInPaise = Math.round(amount * 100);

    const options = {
      amount: amountInPaise,
      currency: currency,
      receipt: receipt || `receipt_${Date.now()}`,
      notes: notes || {},
    };

    const order = await razorpay.orders.create(options);

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
    res.status(500).json({
      error: 'Failed to create order',
      message: error.message,
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

