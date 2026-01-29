import { Context, InlineKeyboard } from "grammy";
import { Repository } from "typeorm";
import { Joke } from "../entities/Joke.js";
import { User } from "../entities/User.js";
import { Payment, PaymentStatus } from "../entities/Payment.js";
import { AppDataSource } from "../database/data-source.js";
import { UserService } from "../services/user.service.js";
import { fetchJokesFromAPI, formatJoke } from "../services/joke.service.js";
import { generatePaymentLink, generateTransactionParam, getFixedPaymentAmount } from "../services/click.service.js";
import { writeFile } from "fs/promises";
import path from "path";
import axios from "axios";
import { SherlarPaymentService } from "../services/sherlar-payment.service.js";

const userService = new UserService();
const sherlarPaymentService = new SherlarPaymentService();

// In-memory session storage
interface UserSession {
    jokes: Joke[];
    currentIndex: number;
}

const sessions = new Map<number, UserSession>();

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function normalizeLabel(label: string): string {
    return label
        .toLowerCase()
        .replace(/['’`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function looksLikeSectionLabel(line: string): boolean {
    const idx = line.indexOf(":");
    if (idx <= 0) return false;
    const label = normalizeLabel(line.slice(0, idx));
    return label.length > 0 && label.length <= 24;
}

function splitIdeaText(raw: string): { title?: string; body: string } {
    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return { title: undefined, body: "" };
    }

    let title: string | undefined;
    if (lines.length > 1 && !looksLikeSectionLabel(lines[0])) {
        title = lines.shift();
    }

    return {
        title,
        body: lines.join("\n")
    };
}

function parseIdeaSections(text: string): {
    sections: Array<{ label: string; value: string }>;
    paragraphs: string[];
} {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const sections: Array<{ label: string; value: string }> = [];
    const paragraphs: string[] = [];

    for (const line of lines) {
        const idx = line.indexOf(":");
        if (idx > 0) {
            const label = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim();
            if (label && value) {
                sections.push({ label, value });
                continue;
            }
        }
        paragraphs.push(line);
    }

    return { sections, paragraphs };
}

function labelIcon(label: string): string {
    const norm = normalizeLabel(label);
    if (norm.startsWith("tavsif")) return "📌";
    if (norm.startsWith("boshlash")) return "🚀";
    if (norm.startsWith("konik") || norm.startsWith("ko'nik")) return "🧠";
    if (norm.startsWith("sarmoya") || norm.startsWith("invest") || norm.startsWith("kapital")) return "💰";
    if (norm.startsWith("bozor")) return "📈";
    if (norm.startsWith("marketing")) return "📣";
    if (norm.startsWith("resurs")) return "🧰";
    if (norm.startsWith("afzallik")) return "✅";
    if (norm.startsWith("kamchilik")) return "⚠️";
    if (norm.startsWith("xavf")) return "🛡️";
    if (norm.startsWith("talab")) return "🧭";
    if (norm.startsWith("auditoriya")) return "🎯";
    return "🔹";
}

/**
 * /start komandasi
 */
export async function handleStart(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Foydalanuvchini yaratish/yangilash
    const user = await userService.findOrCreate(userId, {
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name
    });

    // 🔍 Smart payment verification strategy
    let hasPaid = user.hasPaid;

    if (!hasPaid) {
        console.log(`🔍 [START] Checking sherlar database for user: ${userId}`);
        try {
            const paymentResult = await sherlarPaymentService.hasValidPayment(userId);

            if (paymentResult.hasPaid) {
                if (user.revokedAt && paymentResult.paymentDate) {
                    if (paymentResult.paymentDate < user.revokedAt) {
                        console.log(`⚠️ [START] Payment found but user was revoked. Skipping.`);
                    } else {
                        console.log(`✅ [START] New payment after revoke detected for user: ${userId}`);
                        await userService.update(userId, { hasPaid: true, revokedAt: undefined });
                        hasPaid = true;
                    }
                } else {
                    console.log(`✅ [START] Payment verified in sherlar DB for user: ${userId}`);
                    await userService.markAsPaid(userId);
                    hasPaid = true;
                }
            } else {
                console.log(`ℹ️ [START] No payment found in sherlar DB for user: ${userId}`);
            }
        } catch (error) {
            console.error("❌ [START] Sherlar DB check error:", error);
        }
    }

    // To'g'ridan-to'g'ri g'oyalarni ko'rsatish
    await handleShowJokes(ctx);
}

/**
 * G'oyalarni ko'rsatish
 */
export async function handleShowJokes(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const jokeRepo = AppDataSource.getRepository(Joke);

    // HAR SAFAR yangi tekshiruv (revoke uchun)
    let hasPaid = await userService.hasPaid(userId);

    // Agar DB bo'sh bo'lsa, API dan yuklaymiz
    const count = await jokeRepo.count();
    if (count === 0) {
        await syncJokesFromAPI();
    }

    // Tasodifiy g'oyalarni olish
    let jokes;
    if (hasPaid) {
        jokes = await jokeRepo
            .createQueryBuilder("joke")
            .orderBy("RANDOM()")
            .getMany();
    } else {
        jokes = await jokeRepo
            .createQueryBuilder("joke")
            .orderBy("RANDOM()")
            .limit(5)
            .getMany();
    }

    if (jokes.length === 0) {
        await ctx.reply("G'oyalar topilmadi 😔");
        return;
    }

    // Session yaratish
    sessions.set(userId, {
        jokes,
        currentIndex: 0
    });

    await showJoke(ctx, userId, 0);
}

/**
 * G'oyani ko'rsatish
 */
async function showJoke(ctx: Context, userId: number, index: number) {
    const session = sessions.get(userId);
    if (!session) return;

    const joke = session.jokes[index];
    const total = session.jokes.length;
    const hasPaid = await userService.hasPaid(userId);

    // Ko'rilgan g'oyalar sonini oshirish
    await userService.incrementViewedJokes(userId);

    // Increment views
    const jokeRepo = AppDataSource.getRepository(Joke);
    joke.views += 1;
    await jokeRepo.save(joke);

    const keyboard = new InlineKeyboard();

    if (index < total - 1) {
        keyboard.text("💡 Keyingi g'oya", `next:${index + 1}`);
    }

    // Agar to'lov qilmagan bo'lsa va oxirgi g'oya
    if (!hasPaid && index === total - 1) {
        keyboard.row();
        keyboard.text("🚀 Premium kirish", "payment");
    }

    const resolved = splitIdeaText(joke.content);
    const title = joke.title || resolved.title;
    let body = joke.title ? joke.content : (resolved.body || joke.content);
    if (title && body.trim() === title.trim()) {
        body = "";
    }
    const { sections, paragraphs } = parseIdeaSections(body);

    let text = `╭━━━━━━ 💼 ━━━━━━╮\n`;
    text += `     💡 <b>G'OYA #${index + 1}</b> 💡\n`;
    text += `╰━━━━━━ 💼 ━━━━━━╯\n\n`;

    if (title) {
        text += `💼 <b>${escapeHtml(title)}</b>\n\n`;
    }

    if (!title && sections.length === 0 && paragraphs.length === 0) {
        text += `G'oya topilmadi 😔\n`;
    } else {
        for (const section of sections) {
            const icon = labelIcon(section.label);
            text += `${icon} <b>${escapeHtml(section.label)}:</b> ${escapeHtml(section.value)}\n`;
        }
        for (const paragraph of paragraphs) {
            text += `🔹 ${escapeHtml(paragraph)}\n`;
        }
        text += `\n`;
    }

    if (joke.views > 10) {
        text += `\n👁 ${joke.views.toLocaleString()} | `;
        text += `👍 ${joke.likes} | `;
        text += `👎 ${joke.dislikes}`;
    }

    // Yuborish
    if (ctx.callbackQuery) {
        await ctx.editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
        await ctx.answerCallbackQuery();
    } else {
        await ctx.reply(text, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
    }
}

/**
 * Keyingi g'oya
 */
export async function handleNext(ctx: Context, index: number) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const hasPaid = await userService.hasPaid(userId);
    const session = sessions.get(userId);

    if (!session) {
        await ctx.answerCallbackQuery({
            text: "Sessiya tugagan. /start ni bosing.",
            show_alert: true
        });
        return;
    }

    if (!hasPaid && index >= 5) {
        await ctx.answerCallbackQuery({
            text: "❌ Obunangiz bekor qilindi! Faqat 5 ta bepul g'oya.",
            show_alert: true
        });

        const keyboard = new InlineKeyboard()
            .text("💳 Premium olish", "payment");

        await ctx.editMessageText(
            `⚠️ <b>Obunangiz bekor qilindi!</b>\n\n` +
            `Siz faqat 5 ta bepul g'oyani ko'rishingiz mumkin.\n\n` +
            `Cheksiz biznes g'oyalaridan bahramand bo'lish uchun premium oling! 💼`,
            {
                reply_markup: keyboard,
                parse_mode: "HTML"
            }
        );
        return;
    }

    await showJoke(ctx, userId, index);
}

/**
 * To'lov oynasi
 */
export async function handlePayment(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const user = await userService.findOrCreate(userId);

    if (user.hasPaid) {
        await ctx.answerCallbackQuery({
            text: "Siz allaqachon premium a'zosisiz! ✅",
            show_alert: true
        });
        return;
    }

    const amount = getFixedPaymentAmount();
    const transactionParam = generateTransactionParam();

    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = paymentRepo.create({
        transactionParam,
        userId: user.id,
        amount,
        status: PaymentStatus.PENDING,
        metadata: {
            telegramId: userId,
            username: ctx.from?.username
        }
    });
    await paymentRepo.save(payment);

    const botUsername = ctx.me?.username || "biznes_goyalar_bot";
    const returnUrl = `https://t.me/${botUsername}`;

    const paymentLink = generatePaymentLink({
        amount,
        transactionParam,
        userId,
        returnUrl
    });

    const keyboard = new InlineKeyboard()
        .url("💳 To'lash", paymentLink.url)
        .row()
        .text("✅ To'lovni tekshirish", `check_payment:${payment.id}`);

    await ctx.editMessageText(
        `🚀 <b>BIZNES G'OYALARI – PREMIUM KIRISH!</b>\n\n` +
        `💰 Narx: atigi <b>${amount.toLocaleString()} so'm</b>\n` +
        `💼 Bir marta to'lang — doimiy biznes ilhomlari!\n\n` +
        `✨ <b>Sizni kutayotgan imkoniyatlar:</b>\n` +
        `   💡 Amaliy biznes g'oyalari va tavsiyalar\n` +
        `   📈 Bozor va marketing bo'yicha yo'l-yo'riqlar\n` +
        `   🧠 Ko'nikmalarni mustahkamlovchi maslahatlar\n` +
        `   🔥 Har kuni yangilanadigan g'oyalar\n` +
        `   ♾️ Cheksiz kirish – hech qanday cheklov yo'q\n\n` +
        `💡 Bu narx – bir chashka qahva narxidan ham arzon,\n` +
        `lekin foydasi – katta! ☕💰\n\n` +
        `👉 <b>Boshlash juda oson:</b>\n` +
        `   1️⃣ "To'lash" tugmasini bosing\n` +
        `   2️⃣ Xavfsiz to'lovni amalga oshiring\n` +
        `   3️⃣ "To'lovni tekshirish" ni bosing\n` +
        `   4️⃣ G'oyalarni o'qishni boshlang!\n\n` +
        `⚡️ Bugun boshlang, ertaga natija ko'ring!`,
        {
            reply_markup: keyboard,
            parse_mode: "HTML"
        }
    );
}

/**
 * To'lovni tekshirish
 */
export async function handleCheckPayment(ctx: Context, paymentId: number) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({
        where: { id: paymentId },
        relations: ["user"]
    });

    if (!payment) {
        await ctx.answerCallbackQuery({
            text: "To'lov topilmadi ❌",
            show_alert: true
        });
        return;
    }

    if (payment.status === PaymentStatus.PAID) {
        await ctx.answerCallbackQuery({
            text: "To'lovingiz tasdiqlandi! ✅",
            show_alert: true
        });

        await ctx.editMessageText(
            `✅ <b>To'lov muvaffaqiyatli!</b>\n\n` +
            `🎉 Tabriklaymiz! Endi siz cheksiz biznes g'oyalaridan bahramand bo'lasiz!\n\n` +
            `Ilhom va natija davom etsin – /start bosing! 💼`,
            { parse_mode: "HTML" }
        );
        return;
    }

    if (payment.status === PaymentStatus.PENDING) {
        await ctx.answerCallbackQuery({
            text: "🔍 To'lov tekshirilmoqda...",
            show_alert: false
        });

        try {
            const paymentResult = await sherlarPaymentService.hasValidPayment(userId);

            if (paymentResult.hasPaid) {
                const userRepo = AppDataSource.getRepository(User);
                const user = await userRepo.findOne({ where: { telegramId: userId } });

                if (user?.revokedAt && paymentResult.paymentDate) {
                    if (paymentResult.paymentDate < user.revokedAt) {
                        await ctx.editMessageText(
                            `⚠️ <b>Obunangiz bekor qilingan!</b>\n\n` +
                            `Qaytadan to'lov qiling.\n\n/start`,
                            { parse_mode: "HTML" }
                        );
                        return;
                    }
                }

                payment.status = PaymentStatus.PAID;
                await paymentRepo.save(payment);

                await userRepo
                    .createQueryBuilder()
                    .update(User)
                    .set({ hasPaid: true, revokedAt: () => "NULL" })
                    .where("telegramId = :telegramId", { telegramId: userId })
                    .execute();

                await ctx.editMessageText(
                    `✅ <b>To'lovingiz tasdiqlandi!</b>\n\n` +
                    `💰 Summa: ${payment.amount} so'm\n` +
                    `🎉 Endi siz premium a'zosisiz!\n\n` +
                    `Cheksiz g'oyalar – /start bosing! 💼`,
                    { parse_mode: "HTML" }
                );
            } else {
                await ctx.editMessageText(
                    `⏳ <b>To'lov hali tasdiqlanmadi</b>\n\n` +
                    `💡 To'lovdan keyin biroz kuting va qayta tekshiring.`,
                    { parse_mode: "HTML" }
                );
            }
        } catch (error) {
            console.error("❌ [CHECK_PAYMENT] Error:", error);
            await ctx.editMessageText(
                `❌ <b>Xatolik yuz berdi</b>\n\nQaytadan urinib ko'ring.`,
                { parse_mode: "HTML" }
            );
        }
        return;
    }

    await ctx.answerCallbackQuery({
        text: "To'lov muvaffaqiyatsiz ❌",
        show_alert: true
    });
}

