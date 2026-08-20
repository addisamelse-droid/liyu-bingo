const express = require('express');
const app = express();
const http = require('http').createServer(app);

// 🟢 1. የኔትወርክ መረጋጋት ማስተካከያ (CORS እና Ping Timouts)
const io = require('socket.io')(http, {
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

// 🟢 Express Static Files & JSON Body Parser
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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

// 🟢 ቁጥሩን አይቶ B, I, N, G, O የሚለውን ፊደል የሚመልስ Helper Function
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
        const { telegram_id, name, username } = req.body;
        const tid = telegram_id ? telegram_id.toString() : '123456789';
        const pName = name || 'Demo Player';
        const pUsername = username || 'demo';

        let user = await User.findOne({ telegram_id: tid });
        if (!user) {
            user = new User({
                telegram_id: tid,
                name: pName,
                username: pUsername,
                balance: 10, // የመጀመሪያ ቦነስ
                hasUsedBonus: false,
                history: []
            });
            await user.save();
        }

        res.json({ ok: true, player: user });
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

// 🟢 የቢንጎ ማረጋገጫ ተግባር
function verifyBingoWin(cardNum, drawnNumbers) {
    const cardNumbers = getServerCardNumbers(cardNum);
    const grid = [];
    for (let i = 0; i < 5; i++) {
        grid.push(cardNumbers.slice(i * 5, i * 5 + 5));
    }

    for (let r = 0; r < 5; r++) {
        let rowWin = true;
        for (let c = 0; c < 5; c++) {
            let val = grid[r][c];
            if (val !== "FREE" && !drawnNumbers.includes(val)) {
                rowWin = false;
                break;
            }
        }
        if (rowWin) return true;
    }

    for (let c = 0; c < 5; c++) {
        let colWin = true;
        for (let r = 0; r < 5; r++) {
            let val = grid[r][c];
            if (val !== "FREE" && !drawnNumbers.includes(val)) {
                colWin = false;
                break;
            }
        }
        if (colWin) return true;
    }

    let diag1Win = true;
    let diag2Win = true;
    for (let i = 0; i < 5; i++) {
        let val1 = grid[i][i];
        if (val1 !== "FREE" && !drawnNumbers.includes(val1)) diag1Win = false;
        let val2 = grid[i][4 - i];
        if (val2 !== "FREE" && !drawnNumbers.includes(val2)) diag2Win = false;
    }
    if (diag1Win || diag2Win) return true;

    // 🟢 4 Corners Win (4 ማዕዘን ቁጥሮች)
    const corners = [
        grid[0][0], // top-left
        grid[0][4], // top-right
        grid[4][0], // bottom-left
        grid[4][4]  // bottom-right
    ];
    const cornersWin = corners.every(val => val === "FREE" || drawnNumbers.includes(val));
    if (cornersWin) return true;

    return false;
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
        if (room.players[pId]) room.players[pId].cardNums = [];
    });
    
    room.takenCards = [];
    room.drawnNumbers = [];
    room.isGameInProgress = false;
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

    room.timerInterval = setInterval(() => {
        room.timeLeft--;

        const activePlayerCount = getActivePlayerCount(room);
        const totalCardsBought = room.takenCards.length;
        const prizePool = Math.floor(totalCardsBought * room.stake * 0.8);

        io.to(`room_${stakeNum}`).emit('clock_tick', {
            gameId: room.gameId,
            playerCount: activePlayerCount,
            totalCards: totalCardsBought,
            prizePool: prizePool,
            timeLeft: room.timeLeft
        });

        if (room.timeLeft <= 0) {
            clearInterval(room.timerInterval);
            room.timerInterval = null;

            if (totalCardsBought === 0) {
                room.takenCards.push(1);
            }

            startRoomGame(stakeNum);
        }
    }, 1000);
}

