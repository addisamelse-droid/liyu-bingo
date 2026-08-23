# -*- coding: utf-8 -*-
# ===============================
# LIYU BINGO PRO - FULLY FIXED CODE
# ===============================
import os
import re
import pymongo
from dotenv import load_dotenv
from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    WebAppInfo
)
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    ContextTypes,
    filters
)

# -------------------------------------------------------------
# CONFIGURATION - እዚህ የራስህን እሴቶች አስገባ
# -------------------------------------------------------------
BOT_TOKEN = "8722297780:AAFoDXr0L58fI4l0pDXsv4K6BLir1tR8mV0"          # ← የ Telegram Bot Tokenህን እዚህ ጻፍ"mongodb+srv://addisamelse_db_user:ab26032011@cluster0.itkanfk.mongodb.net/?appName=Cluster0"          # ← የ Telegram Bot Tokenህን እዚህ ጻፍ
MONGO_URI = "mongodb+srv://addisamelse_db_user:ab26032011@cluster0.itkanfk.mongodb.net/?appName=Cluster0"          # ← የ MongoDB URLህን እዚህ ጻፍ
ADMIN_ID = "2134795751"           # ← የ Telegram IDህን እዚህ ጻፍ

WEB_APP_URL = "https://liyu-bingo-2jg6.onrender.com"

try:
    load_dotenv()
    if os.getenv("BOT_TOKEN"):
        BOT_TOKEN = os.getenv("BOT_TOKEN")
    if os.getenv("MONGO_URI"):
        MONGO_URI = os.getenv("MONGO_URI")
    if os.getenv("ADMIN_ID"):
        ADMIN_ID = os.getenv("ADMIN_ID")
except Exception:
    pass

TELEBIRR_ACCOUNT = "0902715499"
CBE_ACCOUNT = "1000483349452"
ACCOUNT_NAME = "ABRHAM MULU"

CARD_PRICE = "10, 20, 50"
REFERRAL_BONUS = 2.0
WELCOME_BONUS = 10.0
MIN_WITHDRAW = 50.0
MIN_REMAIN = 10.0
BONUS_WINS_REQUIRED = 5

BOT_NAME = "Liyu Bingo"
CURRENCY = "Birr"

SUPPORT_GROUP_URL = "https://t.me/liyubingogame"
SUPPORT_PERSON_URL = "https://t.me/abmulu11"

# -------------------------------------------------------------
# MONGODB CONNECTION SETUP
# -------------------------------------------------------------
client = None
db = None
players_col = None

def init_db():
    global client, db, players_col
    if client is not None:
        return
    if not MONGO_URI or str(MONGO_URI).startswith("YOUR_"):
        raise RuntimeError("MONGO_URI not set! Fill main.py above.")
    client = pymongo.MongoClient(MONGO_URI)
    db = client['liyu_bingo']
    players_col = db['users']
    print("MongoDB connected (liyu_bingo)")

def get_used_txns_col():
    init_db()
    return db['used_transactions']

def is_txn_used(txn_id):
    if not txn_id or len(str(txn_id).strip()) < 4:
        return False
    col = get_used_txns_col()
    return col.find_one({"txn_id": str(txn_id).strip().upper()}) is not None

def mark_txn_used(txn_id, telegram_id, amount):
    col = get_used_txns_col()
    col.insert_one({
        "txn_id": str(txn_id).strip().upper(),
        "telegram_id": str(telegram_id),
        "amount": float(amount),
        "used_at": __import__("datetime").datetime.utcnow()
    })


def set_agent(telegram_id, name="Agent"):
    init_db()
    players_col.update_one(
        {"telegram_id": str(telegram_id)},
        {"$set": {"is_agent": True, "role": "agent", "name": name},
         "$setOnInsert": {"balance": 0.0, "history": [], "agent_balance": 0.0}},
        upsert=True
    )

def set_player_agent(player_id, agent_id):
    init_db()
    if str(player_id) == str(agent_id):
        return
    players_col.update_one(
        {"telegram_id": str(player_id), "agent_id": {"$exists": False}},
        {"$set": {"agent_id": str(agent_id)}}
    )
    # also if agent_id is null
    players_col.update_one(
        {"telegram_id": str(player_id), "agent_id": None},
        {"$set": {"agent_id": str(agent_id)}}
    )

