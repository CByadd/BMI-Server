// ============================================
// RAZORPAY IMPLEMENTATION (COMMENTED OUT)
// ============================================
// const Razorpay = require('razorpay');
// const crypto = require('crypto');

// // Validate Razorpay credentials
// const keyId = process.env.RAZORPAY_KEY_ID?.trim();
// const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

// if (!keyId || !keySecret) {
//   console.error('[RAZORPAY] WARNING: Razorpay credentials not configured!');
//   console.error('[RAZORPAY] RAZORPAY_KEY_ID:', keyId ? 'SET' : 'MISSING');
//   console.error('[RAZORPAY] RAZORPAY_KEY_SECRET:', keySecret ? 'SET' : 'MISSING');
// } else {
//   // Log key info without exposing secrets
//   console.log('[RAZORPAY] Credentials loaded:');
//   console.log('[RAZORPAY] Key ID:', keyId.substring(0, 10) + '...' + keyId.substring(keyId.length - 4));
//   console.log('[RAZORPAY] Key Secret:', keySecret.substring(0, 4) + '...' + keySecret.substring(keySecret.length - 4));
//   console.log('[RAZORPAY] Key Type:', keyId.startsWith('rzp_live_') ? 'LIVE' : keyId.startsWith('rzp_test_') ? 'TEST' : 'UNKNOWN');
// }

// // Initialize Razorpay instance
// const razorpay = new Razorpay({
//   key_id: keyId,
//   key_secret: keySecret,
// });

// ============================================
// MOCK PAYMENT IMPLEMENTATION
// ============================================
const MOCK_PAYMENT_MODE = process.env.MOCK_PAYMENT_MODE === 'true' || process.env.MOCK_PAYMENT_MODE === '1' || true; // Default to true
const crypto = require('crypto');

// In-memory store for mock orders (for verification)
const mockOrderStore = new Map();

console.log('[PAYMENT] 🧪 MOCK PAYMENT MODE ENABLED');
console.log('[PAYMENT] 🧪 All payments will be automatically approved');

/**
 * POST /api/payment/create-order
 * Create a mock payment order (Razorpay implementation commented out)
 */
