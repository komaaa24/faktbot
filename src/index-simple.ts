import dotenv from "dotenv";
dotenv.config();

import { Bot, InlineKeyboard } from "grammy";

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

const anecdotes: Anecdote[] = [];
let anecdoteIdCounter = 1;

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
}

// command /start
bot.command("start", async (ctx) => {
    await ctx.reply("Assalomu alaykum! Latifalar olish uchun /latifa buyrug'ini bering.");
});

// fetch + start session and send first anecdote
bot.command("latifa", async (ctx) => {
    const tgId = ctx.from?.id!;
    // ensure we have at least some anecdotes
    const count = anecdotes.length;
    if (count < 5) {
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
    const list = shuffled.slice(0, Math.min(5, shuffled.length));

    sessions.set(tgId, { list, idx: 0 });

    if (list.length === 0) {
        await ctx.reply("Hozircha latifalar topilmadi.");
        return;
    }

    const first = list[0];
    const kb = new InlineKeyboard().text("Keyingi ➜", "next_0");
    await ctx.reply(`${first.content}\n\n(${1}/${list.length})`, { reply_markup: kb });
});

// handle callback queries (Next)
bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from?.id!;
    const session = sessions.get(userId);

    if (!session) {
        await ctx.answerCallbackQuery({ text: "Seshiyangiz topilmadi. /latifa ni bosing." });
        return;
    }

    if (data?.startsWith("next_")) {
        // increase idx and send next
        session.idx += 1;
        if (session.idx < session.list.length) {
            const cur = session.list[session.idx];
            const kb = new InlineKeyboard().text("Keyingi ➜", `next_${session.idx}`);
            await ctx.editMessageText(`${cur.content}\n\n(${session.idx + 1}/${session.list.length})`, { reply_markup: kb });
            await ctx.answerCallbackQuery();
        } else {
            // all read -> show completion message
            await ctx.editMessageText(`Siz ${session.list.length} latifani ko'rdingiz. Rahmat!`);
            await ctx.answerCallbackQuery();
        }
    } else {
        await ctx.answerCallbackQuery();
    }
});

// start bot (polling)
bot.start({
    onStart: () => {
        console.log("Bot ishga tushdi!");
    }
});