def extract_txn_id(text):
    """From message like: 100 TXN123456"""
    parts = text.strip().split()
    for p in parts:
        if re.match(r'^[A-Za-z0-9\-]{5,}$', p) and not re.match(r'^\d+(\.\d+)?$', p):
            return p.upper()
    nums = re.findall(r'\b\d{6,}\b', text)
    if len(nums) >= 2:
        return nums[1]
    if len(nums) == 1 and len(nums[0]) >= 8:
        return nums[0]
    return None

# -------------------------------------------------------------
# KEYBOARD SETUP
# -------------------------------------------------------------
def get_contact_keyboard():
    keyboard = [
        [KeyboardButton("📱 ስልክ ቁጥር ያጋሩ", request_contact=True)]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True, one_time_keyboard=True)

def get_persistent_keyboard():
    keyboard = [
        [KeyboardButton("💳 ብር መሙያ"), KeyboardButton("💸 ብር ማውጫ")],
        [KeyboardButton("🎮 ጨዋታ ጀምር"), KeyboardButton("📊 መገለጫ / ቀሪ ሂሳብ")],
        [KeyboardButton("🎁 የመጋበዣ ሊንክ"), KeyboardButton("👥 የድጋፍ ቡድን")]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

def get_inline_menu():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🎁 ቦነስ እና መጋበዣ", callback_data="referral")],
        [
            InlineKeyboardButton("❓ እርዳታ", callback_data="help"),
            InlineKeyboardButton("👥 የድጋፍ ቡድን", url=SUPPORT_GROUP_URL)
        ],
        [InlineKeyboardButton("💬 አስተዳዳሪ", url=SUPPORT_PERSON_URL)]
    ])

# -------------------------------------------------------------
# DATABASE FUNCTIONS
# -------------------------------------------------------------
def add_player(telegram_id, name, username, referred_by=0, phone=""):
    init_db()
    player = players_col.find_one({"telegram_id": str(telegram_id)})
    if not player:
        new_player = {
            "telegram_id": str(telegram_id),
            "name": name,
            "username": username or "",
            "phone": phone,
            "balance": float(WELCOME_BONUS),
            "hasUsedBonus": False,
            "history": [],
            "referred_by": referred_by
        }
        players_col.insert_one(new_player)
        if referred_by != 0 and referred_by != telegram_id:
            players_col.update_one(
                {"telegram_id": str(referred_by)},
                {"$inc": {"balance": float(REFERRAL_BONUS)}}
            )
        return True
    return False

def update_phone(telegram_id, phone):
    init_db()
    players_col.update_one({"telegram_id": str(telegram_id)}, {"$set": {"phone": phone}})

def update_balance(telegram_id, amount):
    init_db()
    players_col.update_one({"telegram_id": str(telegram_id)}, {"$inc": {"balance": float(amount)}})

def get_player(telegram_id):
    init_db()
    return players_col.find_one({"telegram_id": str(telegram_id)})


def player_has_deposit(player):
    if not player:
        return False
    for h in (player.get("history") or []):
        if not h:
            continue
        if h.get("type") == "Deposit" and h.get("status") in ("Approved", "Completed"):
            return True
    return False

def player_win_count(player):
    if not player:
        return 0
    n = 0
    for h in (player.get("history") or []):
        if h and h.get("type") in ("Win", "Prize"):
            n += 1
    return n

