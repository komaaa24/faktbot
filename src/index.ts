import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import { Bot, InlineKeyboard } from "grammy";
import { generateClickLink } from "./click.js";

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN!;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN kerak .env ga");

const bot = new Bot(BOT_TOKEN);

// In-memory storage (no database)
interface Anecdote {
    id: number;
    externalId: string;
    content: string;
    section: string;
}

interface Payment {
    id: number;
    txId: string;
    userId: number;
    amount: number;
    status: "pending" | "paid" | "failed";
    clickPaymentId?: string;
}

const anecdotes: Anecdote[] = [];
const payments: Payment[] = [];
let anecdoteIdCounter = 1;
let paymentIdCounter = 1;

// simple in-memory user session to track which anecdote index a user is on
const sessions = new Map<number, { list: Anecdote[]; idx: number }>();

// helper: fetch remote anecdotes and store if new
async function fetchAndStoreRemote(page = 1) {
    const url = `https://www.programsoft.uz/api/service/1?page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Remote API error " + res.status);
    const json: any = await res.json();
    // You must inspect JSON shape — here we assume it contains items array
    const items = json?.data?.items || json?.items || json; // best-effort
    if (!Array.isArray(items)) return [];

    const saved: Anecdote[] = [];
    for (const item of items) {
        // adapt the field names to actual API: here we assume item.id and item.title or item.description
        const externalId = String(item.id ?? item._id ?? item.uuid ?? Math.random());
        const text = item.description ?? item.text ?? item.title ?? JSON.stringify(item);
        const section = item.section ?? "default";

        // avoid duplicates
        let existing = anecdotes.find(a => a.externalId === externalId);
        if (!existing) {
            existing = {
                id: anecdoteIdCounter++,
                externalId,
                content: String(text),
                section
            };
            anecdotes.push(existing);
        }
        saved.push(existing);
    }
    return saved;
}// command /start
bot.command("start", async (ctx) => {
    await ctx.reply("Assalomu alaykum! Latifalar olish uchun /latifa buyrug'ini bering.");
});

// fetch + start session and send first anecdote
bot.command("latifa", async (ctx) => {
    const tgId = ctx.from?.id!;
    // ensure we have at least some anecdotes in DB (fetch remote)
    const count = anecdotes.length;
    if (count < 10) {
        try {
            await fetchAndStoreRemote(1);
        } catch (e) {
            console.error(e);
            await ctx.reply("Anecdotlarni olishda xatolik yuz berdi. Keyinroq qayta urinib ko'ring.");
            return;
        }
    }

    // take 5 random
    const shuffled = [...anecdotes].sort(() => Math.random() - 0.5);
    const list = shuffled.slice(0, 5);

    sessions.set(tgId, { list, idx: 0 });

    if (list.length === 0) {
        await ctx.reply("Hozircha latifalar topilmadi.");
        return;
    }

    const first = list[0];
    const kb = new InlineKeyboard().text("Keyingi ➜", "next_0");
    await ctx.reply(`${first.content}\n\n(${1}/${list.length})`, { reply_markup: kb });
});// handle callback queries (Next and Payment)
bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from?.id!;
    const session = sessions.get(userId);
    if (!session) {
        await ctx.answerCallbackQuery({ text: "Seshiyangiz topilmadi. /latifa ni bosing." });
        return;
    }

    if (data?.startsWith("next_")) {
        // increase idx and send next or payment prompt
        session.idx += 1;
        if (session.idx < session.list.length) {
            const cur = session.list[session.idx];
            const kb = new InlineKeyboard().text("Keyingi ➜", `next_${session.idx}`);
            await ctx.editMessageText(`${cur.content}\n\n(${session.idx + 1}/${session.list.length})`, { reply_markup: kb });
            await ctx.answerCallbackQuery();
        } else {
            // all read -> offer payment
            const amount = Number(process.env.CLICK_DEFAULT_AMOUNT || 1000);
            const { link, tx } = generateClickLink(amount, { additional_param4: "basic" });

            // save pending payment
            const p: Payment = {
                id: paymentIdCounter++,
                txId: tx,
                userId: userId,
                amount,
                status: "pending"
            };
            payments.push(p);

            const kb = new InlineKeyboard()
                .text("To'lov qilish (Click) 💳", `pay_${p.id}`)
                .url("To'lov", link);
            // we can also send separate message
            await ctx.editMessageText(`Siz ${session.list.length} latifani ko'rdingiz. To'liq yig'ilgan to'plam uchun bir martalik to'lov: ${amount} so'm. To'lovni Click orqali amalga oshiring:`, { reply_markup: kb });
            await ctx.answerCallbackQuery();
        }
    } else if (data?.startsWith("pay_")) {
        // fallback — but we used url button already
        const pid = Number(data.split("_")[1]);
        const payment = payments.find(p => p.id === pid);
        if (!payment) {
            await ctx.answerCallbackQuery({ text: "To'lov topilmadi." });
            return;
        }
        const { link } = generateClickLink(payment.amount, {});
        await ctx.answerCallbackQuery();
        await ctx.reply(`To'lov uchun link: ${link}`);
    } else {
        await ctx.answerCallbackQuery();
    }
});

// start Express server for webhook (Click webhook and optional Telegram webhook)
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Click will call this webhook after payment (example: we'll accept JSON or form-data)
// You MUST adapt to Click's real payload fields per their docs — here we accept common fields:
app.post("/webhook/click", async (req, res) => {
    // Example payload keys: transaction_param (our tx), status, amount, click_id, merchant_id ...
    const payload = { ...req.body, ...req.query };
    console.log("Click webhook payload:", payload);

    const tx = String(payload.transaction_param || payload.transaction || payload.tx || "");
    if (!tx) {
        res.status(400).send("no tx");
        return;
    }

    // find payment record
    const payment = payments.find(p => p.txId === tx);
    if (!payment) {
        // maybe it's a different field; respond 200 to avoid retries
        console.warn("Payment not found for tx", tx);
        res.sendStatus(200);
        return;
    }

    // determine paid status — adapt to Click's actual status field
    const status = String(payload.status || payload.payment_status || payload.state || "").toLowerCase();
    if (status === "success" || status === "paid" || payload.is_paid === "true" || payload.payment_status === "COMPLETED") {
        payment.status = "paid";
        payment.clickPaymentId = String(payload.click_id || payload.payment_id || "");

        // notify user on Telegram (if we have userId)
        try {
            await bot.api.sendMessage(payment.userId, `To'lovingiz muvaffaqiyatli qabul qilindi. Rahmat!`);
        } catch (e) {
            console.error("Failed to notify user:", e);
        }

        res.sendStatus(200);
        return;
    } else {
        // mark failed or pending
        payment.status = "failed";
        res.sendStatus(200);
        return;
    }
});

// health
app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
    console.log(`Express server running on port ${PORT}`);
});

// start bot (polling). For production you may set Telegram webhook instead.
bot.start({
    onStart: () => {
        console.log("Bot started");
    }
});