/**
 * API dan g'oyalarni sinxronlash
 */
export async function syncJokesFromAPI() {
    const jokeRepo = AppDataSource.getRepository(Joke);

    try {
        const maxPages = Number(process.env.PROGRAMSOFT_PAGES) || 12;

        for (let page = 1; page <= maxPages; page++) {
            const items = await fetchJokesFromAPI(page);
            if (items.length === 0) {
                console.log(`ℹ️ No items on page ${page}, stopping sync.`);
                break;
            }

            for (const item of items) {
                const formatted = formatJoke(item);

                const existing = await jokeRepo.findOne({
                    where: { externalId: formatted.externalId }
                });

                if (!existing) {
                    const joke = jokeRepo.create({
                        externalId: formatted.externalId,
                        content: formatted.content,
                        category: formatted.category,
                        title: formatted.title,
                        likes: formatted.likes,
                        dislikes: formatted.dislikes
                    });
                    await jokeRepo.save(joke);
                }
            }
        }

        console.log("✅ Content synced successfully");
    } catch (error) {
        console.error("❌ Error syncing ideas:", error);
    }
}

/**
 * Admin: Fon rasmini yuklash
 */
export async function handleUploadBackground(ctx: Context) {
    const userId = ctx.from?.id;
    const adminId = Number(process.env.ADMIN_ID) || 7789445876;

    if (userId !== adminId) {
        await ctx.reply("❌ Bu buyruq faqat admin uchun!");
        return;
    }

    const photo = ctx.message?.photo;
    if (!photo || photo.length === 0) {
        await ctx.reply("❌ Iltimos rasm yuboring!");
        return;
    }

    try {
        const largestPhoto = photo[photo.length - 1];
        const file = await ctx.api.getFile(largestPhoto.file_id);

        if (!file.file_path) {
            throw new Error("File path not found");
        }

        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        const response = await axios.get(fileUrl, {
            responseType: "arraybuffer"
        });

        const backgroundPath = path.join(process.cwd(), "assets", "background.jpg");
        await writeFile(backgroundPath, response.data);

        await ctx.reply(
            "✅ <b>Fon rasmi yangilandi!</b>\n\n" +
            "📁 Fayl: assets/background.jpg\n" +
            "📏 O'lcham: " + (response.data.byteLength / 1024).toFixed(2) + " KB",
            { parse_mode: "HTML" }
        );
    } catch (error) {
        console.error("Error uploading background:", error);
        await ctx.reply("❌ Xatolik yuz berdi");
    }
}
