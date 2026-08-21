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
# CONFIGURATION - áŠ¥á‹šáˆ… á‹¨áˆ«áˆµáˆ…áŠ• áŠ¥áˆ´á‰¶á‰½ áŠ áˆµáŒˆá‰£
# -------------------------------------------------------------
# áŠ¨ .env á‹ˆá‹­áˆ áŠ¨á‹šáˆ… á‰ á‰³á‰½ á‰ á‰€áŒ¥á‰³ áˆ˜áˆ™áˆ‹á‰µ á‰µá‰½áˆ‹áˆˆáˆ…

 

# .env áŠ«áˆˆáˆ… áŠ¨áˆ‹á‹­ á‹«áˆ‰á‰µáŠ• á‰£á‹¶ á‰µá‰°áˆ… á‹­áˆ…áŠ• áŠ á‰µáˆ°áˆ­á‹
try:
    load_dotenv()
    if os.getenv("BOT_TOKEN"):
        BOT_TOKEN = os.getenv("BOT_TOKEN")
    if os.getenv("MONGO_URI"):
        MONGO_URI = os.getenv("MONGO_URI")
    if os.getenv("ADMIN_ID"):
        ADMIN_ID = os.getenv("ADMIN_ID")
except:
    pass

TELEBIRR_ACCOUNT = "0902715499"  
CBE_ACCOUNT = "1000483349452"    
ACCOUNT_NAME = "ABRHAM MULU"   

CARD_PRICE = "10, 20, 50"     
REFERRAL_BONUS = 2.0            
WELCOME_BONUS = 10.0             
MIN_WITHDRAW = 50.0             

BOT_NAME = "Liyu Bingo"
CURRENCY = "Birr"

# ðŸŸ¢ Support Group / Channel link (á‹¨áˆ«áˆµáˆ…áŠ• á‰€á‹­áˆ­)
SUPPORT_GROUP_URL = "https://t.me/abmulu11"   # â† á‹¨ Support Group/Channel linkáˆ…áŠ• áŠ¥á‹šáˆ… áŒ»á
SUPPORT_PERSON_URL = "https://t.me/abmulu11"  # â† á‹¨ Admin/Support chat link

# -------------------------------------------------------------
# MONGODB CONNECTION SETUP
# -------------------------------------------------------------
client = pymongo.MongoClient(MONGO_URI)
db = client['liyu_bingo']
players_col = db['users']

# -------------------------------------------------------------
# KEYBOARD SETUP (á‰‹áˆš áŠ¥áŠ“ áŠ¢áŠ•áˆ‹á‹­áŠ• á‰ á‰°áŠ–á‰½)
# -------------------------------------------------------------
def get_contact_keyboard():
    """áˆµáˆáŠ­ á‰áŒ¥áˆ­ áˆˆáˆ˜áŒ á‹¨á‰‚á‹« á‹¨áˆšáˆ†áŠ• áŠ á‹áˆ«áˆ­"""
    keyboard = [
        [KeyboardButton("ðŸ“± áˆµáˆáŠ­ á‰áŒ¥áˆ­ á‹«áŒ‹áˆ© (Register)", request_contact=True)]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True, one_time_keyboard=True)

