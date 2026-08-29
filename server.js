const express = require('express');
const app = express();
const http = require('http').createServer(app);

// 🟢 1. የኔትወርክ መረጋጋት ማስተካከያ (CORS እና Ping Timouts)
const io = require('socket.io')(http, {
    pingInterval: 15000,
    pingTimeout: 60000,
    cors: { origin: '*', methods: ['GET', 'POST'] },

    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000, 
    pingInterval: 25000  
});

const https = require('https');
const mongoose = require('mongoose');
const path = require('path'); 

// 🟢 User Model ን ከ models/user.js መጥሪያ
const User = require('./models/user');

const gameHistorySchema = new mongoose.Schema({
    gameId: Number,
    stake: Number,
    winners: [{ name: String, telegram_id: String, cards: [Number], prize: Number }],
    prizeTotal: Number,
    totalCards: Number,
    at: { type: Date, default: Date.now }
});
const GameHistory = mongoose.models.GameHistory || mongoose.model('GameHistory', gameHistorySchema);


// 🟢 Express Static Files & JSON Body Parser
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.get('/api/config', async (req, res) => {
    if (!BOT_USERNAME) await resolveBotUsername();
    res.json({
        ok: true,
        botUsername: BOT_USERNAME || null,
        webAppUrl: process.env.WEB_APP_URL || null
    });
});

// 🟢 🔊 የድምጽ (Sound) አቃፊ - ሁለት ቦታ ይመልከት
app.use('/sounds', express.static(path.join(__dirname, 'sounds')));
app.use('/sounds', express.static(path.join(__dirname, 'public', 'sounds')));

// 🟢 2. CONFIG - እዚህ የራስህን እሴቶች ማስገባት ትችላለህ (Render env ካለ ይመረጣል)
const HARDCODED_MONGO_URI = "mongodb+srv://addisamelse_db_user:ab26032011@cluster0.itkanfk.mongodb.net/?appName=Cluster0";       // ← MongoDB URLህን እዚህ ጻፍ
const HARDCODED_BOT_TOKEN = "8722297780:AAFoDXr0L58fI4l0pDXsv4K6BLir1tR8mV0";       // ← Bot Tokenህን እዚህ ጻፍ
const HARDCODED_ADMIN_CHAT_ID = "2134795751"; // ← Telegram IDህን እዚህ ጻፍ

const MONGO_URI = process.env.MONGO_URI || HARDCODED_MONGO_URI;
if (!MONGO_URI || MONGO_URI.startsWith("YOUR_")) {
    console.warn('⚠️ MONGO_URI is not set. Fill HARDCODED_MONGO_URI in server.js or set Render Environment Variable.');
}

let mongoUrl = (MONGO_URI && !MONGO_URI.startsWith("YOUR_")) ? MONGO_URI : 'mongodb://127.0.0.1:27017/liyu_bingo';
// database name ካልተገለጸ liyu_bingo እንዲጠቀም
if (mongoUrl.includes('mongodb.net') && !mongoUrl.includes('/liyu_bingo')) {
    if (mongoUrl.includes('mongodb.net/?')) {
        mongoUrl = mongoUrl.replace('mongodb.net/?', 'mongodb.net/liyu_bingo?');
    } else if (mongoUrl.endsWith('mongodb.net/') || mongoUrl.endsWith('mongodb.net')) {
        mongoUrl = mongoUrl.replace(/mongodb\.net\/?$/, 'mongodb.net/liyu_bingo');
    }
}

mongoose.connect(mongoUrl)
    .then(() => console.log('✅ Connected to MongoDB (liyu_bingo) successfully!'))
    .catch((err) => console.error('❌ Database Connection Error:', err));

// 🟢 Telegram Bot Token እና Admin Chat ID
const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN || HARDCODED_BOT_TOKEN; 
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || HARDCODED_ADMIN_CHAT_ID;
let BOT_USERNAME = (process.env.BOT_USERNAME || '').replace('@', '');

// Bot username ካልተሞላ → Telegram getMe ራስ-ሰር
function resolveBotUsername() {
    return new Promise((resolve) => {
        if (BOT_USERNAME) return resolve(BOT_USERNAME);
        const token = TELEGRAM_BOT_TOKEN;
        if (!token || String(token).startsWith('YOUR_')) return resolve('');
        const url = `https://api.telegram.org/bot${token}/getMe`;
        https.get(url, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => {
                try {
                    const j = JSON.parse(body);
                    if (j.ok && j.result && j.result.username) {
                        BOT_USERNAME = String(j.result.username).replace('@', '');
                        console.log('✅ Bot username auto:', BOT_USERNAME);
                    }
                } catch (e) {}
                resolve(BOT_USERNAME);
            });
        }).on('error', () => resolve(''));
    });
}
// delay until TELEGRAM_BOT_TOKEN is defined - call after const TELEGRAM_BOT_TOKEN


// 🟢 ቁጥሩን አይቶ B, I, N, G, O የሚለውን ፊደል የሚመልስ Helper Function
function userHasDeposit(user) {
    if (!user || !user.history) return false;
    return (user.history || []).some(h => h && h.type === 'Deposit' && (h.status === 'Approved' || h.status === 'Completed'));
}
function getPlayableBalance(user) {
    return (Number(user.balance) || 0) + (Number(user.bonus_balance) || 0);
}
/** ካርድ ክፍያ: መጀመሪያ bonus_balance ከዛ balance */
function deductPlayable(user, amount) {
    amount = Number(amount) || 0;
    let left = amount;
    const bonus = Number(user.bonus_balance) || 0;
    const fromBonus = Math.min(bonus, left);
    user.bonus_balance = bonus - fromBonus;
    left -= fromBonus;
    if (left > 0) {
        user.balance = (Number(user.balance) || 0) - left;
    }
    return amount;
}
function addRefundToBalance(user, amount) {
    // refund ወደ ዋና balance (withdrawable) — ቀላልና ፍትሃዊ
    user.balance = (Number(user.balance) || 0) + (Number(amount) || 0);
}
function histEntry(type, amount, extra = {}) {
    return {
        date: new Date().toLocaleString('en-GB', { hour12: false }),
        at: new Date(),
        type,
        amount,
        status: extra.status || 'Completed',
        ...extra
    };
}

function getBingoLetter(num) {
    if (num >= 1 && num <= 15) return 'B';
    if (num >= 16 && num <= 30) return 'I';
    if (num >= 31 && num <= 45) return 'N';
    if (num >= 46 && num <= 60) return 'G';
    if (num >= 61 && num <= 75) return 'O';
    return '';
}

// 🟢 የተጠቃሚ መረጃን ከ Database ለማግኘት የሚያስችል ተግባር
async function getUserData(socketId, telegramId = null) {
    try {
        let user = null;
        if (telegramId) {
            user = await User.findOne({ telegram_id: telegramId.toString() });
        }
        if (!user && socketId) {
            user = await User.findOne({ socketId: socketId });
        }
        return user;
    } catch (err) {
        console.error('Error fetching user:', err);
        return null;
    }
}

