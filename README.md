# 💼 Biznes G'oyalari Telegram Bot

Professional Telegram bot with Click payment integration for delivering curated business ideas and practical guidance.

## ✨ Features

- 💡 Biznes g'oyalari va amaliy tavsiyalar
- 🎲 Tasodifiy g'oya tanlash
- 💳 Click.uz to'lov integratsiyasi
- 👤 Foydalanuvchilar boshqaruvi
- 📊 Ko'rishlar statistikasi
- 🔄 API dan avtomatik sinxronlash
- 🎯 5 ta bepul g'oya
- ✅ Bir martalik to'lov - cheksiz kirish

## 🛠 Tech Stack

- **Runtime:** Node.js
- **Framework:** Grammy (Telegram Bot Framework)
- **Database:** PostgreSQL
- **ORM:** TypeORM
- **Payment:** Click.uz
- **Language:** TypeScript

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Telegram Bot Token
- Click.uz Merchant Account

## 🚀 Installation

1. **Clone repository:**
   ```bash
   git clone <your-repo-url>
   cd pul_topish
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Setup environment:**
   ```bash
   cp .env.example .env
   ```

4. **Configure `.env` file:**
   ```env
   BOT_TOKEN=your_telegram_bot_token

   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASS=your_password
   DB_NAME=pul_topish

   CLICK_SERVICE_ID=87085
   CLICK_MERCHANT_ID=7269
   CLICK_SECRET_KEY=your_click_secret_key
   CLICK_DEFAULT_AMOUNT=1111
   CLICK_RETURN_URL=https://t.me/your_bot_username

   PORT=3000
   ADMIN_IDS=your_telegram_id

   # ProgramSoft API (Biznes g'oyalari)
   PROGRAMSOFT_API_URL=https://www.programsoft.uz/api
   PROGRAMSOFT_SERVICE_ID=64
   PROGRAMSOFT_PAGES=12
   ```

5. **Create database:**
   ```bash
   createdb pul_topish
   ```

## 🎮 Usage

### Development mode:
```bash
npm run dev
```

### Production mode:
```bash
npm run build
npm run start:prod
```

### Sync ideas manually:
Use `/sync` command in bot (admin only)

## 🔧 Project Structure

```
src/
├── database/
│   └── data-source.ts       # TypeORM configuration
├── entities/
│   ├── User.ts              # User entity
│   ├── Joke.ts              # Business ideas content (stored in jokes table)
│   └── Payment.ts           # Payment entity
├── services/
│   ├── user.service.ts      # User business logic
│   ├── joke.service.ts      # ProgramSoft API integration (biznes g'oyalari)
│   └── click.service.ts     # Click payment service
├── handlers/
│   ├── bot.handlers.ts      # Bot command handlers
│   └── webhook.handlers.ts  # Click webhook handlers
└── main.ts                  # Application entry point
```

## 📱 Bot Commands

- `/start` - Start bot and show content
- `/sync` - Sync ideas from API (admin only)

## 💰 Payment Flow

1. User views 5 free ideas
2. Bot offers payment option
3. Click payment link generated
4. User completes payment
5. Webhook confirms payment
6. User gets unlimited access

## 🔐 Click.uz Integration

### Webhook URL:
```
https://yourdomain.com/webhook/pay
```

### Methods Implemented:
- ✅ PREPARE (action=0)
- ✅ COMPLETE (action=1)

### Security:
- Signature verification
- Amount validation
- Transaction deduplication

## 📊 Database Schema

### Users
- telegramId (unique)
- username, firstName, lastName
- hasPaid (boolean)
- viewedJokes (counter)

### Ideas (jokes table)
- externalId (from API)
- category
- content (text)
- views (counter)

### Payments
- transactionParam (UUID)
- userId (relation)
- amount, status
- Click transaction IDs
- metadata (JSONB)

## 🔒 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| BOT_TOKEN | Telegram bot token | ✅ |
| DB_HOST | PostgreSQL host | ✅ |
| DB_PORT | PostgreSQL port | ✅ |
| DB_USER | Database user | ✅ |
| DB_PASS | Database password | ✅ |
| DB_NAME | Database name | ✅ |
| CLICK_SERVICE_ID | Click service ID | ✅ |
| CLICK_MERCHANT_ID | Click merchant ID | ✅ |
| CLICK_SECRET_KEY | Click secret key | ✅ |
| CLICK_DEFAULT_AMOUNT | Payment amount (tiyin) | ✅ |
| CLICK_RETURN_URL | Return URL after payment | ✅ |
| PORT | Webhook server port | ❌ |
| ADMIN_IDS | Admin Telegram IDs | ❌ |
| PROGRAMSOFT_API_URL | ProgramSoft API base | ✅ |
| PROGRAMSOFT_SERVICE_ID | ProgramSoft service ID | ✅ |
| PROGRAMSOFT_PAGES | API pages to sync | ❌ |

## 🐛 Troubleshooting

### Database connection error:
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Create database if not exists
createdb pul_topish
```

### Bot not responding:
- Check BOT_TOKEN is correct
- Verify bot is not running elsewhere
- Check network/firewall settings

### Webhook not working:
- Ensure server is publicly accessible
- Check HTTPS certificate (production)
- Verify Click.uz webhook URL configured

## 📝 License

MIT

## 👨‍💻 Author

Professional Senior Developer

---

Made with ❤️ using Grammy & TypeScript