function startRoomGame(stake) {
    const stakeNum = parseInt(stake) || 10;
    const room = rooms[stakeNum];
    if (!room) return;

    room.isGameInProgress = true;
    room.drawnNumbers = [];

    if (room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
    }

    const totalCardsBought = room.takenCards.length;
    const prizePool = Math.floor(totalCardsBought * room.stake * 0.8);

    io.to(`room_${stakeNum}`).emit('game_started', { 
        gameId: room.gameId,
        prizePool: prizePool
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

    // 🟢 ተጫዋች Room ውስጥ ሲገባ
    socket.on('join_room', (stake) => {
        const stakeNum = parseInt(stake) || 10;
        socket.currentStake = stakeNum;
        socket.join(`room_${stakeNum}`);
        
        const room = rooms[stakeNum];
        if (!room) return;

        const activePlayerCount = getActivePlayerCount(room);
        const totalCardsBought = room.takenCards.length;
        const prizePool = Math.floor(totalCardsBought * room.stake * 0.8);

        socket.emit('init_state', {
            gameId: room.gameId,
            playerCount: activePlayerCount,
            totalCards: totalCardsBought,
            prizePool: prizePool,
            timeLeft: room.timeLeft,
            stake: stakeNum,
            isGameInProgress: !!room.isGameInProgress,
            drawnNumbers: room.drawnNumbers || []
        });

        socket.emit('update_taken_cards', room.takenCards);

        // ጨዋታ እየተካሄደ ከሆነ → አዲስ ተጫዋች እንደ spectator ያየዋል
        if (room.isGameInProgress) {
            socket.emit('game_started', {
                gameId: room.gameId,
                prizePool: prizePool,
                isSpectator: true
            });

            // እስካሁን የወጡ ቁጥሮችን ላክ
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
                cardNums: []
            };
        }

        const player = room.players[socket.id];
        
        // telegram_id ከ data ወይም ከ socket ውሰድ (የበለጠ አስተማማኝ)
        const tid = (data.telegram_id || socket.telegramId || '').toString();
        if (tid && !socket.telegramId) socket.telegramId = tid;
        
        const user = await getUserData(socket.id, tid || socket.telegramId);

        if (!user) {
            socket.emit('card_error', '⚠️ ተጠቃሚው በዳታቤዝ አልተገኘም! እባክዎን እንደገና ሎጊን ያድርጉ።');
            return;
        }

        if (!user.history) user.history = [];

        if (player.cardNums.includes(cardNum)) {
            // ካርድ ማስወገድ → ገንዘብ መመለስ
            player.cardNums = player.cardNums.filter(c => c !== cardNum);
            user.balance += stake;
            user.history.unshift({
                date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                type: 'Card Refund',
                amount: stake,
                status: 'Completed'
            });
        } else {
            if (user.balance < stake) {
                socket.emit('card_error', '⚠️ በቂ የብር መጠን የሎትም! እባክዎን አካውንትዎ ላይ ገንዘብ ያስገቡ (Deposit)።');
                return;
            }

            if (player.cardNums.length >= 3) {
                socket.emit('card_error', '⚠️ በአንድ ዙር ከ3 ካርድ በላይ መያዝ አይችሉም!');
                return;
            }
            
            player.cardNums.push(cardNum);
            user.balance -= stake;

            user.history.unshift({
                date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                type: 'Card Buy',
                amount: stake,
                status: 'Completed'
            });

            if (!user.hasUsedBonus) {
                user.hasUsedBonus = true; 
            }
        }

        // ታሪክ ከ 30 በላይ ካለ አሮጌውን አስወግድ
        if (user.history.length > 30) user.history = user.history.slice(0, 30);

        await user.save();
        socket.emit('update_wallet', user.balance);
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

            const player = room.players[socket.id];
            const cardsToCheck = (player && player.cardNums && player.cardNums.length > 0) ? player.cardNums : [data.cardNum || 1];
            
            let winningCardsForThisPlayer = [];
            cardsToCheck.forEach(cNum => {
                if (verifyBingoWin(cNum, room.drawnNumbers)) {
                    winningCardsForThisPlayer.push(cNum);
                }
            });

            if (winningCardsForThisPlayer.length === 0) {
                socket.emit('card_error', '⚠️ ገና አልተሞላም! BINGO ትክክል አይደለም።');
                return;
            }

            if (room.drawInterval) {
                clearInterval(room.drawInterval);
                room.drawInterval = null;
            }
            room.isGameInProgress = false;

            const totalCards = room.takenCards && room.takenCards.length > 0 ? room.takenCards.length : 1;
            const prizeAmount = Math.floor(totalCards * room.stake * 0.8);

            // telegram_id ከ data ወይም socket ውሰድ
            const tid = (data.telegram_id || socket.telegramId || '').toString();
            if (tid && !socket.telegramId) socket.telegramId = tid;

            const user = await getUserData(socket.id, tid || socket.telegramId);
            const playerName = (user && user.name) ? user.name : (player && player.playerName ? player.playerName : "ተጫዋች");

            if (user) {
                user.balance = (user.balance || 0) + prizeAmount;
                if (!user.history) user.history = [];
                
                user.history.unshift({
                    date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                    type: 'Win',
                    amount: prizeAmount,
                    status: 'Completed'
                });

                if (user.history.length > 30) user.history = user.history.slice(0, 30);
                
                await user.save();

                socket.emit('update_wallet', user.balance);
                socket.emit('update_history', user.history);
                
                // ለሁሉም የተጠቃሚው ሶኬቶችም አዘምን
                io.to(`user_${user.telegram_id}`).emit('update_wallet', user.balance);
                io.to(`user_${user.telegram_id}`).emit('update_history', user.history);
            }

            io.to(`room_${stake}`).emit('game_ended', {
                winnerName: playerName,
                winningCards: winningCardsForThisPlayer,
                gameId: room.gameId,
                prizeAmount: prizeAmount,
                message: `🏆 <b>${playerName}</b> (ካርዶች: <b>#${winningCardsForThisPlayer.join(", ")}</b>) ቢንጎ አሸንፏል!`
            });

            if (typeof sendTelegramNotification === 'function') {
                sendTelegramNotification(`🏆 <b>ቢንጎ አሸናፊ!</b>\n\n👤 ስም: <b>${playerName}</b>\n💵 የሽልማት መጠን: <b>${prizeAmount} ብር</b>\n🎯 ካርዶች: #${winningCardsForThisPlayer.join(", ")}\n🎮 Room: ${stake} ብር`);
            }

            setTimeout(() => {
                if (typeof resetRoomState === 'function') {
                    resetRoomState(stake);
                }
            }, 10000);

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
            if (player && player.cardNums && player.cardNums.length > 0 && !room.isGameInProgress) {
                try {
                    const user = await getUserData(socket.id, socket.telegramId);
                    if (user) {
                        const refundAmount = player.cardNums.length * room.stake;
                        user.balance = (user.balance || 0) + refundAmount;
                        if (!user.history) user.history = [];
                        user.history.unshift({
                            date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
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

http.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is running on port ${PORT}`);
});