// 🟢 3. Telegram Profile Authentication API Route
app.post('/api/profile', async (req, res) => {
    try {
        const body = req.body || {};
        const tid = String(body.telegram_id || body.id || '').trim();
        if (!tid) return res.status(400).json({ ok: false, error: 'telegram_id required' });
        const pName = body.name || body.first_name || 'ተጫዋች';
        const pUsername = body.username || '';
        const agentRef = body.agent_id ? String(body.agent_id) : null;

        let user = await User.findOne({ telegram_id: tid });
        if (!user) {
            user = new User({
                telegram_id: tid,
                name: pName,
                username: pUsername,
                balance: 0,
                bonus_balance: 10,
                hasUsedBonus: false,
                history: [],
                agent_id: agentRef
            });
            await user.save();
        } else {
            if (agentRef && !user.agent_id && !user.is_agent && String(agentRef) !== tid) {
                user.agent_id = agentRef;
                await user.save();
            }
        }

        res.json({
            ok: true,
            player: {
                telegram_id: user.telegram_id,
                name: user.name,
                username: user.username,
                phone: user.phone,
                balance: Number(user.balance) || 0,
                bonus_balance: Number(user.bonus_balance) || 0,
                total_balance: getPlayableBalance(user),
                history: user.history || [],
                is_agent: !!user.is_agent,
                agent_id: user.agent_id || null,
                agent_balance: user.agent_balance || 0,
                wins_count: user.wins_count || 0,
                is_admin: String(user.telegram_id) === String(ADMIN_CHAT_ID).trim()
            }
        });
    } catch (error) {
        console.error('API Profile Error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// 🟢 4. Game Join HTTP API Route
app.post('/api/game/join', async (req, res) => {
    try {
        const { stake, telegram_id } = req.body;
        const stakeNum = parseInt(stake) || 10;
        
        res.json({ 
            ok: true, 
            game_code: `GAME-${stakeNum}-1001`,
            message: 'Successfully joined room', 
            stake: stakeNum 
        });
    } catch (error) {
        console.error('API Game Join Error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// 🟢 መልዕክት ወደ Telegram Admin መላኪያ ተግባር
function sendTelegramNotification(message, replyMarkup = null) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
    };

    if (replyMarkup) {
        payload.reply_markup = replyMarkup;
    }

    const data = JSON.stringify(payload);
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    const req = https.request(url, options, (res) => {
        res.on('data', () => {});
    });

    req.on('error', (error) => {
        console.error('Telegram Notification Error:', error);
    });

    req.write(data);
    req.end();
}

function answerTelegramCallback(callbackQueryId, text) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
    const data = JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text
    });

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    const req = https.request(url, options, (res) => {
        res.on('data', () => {});
    });

    req.on('error', (error) => {
        console.error('Telegram Callback Error:', error);
    });

    req.write(data);
    req.end();
}

async function processApproval(telegramId, amount, type = 'Deposit', callbackId = null) {
    try {
        const user = await getUserData(null, telegramId);
        if (user) {
            if (type === 'Deposit') {
                user.balance += amount;
            }

            if (user.history && user.history.length > 0) {
                const item = user.history.find(h => h.type === type && h.status === 'Pending');
                if (item) item.status = type === 'Withdraw' ? 'Completed' : 'Approved';
            }

            await user.save();

            io.to(`user_${user.telegram_id}`).emit('update_wallet', user.balance);
            io.to(`user_${user.telegram_id}`).emit('update_history', user.history);

            if (callbackId) answerTelegramCallback(callbackId, `✅ ${type} ${amount} ብር ጸድቋል!`);
            sendTelegramNotification(`✅ <b>${type} ${amount} ብር ለ ተጠቃሚ (ID: ${telegramId}) ተጸድቋል!</b>`);
        } else {
            if (callbackId) answerTelegramCallback(callbackId, '⚠️ ተጫዋቹ በዳታቤዝ አልተገኘም!');
        }
    } catch (err) {
        console.error('Error in processApproval:', err);
    }
}

async function processRejection(telegramId, amount = 0, type = 'Deposit', callbackId = null) {
    try {
        const user = await getUserData(null, telegramId);
        if (user) {
            if (type === 'Withdraw') {
                user.balance += amount;
            }

            if (user.history && user.history.length > 0) {
                const item = user.history.find(h => h.type === type && h.status === 'Pending');
                if (item) item.status = 'Rejected';
            }

            await user.save();

            io.to(`user_${user.telegram_id}`).emit('update_wallet', user.balance);
            io.to(`user_${user.telegram_id}`).emit('update_history', user.history);

            if (callbackId) answerTelegramCallback(callbackId, '❌ ጥያቄው ውድቅ ተደርጓል!');
            sendTelegramNotification(`❌ <b>የ ${type} ጥያቄ ውድቅ ተደርጓል!</b>`);
        } else {
            if (callbackId) answerTelegramCallback(callbackId, '⚠️ ተጫዋቹ አልተገኘም!');
        }
    } catch (err) {
        console.error('Error in processRejection:', err);
    }
}

// Telegram admin approvals are handled by main.py bot polling.
// 🔴 Rooms Setup
const rooms = {
    10: { stake: 10, players: {}, takenCards: [], drawnNumbers: [], isGameInProgress: false, timeLeft: 30, timerInterval: null, drawInterval: null, gameId: 1001 },
    20: { stake: 20, players: {}, takenCards: [], drawnNumbers: [], isGameInProgress: false, timeLeft: 30, timerInterval: null, drawInterval: null, gameId: 2001 },
    50: { stake: 50, players: {}, takenCards: [], drawnNumbers: [], isGameInProgress: false, timeLeft: 30, timerInterval: null, drawInterval: null, gameId: 5001 }
};

// 🟢 75-ቁጥር ቢንጎ ካርድ ማመንጪያ
function getServerCardNumbers(seed) {
    function pseudoRandom(s) {
        let x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    }

    let boardNumbers = [];
    let seedOffset = seed * 100;

    for (let col = 0; col < 5; col++) {
        let min = col * 15 + 1;
        let colNums = [];
        let step = 0;
        
        while (colNums.length < 5) {
            let rand = Math.floor(pseudoRandom(seedOffset + col * 10 + step) * 15) + min;
            if (!colNums.includes(rand)) {
                colNums.push(rand);
            }
            step++;
        }
        // Frontend ጋር እንዲገጣጠም ቁጥሮቹን sort አድርግ
        colNums.sort((a, b) => a - b);
        boardNumbers.push(colNums);
    }

    let flatArray = [];
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            if (col === 2 && row === 2) {
                flatArray.push("FREE");
            } else {
                flatArray.push(boardNumbers[col][row]);
            }
        }
    }
    return flatArray;
}

// 🟢 አንድ pattern ሙሉ መሆኑን ያረጋግጣል
function hasAnyWinPattern(cardNumbers, drawn) {
    const isDrawn = (val) => val === "FREE" || drawn.includes(Number(val));
    const grid = [];
    for (let i = 0; i < 5; i++) {
        grid.push(cardNumbers.slice(i * 5, i * 5 + 5));
    }
    for (let r = 0; r < 5; r++) {
        if (grid[r].every(isDrawn)) return true;
    }
    for (let c = 0; c < 5; c++) {
        let colWin = true;
        for (let r = 0; r < 5; r++) {
            if (!isDrawn(grid[r][c])) { colWin = false; break; }
        }
        if (colWin) return true;
    }
    let diag1Win = true, diag2Win = true;
    for (let i = 0; i < 5; i++) {
        if (!isDrawn(grid[i][i])) diag1Win = false;
        if (!isDrawn(grid[i][4 - i])) diag2Win = false;
    }
    if (diag1Win || diag2Win) return true;
    const corners = [grid[0][0], grid[0][4], grid[4][0], grid[4][4]];
    if (corners.every(isDrawn)) return true;
    return false;
}

// 🟢 የቢንጎ ማረጋገጫ — የመጨረሻው ቁጥር አዲስ መስመር ሲያሟላ ብቻ
// ማሸነፊያ ቁጥር ሲወጣ BINGO ካላሉ፣ ቀጣይ ቁጥር ሲወጣ ያ መስመር አይቆጠርም
function verifyBingoWin(cardNum, drawnNumbers) {
    const cardNumbers = getServerCardNumbers(cardNum);
    const drawn = (drawnNumbers || []).map(n => Number(n));

    if (drawn.length === 0) return false;

    // አሁን ሙሉ የድል pattern አለ?
    if (!hasAnyWinPattern(cardNumbers, drawn)) return false;

    // ያለ የመጨረሻው ቁጥር pattern ይሟላ ነበር? → ያለፈ መስመር ነው (አይቆጠርም)
    const withoutLast = drawn.slice(0, -1);
    if (hasAnyWinPattern(cardNumbers, withoutLast)) {
        // ቀድሞ ነበር — አዲስ መስመር ካልተጨመረ አይሸነፍም
        // ነገር ግን ያለ last አንድ pattern ሲሞላ፣ ከ last ጋር ሌላ አዲስ pattern ካለ ይቆጠራል
        // ቀላል ሕግ፡ last ቁጥር ካርዱ ላይ ከሌለ ወይም ያለፈ win ብቻ ከሆነ አትቀበል
        // የበለጠ ትክክል፡ last ያለውን አዲስ pattern ይፈልግ
        return hasNewPatternCompletedByLast(cardNumbers, drawn);
    }

    // ያለ last አልተሟላም፣ ከ last ጋር ተሟላ → ትክክለኛ አዲስ win
    return true;
}

// የመጨረሻው ቁጥር አዲስ መስመር ሲያሟላ ብቻ true
function hasNewPatternCompletedByLast(cardNumbers, drawn) {
    const last = drawn[drawn.length - 1];
    const withoutLast = drawn.slice(0, -1);
    const isDrawnFull = (val) => val === "FREE" || drawn.includes(Number(val));
    const isDrawnPrev = (val) => val === "FREE" || withoutLast.includes(Number(val));

    const grid = [];
    for (let i = 0; i < 5; i++) {
        grid.push(cardNumbers.slice(i * 5, i * 5 + 5));
    }

    // እያንዳንዱ pattern፡ አሁን ሙሉ ነው፣ ቀድሞ አልነበረም፣ እና last በ pattern ውስጥ ነው
    const patterns = [];
    for (let r = 0; r < 5; r++) patterns.push(grid[r]);
    for (let c = 0; c < 5; c++) patterns.push([0,1,2,3,4].map(r => grid[r][c]));
    patterns.push([0,1,2,3,4].map(i => grid[i][i]));
    patterns.push([0,1,2,3,4].map(i => grid[i][4 - i]));
    patterns.push([grid[0][0], grid[0][4], grid[4][0], grid[4][4]]);

    for (const pattern of patterns) {
        const nowComplete = pattern.every(isDrawnFull);
        const wasComplete = pattern.every(isDrawnPrev);
        const containsLast = pattern.some(v => Number(v) === Number(last));
        if (nowComplete && !wasComplete && containsLast) return true;
    }
    return false;
}


// Ethiopian filler bot names — ከ 10 ተጫዋች በታች ሲሆን 5 ካርድ
const BOT_NAMES = [
    'Abebe', 'Mina', 'Sura', 'Fayisa', 'Abedla',
    'Biruk', 'Eyob', 'Kidist', 'Hanna', 'Samuel',
    'Meron', 'Dawit', 'Tigist', 'Yonas', 'Selam'
];


function rebuildTakenCards(room) {
    let allTaken = [];
    Object.values(room.players || {}).forEach(p => {
        if (p && p.cardNums && p.cardNums.length) {
            allTaken = allTaken.concat(p.cardNums);
        }
    });
    room.takenCards = allTaken;
    return allTaken;
}

function emitRoomCardState(stakeNum) {
    const room = rooms[stakeNum];
    if (!room) return;
    rebuildTakenCards(room);
    const totalCards = (room.takenCards || []).length;
    const prizePool = Math.floor(totalCards * room.stake * 0.8);
    io.to(`room_${stakeNum}`).emit('update_taken_cards', room.takenCards);
    io.to(`room_${stakeNum}`).emit('clock_tick', {
        gameId: room.gameId,
        playerCount: totalCards, // ካርድ ብዛት
        totalCards: totalCards,
        prizePool: prizePool,
        timeLeft: room.timeLeft,
        stake: room.stake
    });
}

function countRealPlayers(room) {
    if (!room || !room.players) return 0;
    return Object.values(room.players).filter(
        p => p && p.cardNums && p.cardNums.length > 0 && !p.isBot
    ).length;
}

function fillBotCards(room, stakeNum, force) {
    const realCount = countRealPlayers(room);
    if (realCount >= 10) {
        // ቦቶች አስወግድ
        Object.keys(room.players || {}).forEach(id => {
            if (room.players[id] && room.players[id].isBot) delete room.players[id];
        });
        rebuildTakenCards(room);
        return [];
    }

    // አስቀድሞ 5 bot ካለ — አትቀይር (refresh / join ላይ መዝገብት አያስፈልግም)
    const existingBots = Object.keys(room.players || {}).filter(id => room.players[id] && room.players[id].isBot);
    if (!force && existingBots.length >= 5) {
        rebuildTakenCards(room);
        return existingBots;
    }

    // አሮጌ bots አጽዳ ከዛ አዲስ ሙላ
    Object.keys(room.players || {}).forEach(id => {
        if (room.players[id] && room.players[id].isBot) {
            delete room.players[id];
        }
    });
    rebuildTakenCards(room);

    const needCards = 5;
    const freeNums = [];
    for (let n = 1; n <= 200; n++) {
        if (!room.takenCards.includes(n)) freeNums.push(n);
    }
    // shuffle free
    for (let i = freeNums.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [freeNums[i], freeNums[j]] = [freeNums[j], freeNums[i]];
    }
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const pick = freeNums.slice(0, needCards);
    pick.forEach((cardNum, idx) => {
        const botId = `bot_${stakeNum}_${cardNum}_${Date.now()}_${idx}`;
        room.players[botId] = {
            playerName: names[idx % names.length],
            cardNums: [cardNum],
            isBot: true,
            telegram_id: null
        };
        room.takenCards.push(cardNum);
    });
    console.log(`🤖 Room ${stakeNum}: ${realCount} real players → filled ${pick.length} bot cards`);
}


function getActivePlayerCount(room) {
    if (!room || !room.players) return 0;
    const activePlayers = Object.values(room.players).filter(p => p.cardNums && p.cardNums.length > 0);
    return activePlayers.length;
}

function resetRoomState(stakeNum) {
    const room = rooms[stakeNum];
    if (!room) return;

    Object.keys(room.players).forEach(pId => {
        if (room.players[pId] && room.players[pId].isBot) {
            delete room.players[pId];
        } else if (room.players[pId]) {
            room.players[pId].cardNums = [];
        }
    });
    
    room.takenCards = [];
    room.drawnNumbers = [];
    room.isGameInProgress = false;
    room.claimSettling = false;
    room.pendingWinners = [];
    room.gameId++;

    if (room.drawInterval) {
        clearInterval(room.drawInterval);
        room.drawInterval = null;
    }

    io.to(`room_${stakeNum}`).emit('reset_player_card');
    io.to(`room_${stakeNum}`).emit('update_taken_cards', []);

    startRoomTimer(stakeNum);
}

function startRoomTimer(stake) {
    const stakeNum = parseInt(stake) || 10;
    const room = rooms[stakeNum];
    if (!room) return;

    if (room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
    }

    room.timeLeft = 30;

    // 30 ሰከንድ ሲጀመር — ሲስተም 5 ካርድ እንደ ተጫዋች ይመርጣል (ለሁሉም ይታያል)
    if (!room.isGameInProgress) {
        try {
            fillBotCards(room, stakeNum);
            emitRoomCardState(stakeNum);
        } catch (e) { console.error('bot fill on timer', e); }
    }

    room.timerInterval = setInterval(() => {
        room.timeLeft--;

        rebuildTakenCards(room);
        const totalCardsBought = room.takenCards.length;
        // Players ማሳያ = የካርድ ብዛት (1 ሰው 2 ካርድ → 2)
        const displayPlayers = totalCardsBought;
        const prizePool = Math.floor(totalCardsBought * room.stake * 0.8);

        io.to(`room_${stakeNum}`).emit('clock_tick', {
            gameId: room.gameId,
            playerCount: displayPlayers,
            totalCards: totalCardsBought,
            prizePool: prizePool,
            timeLeft: room.timeLeft
        });

        if (room.timeLeft <= 0) {
            clearInterval(room.timerInterval);
            room.timerInterval = null;
            try {
                rebuildTakenCards(room);
                let cardsNow = (room.takenCards || []).length;
                if (cardsNow === 0) {
                    fillBotCards(room, stakeNum);
                    rebuildTakenCards(room);
                    cardsNow = (room.takenCards || []).length;
                }
                if (cardsNow === 0) {
                    room.timeLeft = 30;
                    startRoomTimer(stakeNum);
                    return;
                }
                console.log('▶️ Starting game room', stakeNum, 'cards=', cardsNow);
                startRoomGame(stakeNum);
            } catch (e) {
                console.error('timer end start error', e);
                room.timeLeft = 30;
                startRoomTimer(stakeNum);
            }
        }
    }, 1000);
}

function startRoomGame(stake) {
    const stakeNum = parseInt(stake) || 10;
    const room = rooms[stakeNum];
    if (!room) return;

    // አስቀድሞ draw ካለ አቁም
    if (room.drawInterval) {
        clearInterval(room.drawInterval);
        room.drawInterval = null;
    }
    if (room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
    }

    // ከ 10 እውነተኛ ተጫዋች በታች → 5 bot ካርድ (Abebe, Fayisa, ...)
    try {
        fillBotCards(room, stakeNum);
        emitRoomCardState(stakeNum);
    } catch (e) { console.error('fillBotCards', e); }

    room.isGameInProgress = true;
    room.drawnNumbers = [];
    room.claimSettling = false;
    room.pendingWinners = [];

    const totalCardsBought = room.takenCards.length;
    const prizePool = Math.floor(totalCardsBought * room.stake * 0.8);
    // Players = ካርድ ብዛት (ሲስተም + እውነተኛ)
    io.to(`room_${stakeNum}`).emit('game_started', { 
        gameId: room.gameId,
        prizePool: prizePool,
        playerCount: totalCardsBought,
        totalCards: totalCardsBought
    });

    room.drawInterval = setInterval(() => {
        if (!room.isGameInProgress) {
            clearInterval(room.drawInterval);
            room.drawInterval = null;
            return;
        }

        if (room.drawnNumbers.length >= 75) {
            clearInterval(room.drawInterval);
            room.drawInterval = null;
            room.isGameInProgress = false;

            io.to(`room_${stakeNum}`).emit('game_ended', {
                winnerName: 'ማንም',
                gameId: room.gameId,
                prizeAmount: 0,
                message: '❌ ቁጥሮች አልቀዋል! በዚህ ዙር አሸናፊ የለም።'
            });

            setTimeout(() => {
                resetRoomState(stakeNum);
            }, 6000);
            return;
        }

        let nextNum;
        do {
            nextNum = Math.floor(Math.random() * 75) + 1;
        } while (room.drawnNumbers.includes(nextNum));

        room.drawnNumbers.push(nextNum);
        
        const letter = getBingoLetter(nextNum);
        const formattedNumber = `${letter}${nextNum}`;

        io.to(`room_${stakeNum}`).emit('number_drawn', {
            number: nextNum,               
            letter: letter,                
            displayNumber: formattedNumber,  
            calledCount: room.drawnNumbers.length,
            drawnNumbers: room.drawnNumbers
        });

        // Bot auto-win: ካርድ ማሸነፊያ ከሆነ በ bot ስም
        try {
            if (!room.claimSettling) {
                for (const [pid, pl] of Object.entries(room.players)) {
                    if (!pl || !pl.isBot || !pl.cardNums) continue;
                    for (const cNum of pl.cardNums) {
                        if (verifyBingoWin(cNum, room.drawnNumbers)) {
                            room.claimSettling = true;
                            if (room.drawInterval) {
                                clearInterval(room.drawInterval);
                                room.drawInterval = null;
                            }
                            room.isGameInProgress = false;
                            const totalCards = room.takenCards.length || 1;
                            const prizeTotal = Math.floor(totalCards * room.stake * 0.8);
                            const botName = pl.playerName || 'Abebe';
                            // ሽልማት → Admin wallet
                            (async () => {
                                try {
                                    const adminId = String(ADMIN_CHAT_ID || '').trim();
                                    if (adminId && prizeTotal > 0) {
                                        let adminUser = await User.findOne({ telegram_id: adminId });
                                        if (!adminUser) {
                                            adminUser = new User({
                                                telegram_id: adminId,
                                                name: 'Admin',
                                                balance: 0,
                                                history: []
                                            });
                                        }
                                        adminUser.balance = (Number(adminUser.balance) || 0) + prizeTotal;
                                        if (!adminUser.history) adminUser.history = [];
                                        adminUser.history.unshift({
                                            date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                                            at: new Date(),
                                            type: 'Bot Win (House)',
                                            amount: prizeTotal,
                                            status: 'Completed',
                                            botName: botName,
                                            card: cNum,
                                            gameId: room.gameId,
                                            stake: room.stake
                                        });
                                        if (adminUser.history.length > 50) adminUser.history = adminUser.history.slice(0, 50);
                                        await adminUser.save();
                                        io.to(`user_${adminId}`).emit('update_wallet',
                                            (Number(adminUser.balance)||0) + (Number(adminUser.bonus_balance)||0));
                                        sendTelegramNotification(
                                            `🏠 <b>Bot Win → Admin</b>\n` +
                                            `👤 ${botName} (ካርድ #${cNum})\n` +
                                            `💵 +${prizeTotal} ብር\n` +
                                            `🎮 Game #${room.gameId} · ${room.stake} ብር room`
                                        );
                                        console.log(`🏠 Bot win ${prizeTotal} → Admin ${adminId}`);
                                    }
                                } catch (e) { console.error('admin bot prize', e); }
                            })();
                            io.to(`room_${stakeNum}`).emit('game_ended', {
                                winnerName: botName,
                                winningCards: [cNum],
                                gameId: room.gameId,
                                prizeAmount: prizeTotal,
                                winnerCount: 1,
                                isBot: true,
                                message: `🏆 ${botName} (ካርድ #${cNum}) ቢንጎ አሸንፏል!`
                            });
                            setTimeout(() => resetRoomState(stakeNum), 10000);
                            return;
                        }
                    }
                }
            }
        } catch (e) { console.error('bot win check', e); }


    }, 3000);
}

// 🔴 SOCKET.IO connection handling
io.on('connection', (socket) => {

    socket.on('register_telegram_user', async (telegramId) => {
        if (telegramId) {
            socket.telegramId = telegramId.toString();
            socket.join(`user_${socket.telegramId}`);
            
            const user = await getUserData(socket.id, socket.telegramId);
            if (user) {
                socket.emit('update_wallet', user.balance);
                socket.emit('update_history', user.history);
            }
        }
    });

    socket.on('get_user_profile', async (data) => {
        const tid = data && data.telegram_id ? data.telegram_id : socket.telegramId;
        const user = await getUserData(socket.id, tid);
        if (user) {
            socket.emit('update_wallet', user.balance);
            socket.emit('update_history', user.history);
        }
    });

    socket.on('submit_deposit', async (data) => {
        const amount = parseFloat(data.amount || data.amountInput || 0);
        const refId = data.ref || data.refId || 'የለም';
        const method = data.method || 'Telebirr/CBE';
        const tid = data.telegram_id || socket.telegramId;

        const user = await getUserData(socket.id, tid);
        if (user) {
            if (!user.history) user.history = [];
            user.history.unshift({
                date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                type: 'Deposit',
                amount: amount,
                status: 'Pending'
            });

            await user.save();
            socket.emit('update_history', user.history);

            const adminMsg = `
🚨 <b>አዲስ የ Deposit ጥያቄ ደርሷል!</b>

👤 <b>Telegram ID:</b> <code>${user.telegram_id}</code>
👤 <b>ስም:</b> ${user.name}
💵 <b>የብር መጠን:</b> ${amount} ብር
💳 <b>የክፍያ መንገድ:</b> ${method}
🔢 <b>Transaction Ref:</b> <code>${refId}</code>
            `;

            const inlineKeyboard = {
                inline_keyboard: [
                    [
                        { text: "✅ Approve (አጽድቅ)", callback_data: `app_dep_${user.telegram_id}_${amount}` },
                        { text: "❌ Reject (ሰርዝ)", callback_data: `rej_dep_${user.telegram_id}` }
                    ]
                ]
            };

            sendTelegramNotification(adminMsg, inlineKeyboard);
        }
    });

    socket.on('submit_withdraw', async (data) => {
        const phone = data.phone || 'የለም';
        const amount = parseFloat(data.amount || 0);
        const tid = data.telegram_id || socket.telegramId;
        
        const user = await getUserData(socket.id, tid);
        if (!user) return;

        if (amount > user.balance) {
            socket.emit('card_error', '⚠️ በቂ የብር መጠን የሎትም!');
            return;
        }

        user.balance -= amount;
        user.phone = phone;
        if (!user.history) user.history = [];
        user.history.unshift({
            date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            type: 'Withdraw',
            amount: amount,
            status: 'Pending'
        });

        await user.save();

        socket.emit('update_wallet', user.balance);
        socket.emit('update_history', user.history);

        const adminMsg = `
💸 <b>አዲስ የ Withdraw ጥያቄ ደርሷል!</b>

👤 <b>Telegram ID:</b> <code>${user.telegram_id}</code>
👤 <b>ስም:</b> ${user.name}
📱 <b>ስልክ / አካውንት:</b> <code>${phone}</code>
💵 <b>የወጣው መጠን:</b> ${amount} ብር
        `;

        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: "✅ Approve (ክፈል)", callback_data: `app_wd_${user.telegram_id}_${amount}` },
                    { text: "❌ Reject (መልስ)", callback_data: `rej_wd_${user.telegram_id}` }
                ]
            ]
        };

        sendTelegramNotification(adminMsg, inlineKeyboard);
    });

    // 🟢 ከቀድሞ room ውጣ (ካርድ refund አይደለም ከ game በፊት ብቻ)
    function leaveCurrentRoom(socket, reason) {
        const oldStake = socket.currentStake;
        if (!oldStake || !rooms[oldStake]) return;
        const oldRoom = rooms[oldStake];
        try { socket.leave(`room_${oldStake}`); } catch (e) {}

        const player = oldRoom.players[socket.id];
        if (player) {
            // ጨዋታ ካልጀመረ ካርዶችን ነፃ አድርግ
            if (!oldRoom.isGameInProgress && player.cardNums && player.cardNums.length) {
                oldRoom.takenCards = (oldRoom.takenCards || []).filter(
                    c => !(player.cardNums || []).includes(c)
                );
            }
            delete oldRoom.players[socket.id];
            io.to(`room_${oldStake}`).emit('update_taken_cards', oldRoom.takenCards || []);
            const active = getActivePlayerCount(oldRoom);
            const prize = Math.floor((oldRoom.takenCards || []).length * oldRoom.stake * 0.8);
            io.to(`room_${oldStake}`).emit('update_player_count', {
                playerCount: active,
                prizePool: prize
            });
        }
        socket.currentStake = null;
    }

    socket.on('leave_room', () => {
        leaveCurrentRoom(socket, 'leave');
        socket.emit('left_room', { ok: true });
    });

    // 🟢 ተጫዋች Room ውስጥ ሲገባ (ተመሳሳይ room ይቀጥላል — Leave ካልተጫኑ)
    socket.on('join_room', (payload) => {
        // number ወይም { stake: 20 } ሁለቱንም ይቀበላል
        let stakeNum = 10;
        if (payload && typeof payload === 'object') {
            stakeNum = parseInt(payload.stake) || 10;
            if (payload.telegram_id) socket.telegramId = String(payload.telegram_id);
        } else {
            stakeNum = parseInt(payload) || 10;
        }
        if (![10, 20, 50].includes(stakeNum)) stakeNum = 10;

        // ሌላ room ከመጣ ብቻ ቀድሞውን ለይ (ተመሳሳይ room = አትለይ)
        if (socket.currentStake && socket.currentStake !== stakeNum) {
            leaveCurrentRoom(socket, 'switch');
        }

        socket.currentStake = stakeNum;
        socket.join(`room_${stakeNum}`);
        
        const room = rooms[stakeNum];
        if (!room) return;

        // 🟢 Refresh / reconnect: telegram_id ካለ ካርዶችን መልስ አያይዝ
        const tid = (socket.telegramId || '').toString();
        let myCards = [];
        let isMyPlayer = false;
        if (tid) {
            // ቀድሞ በሌላ socket_id የተመዘገበ ተጫዋች ካለ — ወደ አዲስ socket አስተላልፍ
            for (const [oldSid, pl] of Object.entries(room.players)) {
                if (pl && pl.telegram_id && String(pl.telegram_id) === tid) {
                    myCards = (pl.cardNums || []).slice();
                    isMyPlayer = myCards.length > 0;
                    if (oldSid !== socket.id) {
                        room.players[socket.id] = {
                            playerName: pl.playerName || 'ተጫዋች',
                            cardNums: myCards.slice(),
                            telegram_id: tid
                        };
                        delete room.players[oldSid];
                    } else {
                        room.players[socket.id] = pl;
                    }
                    break;
                }
            }
        }

        rebuildTakenCards(room);
        const totalCardsBought = room.takenCards.length;
        const prizePool = Math.floor(totalCardsBought * room.stake * 0.8);

        socket.emit('init_state', {
            gameId: room.gameId,
            playerCount: totalCardsBought,
            totalCards: totalCardsBought,
            prizePool: prizePool,
            timeLeft: room.timeLeft,
            stake: stakeNum,
            isGameInProgress: !!room.isGameInProgress,
            drawnNumbers: room.drawnNumbers || [],
            myCards: myCards
        });

        // Lobby: ሲስተም መጀመሪያ 5 ካርድ ይመርጣል — ለሁሉም ይታያል
        if (!room.isGameInProgress) {
            try {
                fillBotCards(room, stakeNum);
                emitRoomCardState(stakeNum);
            } catch (e) { console.error(e); }
        }

        socket.emit('update_taken_cards', room.takenCards);
        if (myCards.length > 0) {
            socket.emit('card_selected_success', { selectedCards: myCards });
        }

        // ጨዋታ እየተካሄደ ከሆነ
        if (room.isGameInProgress) {
            const spectator = !isMyPlayer;
            socket.emit('game_started', {
                gameId: room.gameId,
                prizePool: prizePool,
                playerCount: (room.takenCards || []).length,
                totalCards: (room.takenCards || []).length,
                isSpectator: spectator,
                drawnNumbers: room.drawnNumbers || []
            });

            if (room.drawnNumbers && room.drawnNumbers.length > 0) {
                const lastNum = room.drawnNumbers[room.drawnNumbers.length - 1];
                const letter = getBingoLetter(lastNum);
                socket.emit('number_drawn', {
                    number: lastNum,
                    letter: letter,
                    displayNumber: `${letter}${lastNum}`,
                    calledCount: room.drawnNumbers.length,
                    drawnNumbers: room.drawnNumbers,
                    isReplay: true
                });
            }
        }

        if (!room.isGameInProgress && !room.timerInterval) {
            startRoomTimer(stakeNum);
        }
    });

    // 🟢 ተጫዋች ካርድ ሲመርጥ
    socket.on('select_card', async (data) => {
        const stake = parseInt(data.stake) || socket.currentStake || 10;
        const cardNum = parseInt(data.cardNum);
        
        if (!cardNum || cardNum < 1 || cardNum > 200) {
            socket.emit('card_error', '⚠️ እባክዎን ትክክለኛ ካርድ ከ 1 እስከ 200 ይምረጡ!');
            return;
        }

        const room = rooms[stake];
        if (!room) return;

        if (room.isGameInProgress) {
            socket.emit('card_error', '⚠️ ጨዋታው እየተካሄደ ነው! አሁን ካርድ መምረጥ አይችሉም።');
            return;
        }

        if (room.takenCards.includes(cardNum) && (!room.players[socket.id] || !room.players[socket.id].cardNums.includes(cardNum))) {
            socket.emit('card_error', '⚠️ ይህ ካርድ ተይዟል! እባክዎን ሌላ ይምረጡ።');
            return;
        }

        if (!room.players[socket.id]) {
            room.players[socket.id] = {
                playerName: data.playerName || "ተጫዋች",
                cardNums: [],
                telegram_id: null
            };
        }

        const player = room.players[socket.id];
        
        // telegram_id ከ data ወይም ከ socket ውሰድ (የበለጠ አስተማማኝ)
        const tid = (data.telegram_id || socket.telegramId || '').toString();
        if (tid && !socket.telegramId) socket.telegramId = tid;
        if (tid) player.telegram_id = tid;
        
        const user = await getUserData(socket.id, tid || socket.telegramId);

        if (!user) {
            socket.emit('card_error', '⚠️ ተጠቃሚው በዳታቤዝ አልተገኘም! እባክዎን እንደገና ሎጊን ያድርጉ።');
            return;
        }

        if (!user.history) user.history = [];

        if (player.cardNums.includes(cardNum)) {
            // ካርድ ማስወገድ → ገንዘብ መመለስ (ወደ balance)
            player.cardNums = player.cardNums.filter(c => c !== cardNum);
            addRefundToBalance(user, stake);
            user.history.unshift({
                date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                type: 'Card Refund',
                amount: stake,
                status: 'Completed',
                at: new Date()
            });
        } else {
            if (getPlayableBalance(user) < stake) {
                socket.emit('card_error', '⚠️ በቂ የብር መጠን የሎትም! እባክዎን አካውንትዎ ላይ ገንዘብ ያስገቡ (Deposit)።');
                return;
            }

            if (player.cardNums.length >= 3) {
                socket.emit('card_error', '⚠️ በአንድ ዙር ከ3 ካርድ በላይ መያዝ አይችሉም!');
                return;
            }
            
            player.cardNums.push(cardNum);
            player.telegram_id = tid || player.telegram_id || null;
            deductPlayable(user, stake);

            user.history.unshift({
                date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                type: 'Card Buy',
                amount: stake,
                status: 'Completed',
                at: new Date()
            });

            if (!user.hasUsedBonus) {
                user.hasUsedBonus = true; 
            }

            // 🟢 Agent 10% — ካርድ ሲገዛ (10ብር→1, 20→2, 50→5)
            try {
                if (user.agent_id) {
                    let agent = await User.findOne({ telegram_id: String(user.agent_id) });
                    if (agent) {
                        if (!agent.is_agent) {
                            agent.is_agent = true;
                            agent.role = 'agent';
                        }
                        const commission = Math.round(stake * 0.10 * 100) / 100;
                        agent.agent_balance = (Number(agent.agent_balance) || 0) + commission;
                        agent.balance = (Number(agent.balance) || 0) + commission;
                        if (!agent.history) agent.history = [];
                        agent.history.unshift({
                            date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                            type: 'Agent Commission',
                            amount: commission,
                            from: tid,
                            stake: stake,
                            status: 'Completed',
                            at: new Date()
                        });
                        if (agent.history.length > 50) agent.history = agent.history.slice(0, 50);
                        await agent.save();
                        const agTotal = (Number(agent.balance)||0) + (Number(agent.bonus_balance)||0);
                        io.to(`user_${agent.telegram_id}`).emit('update_wallet', agTotal);
                        if (typeof sendTelegramNotification === 'function') {
                            // optional: notify only agent via direct API
                        }
                        // መልእክት ለ Agent
                        try {
                            const token = process.env.BOT_TOKEN || TELEGRAM_BOT_TOKEN;
                            if (token && !String(token).startsWith('YOUR_')) {
                                const msg = `🤝 <b>Agent Commission</b>\n+${commission} ብር (${stake}×10%)\nከ ተጫዋች: ${tid}\nባላንስ: ${agent.balance} ብር`;
                                const payload = JSON.stringify({
                                    chat_id: agent.telegram_id,
                                    text: msg.replace(/\\n/g, '\n'),
                                    parse_mode: 'HTML'
                                });
                                const url = `https://api.telegram.org/bot${token}/sendMessage`;
                                const req = https.request(url, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
                                }, (resp) => { resp.on('data', () => {}); });
                                req.on('error', () => {});
                                req.write(payload);
                                req.end();
                            }
                        } catch (e2) {}
                        console.log(`🤝 Agent ${agent.telegram_id} +${commission} from stake ${stake}`);
                    }
                }
            } catch (e) { console.error('Agent commission error', e); }
        }

        // ታሪክ ከ 30 በላይ ካለ አሮጌውን አስወግድ
        if (user.history.length > 30) user.history = user.history.slice(0, 30);

        await user.save();
        socket.emit('update_wallet', getPlayableBalance(user));
        socket.emit('update_history', user.history);

        let allTaken = [];
        Object.values(room.players).forEach(p => {
            allTaken = allTaken.concat(p.cardNums);
        });
        room.takenCards = allTaken;

        socket.emit('card_selected_success', {
            selectedCards: player.cardNums,
            lastCard: cardNum
        });

        const activePlayerCount = getActivePlayerCount(room);
        const prizePool = Math.floor(allTaken.length * room.stake * 0.8);

        io.to(`room_${stake}`).emit('clock_tick', {
            gameId: room.gameId,
            playerCount: activePlayerCount,
            totalCards: allTaken.length,
            prizePool: prizePool,
            timeLeft: room.timeLeft,
            stake: stake
        });

        io.to(`room_${stake}`).emit('update_taken_cards', room.takenCards);
    });

    socket.on('claim_bingo', async (data) => {
        try {
            const stake = parseInt(data.stake) || socket.currentStake || 10;
            const room = rooms[stake];
            if (!room) {
                socket.emit('card_error', '❌ ክፍሉ አልተገኘም!');
                return;
            }
            // አንድ ጨዋታ አንድ ጊዜ ብቻ (double claim አይፍቀድ)
            if (room.claimSettling) {
                // በ claim window ውስጥ ተጨማሪ አሸናፊዎችን ሰብስብ
            } else if (!room.isGameInProgress) {
                socket.emit('card_error', '⚠️ ጨዋታው አልቋል!');
                return;
            }

            const player = room.players[socket.id];
            const cardsToCheck = (player && player.cardNums && player.cardNums.length > 0)
                ? player.cardNums
                : [data.cardNum || 1];

            let winningCardsForThisPlayer = [];
            cardsToCheck.forEach(cNum => {
                if (verifyBingoWin(cNum, room.drawnNumbers)) {
                    winningCardsForThisPlayer.push(cNum);
                }
            });

            if (winningCardsForThisPlayer.length === 0) {
                socket.emit('card_error', '⚠️ BINGO አልተቀበለም! ማሸነፊያ ቁጥር ሲወጣ ካላሉ፣ አዲስ መስመር ማግኘት አለብዎት።');
                return;
            }

            const tid = (data.telegram_id || socket.telegramId || (player && player.telegram_id) || '').toString();
            if (tid && !socket.telegramId) socket.telegramId = tid;
            const user = await getUserData(socket.id, tid || socket.telegramId);
            const playerName = (user && user.name) ? user.name : (player && player.playerName ? player.playerName : "ተጫዋች");

            // Claim window — 1.5s ሁሉንም አሸናፊዎች ሰብስብ
            if (!room.pendingWinners) room.pendingWinners = [];
            // ተመሳሳይ telegram ሁለት ጊዜ አይግባ
            if (room.pendingWinners.some(w => w.telegram_id && tid && String(w.telegram_id) === String(tid))) {
                return;
            }
            room.pendingWinners.push({
                socketId: socket.id,
                telegram_id: tid,
                name: playerName,
                cards: winningCardsForThisPlayer
            });

            if (room.claimSettling) return;

            room.claimSettling = true;
            if (room.drawInterval) {
                clearInterval(room.drawInterval);
                room.drawInterval = null;
            }
            room.isGameInProgress = false;

            const settle = async () => {
                try {
                    const winners = (room.pendingWinners || []).slice();
                    room.pendingWinners = [];
                    room.claimSettling = false;

                    const totalCards = room.takenCards && room.takenCards.length > 0 ? room.takenCards.length : 1;
                    const prizeTotal = Math.floor(totalCards * room.stake * 0.8);
                    const n = Math.max(winners.length, 1);
                    const eachPrize = Math.floor(prizeTotal / n);
                    const remainder = prizeTotal - eachPrize * n;

                    for (let i = 0; i < winners.length; i++) {
                        const w = winners[i];
                        const prize = eachPrize + (i === 0 ? remainder : 0);
                        w.prize = prize;
                        if (!w.telegram_id) continue;
                        const u = await User.findOne({ telegram_id: String(w.telegram_id) });
                        if (!u) continue;
                        // Win ሁልጊዜ ዋና balance → Withdraw ይቻላል (deposit አያስፈልግም)
                        u.wins_count = (Number(u.wins_count) || 0) + 1;
                        u.balance = (Number(u.balance) || 0) + prize;
                        if (!u.history) u.history = [];
                        u.history.unshift({
                            date: new Date().toLocaleString('en-GB', { hour12: false }),
                            at: new Date(),
                            type: 'Win',
                            amount: prize,
                            status: 'Completed',
                            gameId: room.gameId,
                            stake: room.stake
                        });
                        if (u.history.length > 40) u.history = u.history.slice(0, 40);
                        await u.save();
                        const totalBal = getPlayableBalance(u);
                        io.to(`user_${u.telegram_id}`).emit('update_wallet', totalBal);
                        io.to(`user_${u.telegram_id}`).emit('update_history', u.history);
                    }

                    const names = winners.map(w => w.name).join(', ');
                    const cardsTxt = winners.map(w => `#${(w.cards||[]).join(',')}`).join(' | ');
                    const msg = winners.length > 1
                        ? `🏆 አሸናፊዎች (${winners.length}): <b>${names}</b> — ሽልማት እኩል ${eachPrize} ብር`
                        : `🏆 <b>${names}</b> (ካርዶች: <b>${cardsTxt}</b>) ቢንጎ አሸንፏል!`;

                    // አንድ ጊዜ ብቻ game_ended
                    io.to(`room_${stake}`).emit('game_ended', {
                        winnerName: names,
                        winners: winners.map(w => ({
                            name: w.name,
                            telegram_id: w.telegram_id,
                            cards: w.cards,
                            prize: w.prize
                        })),
                        winningCards: winners.length === 1 ? winners[0].cards : winners.flatMap(w => w.cards || []),
                        gameId: room.gameId,
                        prizeAmount: prizeTotal,
                        prizeEach: eachPrize,
                        winnerCount: winners.length,
                        message: msg
                    });

                    // Save game history for admin
                    try {
                        await GameHistory.create({
                            gameId: room.gameId,
                            stake: room.stake,
                            winners: winners.map(w => ({
                                name: w.name,
                                telegram_id: w.telegram_id,
                                cards: w.cards,
                                prize: w.prize
                            })),
                            prizeTotal,
                            totalCards,
                            at: new Date()
                        });
                    } catch (e) { console.error('GameHistory save', e); }

                    if (typeof sendTelegramNotification === 'function') {
                        sendTelegramNotification(
                            `🏆 <b>ቢንጎ</b>\n👥 ${names}\n💵 ጠቅላላ: <b>${prizeTotal} ብር</b>` +
                            (winners.length > 1 ? ` (እያንዳንዱ ~${eachPrize})` : '') +
                            `\n🎮 Room: ${stake} · Game ID: ${room.gameId}`
                        );
                    }

                    setTimeout(() => {
                        if (typeof resetRoomState === 'function') resetRoomState(stake);
                    }, 10000);
                } catch (err) {
                    console.error('Settle winners error', err);
                    room.claimSettling = false;
                }
            };

            setTimeout(settle, 1500);

        } catch (error) {
            console.error("Claim Bingo Server Error:", error);
            socket.emit('card_error', '❌ የቢንጎ ጥያቄ ሲፈተሽ ስህተት ተፈጥሯል!');
        }
    });

    socket.on('disconnect', async () => {
        const stake = socket.currentStake;
        if (stake && rooms[stake]) {
            const room = rooms[stake];
            const player = room.players[socket.id];

            // ጨዋታ ከመጀመሩ በፊት ከወጣ → የካርዶቹን ገንዘብ መመለስ
            if (player && player.cardNums && player.cardNums.length > 0 && !room.isGameInProgress && !player.refunded) {
                try {
                    player.refunded = true;
                    const user = await getUserData(socket.id, socket.telegramId);
                    if (user) {
                        const refundAmount = player.cardNums.length * room.stake;
                        user.balance = (user.balance || 0) + refundAmount;
                        if (!user.history) user.history = [];
                        user.history.unshift({
                            date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                            at: new Date(),
                            type: 'Disconnect Refund',
                            amount: refundAmount,
                            status: 'Completed'
                        });
                        if (user.history.length > 30) user.history = user.history.slice(0, 30);
                        await user.save();
                        console.log(`💸 Refunded ${refundAmount} Birr to ${socket.telegramId} on disconnect`);
                    }
                } catch (err) {
                    console.error('Disconnect refund error:', err);
                }
            }

            delete room.players[socket.id];

            let allTaken = [];
            Object.values(room.players).forEach(p => {
                allTaken = allTaken.concat(p.cardNums || []);
            });
            room.takenCards = allTaken;

            const activePlayerCount = getActivePlayerCount(room);
            const prizePool = Math.floor(allTaken.length * room.stake * 0.8);

            io.to(`room_${stake}`).emit('clock_tick', {
                gameId: room.gameId,
                playerCount: activePlayerCount,
                totalCards: allTaken.length,
                prizePool: prizePool,
                timeLeft: room.timeLeft,
                stake: stake
            });

            io.to(`room_${stake}`).emit('update_taken_cards', room.takenCards);
        }
    });
});

