const tokenManager = require('./tokenManager');

function getTokenFromHeader(req) {
    const headerToken = req.headers['x-bmi-token'] || req.headers['x-bmi-session'];
    return typeof headerToken === 'string' ? headerToken : '';
}

exports.sessionClaim = (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!token) return res.status(400).json({ error: 'token_required' });
        const clientId = req.headers['x-client-id'] || req.ip || 'unknown';
        const result = tokenManager.claimToken(token, clientId);
        if (!result.valid) {
            return res.status(400).json({ error: result.error });
        }
        return res.json({
            ok: true,
            token: result.tokenData,
            expiresAt: result.tokenData.expiresAt
        });
    } catch (e) {
        console.error('[SESSION] Claim error:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
};

exports.sessionStatus = (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!token) return res.status(400).json({ error: 'token_required' });
        const tokenData = tokenManager.getToken(token);
        if (!tokenData) return res.status(404).json({ error: 'token_not_found' });
        const now = Date.now();
        const isExpired = now > tokenData.expiresAt;
        const isUnusedTimeout = now > tokenData.unusedTimeout;
        return res.json({
            ok: true,
            token: {
                screenId: tokenData.screenId,
                bmiId: tokenData.bmiId,
                state: tokenData.state,
                isExpired,
                isUnusedTimeout,
                expiresAt: tokenData.expiresAt,
                lastActivity: tokenData.lastActivity
            }
        });
    } catch (e) {
        console.error('[SESSION] Status error:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
};
























