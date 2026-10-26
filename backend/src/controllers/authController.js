const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const generateToken = require('../utils/generateToken');

// POST /api/auth/register
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, college, course, year } = req.body;
  if (await User.findOne({ email })) throw new ApiError(409, 'An account with this email already exists.');
  const user = await User.create({ name, email, password, college, course, year });
  res.status(201).json({ success: true, data: { token: generateToken(user._id), user } });
});

// POST /api/auth/login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password +role');
  // Same message for unknown email / wrong password so accounts can't be enumerated.
  if (!user || !(await user.matchPassword(password))) throw new ApiError(401, 'Invalid email or password.');
  res.json({ success: true, data: { token: generateToken(user._id), user } });
});

// GET /api/auth/me
exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});
