 # -*- coding: utf-8 -*-
# ===============================
# LIYU BINGO 
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
# CONFIGURATION
# -------------------------------------------------------------
load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "") 
MONGO_URI = os.getenv("MONGO_URI", "")
ADMIN_ID = os.getenv("ADMIN_ID", "")

WEB_APP_URL = "https://liyu-bingo-1-d7oz.onrender.com"

TELEBIRR_ACCOUNT = "0902715499"  
CBE_ACCOUNT = "1000483349452"    
ACCOUNT_NAME = "ABRHAM MULU"   

CARD_PRICE = "10, 20, 50"     
REFERRAL_BONUS = 2.0            
WELCOME_BONUS = 10.0             
MIN_WITHDRAW = 50.0             

BOT_NAME = "Liyu Bingo"
CURRENCY = "Birr"

# -------------------------------------------------------------
# MONGODB CONNECTION SETUP
# -------------------------------------------------------------
client = pymongo.MongoClient(MONGO_URI)
db = client['liyu_bingo']
players_col = db['users']

# -------------------------------------------------------------
# KEYBOARD SETUP (ቋሚ እና ኢንላይን በተኖች)
# -------------------------------------------------------------
def get_contact_keyboard():
    """ስልክ ቁጥር ለመጠየቂያ የሚሆን አዝራር"""
    keyboard = [
        [KeyboardButton("📱 ስልክ ቁጥር ያጋሩ (Register)", request_contact=True)]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True, one_time_keyboard=True)

def get_persistent_keyboard():
    """ሁልጊዜ ታች በቋሚነት የሚቀመጡ በተኖች (Reply Keyboard)"""
    keyboard = [
        [KeyboardButton("💳 Deposit (ብር መሙያ)"), KeyboardButton("💸 Withdraw (ብር ማውጫ)")],
        [KeyboardButton("🎮 ጨዋታ ጀምር (Play Game)"), KeyboardButton("📊 Profile / Balance")]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

def get_inline_menu():
    """በመልእክቱ ላይ የሚወጡ ተጨማሪ በተኖች (Inline Keyboard)"""
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🎁 Bonus & Referral", callback_data="referral")],
        [
            InlineKeyboardButton("❓ Help / እርዳታ", callback_data="help"),
            InlineKeyboardButton("💬 Support / ድጋፍ", url="https://t.me/abmulu11")
        ]
    ])

# -------------------------------------------------------------
# DATABASE FUNCTIONS
# -------------------------------------------------------------
def add_player(telegram_id, name, username, referred_by=0, phone=""):
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
        return True # አዲስ ተመዝጋቢ
    return False # አስቀድሞ የተመዘገበ

def update_phone(telegram_id, phone):
    players_col.update_one({"telegram_id": str(telegram_id)}, {"$set": {"phone": phone}})

def update_balance(telegram_id, amount):
    players_col.update_one({"telegram_id": str(telegram_id)}, {"$inc": {"balance": float(amount)}})

def get_player(telegram_id):
    return players_col.find_one({"telegram_id": str(telegram_id)})

def extract_first_number(text):
    """ከጽሑፍ ውስጥ የመጀመሪያውን የብር ቁጥር ለይቶ ማውጫ"""
    match = re.search(r'\b\d+(\.\d+)?\b', text)
    if match:
        return float(match.group(0))
    return 0.0

