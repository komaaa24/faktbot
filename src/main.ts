import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import { Bot } from "grammy";
import { AppDataSource } from "./database/data-source.js";
import {
    handleStart,
    handleShowSections,
    handleSectionSelect,
    handleNext,
    handlePayment,
    handleCheckPayment,
    syncAnecdotesFromAPI
} from "./handlers/bot.handlers.js";
import {
    handleClickPrepare,
    handleClickComplete
} from "./handlers/webhook.handlers.js";

// Environment variables validation
const requiredEnvVars = [
    "BOT_TOKEN",
    "CLICK_SERVICE_ID",
    "CLICK_MERCHANT_ID",
    "CLICK_SECRET_KEY"
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

// Error handling
bot.catch((err) => {
    console.error("❌ Bot error:", err);
});

/**
 * Bot command handlers
 */
bot.command("start", handleStart);

bot.command("sync", async (ctx) => {
    const userId = ctx.from?.id;
    const adminIds = (process.env.ADMIN_IDS || "").split(",").map(Number);

    if (!userId || !adminIds.includes(userId)) {
        return ctx.reply("⛔️ Bu buyruqdan foydalanish uchun ruxsatingiz yo'q.");
    }

    await ctx.reply("🔄 Latifalar sinxronlashtirilmoqda...");
    await syncAnecdotesFromAPI();
    await ctx.reply("✅ Sinxronlash muvaffaqiyatli tugadi!");
});

/**
 * Callback query handlers
 */
bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    try {
        if (data === "show_sections") {
            await handleShowSections(ctx);
        } else if (data === "back_to_start") {
            await handleStart(ctx);
        } else if (data.startsWith("section:")) {
            const section = data.replace("section:", "");
            await handleSectionSelect(ctx, section);
        } else if (data.startsWith("next:")) {
            const index = parseInt(data.replace("next:", ""));
            await handleNext(ctx, index);
        } else if (data === "payment") {
            await handlePayment(ctx);
        } else if (data.startsWith("check_payment:")) {
            const paymentId = parseInt(data.replace("check_payment:", ""));
            await handleCheckPayment(ctx, paymentId);
        } else if (data === "cancel_payment") {
            await ctx.editMessageText(
                "❌ To'lov bekor qilindi.\n\nQayta urinish uchun /start buyrug'ini bering."
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

// Click webhook endpoint
app.post("/webhook/click", async (req, res) => {
    const { action } = req.body;

    // Log incoming webhook request
    console.log("\n" + "=".repeat(70));
    console.log("📨 INCOMING CLICK WEBHOOK REQUEST");
    console.log("=".repeat(70));
    console.log("📅 Time:", new Date().toISOString());
    console.log("🔄 Action:", action === 0 ? "PREPARE" : action === 1 ? "COMPLETE" : "UNKNOWN");
    console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));
    console.log("=".repeat(70) + "\n");

    try {
        if (action === 0) {
            // PREPARE
            await handleClickPrepare(req, res, bot);
        } else if (action === 1) {
            // COMPLETE
            await handleClickComplete(req, res, bot);
        } else {
            console.error("❌ Unknown action:", action);
            res.status(400).json({
                error: -3,
                error_note: "Unknown action"
            });
        }
    } catch (error) {
        console.error("❌ Webhook error:", error);
        console.error("Stack trace:", error instanceof Error ? error.stack : String(error));
        res.status(500).json({
            error: -8,
            error_note: "Internal server error"
        });
    }
});

/**
 * Initialize application
 */
async function main() {
    try {
        console.log("🚀 Starting Anecdote Bot...");

        // Initialize database
        console.log("📦 Connecting to database...");
        await AppDataSource.initialize();
        console.log("✅ Database connected");

        // Sync anecdotes on startup
        console.log("🔄 Syncing anecdotes from API...");
        await syncAnecdotesFromAPI();
        console.log("✅ Anecdotes synced");

        // Start Express server
        app.listen(PORT, () => {
            console.log(`🌐 Webhook server running on port ${PORT}`);
        });

        // Start bot
        console.log("🤖 Starting bot...");
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
