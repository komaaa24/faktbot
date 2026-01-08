# PM2 bilan Sevgi She'rlari Botini Ishga Tushirish

## 1. Tayyorgarlik

```bash
# Loyihani build qilish
npm run build

# Logs papkasini yaratish
mkdir -p logs
```

## 2. PM2 bilan Ishga Tushirish

```bash
# Barcha jarayonlarni ishga tushirish
pm2 start ecosystem.config.cjs

# Yoki faqat botni ishga tushirish
pm2 start ecosystem.config.cjs --only sevgi-sherlar-bot

# Yoki faqat payment gateway'ni ishga tushirish
pm2 start ecosystem.config.cjs --only sevgi-payment-gateway
```

## 3. PM2 Buyruqlari

```bash
# Statusni ko'rish
pm2 status

# Loglarni ko'rish
pm2 logs sevgi-sherlar-bot
pm2 logs sevgi-payment-gateway

# Botni restart qilish
pm2 restart sevgi-sherlar-bot

# Botni to'xtatish
pm2 stop sevgi-sherlar-bot

# Botni o'chirish
pm2 delete sevgi-sherlar-bot

# Barcha botlarni restart qilish
pm2 restart all

# Barcha botlarni to'xtatish
pm2 stop all

# PM2 ni reboot'dan keyin avtomatik ishga tushirish
pm2 startup
pm2 save
```

## 4. Yangi Kod Deploy Qilish

```bash
# 1. GitHub'dan tortish
git pull origin master

# 2. Build qilish
npm run build

# 3. PM2 restart
pm2 restart all
```

## 5. Monitoring

```bash
# Real-time monitoring
pm2 monit

# CPU va RAM ishlatish
pm2 list
```

## 6. Logs

Loglar `logs/` papkasida saqlanadi:
- `logs/out.log` - Bot loglar
- `logs/error.log` - Bot errorlar
- `logs/gateway-out.log` - Gateway loglar
- `logs/gateway-error.log` - Gateway errorlar

## Portlar

- Bot: `9988`
- Payment Gateway: `9999`
