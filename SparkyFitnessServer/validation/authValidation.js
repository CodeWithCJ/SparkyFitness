const { body } = require('express-validator');

const registerValidation = [
  body('email').isEmail().withMessage('Invalid email address'),
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),
  body('full_name').notEmpty().withMessage('Full name is required'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Invalid email address'),
  body('password').notEmpty().withMessage('Password is required'),
];

const forgotPasswordValidation = [
  body('email').isEmail().withMessage('Invalid email address'),
];

const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),
];

const mfaValidation = [
  body('code').notEmpty().withMessage('MFA code is required').isLength({ min: 6, max: 6 }).withMessage('MFA code must be 6 digits.'),
  body('userId').optional().isUUID().withMessage('Invalid User ID format.'),
];

const verifyRecoveryCodeValidation = [
  body('code').notEmpty().withMessage('Recovery code is required').isLength({ min: 16, max: 16 }).withMessage('Recovery code must be 16 characters long.'),
  body('userId').isUUID().withMessage('User ID is required and must be a valid UUID.'),
];

const emailMfaValidation = [
  body('code').notEmpty().withMessage('MFA code is required').isLength({ min: 6, max: 6 }).withMessage('MFA code must be 6 digits.'),
];

const magicLinkRequestValidation = [
  body('email').isEmail().withMessage('Invalid email address'),
];

module.exports = {
  registerValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  mfaValidation,
  emailMfaValidation,
  verifyRecoveryCodeValidation,
  magicLinkRequestValidation,
};