def get_persistent_keyboard():
    """áˆáˆáŒŠá‹œ á‰³á‰½ á‰ á‰‹áˆšáŠá‰µ á‹¨áˆšá‰€áˆ˜áŒ¡ á‰ á‰°áŠ–á‰½ (Reply Keyboard)"""
    keyboard = [
        [KeyboardButton("ðŸ’³ Deposit (á‰¥áˆ­ áˆ˜áˆ™á‹«)"), KeyboardButton("ðŸ’¸ Withdraw (á‰¥áˆ­ áˆ›á‹áŒ«)")],
        [KeyboardButton("ðŸŽ® áŒ¨á‹‹á‰³ áŒ€áˆáˆ­ (Play Game)"), KeyboardButton("ðŸ“Š Profile / Balance")],
        [KeyboardButton("ðŸŽ Referral Code"), KeyboardButton("ðŸ‘¥ Support Group")]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

def get_inline_menu():
    """á‰ áˆ˜áˆáŠ¥áŠ­á‰± áˆ‹á‹­ á‹¨áˆšá‹ˆáŒ¡ á‰°áŒ¨áˆ›áˆª á‰ á‰°áŠ–á‰½ (Inline Keyboard)"""
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("ðŸŽ Bonus & Referral", callback_data="referral")],
        [
            InlineKeyboardButton("â“ Help / áŠ¥áˆ­á‹³á‰³", callback_data="help"),
            InlineKeyboardButton("ðŸ‘¥ Support Group", url=SUPPORT_GROUP_URL)
        ],
        [InlineKeyboardButton("ðŸ’¬ Admin Support", url=SUPPORT_PERSON_URL)]
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
        return True # áŠ á‹²áˆµ á‰°áˆ˜á‹áŒ‹á‰¢
    return False # áŠ áˆµá‰€á‹µáˆž á‹¨á‰°áˆ˜á‹˜áŒˆá‰ 

def update_phone(telegram_id, phone):
    players_col.update_one({"telegram_id": str(telegram_id)}, {"$set": {"phone": phone}})

def update_balance(telegram_id, amount):
    players_col.update_one({"telegram_id": str(telegram_id)}, {"$inc": {"balance": float(amount)}})

def get_player(telegram_id):
    return players_col.find_one({"telegram_id": str(telegram_id)})

def extract_first_number(text):
    """áŠ¨áŒ½áˆ‘á á‹áˆµáŒ¥ á‹¨áˆ˜áŒ€áˆ˜áˆªá‹«á‹áŠ• á‹¨á‰¥áˆ­ á‰áŒ¥áˆ­ áˆˆá‹­á‰¶ áˆ›á‹áŒ«"""
    match = re.search(r'\b\d+(\.\d+)?\b', text)
    if match:
        return float(match.group(0))
    return 0.0

# -------------------------------------------------------------
# START COMMAND (áˆµáˆáŠ­ á‰áŒ¥áˆ­ áˆ˜áŒ á‹¨á‰‚á‹«)
# -------------------------------------------------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    player = get_player(user.id)
    
    # áˆªáŒáˆ«áˆ áˆŠáŠ•áŠ©áŠ• áˆ˜á‹«á‹
    if context.args and context.args[0].isdigit():
        context.user_data['referred_by'] = int(context.args[0])

    # á‰°áŒ«á‹‹á‰¹ áŠ áˆµá‰€á‹µáˆž áˆµáˆáŠ­ áŠ áŒ‹áˆ­á‰¶ á‹¨á‰°áˆ˜á‹˜áŒˆá‰  áŠ¨áˆ†áŠ á‰€áŒ¥á‰³ á‹‹áŠ“á‹áŠ• áˆœáŠ‘ áˆ›áˆ³á‹¨á‰µ
    if player and player.get("phone"):
        await update.message.reply_text(
            f"ðŸ‘‹ áŠ¥áŠ•áŠ³áŠ• á‹°áˆ…áŠ“ áˆ˜áŒ¡ <b>{user.first_name}</b>!\n\nðŸ‘‡ áŠ¨á‰³á‰½ á‹«áˆ‰á‰µáŠ• á‰ á‰°áŠ–á‰½ á‰ áˆ˜áŒ á‰€áˆ á‹­áŒ«á‹ˆá‰±á¡",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )
        return

    # á‰°áŒ«á‹‹á‰¹ áŠ á‹²áˆµ áŠ¨áˆ†áŠ áˆµáˆáŠ­ áŠ¥áŠ•á‹²á‹«áŒ‹áˆ« áˆ˜áŒ á‹¨á‰…
    await update.message.reply_text(
        f"""
ðŸŽ° <b>á‹ˆá‹° {BOT_NAME} áŠ¥áŠ•áŠ³áŠ• á‹°áˆ…áŠ“ áˆ˜áŒ¡!</b>

ðŸ‘‹ áˆ°áˆ‹áˆ <b>{user.first_name}</b>!

ðŸŽ áˆˆáˆ˜áˆ˜á‹áŒˆá‰¥ áŠ¥áŠ“ á‹¨ <b>{WELCOME_BONUS} {CURRENCY}</b> á‰¦áŠáˆµá‹ŽáŠ• áˆˆáˆ›áŒáŠ˜á‰µ áŠ¥á‰£áŠ­á‹ŽáŠ• áŠ¨á‰³á‰½ á‹«áˆˆá‹áŠ• <b>"ðŸ“± áˆµáˆáŠ­ á‰áŒ¥áˆ­ á‹«áŒ‹áˆ©"</b> á‹¨áˆšáˆˆá‹áŠ• á‰ á‰°áŠ• á‹­áŒ«áŠ‘!
""",
        parse_mode="HTML",
        reply_markup=get_contact_keyboard()
    )

