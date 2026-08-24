const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegram_id: { type: String, unique: true },
    name: String,
    username: String,
    balance: { type: Number, default: 0 },           // ዋና — Deposit/Win/Gift — WITHDRAW ይቻላል
    bonus_balance: { type: Number, default: 0 },     // ቦነስ — ጨዋታ ብቻ
    hasUsedBonus: { type: Boolean, default: false },
    phone: String,
    wins_count: { type: Number, default: 0 },
    history: { type: [mongoose.Schema.Types.Mixed], default: [] },
    is_agent: { type: Boolean, default: false },
    agent_id: { type: String, default: null },
    agent_balance: { type: Number, default: 0 },
    role: { type: String, default: 'player' }
});

module.exports = mongoose.model('User', userSchema);