def can_withdraw(player, amount):
    """Returns (ok: bool, error_message: str)"""
    bal = float(player.get("balance", 0) or 0) if player else 0.0
    amount = float(amount or 0)
    if amount < MIN_WITHDRAW:
        return False, f"⚠️ አነስተኛው withdraw <b>{MIN_WITHDRAW} ብር</b> ነው።"
    if amount > bal:
        return False, f"❌ ባላንስ በቂ አይደለም። (ባላንስ: {bal} ብር)"
    if bal - amount < MIN_REMAIN:
        return False, f"⚠️ ከ withdraw በኋላ ቢያንስ <b>{MIN_REMAIN} ብር</b> በ wallet መቆየት አለበት።\nከፍተኛው የሚወጣ: <b>{max(0, bal - MIN_REMAIN)} ብር</b>"
    # Bonus only → 5 wins required; deposit ካለ ይፈቀዳል
    if not player_has_deposit(player):
        wins = player_win_count(player)
        if wins < BONUS_WINS_REQUIRED:
            return False, (
                f"🎁 የ ቦነስ ገንዘብ ለማውጣት ቢያንስ <b>{BONUS_WINS_REQUIRED} ጨዋታ win</b> ያስፈልጋል።\n"
                f"አሁን ያሸነፉት: <b>{wins}/{BONUS_WINS_REQUIRED}</b>\n"
                f"ወይም Deposit ካደረጉ በኋላ win ካደረጉ withdraw ይችላሉ።"
            )
    return True, ""

def extract_first_number(text):
    match = re.search(r'\b\d+(\.\d+)?\b', text)
    if match:
        return float(match.group(0))
    return 0.0

# -------------------------------------------------------------
# START COMMAND
# -------------------------------------------------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    player = get_player(user.id)

    if context.args:
        arg0 = context.args[0]
        if arg0.isdigit():
            context.user_data['referred_by'] = int(arg0)
        elif str(arg0).startswith('ag_'):
            context.user_data['agent_id'] = str(arg0)[3:]


    if player and player.get("phone"):
        await update.message.reply_text(
            f"👋 እንኳን ደህና መጡ <b>{user.first_name}</b>!\n\n👇 ከታች ያሉትን በተኖች በመጠቀም ይጫወቱ፡",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )
        return

    await update.message.reply_text(
        f"""
🎰 <b>ወደ {BOT_NAME} እንኳን ደህና መጡ!</b>

👋 ሰላም <b>{user.first_name}</b>!

🎁 ለመመዝገብ እና የ <b>{WELCOME_BONUS} ብር</b> ቦነስዎን ለማግኘት እባክዎን ከታች ያለውን <b>"📱 ስልክ ቁጥር ያጋሩ"</b> የሚለውን ቁልፍ ይጫኑ!
""",
        parse_mode="HTML",
        reply_markup=get_contact_keyboard()
    )

