const bcrypt = require("bcrypt");

const SALT_ROUNDS = 10;

/**
 * Helper reusable untuk hash & compare password.
 * Dipakai authService (register/login) dan mana pun yang butuh cek password.
 */
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function comparePassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

module.exports = { hashPassword, comparePassword };
