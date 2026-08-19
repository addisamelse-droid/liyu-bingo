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
    }
});

module.exports = mongoose.model('User', userSchema);