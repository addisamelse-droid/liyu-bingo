# Liyu Bingo - Fixed Version

## የተስተካከሉ ችግሮች (Fixes Applied)

### 1. Sound (ድምጽ)
- ቁጥር ሲጠራ ድምጽ አይሰማም የነበረው ችግር ተስተካክሏል
- ፋይል ስሞች lowercase (b12.mp3) ስለሆኑ frontend ኮድ ተቀይሯል
- /sounds path ሁለት ቦታ ይመለከታል (root/sounds + public/sounds)

### 2. Wallet Sync (ገንዘብ ማመሳሰል)
- ካርድ ሲመረጥ / ሲነሳ ገንዘብ በ MongoDB ላይ ይቀንሳል/ይጨምራል
- አሸናፊ ሲወጣ ሽልማቱ balance ላይ ይጨመራል
- Bot እና Mini App ሁለቱም አንድ MongoDB users collection ይጠቀማሉ
- Mini App በየ 5 ሰከንድ balance ያድሳል + Socket real-time update አለው

### 3. ካርድ ሲመረጥ
- ገንዘብ ይቀንሳል + History ላይ "Card Buy" ይመዘገባል
- ካርድ ሲነሳ ገንዘብ ይመለሳል + "Card Refund" ይመዘገባል
- telegram_id በተሻለ መንገድ ይያዛል

### 4. አሸናፊ
- ያሸነፈው ገንዘብ balance ላይ ይጨመራል
- History ላይ "Win" ይመዘገባል
- ሁሉም የተጠቃሚው ሶኬቶች real-time ያዘምናሉ

### 5. Disconnect Refund
- ጨዋታ ከመጀመሩ በፊት ተጫዋች ከወጣ የካርዶቹ ገንዘብ ይመለሳል

### 6. Cleanup
- የቆየ አላስፈላጊ script.js / app.js ከ public/ ተወግደዋል

## እንዴት ማስኬድ

1. Environment Variables (Render ወይም .env):
   - MONGO_URI
   - BOT_TOKEN
   - ADMIN_ID / ADMIN_CHAT_ID
   - WEB_APP_URL (የ Render URLዎ)

2. Node Server:
   npm install
   npm start

3. Python Bot (በተለየ terminal/process):
   pip install python-telegram-bot pymongo python-dotenv
   python main.py

4. main.py ውስጥ WEB_APP_URL ን ወደ የእርስዎ Render URL ይቀይሩ
