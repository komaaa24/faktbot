import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import { Bot } from "grammy";
import { AppDataSource } from "./database/data-source.js";
import { SherlarDataSource } from "./database/sherlar-data-source.js";
import {
    handleStart,
    handleShowJokes,
    handleNext,
    handlePayment,
    handleCheckPayment,
    syncJokesFromAPI,
    handleUploadBackground,
    handleLanguageMenu,
    handleSetLanguage
} from "./handlers/bot.handlers.js";
import {
    handlePaymentWebhook
} from "./handlers/webhook.handlers.js";
import {
    handleAdminPanel,
    handleAdminCallback,
    handleApproveBytelegramId,
    handleRevokeByTelegramId
} from "./handlers/admin.handlers.js";
import { UserService } from "./services/user.service.js";
import { getMessages, normalizeLanguage } from "./services/i18n.service.js";

// Environment variables validation
const requiredEnvVars = [
    "BOT_TOKEN",
    "PROGRAMSOFT_API_URL",
    "PROGRAMSOFT_UZ_SERVICE_ID",
    "PROGRAMSOFT_EN_SERVICE_ID",
    "PROGRAMSOFT_RU_SERVICE_ID"
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

const BOT_TOKEN = process.env.BOT_TOKEN!;
const PORT = Number(process.env.PORT) || 3000;

// Initialize bot
const bot = new Bot(BOT_TOKEN);
const userService = new UserService();

// Error handling
bot.catch((err) => {
    console.error("❌ Bot error:", err);
});

/**
 * Bot command handlers
 */
bot.command("start", handleStart);
bot.command("lang", handleLanguageMenu);

// Super Admin Panel
bot.command("admin", handleAdminPanel);

// To'lovni qo'lda tasdiqlash
bot.command("approve", async (ctx) => {
    const userId = ctx.from?.id;
    const ADMIN_IDS = [7789445876, 1083408];

    if (!userId || !ADMIN_IDS.includes(userId)) {
        return ctx.reply("⛔️ Bu buyruq faqat super admin uchun!");
    }

    const args = ctx.message?.text?.split(" ");
    if (!args || args.length < 2) {
        return ctx.reply(
            `📝 <b>TO'LOVNI TASDIQLASH</b>\n\n` +
            `Foydalanish: /approve TELEGRAM_ID\n\n` +
            `Masalan: /approve 7789445876`,
            { parse_mode: "HTML" }
        );
    }

    const telegramId = parseInt(args[1]);
    if (isNaN(telegramId)) {
        return ctx.reply("❌ Noto'g'ri Telegram ID!");
    }

    await handleApproveBytelegramId(ctx, telegramId);
});

// Obunani bekor qilish (Super Admin)
bot.command("revoke", async (ctx) => {
    const userId = ctx.from?.id;
    const ADMIN_IDS = [7789445876, 1083408];

    if (!userId || !ADMIN_IDS.includes(userId)) {
        return ctx.reply("⛔️ Bu buyruq faqat super admin uchun!");
    }

    const args = ctx.message?.text?.split(" ");
    if (!args || args.length < 2) {
        return ctx.reply(
            `📝 <b>OBUNANI BEKOR QILISH</b>\n\n` +
            `Foydalanish: /revoke TELEGRAM_ID\n\n` +
            `Masalan: /revoke 7789445876\n\n` +
            `Bu buyruq foydalanuvchining obunasini bekor qiladi.`,
            { parse_mode: "HTML" }
        );
    }

    const telegramId = parseInt(args[1]);
    if (isNaN(telegramId)) {
        return ctx.reply("❌ Noto'g'ri Telegram ID!");
    }

    await handleRevokeByTelegramId(ctx, telegramId);
});

bot.command("sync", async (ctx) => {
    const userId = ctx.from?.id;
    const adminIds = (process.env.ADMIN_IDS || "").split(",").map(Number);

    if (!userId || !adminIds.includes(userId)) {
        return ctx.reply("⛔️ Bu buyruqdan foydalanish uchun ruxsatingiz yo'q.");
    }

    const language = await userService.getPreferredLanguage(userId);
    const messages = getMessages(language);

    await ctx.reply(messages.syncStarted);
    try {
        await syncJokesFromAPI();
        await ctx.reply(messages.syncCompleted);
    } catch (error) {
        console.error("❌ Sync command failed:", error);
        await ctx.reply(messages.syncFailed);
    }
});

/**
 * Callback query handlers
 */
bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    try {
        // Admin panel callbacks
        if (data.startsWith("admin:")) {
            const action = data.replace("admin:", "");
            await handleAdminCallback(ctx, action);
        } else if (data === "lang:menu") {
            await handleLanguageMenu(ctx);
        } else if (data.startsWith("lang:set:")) {
            const language = data.replace("lang:set:", "");
            if (language === "uz" || language === "en" || language === "ru") {
                await handleSetLanguage(ctx, language);
            } else {
                await ctx.answerCallbackQuery();
            }
        } else if (data === "show_jokes") {
            await handleShowJokes(ctx);
        } else if (data === "back_to_start") {
            await handleStart(ctx);
        } else if (data.startsWith("next:")) {
            const index = parseInt(data.replace("next:", ""));
            await handleNext(ctx, index);
        } else if (data === "payment") {
            await handlePayment(ctx);
        } else if (data.startsWith("check_payment:")) {
            const paymentId = parseInt(data.replace("check_payment:", ""));
            await handleCheckPayment(ctx, paymentId);
        } else if (data === "cancel_payment") {
            const language = await userService.getPreferredLanguage(ctx.from?.id || 0);
            const messages = getMessages(language);
            await ctx.editMessageText(
                messages.paymentCancelled
            );
            await ctx.answerCallbackQuery();
        } else {
            await ctx.answerCallbackQuery();
        }
    } catch (error) {
        console.error("Callback query error:", error);
        await ctx.answerCallbackQuery({
            text: "❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.",
            show_alert: true
        });
    }
});