exports.createOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    console.log('[PAYMENT] 🧪 MOCK: Create order request:', { amount, currency, receipt, notes });

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

    // Minimum amount is 1 INR
    if (amountNum < 1) {
      return res.status(400).json({ 
        error: 'Amount too small',
        details: 'Minimum payment amount is ₹1'
      });
    }

    // Convert amount to paise (smallest currency unit for INR)
    const amountInPaise = Math.round(amountNum * 100);

    // Generate mock order ID
    const mockOrderId = `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const receiptValue = receipt || `rcpt${Date.now()}`;

    // Store order in memory for verification
    mockOrderStore.set(mockOrderId, {
      amount: amountInPaise,
      currency: currency,
      receipt: receiptValue,
      notes: notes || {},
      createdAt: Date.now(),
      status: 'created'
    });

    console.log('[PAYMENT] 🧪 MOCK: Order created successfully:', mockOrderId);

    res.json({
      ok: true,
      order: {
        id: mockOrderId,
        amount: amountInPaise,
        currency: currency,
        receipt: receiptValue,
        status: 'created',
      },
      mockMode: true
    });

    // ============================================
    // RAZORPAY IMPLEMENTATION (COMMENTED OUT)
    // ============================================
    // console.log('[RAZORPAY] Create order request:', { amount, currency, receipt, notes });
    // // ... rest of Razorpay code ...
    // const order = await razorpay.orders.create(options);
    // res.json({ ok: true, order: { ... } });
  } catch (error) {
    console.error('[PAYMENT] 🧪 MOCK: Create order error:', error);
    res.status(500).json({
      error: 'Failed to create order',
      message: error.message,
      details: 'An unexpected error occurred while creating the payment order'
    });
  }
};

/**
 * POST /api/payment/verify
 * Verify mock payment (Razorpay implementation commented out)
 * Also triggers payment success notification to Android if bmiId and userId are in order notes
 */
exports.verifyPayment = async (req, res, io, bmiFlowController) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const paymentVerifyTime = new Date().toISOString();

    // ========== PAYMENT FLOW LOGGING - PAYMENT VERIFICATION ==========
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('[PAYMENT_FLOW] 🔐 PAYMENT VERIFICATION STARTED');
    console.log('[PAYMENT_FLOW] Timestamp:', paymentVerifyTime);
    console.log('[PAYMENT_FLOW] Order ID:', razorpay_order_id);
    console.log('[PAYMENT_FLOW] Payment ID:', razorpay_payment_id);
    console.log('[PAYMENT_FLOW] Request IP:', req.ip || req.connection.remoteAddress);
    console.log('═══════════════════════════════════════════════════════════════');

    console.log('[PAYMENT] 🧪 MOCK: Verify payment request:', { 
      order_id: razorpay_order_id, 
      payment_id: razorpay_payment_id 
    });

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({
        error: 'Missing required payment verification fields',
      });
    }

    // SIMPLE MOCK: Always verify successfully - no store check needed
    // This works in serverless environments where in-memory store doesn't persist
    console.log('[PAYMENT] 🧪 MOCK: Simple mock mode - accepting all payments');
    console.log('[PAYMENT] 🧪 MOCK: Payment verified successfully:', {
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id
    });

    // Automatically trigger payment success notification to Android after payment verification
    // This ensures Android receives confirmation immediately after payment verification
    console.log('[PAYMENT_FLOW] Checking if order exists in store:', razorpay_order_id, 'Exists:', mockOrderStore.has(razorpay_order_id));
    if (mockOrderStore.has(razorpay_order_id) && io && bmiFlowController) {
      const order = mockOrderStore.get(razorpay_order_id);
      console.log('[PAYMENT_FLOW] Order found in store:', JSON.stringify(order, null, 2));
      const notes = order.notes || {};
      const userId = notes.userId;
      const screenId = notes.screenId;
      let bmiId = notes.bmiId;
      
      // If bmiId is not in notes, try to find the most recent unlinked BMI record for this screen
      if (!bmiId && userId && screenId) {
        try {
          const prisma = require('../db');
          // Find the most recent BMI record for this screen that doesn't have a userId yet
          const recentBMI = await prisma.bMI.findFirst({
            where: {
              screenId: String(screenId),
              userId: null // Not yet linked to a user
            },
            orderBy: {
              timestamp: 'desc'
            }
          });
          
          if (recentBMI) {
            bmiId = recentBMI.id;
            console.log('[PAYMENT] Found recent BMI record for screen:', screenId, 'bmiId:', bmiId);
          } else {
            console.log('[PAYMENT] No unlinked BMI record found for screen:', screenId);
          }
        } catch (dbError) {
          console.error('[PAYMENT] Error finding BMI record for auto-notification:', dbError);
        }
      }
      
      // Trigger payment success notification if we have both userId and bmiId
      if (bmiId && userId) {
        console.log('[PAYMENT_FLOW] 🔔 Auto-triggering payment success notification');
        console.log('[PAYMENT_FLOW] BMI ID:', bmiId);
        console.log('[PAYMENT_FLOW] User ID:', userId);
        console.log('[PAYMENT] Auto-triggering payment success notification for bmiId:', bmiId, 'userId:', userId);
        console.log('[PAYMENT_FLOW] Order object:', JSON.stringify(order, null, 2));
        try {
          // Get payment amount from order (convert from paise to rupees)
          const paymentAmountInRupees = order.amount ? order.amount / 100 : null;
          console.log('[PAYMENT_FLOW] Payment amount from order:', paymentAmountInRupees, 'rupees (from order amount:', order.amount, 'paise)');
          
          // Call payment success handler directly
          const mockReq = {
            body: {
              userId: userId,
              bmiId: bmiId,
              appVersion: 'f1', // Default to f1 for F1/F3 flows (will be normalized in paymentSuccess)
              paymentAmount: paymentAmountInRupees // Pass actual payment amount paid by user
            }
          };
          console.log('[PAYMENT_FLOW] Mock request body being passed to paymentSuccess:', JSON.stringify(mockReq.body, null, 2));
          const mockRes = {
            json: (data) => {
              console.log('[PAYMENT_FLOW] ✅ Payment success notification triggered successfully');
              console.log('[PAYMENT] Auto payment success notification result:', data);
            },
            status: (code) => ({ json: (data) => {
              console.log('[PAYMENT_FLOW] ❌ Payment success notification failed:', code);
              console.log('[PAYMENT] Auto payment success notification error:', code, data);
            }})
          };
          await bmiFlowController.paymentSuccess(mockReq, mockRes, io);
        } catch (notifyError) {
          console.log('[PAYMENT_FLOW] ❌ Error auto-triggering payment success notification:', notifyError.message);
          console.error('[PAYMENT] Error auto-triggering payment success notification:', notifyError);
          // Don't fail the verification if notification fails
        }
      } else {
        console.log('[PAYMENT_FLOW] ⚠️ Cannot auto-trigger payment success - missing bmiId or userId');
        console.log('[PAYMENT_FLOW] BMI ID:', bmiId, 'User ID:', userId);
        console.log('[PAYMENT] Cannot auto-trigger payment success - missing bmiId or userId. bmiId:', bmiId, 'userId:', userId);
      }
    }

    console.log('[PAYMENT_FLOW] ✅ Payment verification completed successfully');
    console.log('[PAYMENT_FLOW] Verified: true, Payment ID:', razorpay_payment_id, 'Order ID:', razorpay_order_id);

    return res.json({
      ok: true,
      verified: true,
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      mockMode: true
    });

    // ============================================
    // RAZORPAY IMPLEMENTATION (COMMENTED OUT)
    // ============================================
    // // Create the signature string
    // const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    // // Generate the expected signature
    // const generatedSignature = crypto
    //   .createHmac('sha256', keySecret)
    //   .update(text)
    //   .digest('hex');
    // // Compare signatures
    // const isSignatureValid = generatedSignature === razorpay_signature;
    // if (isSignatureValid) {
    //   res.json({ ok: true, verified: true, ... });
    // } else {
    //   res.status(400).json({ ok: false, verified: false, ... });
    // }
  } catch (error) {
    console.error('[PAYMENT] 🧪 MOCK: Verify payment error:', error);
    res.status(500).json({
      error: 'Failed to verify payment',
      message: error.message,
    });
  }
};

/**
 * GET /api/payment/key
 * Get mock payment key (Razorpay implementation commented out)
 */
exports.getKey = (req, res) => {
  try {
    // Return a mock key for frontend compatibility
    const mockKeyId = 'rzp_mock_' + Math.random().toString(36).substring(2, 15);
    
    console.log('[PAYMENT] 🧪 MOCK: Returning mock key ID');
    
    res.json({
      ok: true,
      key_id: mockKeyId,
      mockMode: true
    });

    // ============================================
    // RAZORPAY IMPLEMENTATION (COMMENTED OUT)
    // ============================================
    // if (!keyId) {
    //   return res.status(500).json({
    //     error: 'Razorpay key not configured',
    //   });
    // }
    // res.json({
    //   ok: true,
    //   key_id: keyId,
    // });
  } catch (error) {
    console.error('[PAYMENT] 🧪 MOCK: Get key error:', error);
    res.status(500).json({
      error: 'Failed to get payment key',
      message: error.message,
    });
  }
};

