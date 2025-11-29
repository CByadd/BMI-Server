// Token-based pairing system for Android-Client synchronization
const { v4: uuidv4 } = require('uuid');

// In-memory token store: token -> { screenId, bmiId, createdAt, expiresAt, clientId, androidId, state }
const tokenStore = new Map();

// Token expiration time (2 minutes)
const TOKEN_EXPIRY_MS = 2 * 60 * 1000;
// Token unused timeout (90 seconds - if not used within 90s, terminate)
const TOKEN_UNUSED_TIMEOUT_MS = 90 * 1000;

/**
 * Generate a new token for BMI flow
 */
function generateToken(screenId, bmiId) {
    const token = uuidv4();
    const now = Date.now();
    
    tokenStore.set(token, {
        screenId: String(screenId),
        bmiId: String(bmiId),
        createdAt: now,
        expiresAt: now + TOKEN_EXPIRY_MS,
        unusedTimeout: now + TOKEN_UNUSED_TIMEOUT_MS,
        clientId: null,
        androidId: null,
        state: 'pending', // pending, qr_scanned, payment_done, loading, bmi, processing, fortune, completed, expired
        lastActivity: now
    });
    
    console.log('[TOKEN] Generated token:', {
        token,
        screenId,
        bmiId,
        expiresAt: new Date(now + TOKEN_EXPIRY_MS).toISOString(),
        unusedTimeout: new Date(now + TOKEN_UNUSED_TIMEOUT_MS).toISOString()
    });
    
    // Cleanup expired tokens periodically
    cleanupExpiredTokens();
    
    return token;
}

/**
 * Validate and claim token (when client scans QR)
 */
function claimToken(token, clientId) {
    const tokenData = tokenStore.get(token);
    
    if (!tokenData) {
        console.log('[TOKEN] Token not found:', token);
        return { valid: false, error: 'token_not_found' };
    }
    
    const now = Date.now();
    
    // Check if token expired
    if (now > tokenData.expiresAt) {
        console.log('[TOKEN] Token expired:', token);
        tokenStore.delete(token);
        return { valid: false, error: 'token_expired' };
    }
    
    // Check if token unused timeout
    if (now > tokenData.unusedTimeout) {
        console.log('[TOKEN] Token unused timeout:', token);
        tokenStore.delete(token);
        return { valid: false, error: 'token_unused_timeout' };
    }
    
    // Claim token for client
    tokenData.clientId = clientId;
    tokenData.state = 'qr_scanned';
    tokenData.lastActivity = now;
    
    console.log('[TOKEN] Token claimed by client:', {
        token,
        clientId,
        screenId: tokenData.screenId,
        bmiId: tokenData.bmiId
    });
    
    return { valid: true, tokenData };
}

/**
 * Update token state (when Android changes screen)
 */
function updateTokenState(token, state, androidId = null) {
    const tokenData = tokenStore.get(token);
    
    if (!tokenData) {
        console.log('[TOKEN] Token not found for state update:', token);
        return false;
    }
    
    tokenData.state = state;
    tokenData.lastActivity = Date.now();
    
    if (androidId) {
        tokenData.androidId = androidId;
    }
    
    console.log('[TOKEN] Token state updated:', {
        token,
        state,
        androidId,
        screenId: tokenData.screenId
    });
    
    return true;
}

/**
 * Get token by screenId and bmiId
 */
function getTokenByBMI(screenId, bmiId) {
    for (const [token, data] of tokenStore.entries()) {
        if (data.screenId === String(screenId) && data.bmiId === String(bmiId)) {
            return { token, tokenData: data };
        }
    }
    return null;
}

/**
 * Get token data
 */
function getToken(token) {
    return tokenStore.get(token);
}

/**
 * Check if Android is ready (has changed to expected state)
 */
function isAndroidReady(token, expectedState) {
    const tokenData = tokenStore.get(token);
    if (!tokenData) return false;
    
    const stateOrder = ['pending', 'qr_scanned', 'payment_done', 'loading', 'bmi', 'processing', 'fortune'];
    const currentIndex = stateOrder.indexOf(tokenData.state);
    const expectedIndex = stateOrder.indexOf(expectedState);
    
    return currentIndex >= expectedIndex;
}

/**
 * Cleanup expired tokens
 */
function cleanupExpiredTokens() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [token, data] of tokenStore.entries()) {
        if (now > data.expiresAt || now > data.unusedTimeout) {
            tokenStore.delete(token);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log('[TOKEN] Cleaned up', cleaned, 'expired tokens');
    }
}

/**
 * Cleanup old tokens periodically
 */
setInterval(cleanupExpiredTokens, 5000); // Every 5 seconds

module.exports = {
    generateToken,
    claimToken,
    updateTokenState,
    getTokenByBMI,
    getToken,
    isAndroidReady,
    TOKEN_EXPIRY_MS,
    TOKEN_UNUSED_TIMEOUT_MS
};