// 🟢 5. Frontend (index.html) ማገልገያ Route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🟢 6. Render Keep-Alive Ping
setInterval(() => {
    const appUrl = process.env.RENDER_EXTERNAL_URL;
    if (appUrl) {
        https.get(appUrl, (res) => {}).on('error', (err) => {});
    }
}, 600000);

// 🟢 7. Server Listener
const PORT = process.env.PORT || 3000;


// ========== AGENT / ADMIN APIs ==========
app.post('/api/agent/dashboard', async (req, res) => {
    try {
        const tid = String(req.body.telegram_id || '');
        if (!tid) return res.json({ ok: false, error: 'no id' });
        const agent = await User.findOne({ telegram_id: tid });
        if (!agent || !agent.is_agent) return res.json({ ok: false, error: 'agent አይደሉም' });
        const players = await User.find({ agent_id: tid }).select(
            'telegram_id name username phone balance bonus_balance wins_count history'
        ).lean();
        let totalDeposit = 0, totalWithdraw = 0, totalCommission = 0, totalWins = 0;
        const playerList = players.map(p => {
            let dep = 0, wd = 0, win = 0, cardBuy = 0;
            let pendingDep = 0, pendingWd = 0;
            let lastDep = null, lastWd = null, lastWin = null;
            (p.history || []).forEach(h => {
                if (!h) return;
                const amt = Number(h.amount) || 0;
                const st = h.status || '';
                if (h.type === 'Deposit') {
                    if (st === 'Approved' || st === 'Completed') { dep += amt; lastDep = h; }
                    else if (st === 'Pending') pendingDep += amt;
                }
                if (h.type === 'Withdraw') {
                    if (st === 'Completed' || st === 'Approved') { wd += amt; lastWd = h; }
                    else if (st === 'Pending') pendingWd += amt;
                }
                if (h.type === 'Win' || h.type === 'Prize') { win += amt; lastWin = h; }
                if (h.type === 'Card Buy') cardBuy += amt;
            });
            totalDeposit += dep; totalWithdraw += wd; totalWins += win;
            const main = Number(p.balance) || 0;
            const bonus = Number(p.bonus_balance) || 0;
            return {
                id: p.telegram_id,
                name: p.name || '-',
                username: p.username || '',
                phone: p.phone || '-',
                balance: main,
                bonus_balance: bonus,
                total_balance: main + bonus,
                wins_count: p.wins_count || 0,
                deposit: dep,
                withdraw: wd,
                win: win,
                cardBuy: cardBuy,
                pendingDeposit: pendingDep,
                pendingWithdraw: pendingWd,
                status: {
                    deposit: pendingDep > 0 ? 'Pending' : (dep > 0 ? 'OK' : 'None'),
                    withdraw: pendingWd > 0 ? 'Pending' : (wd > 0 ? 'Done' : 'None'),
                    win: win > 0 ? 'Has wins' : 'No wins'
                },
                lastDeposit: lastDep ? (lastDep.amount + ' · ' + (lastDep.date || lastDep.at || '')) : null,
                lastWithdraw: lastWd ? (lastWd.amount + ' · ' + (lastWd.date || lastWd.at || '')) : null,
                lastWin: lastWin ? (lastWin.amount + ' · ' + (lastWin.date || lastWin.at || '')) : null
            };
        });
        (agent.history || []).forEach(h => {
            if (h.type === 'Agent Commission') totalCommission += Number(h.amount)||0;
        });
        if (!BOT_USERNAME) await resolveBotUsername();
        const referral_link = BOT_USERNAME
            ? `https://t.me/${BOT_USERNAME}?start=ag_${tid}`
            : '';
        res.json({
            ok: true,
            agent: { name: agent.name, balance: agent.balance, agent_balance: agent.agent_balance || 0, totalCommission },
            players: playerList,
            stats: { playerCount: players.length, totalDeposit, totalWithdraw, totalCommission, totalWins },
            referral_link,
            botUsername: BOT_USERNAME || null
        });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});



app.post('/api/admin/players', async (req, res) => {
    try {
        const adminId = String(req.body.admin_id || req.body.telegram_id || '');
        if (!adminId || adminId !== String(ADMIN_CHAT_ID).trim()) {
            return res.json({ ok: false, error: 'Admin ብቻ' });
        }
        const filterAgent = req.body.agent_id ? String(req.body.agent_id) : null;
        const q = filterAgent ? { agent_id: filterAgent } : {};
        const users = await User.find(q).sort({ _id: -1 }).limit(200).lean();
        const list = users.map(u => {
            let deposit = 0, withdraw = 0, win = 0, cardBuy = 0;
            (u.history || []).forEach(h => {
                if (!h) return;
                const a = Number(h.amount) || 0;
                const t = h.type || '';
                const s = h.status || '';
                if (t === 'Deposit' && (s === 'Approved' || s === 'Completed')) deposit += a;
                if (t === 'Withdraw' && (s === 'Approved' || s === 'Completed')) withdraw += a;
                if (t === 'Win' || t === 'Prize') win += a;
                if (t === 'Card Buy') cardBuy += a;
            });
            const main = Number(u.balance) || 0;
            const bonus = Number(u.bonus_balance) || 0;
            return {
                telegram_id: u.telegram_id,
                name: u.name || '-',
                username: u.username || '',
                phone: u.phone || '',
                balance: main,
                bonus_balance: bonus,
                total: main + bonus,
                agent_id: u.agent_id || null,
                is_agent: !!u.is_agent,
                deposit,
                withdraw,
                win,
                cardBuy,
                wins_count: u.wins_count || 0,
                status: main + bonus > 0 ? 'active' : 'empty'
            };
        });
        res.json({ ok: true, count: list.length, players: list });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

app.post('/api/admin/stats', async (req, res) => {
    try {
        const adminId = String(req.body.admin_id || req.body.telegram_id || '');
        if (!adminId || adminId !== String(ADMIN_CHAT_ID).trim()) {
            return res.json({ ok: false, error: 'Admin ብቻ' });
        }
        const users = await User.find({}).select('history balance is_agent telegram_id name').lean();
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        function inRange(d, from) {
            if (!d) return false;
            const t = new Date(d);
            if (isNaN(t.getTime())) return false;
            return t >= from && t <= now;
        }

        function empty() { return { deposit: 0, withdraw: 0, cardBuy: 0, win: 0, commission: 0, benefit: 0 }; }

        const periods = {
            daily: empty(),
            weekly: empty(),
            monthly: empty(),
            yearly: empty(),
            all: empty()
        };

        function addTo(period, key, amt) {
            period[key] += Number(amt) || 0;
        }

        let totalUsers = users.length;
        let totalBalance = 0;
        let agentCount = 0;

        for (const u of users) {
            totalBalance += Number(u.balance) || 0;
            if (u.is_agent) agentCount++;
            for (const h of (u.history || [])) {
                if (!h) continue;
                const at = h.at || h.date || null;
                const amt = Number(h.amount) || 0;
                const type = h.type || '';
                const status = h.status || '';

                const buckets = [periods.all];
                if (inRange(at, startOfDay)) buckets.push(periods.daily);
                if (inRange(at, startOfWeek)) buckets.push(periods.weekly);
                if (inRange(at, startOfMonth)) buckets.push(periods.monthly);
                if (inRange(at, startOfYear)) buckets.push(periods.yearly);

                for (const b of buckets) {
                    if (type === 'Deposit' && (status === 'Approved' || status === 'Completed')) addTo(b, 'deposit', amt);
                    if (type === 'Withdraw' && (status === 'Completed' || status === 'Approved')) addTo(b, 'withdraw', amt);
                    if (type === 'Card Buy') addTo(b, 'cardBuy', amt);
                    if (type === 'Win' || type === 'Prize') addTo(b, 'win', amt);
                    if (type === 'Agent Commission') addTo(b, 'commission', amt);
                }
            }
        }

        for (const k of Object.keys(periods)) {
            const p = periods[k];
            // Benefit = house edge ≈ card buys - wins - commissions (approx)
            p.benefit = Math.round((p.cardBuy - p.win - p.commission) * 100) / 100;
            p.deposit = Math.round(p.deposit * 100) / 100;
            p.withdraw = Math.round(p.withdraw * 100) / 100;
            p.cardBuy = Math.round(p.cardBuy * 100) / 100;
            p.win = Math.round(p.win * 100) / 100;
            p.commission = Math.round(p.commission * 100) / 100;
        }

        let gamesTotal = 0, gamesDaily = 0, recentGames = [];
        try {
            gamesTotal = await GameHistory.countDocuments({});
            gamesDaily = await GameHistory.countDocuments({ at: { $gte: startOfDay } });
            recentGames = await GameHistory.find({}).sort({ at: -1 }).limit(15).lean();
        } catch (e) {}

        res.json({
            ok: true,
            summary: {
                totalUsers,
                agentCount,
                totalBalance: Math.round(totalBalance * 100) / 100,
                gamesTotal,
                gamesDaily
            },
            periods,
            recentGames: (recentGames || []).map(g => ({
                gameId: g.gameId,
                stake: g.stake,
                prizeTotal: g.prizeTotal,
                winners: (g.winners || []).map(w => w.name).join(', '),
                at: g.at
            }))
        });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});




app.post('/api/admin/broadcast', async (req, res) => {
    try {
        const adminId = String(req.body.admin_id || req.body.telegram_id || '');
        if (!adminId || adminId !== String(ADMIN_CHAT_ID).trim()) {
            return res.json({ ok: false, error: 'Admin ብቻ' });
        }
        const message = String(req.body.message || '').trim();
        if (!message) return res.json({ ok: false, error: 'መልእክት ባዶ ነው' });

        const users = await User.find({}).select('telegram_id').lean();
        let ok = 0, fail = 0;
        const token = TELEGRAM_BOT_TOKEN;
        if (!token || String(token).startsWith('YOUR_')) {
            return res.json({ ok: false, error: 'BOT_TOKEN አልተሞላም' });
        }

        // sequential with small delay to avoid Telegram limits
        for (const u of users) {
            const tid = u.telegram_id;
            if (!tid) { fail++; continue; }
            try {
                await new Promise((resolve) => {
                    const payload = JSON.stringify({
                        chat_id: tid,
                        text: '📢 <b>ከ Liyu Bingo</b>\n\n' + message,
                        parse_mode: 'HTML'
                    });
                    const url = `https://api.telegram.org/bot${token}/sendMessage`;
                    const r = https.request(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
                    }, (resp) => {
                        resp.on('data', () => {});
                        resp.on('end', () => {
                            if (resp.statusCode >= 200 && resp.statusCode < 300) ok++;
                            else fail++;
                            resolve();
                        });
                    });
                    r.on('error', () => { fail++; resolve(); });
                    r.write(payload);
                    r.end();
                });
                await new Promise(r => setTimeout(r, 35));
            } catch (e) { fail++; }
        }
        res.json({ ok: true, sent: ok, failed: fail, total: users.length });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

app.post('/api/admin/gift', async (req, res) => {
    try {
        const adminId = String(req.body.admin_id || req.body.telegram_id || '');
        if (!adminId || adminId !== String(ADMIN_CHAT_ID).trim()) {
            return res.json({ ok: false, error: 'Admin ብቻ' });
        }
        const target = String(req.body.target_id || '').trim();
        const amount = parseFloat(req.body.amount);
        if (!target || !(amount > 0)) {
            return res.json({ ok: false, error: 'target_id እና amount ያስፈልጋል' });
        }
        let user = await User.findOne({ telegram_id: target });
        if (!user) {
            user = new User({
                telegram_id: target,
                name: req.body.name || ('User ' + target),
                balance: 0,
                history: []
            });
        }
        user.balance = (user.balance || 0) + amount;
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'Gift',
            amount,
            status: 'Completed',
            at: new Date(),
            by: 'admin',
            date: new Date().toLocaleString('en-GB', { hour12: false })
        });
        if (user.history.length > 50) user.history = user.history.slice(0, 50);
        await user.save();
        try {
            io.to('user_' + target).emit('update_wallet', user.balance);
        } catch (e) {}
        res.json({ ok: true, balance: user.balance, target });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

app.post('/api/admin/create_agent', async (req, res) => {
    try {
        const adminId = String(req.body.admin_id || '');
        const agentTid = String(req.body.agent_telegram_id || '');
        if (!adminId || adminId !== String(ADMIN_CHAT_ID)) {
            return res.json({ ok: false, error: 'Admin ብቻ' });
        }
        if (!agentTid) return res.json({ ok: false, error: 'agent_telegram_id ያስፈልጋል' });
        let user = await User.findOne({ telegram_id: agentTid });
        if (!user) {
            user = new User({ telegram_id: agentTid, name: req.body.name || 'Agent', balance: 0, is_agent: true, role: 'agent', history: [] });
        } else {
            user.is_agent = true;
            user.role = 'agent';
        }
        await user.save();
        res.json({ ok: true, agent: { telegram_id: user.telegram_id, name: user.name } });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});


http.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is running on port ${PORT}`);
    resolveBotUsername().then((u) => {
        if (u) console.log('✅ Agent links use: https://t.me/' + u + '?start=ag_ID');
        else console.warn('⚠️ BOT_USERNAME empty — set env BOT_USERNAME or BOT_TOKEN for auto');
    });
});