# -------------------------------------------------------------
# START COMMAND (ስልክ ቁጥር መጠየቂያ)
# -------------------------------------------------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    player = get_player(user.id)
    
    # ሪፌራል ሊንኩን መያዝ
    if context.args and context.args[0].isdigit():
        context.user_data['referred_by'] = int(context.args[0])

    # ተጫዋቹ አስቀድሞ ስልክ አጋርቶ የተመዘገበ ከሆነ ቀጥታ ዋናውን ሜኑ ማሳየት
    if player and player.get("phone"):
        await update.message.reply_text(
            f"👋 እንኳን ደህና መጡ <b>{user.first_name}</b>!\n\n👇 ከታች ያሉትን በተኖች በመጠቀም ይጫወቱ፡",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )
        return

    # ተጫዋቹ አዲስ ከሆነ ስልክ እንዲያጋራ መጠየቅ
    await update.message.reply_text(
        f"""
🎰 <b>ወደ {BOT_NAME} እንኳን ደህና መጡ!</b>

👋 ሰላም <b>{user.first_name}</b>!

🎁 ለመመዝገብ እና የ <b>{WELCOME_BONUS} {CURRENCY}</b> ቦነስዎን ለማግኘት እባክዎን ከታች ያለውን <b>"📱 ስልክ ቁጥር ያጋሩ"</b> የሚለውን በተን ይጫኑ!
""",
        parse_mode="HTML",
        reply_markup=get_contact_keyboard()
    )