# -------------------------------------------------------------
# CONTACT HANDLER (áˆµáˆáŠ­ á‰áŒ¥áˆ­ áˆ²áˆ‹áŠ­ áˆá‹áŒˆá‰£ áˆ›áŒ áŠ“á‰€á‰‚á‹«)
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
        [InlineKeyboardButton("ðŸ•¹ï¸ áŠ áˆáŠ‘áŠ‘ á‹­áŒ«á‹ˆá‰± (Play Game)", web_app=WebAppInfo(url=WEB_APP_URL))]
    ])

    await update.message.reply_text(
        f"""
ðŸŽ‰ <b>áˆá‹áŒˆá‰£á‹Ž á‰ áˆµáŠ¬á‰µ á‰°áŒ áŠ“á‰‹áˆ!</b>

ðŸ“± <b>áˆµáˆáŠ­á¡</b> <code>{phone_number}</code>
ðŸŽ <b>Welcome Bonus :</b> <b>{WELCOME_BONUS} {CURRENCY}</b> á‹ˆá‹° áŠ áŠ«á‹áŠ•á‰µá‹Ž áŒˆá‰¥á‰·áˆ!

ðŸ‘‡ áŠ¨á‰³á‰½ á‰£áˆˆá‹ á‰ á‰°áŠ• áˆ˜áŒ«á‹ˆá‰µ áˆ˜áŒ€áˆ˜áˆ­ á‹­á‰½áˆ‹áˆ‰á¦
""",
        parse_mode="HTML",
        reply_markup=get_persistent_keyboard()
    )

    await update.message.reply_text("ðŸŽ® áŒ¨á‹‹á‰³á‹áŠ• áˆˆáˆ˜áŠ­áˆá‰µá¡", reply_markup=inline_game_btn)