# -------------------------------------------------------------
# CONTACT HANDLER
# -------------------------------------------------------------
async def handle_contact(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    contact = update.message.contact
    phone_number = contact.phone_number

    referred_by = context.user_data.get('referred_by', 0)
    is_new = add_player(user.id, user.first_name, user.username, referred_by, phone_number)
    agent_id = context.user_data.get('agent_id')
    if agent_id:
        set_player_agent(user.id, agent_id)

    if not is_new:
        update_phone(user.id, phone_number)

    inline_game_btn = InlineKeyboardMarkup([
        [InlineKeyboardButton("🕹️ አሁን ይጫወቱ", web_app=WebAppInfo(url=WEB_APP_URL))]
    ])

    await update.message.reply_text(
        f"""
🎉 <b>ምዝገባዎ በስኬት ተጠናቋል!</b>

📱 <b>ስልክ:</b> <code>{phone_number}</code>
🎁 <b>የእንኳን ደህና መጣችሁ ቦነስ:</b> <b>{WELCOME_BONUS} ብር</b> ወደ አካውንትዎ ገብቷል!

👇 ከታች ባለው ቁልፍ መጫወት መጀመር ይችላሉ፦
""",
        parse_mode="HTML",
        reply_markup=get_persistent_keyboard()
    )
    await update.message.reply_text("🎮 ጨዋታውን ለመክፈት፡", reply_markup=inline_game_btn)

# -------------------------------------------------------------
# HANDLER FOR MESSAGES AND PERSISTENT BUTTONS
# -------------------------------------------------------------
async def handle_user_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    text = update.message.text
    action = context.user_data.get('action')
    player = get_player(user.id)

    if not player or not player.get("phone"):
        await update.message.reply_text(
            "⚠️ ለመጠቀም በመጀመሪያ ስልክ ቁጥርዎን ማጋራት አለብዎት። /start ብለው ይጫኑ።",
            reply_markup=get_contact_keyboard()
        )
        return

    # 1. Deposit
    if "ብር መሙያ" in text or "Deposit" in text:
        context.user_data['action'] = 'waiting_deposit'
        await update.message.reply_text(
            f"""
💳 <b>ብር መሙያ</b>

እባክዎን ከታች ባሉት መንገዶች ብር ያስገቡ፡

📱 <b>ቴሌብር:</b> <code>{TELEBIRR_ACCOUNT}</code>
🏦 <b>ሲቢኢ ባንክ:</b> <code>{CBE_ACCOUNT}</code>
👤 <b>ስም:</b> {ACCOUNT_NAME}

ከከፈሉ በኋላ፡
<b>የብር መጠን + Transaction ID</b> አብረው ይላኩ።
<i>ምሳሌ፡ 100 TXN123456</i>
""",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )

    # 2. Withdraw
    elif "ብር ማውጫ" in text or "Withdraw" in text:
        bal = player.get("balance", 0.0) if player else 0.0
        if bal < MIN_WITHDRAW + MIN_REMAIN:
            await update.message.reply_text(
                f"⚠️ Withdraw ለማድረግ ቢያንስ <b>{MIN_WITHDRAW + MIN_REMAIN} ብር</b> ያስፈልጋል "
                f"(min {MIN_WITHDRAW} + በ wallet የሚቀር {MIN_REMAIN})።\n\n"
                f"ባላንስዎ: <b>{bal} ብር</b>",
                parse_mode="HTML",
                reply_markup=get_persistent_keyboard()
            )
            return

        context.user_data['action'] = 'waiting_withdraw'
        wins = player_win_count(player)
        has_dep = player_has_deposit(player)
        max_out = max(0, bal - MIN_REMAIN)
        rule = (
            f"✅ Deposit አለዎት — win ካለ withdraw ይቻላል"
            if has_dep else
            f"🎁 ቦነስ: {wins}/{BONUS_WINS_REQUIRED} wins (5 win ያስፈልጋል)"
        )
        await update.message.reply_text(
            f"""
💸 <b>ብር ማውጫ</b>

💰 <b>ባላንስ:</b> {bal} ብር
📤 <b>ከፍተኛው:</b> {max_out} ብር (ቢያንስ {MIN_REMAIN} ብር ይቀራል)
🔹 <b>አነስተኛ:</b> {MIN_WITHDRAW} ብር
📋 {rule}

እባክዎ **መጠን + ቴሌብር/ሲቢኢ ቁጥር** ይላኩ።
<i>ምሳሌ፡ 50 ቴሌብር 0911223344</i>
""",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )

    # 3. Play
    elif "ጨዋታ ጀምር" in text or "Play Game" in text:
        context.user_data['action'] = None
        inline_game_btn = InlineKeyboardMarkup([
            [InlineKeyboardButton("🕹️ ጨዋታውን ክፈት", web_app=WebAppInfo(url=WEB_APP_URL))]
        ])
        await update.message.reply_text("🎮 ጨዋታውን ለመጀመር ከታች ያለውን ቁልፍ ይጫኑ፡", reply_markup=inline_game_btn)

    # 4. Profile
    elif "መገለጫ" in text or "ቀሪ ሂሳብ" in text or "Profile" in text or "Balance" in text:
        context.user_data['action'] = None
        name = player.get("name", "ተጫዋች") if player else "ተጫዋች"
        tid = player.get("telegram_id", user.id) if player else user.id
        phone = player.get("phone") if player and player.get("phone") else "አልተመዘገበም"
        bal = player.get("balance", 0.0) if player else 0.0

        await update.message.reply_text(
            f"""
👤 <b>የተጫዋች መገለጫ</b>

📝 <b>ስም:</b> {name}
🆔 <b>ቴሌግራም መለያ:</b> <code>{tid}</code>
📱 <b>ስልክ:</b> {phone}
💰 <b>ቀሪ ሂሳብ:</b> <b>{bal} ብር</b>
""",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )

    # 4b. Referral
    elif "መጋበዣ" in text or "Referral" in text:
        context.user_data['action'] = None
        bot_username = (await context.bot.get_me()).username
        ref_link = f"https://t.me/{bot_username}?start={user.id}"
        await update.message.reply_text(
            f"""
🎁 <b>የመጋበዣ ሊንክ</b>

👥 ጓደኞችዎን በመጋበዝ እያንዳንዱ አዲስ ተጫዋች ሲመዘገብ
💰 <b>{REFERRAL_BONUS} ብር</b> ቦነስ ያገኛሉ!

🔗 <b>የእርስዎ ሊንክ:</b>
<code>{ref_link}</code>

📋 ሊንኩን ቅዱና ለጓደኞችዎ ይላኩ።
""",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )

    # 4c. Support
    elif "ድጋፍ" in text or "Support" in text:
        context.user_data['action'] = None
        await update.message.reply_text(
            """
👥 <b>የድጋፍ ቡድን</b>

ጥያቄ፣ ችግር ወይም እርዳታ ከፈለጉ ከታች ያሉትን ይጠቀሙ፡
""",
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("👥 የድጋፍ ቡድን", url=SUPPORT_GROUP_URL)],
                [InlineKeyboardButton("💬 አስተዳዳሪ", url=SUPPORT_PERSON_URL)]
            ])
        )

    # 5. Deposit data — example: 100 TXN123456
    elif action == 'waiting_deposit':
        context.user_data['action'] = None
        parsed_amount = extract_first_number(text)
        txn_id = extract_txn_id(text)

        if parsed_amount <= 0:
            await update.message.reply_text(
                "❌ ትክክለኛ የብር መጠን አልተገኘም። እንደገና ይሞክሩ።\n<i>ምሳሌ፡ 100 TXN123456</i>",
                parse_mode="HTML",
                reply_markup=get_persistent_keyboard()
            )
            return

        if not txn_id:
            await update.message.reply_text(
                "❌ የ Transaction / የክፍያ ቁጥር አልተገኘም።\nእባክዎ **መጠን + Transaction ID** አብረው ይላኩ።\n<i>ምሳሌ፡ 100 TXN123456</i>",
                parse_mode="HTML",
                reply_markup=get_persistent_keyboard()
            )
            return

        if is_txn_used(txn_id):
            await update.message.reply_text(
                f"❌ ይህ Transaction ID (`{txn_id}`) **አስቀድሞ ተጠቅሟል**።\nድጋሚ መጠቀም አይቻልም።",
                parse_mode="HTML",
                reply_markup=get_persistent_keyboard()
            )
            return

        context.user_data['pending_txn'] = txn_id
        context.user_data['pending_amount'] = parsed_amount

        admin_keyboard = [
            [
                InlineKeyboardButton("✅ አፅድቅ", callback_data=f"app_dep_{user.id}_{parsed_amount}_{txn_id}"),
                InlineKeyboardButton("❌ ሰርዝ", callback_data=f"rej_dep_{user.id}")
            ]
        ]
        await context.bot.send_message(
            chat_id=ADMIN_ID,
            text=(
                f"📥 <b>አዲስ ብር መሙያ ጥያቄ!</b>\n\n"
                f"👤 <b>ተጫዋች:</b> {user.first_name} (@{user.username})\n"
                f"🆔 <b>ID:</b> <code>{user.id}</code>\n"
                f"💵 <b>መጠን:</b> {parsed_amount} ብር\n"
                f"🔢 <b>Transaction ID:</b> <code>{txn_id}</code>\n"
                f"📝 <b>ሙሉ መልእክት:</b> {text}\n\n"
                f"⚠️ እባክዎ በ ቴሌብር/ባንክ **ገንዘቡ መግባቱን** ያረጋግጡ ከዚያ Approve ያድርጉ።"
            ),
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(admin_keyboard)
        )
        await update.message.reply_text(
            f"✅ ጥያቄዎ ተልኳል።\n💵 መጠን: <b>{parsed_amount} ብር</b>\n🔢 Txn: <code>{txn_id}</code>\n\nAdmin ከረጋገጠ በኋላ ቀሪ ሂሳብዎ ይጨምራል።",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )

    # 6. Withdraw data
    elif action == 'waiting_withdraw':
        parsed_amount = extract_first_number(text)
        current_bal = player.get("balance", 0.0) if player else 0.0

        ok, err = can_withdraw(player, parsed_amount)
        if not ok:
            await update.message.reply_text(err, parse_mode="HTML", reply_markup=get_persistent_keyboard())
            return

        context.user_data['action'] = None
        admin_keyboard = [
            [
                InlineKeyboardButton("✅ ከፈልኩ", callback_data=f"app_wd_{user.id}_{parsed_amount}"),
                InlineKeyboardButton("❌ ሰርዝ", callback_data=f"rej_wd_{user.id}")
            ]
        ]
        await context.bot.send_message(
            chat_id=ADMIN_ID,
            text=(
                f"📤 <b>አዲስ ብር ማውጫ ጥያቄ!</b>\n\n"
                f"👤 <b>ተጫዋች:</b> {user.first_name} (@{user.username})\n"
                f"🆔 <b>ID:</b> <code>{user.id}</code>\n"
                f"📝 <b>መረጃ:</b> {text}\n"
                f"💵 <b>የሚወጣው መጠን:</b> {parsed_amount} ብር"
            ),
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(admin_keyboard)
        )
        await update.message.reply_text("✅ የ ብር ማውጫ ጥያቄዎ ተልኳል!", reply_markup=get_persistent_keyboard())

