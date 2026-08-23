const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegram_id: { type: String, unique: true },
    name: String,
    username: String,
    balance: { type: Number, default: 0 },
    hasUsedBonus: { type: Boolean, default: false },
    phone: String,
    history: {
        type: [mongoose.Schema.Types.Mixed],
        default: []
    },
    // Agent system
    is_agent: { type: Boolean, default: false },
    agent_id: { type: String, default: null }, // የዚህ ተጫዋች agent telegram_id
    agent_balance: { type: Number, default: 0 }, // commission ቀሪ
    role: { type: String, default: 'player' } // player | agent | admin
});

module.exports = mongoose.model('User', userSchema);
