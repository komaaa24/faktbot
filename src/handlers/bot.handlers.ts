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

    // To'g'ridan-to'g'ri latifalarni ko'rsatish
    await handleShowJokes(ctx);
}

/**
 * Latifalarni ko'rsatish
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

    // Tasodifiy latifalarni olish
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
        await ctx.reply("Latifalar topilmadi 😔");
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
 * Latifani ko'rsatish
 */
async function showJoke(ctx: Context, userId: number, index: number) {
    const session = sessions.get(userId);
    if (!session) return;

    const joke = session.jokes[index];
    const total = session.jokes.length;
    const hasPaid = await userService.hasPaid(userId);

    // Ko'rilgan latifalar sonini oshirish
    await userService.incrementViewedJokes(userId);

    // Increment views
    const jokeRepo = AppDataSource.getRepository(Joke);
    joke.views += 1;
    await jokeRepo.save(joke);

    const keyboard = new InlineKeyboard();

    if (index < total - 1) {
        keyboard.text("😂 Keyingisi", `next:${index + 1}`);
    }

    // Agar to'lov qilmagan bo'lsa va oxirgi latifa
    if (!hasPaid && index === total - 1) {
        keyboard.row();
        keyboard.text("🎉 Cheksiz kulgi", "payment");
    }

    // Professional format
    let text = `╭━━━━━━ 😂 ━━━━━━╮\n`;
    text += `     🎭 <b>LATIFA #${index + 1}</b> 🎭\n`;
    text += `╰━━━━━━ 😂 ━━━━━━╯\n\n`;

    // Latifa matni
    const lines = joke.content.split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            text += `${line.trim()}\n`;
        }
    });

    text += `\n`;

    // Kategoriya
    if (joke.category) {
        text += `\n📂 <i>${joke.category}</i>\n`;
    }

    // Statistika
    if (joke.views > 10) {
        text += `\n👁 ${joke.views.toLocaleString()} | `;
        text += `😄 ${joke.likes} | `;
        text += `😐 ${joke.dislikes}`;
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
 * Keyingi latifa
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
            text: "❌ Obunangiz bekor qilindi! Faqat 5 ta bepul latifa.",
            show_alert: true
        });

        const keyboard = new InlineKeyboard()
            .text("💳 Premium olish", "payment");

        await ctx.editMessageText(
            `⚠️ <b>Obunangiz bekor qilindi!</b>\n\n` +
            `Siz faqat 5 ta bepul latifani ko'rishingiz mumkin.\n\n` +
            `Cheksiz latifalardan bahramand bo'lish uchun premium oling! 😊`,
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

    const botUsername = ctx.me?.username || "latifalar_bot";
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
        `🎉 <b>CHEKSIZ KULGI – BIR MARTALIK TAKLIF!</b>\n\n` +
        `💰 Narx: atigi <b>${amount.toLocaleString()} so'm</b>\n` +
        `😂 Bir marta to'lang — umrbodiygina kuling!\n\n` +
        `✨ <b>Nimalar kutmoqda:</b>\n` +
        `   🎭 Ming-minglab zarafat va hazillar\n` +
        `   😄 Har kuni yangi latifalar\n` +
        `   🚀 Cheksiz kirish – hech qanday cheklov yo'q\n` +
        `   📱 Istalgan vaqt, istalgan joyda\n\n` +
        `💡 Bu narx – bir chashka choyning narxi!\n` +
        `Lekin kulgi va zavq – cheksiz! 🎊\n\n` +
        `👉 <b>To'lash juda oson:</b>\n` +
        `   1️⃣ "To'lash" tugmasini bosing\n` +
        `   2️⃣ Xavfsiz to'lovni amalga oshiring\n` +
        `   3️⃣ "To'lovni tekshirish" ni bosing\n` +
        `   4️⃣ KULING! 😂\n\n` +
        `⚡️ Taklif cheklangan – imkoniyatni qo'ldan boy bermang!`,
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
            `🎉 Tabriklaymiz! Endi siz cheksiz latifalardan bahramand bo'lasiz!\n\n` +
            `Kulgi davom etsin – /start bosing! 😂`,
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
                    `Cheksiz latifalar – /start bosing! 😂`,
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
 * API dan latifalarni sinxronlash
 */
export async function syncJokesFromAPI() {
    const jokeRepo = AppDataSource.getRepository(Joke);

    try {
        const maxPages = Number(process.env.PROGRAMSOFT_PAGES) || 12;

        for (let page = 1; page <= maxPages; page++) {
            const items = await fetchJokesFromAPI(page);

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

        console.log("✅ Jokes synced successfully");
    } catch (error) {
        console.error("❌ Error syncing jokes:", error);
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