// Admin: Rasm yuborilganda fon rasmini yangilash
bot.on("message:photo", handleUploadBackground);

/**
 * Express server for webhooks
 */
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Internal endpoint for payment notifications (from gateway)
app.post("/internal/send-payment-notification", async (req, res) => {
    try {
        const { telegramId, amount } = req.body;

        if (!telegramId) {
            return res.status(400).json({ error: "telegramId required" });
        }

        console.log(`📥 [INTERNAL] Payment notification request for user: ${telegramId}`);

        // Send notification via bot with inline button to return to bot
        const { InlineKeyboard } = await import("grammy");
        const keyboard = new InlineKeyboard()
            .url("🔙 Botga qaytish", `https://t.me/${bot.botInfo.username}`);

        const preferredLanguage = await userService.getPreferredLanguage(Number(telegramId));
        const messages = getMessages(normalizeLanguage(preferredLanguage));
        const paymentAmount = Number(amount) || 1111;

        await bot.api.sendMessage(
            telegramId,
            messages.paymentConfirmedNotification(paymentAmount),
            {
                parse_mode: "HTML",
                reply_markup: keyboard
            }
        );

        console.log(`📤 [INTERNAL] Notification sent to user ${telegramId}`);

        res.json({ success: true, message: "Notification sent" });
    } catch (error) {
        console.error("❌ [INTERNAL] Failed to send notification:", error);
        res.status(500).json({ error: "Failed to send notification" });
    }
});

// Oddiy to'lov webhook endpoint
app.post("/webhook/pay", async (req, res) => {
    try {
        await handlePaymentWebhook(req, res, bot);
    } catch (error) {
        console.error("❌ Webhook error:", error);
        res.status(500).json({
            error: "Internal server error"
        });
    }
});

/**
 * Initialize application
 */
async function main() {
    try {
        console.log("🚀 Starting Facts Bot...");

        // Initialize main database
        console.log("📦 Connecting to main database...");
        await AppDataSource.initialize();
        console.log("✅ Main database connected");

        // Initialize sherlar database (external payment check)
        console.log("📦 Connecting to sherlar database...");
        try {
            await SherlarDataSource.initialize();
            console.log("✅ Sherlar database connected");
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            console.warn("⚠️ Sherlar database connection failed (will use local payments only):", errorMsg);
        }

        // Sync facts on startup
        console.log("🔄 Syncing facts from API...");
        await syncJokesFromAPI();
        console.log("✅ Content synced");

        // Start Express server
        app.listen(PORT, () => {
            console.log(`🌐 Webhook server running on port ${PORT}`);
        });

        // Start bot
        console.log("🤖 Starting bot...");

        // Set menu button for all users (optional)
        try {
            await bot.api.setChatMenuButton({
                menu_button: {
                    type: "commands"
                }
            });

            // Oddiy foydalanuvchilar uchun komandalar
            await bot.api.setMyCommands([
                { command: "start", description: "🚀 Botni qayta boshlash" },
                { command: "lang", description: "🌐 Til / Language" }
            ]);

            await bot.api.setMyCommands([
                { command: "start", description: "Restart bot" },
                { command: "lang", description: "Change language" }
            ], { language_code: "en" });

            await bot.api.setMyCommands([
                { command: "start", description: "Перезапустить бота" },
                { command: "lang", description: "Изменить язык" }
            ], { language_code: "ru" });

            await bot.api.setMyCommands([
                { command: "start", description: "🚀 Botni qayta boshlash" },
                { command: "lang", description: "🌐 Tilni o'zgartirish" }
            ], { language_code: "uz" });

            // Admin uchun maxsus komandalar (har bir admin uchun alohida)
            const ADMIN_IDS = [7789445876, 1083408];
            const adminCommands = [
                { command: "start", description: "🚀 Botni qayta boshlash" },
                { command: "lang", description: "🌐 Tilni o'zgartirish" },
                { command: "admin", description: "👑 Admin panel" },
                { command: "approve", description: "✅ To'lovni tasdiqlash" },
                { command: "revoke", description: "🚫 Obunani bekor qilish" }
            ];

            for (const adminId of ADMIN_IDS) {
                await bot.api.setMyCommands(
                    adminCommands,
                    {
                        scope: {
                            type: "chat",
                            chat_id: adminId
                        }
                    }
                );
            }

            console.log("✅ Menu button configured (user + admin commands)");
        } catch (error) {
            console.warn("⚠️ Failed to set menu button (skipping):", error instanceof Error ? error.message : error);
        }

        await bot.start({
            onStart: (botInfo) => {
                console.log(`✅ Bot @${botInfo.username} started successfully!`);
                console.log("=".repeat(50));
            }
        });
    } catch (error) {
        console.error("❌ Failed to start application:", error);
        process.exit(1);
    }
}

// Handle shutdown
process.on("SIGINT", async () => {
    console.log("\n⏹ Shutting down gracefully...");
    await bot.stop();
    await AppDataSource.destroy();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    console.log("\n⏹ Shutting down gracefully...");
    await bot.stop();
    await AppDataSource.destroy();
    process.exit(0);
});

// Start application
main();