# -------------------------------------------------------------
# CONTACT HANDLER (ስልክ ቁጥር ሲላክ ምዝገባ ማጠናቀቂያ)
# -------------------------------------------------------------
async def handle_contact(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    contact = update.message.contact
    phone_number = contact.phone_number

    referred_by = context.user_data.get('referred_by', 0)
    is_new = add_player(user.id, user.first_name, user.username, referred_by, phone_number)
    
    if not is_new:
        update_phone(user.id, phone_number)

    inline_game_btn = InlineKeyboardMarkup([
        [InlineKeyboardButton("🕹️ አሁኑኑ ይጫወቱ (Play Game)", web_app=WebAppInfo(url=WEB_APP_URL))]
    ])

    await update.message.reply_text(
        f"""
🎉 <b>ምዝገባዎ በስኬት ተጠናቋል!</b>

📱 <b>ስልክ፡</b> <code>{phone_number}</code>
🎁 <b>Welcome Bonus :</b> <b>{WELCOME_BONUS} {CURRENCY}</b> ወደ አካውንትዎ ገብቷል!

👇 ከታች ባለው በተን መጫወት መጀመር ይችላሉ፦
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

    # ተጫዋቹ ገና ስልክ ቁጥር ካላጋራ እንዲያጋራ ማሳሰብ
    if not player or not player.get("phone"):
        await update.message.reply_text(
            "⚠️ ለመጠቀም በመጀመሪያ ስልክ ቁጥርዎን ማጋራት አለብዎት። /start ብለው ይጫኑ።",
            reply_markup=get_contact_keyboard()
        )
        return

    # 1. Deposit በተን
    if "Deposit" in text or "ብር መሙያ" in text:
        context.user_data['action'] = 'waiting_deposit'
        await update.message.reply_text(
            f"""
💳 <b>የክፍያ መረጃ (Deposit)</b>

እባክዎን ከታች ባሉት የክፍያ አማራጮች ብር ገቢ ያድርጉ፡

📱 <b>Telebirr:</b> <code>{TELEBIRR_ACCOUNT}</code>
🏦 <b>CBE Bank:</b> <code>{CBE_ACCOUNT}</code>
👤 <b>ስም:</b> {ACCOUNT_NAME}

ከከፈሉ በኋላ፡
<b>የላኩትን የብር መጠን እና የ Transaction ID/ቁጥር ይጻፉልን!</b>
<i>(ምሳሌ፡ 100 TXN123456)</i>
""",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )

    # 2. Withdraw በተን
    elif "Withdraw" in text or "ብር ማውጫ" in text:
        bal = player.get("balance", 0.0) if player else 0.0
        if bal < MIN_WITHDRAW:
            await update.message.reply_text(
                f"⚠️ ብር ለማውጣት አነስተኛው መጠን <b>{MIN_WITHDRAW} {CURRENCY}</b> መሆን አለበት።\n\nየእርስዎ Balance: <b>{bal} {CURRENCY}</b>",
                parse_mode="HTML",
                reply_markup=get_persistent_keyboard()
            )
            return

        context.user_data['action'] = 'waiting_withdraw'
        await update.message.reply_text(
            f"""
💸 <b>ብር ማውጫ (Withdraw)</b>

💰 <b>የእርስዎ Balance:</b> {bal} {CURRENCY}

እባክዎን **የሚያወጡትን የብር መጠን** እና **የ Telebirr/CBE ቁጥርዎን** በአንድ መስመር ፅፈው ይላኩ!

<i>(ምሳሌ፡ 100 Telebirr 0911223344)</i>
""",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )

    # 3. Game በተን
    elif "ጨዋታ ጀምር" in text or "Play Game" in text:
        context.user_data['action'] = None
        inline_game_btn = InlineKeyboardMarkup([
            [InlineKeyboardButton("🕹️ Game App ክፈት", web_app=WebAppInfo(url=WEB_APP_URL))]
        ])
        await update.message.reply_text("🎮 ጨዋታውን ለመጀመር ከታች ያለውን በተን ይጫኑ፡", reply_markup=inline_game_btn)

    # 4. Profile በተን
    elif "Profile" in text or "Balance" in text:
        context.user_data['action'] = None
        name = player.get("name", "ተጫዋች") if player else "ተጫዋች"
        tid = player.get("telegram_id", user.id) if player else user.id
        phone = player.get("phone") if player and player.get("phone") else "አልተመዘገበም"
        bal = player.get("balance", 0.0) if player else 0.0

        await update.message.reply_text(
            f"""
👤 <b>የተጫዋች Profile</b>

📝 <b>ስም :</b> {name}
🆔 <b>Telegram ID :</b> <code>{tid}</code>
📱 <b>ስልክ :</b> {phone}
💰 <b>የአሁኑ Balance :</b> <b>{bal} {CURRENCY}</b>
""",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )

    # 5. የ Deposit መረጃ መቀበያ
    elif action == 'waiting_deposit':
        context.user_data['action'] = None
        parsed_amount = extract_first_number(text)

        admin_keyboard = [
            [
                InlineKeyboardButton("✅ አፅድቅ (Approve)", callback_data=f"app_dep_{user.id}_{parsed_amount}"),
                InlineKeyboardButton("❌ ሰርዝ (Reject)", callback_data=f"rej_dep_{user.id}")
            ]
        ]
        await context.bot.send_message(
            chat_id=ADMIN_ID,
            text=f"📥 <b>አዲስ Deposit ጥያቄ!</b>\n\n👤 <b>ተጫዋች:</b> {user.first_name} (@{user.username})\n🆔 <b>ID:</b> <code>{user.id}</code>\n📝 <b>መረጃ:</b> {text}\n💡 <b>የተገመተ መጠን:</b> {parsed_amount} Birr",
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(admin_keyboard)
        )
        await update.message.reply_text("✅ የ Deposit ጥያቄዎ ለ Admin ደርሷል!", reply_markup=get_persistent_keyboard())

    # 6. የ Withdraw መረጃ መቀበያ
    elif action == 'waiting_withdraw':
        parsed_amount = extract_first_number(text)
        current_bal = player.get("balance", 0.0) if player else 0.0

        if parsed_amount <= 0 or parsed_amount > current_bal or parsed_amount < MIN_WITHDRAW:
            await update.message.reply_text(f"❌ የተሳሳተ ወይም በቂ ያልሆነ የብር መጠን። (ባላንስ: {current_bal} Birr)", reply_markup=get_persistent_keyboard())
            return

        context.user_data['action'] = None
        admin_keyboard = [
            [
                InlineKeyboardButton("✅ ከፈልኩ (Approve)", callback_data=f"app_wd_{user.id}_{parsed_amount}"),
                InlineKeyboardButton("❌ ሰርዝ (Reject)", callback_data=f"rej_wd_{user.id}")
            ]
        ]
        await context.bot.send_message(
            chat_id=ADMIN_ID,
            text=f"📤 <b>አዲስ Withdraw ጥያቄ!</b>\n\n👤 <b>ተጫዋች:</b> {user.first_name} (@{user.username})\n🆔 <b>ID:</b> <code>{user.id}</code>\n📝 <b>መረጃ:</b> {text}\n💵 <b>የሚወጣው መጠን:</b> {parsed_amount} Birr",
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(admin_keyboard)
        )
        await update.message.reply_text("✅ የ Withdraw ጥያቄዎ ተልኳል!", reply_markup=get_persistent_keyboard())

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
            f"🎁 <b>Bonus & Referral</b>\n\n👥 ጓደኞችዎን በመጋበዝ የ **{REFERRAL_BONUS} {CURRENCY}** ቦነስ ያግኙ!\n\n🔗 <b>የመጋበዣ ሊንክ፡</b>\n<code>{ref_link}</code>",
            parse_mode="HTML"
        )
    elif query.data == "help":
        await query.edit_message_text(
            "❓ <b>እርዳታ</b>\n\n1️⃣ **Deposit** ለመደመር ከታች ያለውን በተን ይጫኑ።\n2️⃣ **Withdraw** ለማውጣት ከታች ያለውን በተን ይጫኑ።",
            parse_mode="HTML"
        )

# -------------------------------------------------------------
# ADMIN APPROVAL / REJECTION HANDLER
# -------------------------------------------------------------
async def admin_approval(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data.split("_")
    action_type = data[0]
    sub_type = data[1]
    player_id = int(data[2])

    if action_type == "app" and sub_type == "dep":
        amount = float(data[3]) if len(data) > 3 else 0.0
        update_balance(player_id, amount)
        players_col.update_one({"telegram_id": str(player_id)}, {"$push": {"history": {"type": "Deposit", "amount": amount, "status": "Approved"}}})
        await query.edit_message_text(f"{query.message.text}\n\n✅ <b>ተፅድቋል! ({amount} Birr ተደማምሯል)</b>", parse_mode="HTML")
        await context.bot.send_message(chat_id=player_id, text=f"🎉 የ Deposit ጥያቄዎ ፅድቆ {amount} Birr ተደምሯል።", reply_markup=get_persistent_keyboard())

    elif action_type == "app" and sub_type == "wd":
        amount = float(data[3]) if len(data) > 3 else 0.0
        update_balance(player_id, -amount)
        players_col.update_one({"telegram_id": str(player_id)}, {"$push": {"history": {"type": "Withdraw", "amount": amount, "status": "Completed"}}})
        await query.edit_message_text(f"{query.message.text}\n\n✅ <b>ክፍያው ተፈፅሟል! ({amount} Birr ተቀንሷል)</b>", parse_mode="HTML")
        await context.bot.send_message(chat_id=player_id, text=f"🎉 የ Withdraw ጥያቄዎ ተፈፅሟል። {amount} Birr ተቀንሷል።", reply_markup=get_persistent_keyboard())

    elif action_type == "rej":
        await query.edit_message_text(f"{query.message.text}\n\n❌ <b>ጥያቄው ውድቅ ተደረገ!</b>", parse_mode="HTML")
        await context.bot.send_message(chat_id=player_id, text="❌ ጥያቄዎ ውድቅ ተደረገ።", reply_markup=get_persistent_keyboard())

# -------------------------------------------------------------
# MAIN APP LAUNCH
# -------------------------------------------------------------
if __name__ == "__main__":
    if not BOT_TOKEN or not MONGO_URI or not ADMIN_ID:
        raise RuntimeError("BOT_TOKEN, MONGO_URI and ADMIN_ID must be set in environment variables")
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
    app.add_handler(MessageHandler(filters.CONTACT, handle_contact)) # ስልክ ቁጥር መቀበያ
    app.add_handler(CallbackQueryHandler(admin_approval, pattern="^(app_|rej_)"))
    app.add_handler(CallbackQueryHandler(buttons))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_user_message))

    print("✅ Bot is running with contact registration flow...")
    app.run_polling(bootstrap_retries=-1, poll_interval=1.0)