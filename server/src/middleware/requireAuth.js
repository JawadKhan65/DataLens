const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'development-secret-change-me');
    req.userId = payload.userId;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
}

module.exports = requireAuth;
