const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many sign-in attempts. Wait a few minutes and try again.' } });

router.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Database is unavailable. Start MongoDB and try again.' });
  next();
});

router.post('/register', authLimiter, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required.' });
  if (name.length > 60 || email.length > 254 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ message: 'Name or email is too long, or password exceeds the 72-byte security limit.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(409).json({ message: 'An account with this email already exists.' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword });
    res.status(201).json(createSession(user));
  } catch (error) {
    res.status(500).json({ message: 'Could not create your account.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  try {
    const user = await User.findOne({ email });
    const passwordMatches = user && await bcrypt.compare(password, user.password);
    if (!passwordMatches) return res.status(401).json({ message: 'Email or password is incorrect.' });
    res.json(createSession(user));
  } catch (error) {
    res.status(500).json({ message: 'Could not sign in right now.' });
  }
});

function createSession(user) {
  const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: '7d' });
  return { token, user: { id: user.id, name: user.name, email: user.email } };
}

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is not configured.');
  return 'local-development-secret-do-not-use-in-production';
}

module.exports = router;