# -------------------------------------------------------------
# CALLBACK QUERY HANDLER
# -------------------------------------------------------------
async def buttons(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    user_id = query.from_user.id
    bot_username = (await context.bot.get_me()).username

    if query.data == "referral":
        ref_link = f"https://t.me/{bot_username}?start={user_id}"
        await query.edit_message_text(
            f"""🎁 <b>ቦነስ እና መጋበዣ</b>

👥 ጓደኞችዎን በመጋበዝ እያንዳንዱ አዲስ ተጫዋች ሲመዘገብ
💰 <b>{REFERRAL_BONUS} ብር</b> ቦነስ ያገኛሉ!

🔗 <b>የእርስዎ የመጋበዣ ሊንክ:</b>
<code>{ref_link}</code>

📋 ሊንኩን ቅዱና ያጋሩ።
""",
            parse_mode="HTML"
        )
    elif query.data == "help":
        await query.edit_message_text(
            f"""❓ <b>እርዳታ</b>

1️⃣ <b>ብር መሙያ</b> — ብር ለመሙላት
2️⃣ <b>ብር ማውጫ</b> — ብር ለማውጣት
3️⃣ <b>ጨዋታ ጀምር</b> — ጨዋታውን ለመክፈት
4️⃣ <b>የመጋበዣ ሊንክ</b> — ጓደኞችን በመጋበዝ ቦነስ
5️⃣ <b>የድጋፍ ቡድን</b> — እርዳታ / ድጋፍ

💬 ተጨማሪ እርዳታ: {SUPPORT_GROUP_URL}
""",
            parse_mode="HTML"
        )

# -------------------------------------------------------------
# ADMIN APPROVAL / REJECTION HANDLER
# -------------------------------------------------------------
async def admin_approval(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    init_db()

    old_text = query.message.text or ""
    if "ተፅድቋል" in old_text or "ተፈፅሟል" in old_text or "ውድቅ ተደረገ" in old_text:
        await query.answer("⚠️ ይህ ጥያቄ አስቀድሞ ተከናውኗል!", show_alert=True)
        return

    await query.answer()

    data = query.data.split("_")
    action_type = data[0]
    sub_type = data[1]
    player_id = int(data[2])

    if action_type == "app" and sub_type == "dep":
        amount = float(data[3]) if len(data) > 3 else 0.0
        txn_id = data[4] if len(data) > 4 else None

        if txn_id and is_txn_used(txn_id):
            await query.answer("⚠️ ይህ Transaction አስቀድሞ ተጠቅሟል!", show_alert=True)
            return

        update_balance(player_id, amount)
        if txn_id:
            mark_txn_used(txn_id, player_id, amount)
        players_col.update_one(
            {"telegram_id": str(player_id)},
            {"$push": {"history": {"type": "Deposit", "amount": amount, "txn_id": txn_id or "", "status": "Approved"}}}
        )
        await query.edit_message_text(
            f"{old_text}\n\n✅ <b>ተፅድቋል! ({amount} ብር ተደምሯል)</b>"
            + (f"\nTxn: <code>{txn_id}</code>" if txn_id else ""),
            parse_mode="HTML"
        )
        await context.bot.send_message(
            chat_id=player_id,
            text=f"🎉 የ ብር መሙያ ጥያቄዎ ተፅድቆ {amount} ብር ተደምሯል።",
            reply_markup=get_persistent_keyboard()
        )

    elif action_type == "app" and sub_type == "wd":
        amount = float(data[3]) if len(data) > 3 else 0.0
        update_balance(player_id, -amount)
        players_col.update_one(
            {"telegram_id": str(player_id)},
            {"$push": {"history": {"type": "Withdraw", "amount": amount, "status": "Completed"}}}
        )
        await query.edit_message_text(
            f"{old_text}\n\n✅ <b>ክፍያው ተፈፅሟል! ({amount} ብር ተቀንሷል)</b>",
            parse_mode="HTML"
        )
        await context.bot.send_message(
            chat_id=player_id,
            text=f"🎉 የ ብር ማውጫ ጥያቄዎ ተፈፅሟል። {amount} ብር ተቀንሷል።",
            reply_markup=get_persistent_keyboard()
        )

    elif action_type == "rej":
        await query.edit_message_text(
            f"{old_text}\n\n❌ <b>ጥያቄው ውድቅ ተደረገ!</b>",
            parse_mode="HTML"
        )
        await context.bot.send_message(
            chat_id=player_id,
            text="❌ ጥያቄዎ ውድቅ ተደረገ።",
            reply_markup=get_persistent_keyboard()
        )


async def cmd_createagent(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != str(ADMIN_ID):
        await update.message.reply_text("Admin ብቻ")
        return
    if not context.args:
        await update.message.reply_text("አጠቃቀም: /createagent TELEGRAM_ID")
        return
    aid = context.args[0].strip()
    set_agent(aid, name=f"Agent {aid}")
    await update.message.reply_text(
        f"✅ Agent ተፈጥሯል!\nID: <code>{aid}</code>\nLink: https://t.me/{(await context.bot.get_me()).username}?start=ag_{aid}",
        parse_mode="HTML"
    )

async def cmd_agents(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != str(ADMIN_ID):
        return
    init_db()
    agents = list(players_col.find({"is_agent": True}).limit(50))
    if not agents:
        await update.message.reply_text("Agent የለም")
        return
    lines = [f"• {a.get('name')} — <code>{a.get('telegram_id')}</code> (bal: {a.get('agent_balance', a.get('balance', 0))})" for a in agents]
    await update.message.reply_text("🤝 Agents:\n" + "\n".join(lines), parse_mode="HTML")

# -------------------------------------------------------------
# MAIN APP LAUNCH
# -------------------------------------------------------------
if __name__ == "__main__":
    if (not BOT_TOKEN or str(BOT_TOKEN).startswith("YOUR_")) or \
       (not MONGO_URI or str(MONGO_URI).startswith("YOUR_")) or \
       (not ADMIN_ID or str(ADMIN_ID).startswith("YOUR_")):
        raise RuntimeError("Please fill BOT_TOKEN, MONGO_URI and ADMIN_ID in main.py!")
    init_db()
    app = (
        Application.builder()
        .token(BOT_TOKEN)
        .connect_timeout(30.0)
        .read_timeout(30.0)
        .write_timeout(30.0)
        .pool_timeout(30.0)
        .build()
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("createagent", cmd_createagent))
    app.add_handler(CommandHandler("agents", cmd_agents))
    app.add_handler(MessageHandler(filters.CONTACT, handle_contact))
    app.add_handler(CallbackQueryHandler(admin_approval, pattern="^(app_|rej_)"))
    app.add_handler(CallbackQueryHandler(buttons))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_user_message))

    print("Bot is running with contact registration flow...")
    app.run_polling(bootstrap_retries=-1, poll_interval=1.0)
