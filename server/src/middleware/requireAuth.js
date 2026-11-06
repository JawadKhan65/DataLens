const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });

  try {
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'local-development-secret-do-not-use-in-production');
    if (!secret) return res.status(500).json({ message: 'Authentication is not configured on this server.' });
    const payload = jwt.verify(token, secret);
    req.userId = payload.userId;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
}

module.exports = requireAuth;