# -------------------------------------------------------------
# HANDLER FOR MESSAGES AND PERSISTENT BUTTONS
# -------------------------------------------------------------
async def handle_user_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    text = update.message.text
    action = context.user_data.get('action')
    player = get_player(user.id)

    # á‰°áŒ«á‹‹á‰¹ áŒˆáŠ“ áˆµáˆáŠ­ á‰áŒ¥áˆ­ áŠ«áˆ‹áŒ‹áˆ« áŠ¥áŠ•á‹²á‹«áŒ‹áˆ« áˆ›áˆ³áˆ°á‰¥
    if not player or not player.get("phone"):
        await update.message.reply_text(
            "âš ï¸ áˆˆáˆ˜áŒ á‰€áˆ á‰ áˆ˜áŒ€áˆ˜áˆªá‹« áˆµáˆáŠ­ á‰áŒ¥áˆ­á‹ŽáŠ• áˆ›áŒ‹áˆ«á‰µ áŠ áˆˆá‰¥á‹Žá‰µá¢ /start á‰¥áˆˆá‹ á‹­áŒ«áŠ‘á¢",
            reply_markup=get_contact_keyboard()
        )
        return

    # 1. Deposit á‰ á‰°áŠ•
    if "Deposit" in text or "á‰¥áˆ­ áˆ˜áˆ™á‹«" in text:
        context.user_data['action'] = 'waiting_deposit'
        await update.message.reply_text(
            f"""
ðŸ’³ <b>á‹¨áŠ­áá‹« áˆ˜áˆ¨áŒƒ (Deposit)</b>

áŠ¥á‰£áŠ­á‹ŽáŠ• áŠ¨á‰³á‰½ á‰£áˆ‰á‰µ á‹¨áŠ­áá‹« áŠ áˆ›áˆ«áŒ®á‰½ á‰¥áˆ­ áŒˆá‰¢ á‹«á‹µáˆ­áŒ‰á¡

ðŸ“± <b>Telebirr:</b> <code>{TELEBIRR_ACCOUNT}</code>
ðŸ¦ <b>CBE Bank:</b> <code>{CBE_ACCOUNT}</code>
ðŸ‘¤ <b>áˆµáˆ:</b> {ACCOUNT_NAME}

áŠ¨áŠ¨áˆáˆ‰ á‰ áŠ‹áˆ‹á¡
<b>á‹¨áˆ‹áŠ©á‰µáŠ• á‹¨á‰¥áˆ­ áˆ˜áŒ áŠ• áŠ¥áŠ“ á‹¨ Transaction ID/á‰áŒ¥áˆ­ á‹­áŒ»á‰áˆáŠ•!</b>
<i>(áˆáˆ³áˆŒá¡ 100 TXN123456)</i>
""",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )

    # 2. Withdraw á‰ á‰°áŠ•
    elif "Withdraw" in text or "á‰¥áˆ­ áˆ›á‹áŒ«" in text:
        bal = player.get("balance", 0.0) if player else 0.0
        if bal < MIN_WITHDRAW:
            await update.message.reply_text(
                f"âš ï¸ á‰¥áˆ­ áˆˆáˆ›á‹áŒ£á‰µ áŠ áŠáˆµá‰°áŠ›á‹ áˆ˜áŒ áŠ• <b>{MIN_WITHDRAW} {CURRENCY}</b> áˆ˜áˆ†áŠ• áŠ áˆˆá‰ á‰µá¢\n\ná‹¨áŠ¥áˆ­áˆµá‹Ž Balance: <b>{bal} {CURRENCY}</b>",
                parse_mode="HTML",
                reply_markup=get_persistent_keyboard()
            )
            return

        context.user_data['action'] = 'waiting_withdraw'
        await update.message.reply_text(
            f"""
ðŸ’¸ <b>á‰¥áˆ­ áˆ›á‹áŒ« (Withdraw)</b>

ðŸ’° <b>á‹¨áŠ¥áˆ­áˆµá‹Ž Balance:</b> {bal} {CURRENCY}

áŠ¥á‰£áŠ­á‹ŽáŠ• **á‹¨áˆšá‹«á‹ˆáŒ¡á‰µáŠ• á‹¨á‰¥áˆ­ áˆ˜áŒ áŠ•** áŠ¥áŠ“ **á‹¨ Telebirr/CBE á‰áŒ¥áˆ­á‹ŽáŠ•** á‰ áŠ áŠ•á‹µ áˆ˜áˆµáˆ˜áˆ­ á…áˆá‹ á‹­áˆ‹áŠ©!

<i>(áˆáˆ³áˆŒá¡ 100 Telebirr 0911223344)</i>
""",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )

    # 3. Game á‰ á‰°áŠ•
    elif "áŒ¨á‹‹á‰³ áŒ€áˆáˆ­" in text or "Play Game" in text:
        context.user_data['action'] = None
        inline_game_btn = InlineKeyboardMarkup([
            [InlineKeyboardButton("ðŸ•¹ï¸ Game App áŠ­áˆá‰µ", web_app=WebAppInfo(url=WEB_APP_URL))]
        ])
        await update.message.reply_text("ðŸŽ® áŒ¨á‹‹á‰³á‹áŠ• áˆˆáˆ˜áŒ€áˆ˜áˆ­ áŠ¨á‰³á‰½ á‹«áˆˆá‹áŠ• á‰ á‰°áŠ• á‹­áŒ«áŠ‘á¡", reply_markup=inline_game_btn)

    # 4. Profile á‰ á‰°áŠ•
    elif "Profile" in text or "Balance" in text:
        context.user_data['action'] = None
        name = player.get("name", "á‰°áŒ«á‹‹á‰½") if player else "á‰°áŒ«á‹‹á‰½"
        tid = player.get("telegram_id", user.id) if player else user.id
        phone = player.get("phone") if player and player.get("phone") else "áŠ áˆá‰°áˆ˜á‹˜áŒˆá‰ áˆ"
        bal = player.get("balance", 0.0) if player else 0.0

        await update.message.reply_text(
            f"""
ðŸ‘¤ <b>á‹¨á‰°áŒ«á‹‹á‰½ Profile</b>

ðŸ“ <b>áˆµáˆ :</b> {name}
ðŸ†” <b>Telegram ID :</b> <code>{tid}</code>
ðŸ“± <b>áˆµáˆáŠ­ :</b> {phone}
ðŸ’° <b>á‹¨áŠ áˆáŠ‘ Balance :</b> <b>{bal} {CURRENCY}</b>
""",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )

    # 4b. Referral Code á‰ á‰°áŠ•
    elif "Referral" in text or "Referral Code" in text:
        context.user_data['action'] = None
        bot_username = (await context.bot.get_me()).username
        ref_link = f"https://t.me/{bot_username}?start={user.id}"
        await update.message.reply_text(
            f"""
ðŸŽ <b>Referral Code / á‹¨áˆ˜áŒ‹á‰ á‹£ áˆŠáŠ•áŠ­</b>

ðŸ‘¥ áŒ“á‹°áŠžá‰½á‹ŽáŠ• á‰ áˆ˜áŒ‹á‰ á‹ áŠ¥á‹«áŠ•á‹³áŠ•á‹± áŠ á‹²áˆµ á‰°áŒ«á‹‹á‰½ áˆ²áˆ˜á‹˜áŒˆá‰¥
ðŸ’° <b>{REFERRAL_BONUS} {CURRENCY}</b> á‰¦áŠáˆµ á‹«áŒˆáŠ›áˆ‰!

ðŸ”— <b>á‹¨áŠ¥áˆ­áˆµá‹Ž áˆŠáŠ•áŠ­á¡</b>
<code>{ref_link}</code>

ðŸ“‹ áˆŠáŠ•áŠ©áŠ• copy áŠ á‹µáˆ­áŒˆá‹ áˆˆáŒ“á‹°áŠžá‰½á‹Ž á‹­áˆ‹áŠ©á¢
""",
            parse_mode="HTML",
            reply_markup=get_persistent_keyboard()
        )

    # 4c. Support Group á‰ á‰°áŠ•
    elif "Support Group" in text or "Support" in text:
        context.user_data['action'] = None
        await update.message.reply_text(
            f"""
ðŸ‘¥ <b>Support Group / á‹µáŒ‹á</b>

áŒ¥á‹«á‰„á£ á‰½áŒáˆ­ á‹ˆá‹­áˆ áŠ¥áˆ­á‹³á‰³ áŠ¨áˆáˆˆáŒ‰ áŠ¨á‰³á‰½ á‹«áˆ‰á‰µáŠ• á‹­áŒ á‰€áˆ™á¡
""",
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("ðŸ‘¥ Support Group", url=SUPPORT_GROUP_URL)],
                [InlineKeyboardButton("ðŸ’¬ Admin Support", url=SUPPORT_PERSON_URL)]
            ])
        )

    # 5. á‹¨ Deposit áˆ˜áˆ¨áŒƒ áˆ˜á‰€á‰ á‹«
    elif action == 'waiting_deposit':
        context.user_data['action'] = None
        parsed_amount = extract_first_number(text)

        admin_keyboard = [
            [
                InlineKeyboardButton("âœ… áŠ á…á‹µá‰… (Approve)", callback_data=f"app_dep_{user.id}_{parsed_amount}"),
                InlineKeyboardButton("âŒ áˆ°áˆ­á‹ (Reject)", callback_data=f"rej_dep_{user.id}")
            ]
        ]
        await context.bot.send_message(
            chat_id=ADMIN_ID,
            text=f"ðŸ“¥ <b>áŠ á‹²áˆµ Deposit áŒ¥á‹«á‰„!</b>\n\nðŸ‘¤ <b>á‰°áŒ«á‹‹á‰½:</b> {user.first_name} (@{user.username})\nðŸ†” <b>ID:</b> <code>{user.id}</code>\nðŸ“ <b>áˆ˜áˆ¨áŒƒ:</b> {text}\nðŸ’¡ <b>á‹¨á‰°áŒˆáˆ˜á‰° áˆ˜áŒ áŠ•:</b> {parsed_amount} Birr",
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(admin_keyboard)
        )
        await update.message.reply_text("âœ… á‹¨ Deposit áŒ¥á‹«á‰„á‹Ž áˆˆ Admin á‹°áˆ­áˆ·áˆ!", reply_markup=get_persistent_keyboard())

    # 6. á‹¨ Withdraw áˆ˜áˆ¨áŒƒ áˆ˜á‰€á‰ á‹«
    elif action == 'waiting_withdraw':
        parsed_amount = extract_first_number(text)
        current_bal = player.get("balance", 0.0) if player else 0.0

        if parsed_amount <= 0 or parsed_amount > current_bal or parsed_amount < MIN_WITHDRAW:
            await update.message.reply_text(f"âŒ á‹¨á‰°áˆ³áˆ³á‰° á‹ˆá‹­áˆ á‰ á‰‚ á‹«áˆáˆ†áŠ á‹¨á‰¥áˆ­ áˆ˜áŒ áŠ•á¢ (á‰£áˆ‹áŠ•áˆµ: {current_bal} Birr)", reply_markup=get_persistent_keyboard())
            return

        context.user_data['action'] = None
        admin_keyboard = [
            [
                InlineKeyboardButton("âœ… áŠ¨áˆáˆáŠ© (Approve)", callback_data=f"app_wd_{user.id}_{parsed_amount}"),
                InlineKeyboardButton("âŒ áˆ°áˆ­á‹ (Reject)", callback_data=f"rej_wd_{user.id}")
            ]
        ]
        await context.bot.send_message(
            chat_id=ADMIN_ID,
            text=f"ðŸ“¤ <b>áŠ á‹²áˆµ Withdraw áŒ¥á‹«á‰„!</b>\n\nðŸ‘¤ <b>á‰°áŒ«á‹‹á‰½:</b> {user.first_name} (@{user.username})\nðŸ†” <b>ID:</b> <code>{user.id}</code>\nðŸ“ <b>áˆ˜áˆ¨áŒƒ:</b> {text}\nðŸ’µ <b>á‹¨áˆšá‹ˆáŒ£á‹ áˆ˜áŒ áŠ•:</b> {parsed_amount} Birr",
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(admin_keyboard)
        )
        await update.message.reply_text("âœ… á‹¨ Withdraw áŒ¥á‹«á‰„á‹Ž á‰°áˆáŠ³áˆ!", reply_markup=get_persistent_keyboard())

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
            f"""ðŸŽ <b>Bonus & Referral</b>

ðŸ‘¥ áŒ“á‹°áŠžá‰½á‹ŽáŠ• á‰ áˆ˜áŒ‹á‰ á‹ áŠ¥á‹«áŠ•á‹³áŠ•á‹± áŠ á‹²áˆµ á‰°áŒ«á‹‹á‰½ áˆ²áˆ˜á‹˜áŒˆá‰¥
ðŸ’° <b>{REFERRAL_BONUS} {CURRENCY}</b> á‰¦áŠáˆµ á‹«áŒˆáŠ›áˆ‰!

ðŸ”— <b>á‹¨áŠ¥áˆ­áˆµá‹Ž Referral Linká¡</b>
<code>{ref_link}</code>

ðŸ“‹ áˆŠáŠ•áŠ©áŠ• copy áŠ á‹µáˆ­áŒˆá‹ á‹«áŒ‹áˆ©á¢
""",
            parse_mode="HTML"
        )
    elif query.data == "help":
        await query.edit_message_text(
            f"""â“ <b>áŠ¥áˆ­á‹³á‰³</b>

1ï¸âƒ£ <b>Deposit</b> â€” á‰¥áˆ­ áˆˆáˆ˜áˆ™áˆ‹á‰µ
2ï¸âƒ£ <b>Withdraw</b> â€” á‰¥áˆ­ áˆˆáˆ›á‹áŒ£á‰µ
3ï¸âƒ£ <b>áŒ¨á‹‹á‰³ áŒ€áˆáˆ­</b> â€” Mini Game áˆˆáˆ˜áŠ­áˆá‰µ
4ï¸âƒ£ <b>Referral Code</b> â€” áŒ“á‹°áŠžá‰½áŠ• á‰ áˆ˜áŒ‹á‰ á‹ á‰¦áŠáˆµ
5ï¸âƒ£ <b>Support Group</b> â€” áŠ¥áˆ­á‹³á‰³ / á‹µáŒ‹á

ðŸ’¬ á‰°áŒ¨áˆ›áˆª áŠ¥áˆ­á‹³á‰³: {SUPPORT_GROUP_URL}
""",
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
        await query.edit_message_text(f"{query.message.text}\n\nâœ… <b>á‰°á…á‹µá‰‹áˆ! ({amount} Birr á‰°á‹°áˆ›áˆáˆ¯áˆ)</b>", parse_mode="HTML")
        await context.bot.send_message(chat_id=player_id, text=f"ðŸŽ‰ á‹¨ Deposit áŒ¥á‹«á‰„á‹Ž á…á‹µá‰† {amount} Birr á‰°á‹°áˆáˆ¯áˆá¢", reply_markup=get_persistent_keyboard())

    elif action_type == "app" and sub_type == "wd":
        amount = float(data[3]) if len(data) > 3 else 0.0
        update_balance(player_id, -amount)
        players_col.update_one({"telegram_id": str(player_id)}, {"$push": {"history": {"type": "Withdraw", "amount": amount, "status": "Completed"}}})
        await query.edit_message_text(f"{query.message.text}\n\nâœ… <b>áŠ­áá‹«á‹ á‰°áˆá…áˆŸáˆ! ({amount} Birr á‰°á‰€áŠ•áˆ·áˆ)</b>", parse_mode="HTML")
        await context.bot.send_message(chat_id=player_id, text=f"ðŸŽ‰ á‹¨ Withdraw áŒ¥á‹«á‰„á‹Ž á‰°áˆá…áˆŸáˆá¢ {amount} Birr á‰°á‰€áŠ•áˆ·áˆá¢", reply_markup=get_persistent_keyboard())

    elif action_type == "rej":
        await query.edit_message_text(f"{query.message.text}\n\nâŒ <b>áŒ¥á‹«á‰„á‹ á‹á‹µá‰… á‰°á‹°áˆ¨áŒˆ!</b>", parse_mode="HTML")
        await context.bot.send_message(chat_id=player_id, text="âŒ áŒ¥á‹«á‰„á‹Ž á‹á‹µá‰… á‰°á‹°áˆ¨áŒˆá¢", reply_markup=get_persistent_keyboard())

# -------------------------------------------------------------
# MAIN APP LAUNCH
# -------------------------------------------------------------
if __name__ == "__main__":
    if (not BOT_TOKEN or BOT_TOKEN.startswith("YOUR_")) or (not MONGO_URI or MONGO_URI.startswith("YOUR_")) or (not ADMIN_ID or ADMIN_ID.startswith("YOUR_")):
        raise RuntimeError("âŒ áŠ¥á‰£áŠ­á‹Ž BOT_TOKEN, MONGO_URI áŠ¥áŠ“ ADMIN_ID áŠ• á‰  main.py á‹áˆµáŒ¥ (áŠ¨áˆ‹á‹­) á‹­áˆ™áˆ‰!")
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
    app.add_handler(MessageHandler(filters.CONTACT, handle_contact)) # áˆµáˆáŠ­ á‰áŒ¥áˆ­ áˆ˜á‰€á‰ á‹«
    app.add_handler(CallbackQueryHandler(admin_approval, pattern="^(app_|rej_)"))
    app.add_handler(CallbackQueryHandler(buttons))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_user_message))

    print("âœ… Bot is running with contact registration flow...")
    app.run_polling(bootstrap_retries=-1, poll_interval=1.0)