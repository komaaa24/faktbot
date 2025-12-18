import { Context, InlineKeyboard } from "grammy";
import { Repository } from "typeorm";
import { Anecdote } from "../entities/Anecdote.js";
import { User } from "../entities/User.js";
import { Payment, PaymentStatus } from "../entities/Payment.js";
import { AppDataSource } from "../database/data-source.js";
import { UserService } from "../services/user.service.js";
import { fetchAnecdotesFromAPI, formatAnecdote } from "../services/anecdote.service.js";
import { generateClickPaymentLink, generateTransactionParam } from "../services/click.service.js";

const userService = new UserService();

// In-memory session storage
interface UserSession {
    anecdotes: Anecdote[];
    currentIndex: number;
    section: string | null;
}

const sessions = new Map<number, UserSession>();

/**
 * /start komandasi
 */
export async function handleStart(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Foydalanuvchini yaratish/yangilash
    await userService.findOrCreate(userId, {
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name
    });

    const keyboard = new InlineKeyboard()
        .text("📚 Latifalarni ko'rish", "show_sections");

    await ctx.reply(
        `🎭 <b>Latifalar botiga xush kelibsiz!</b>\n\n` +
        `📖 Yuzlab qiziqarli latifalar sizni kutmoqda.\n\n` +
        `💡 <b>Qanday ishlaydi?</b>\n` +
        `• Turli bo'limlardan 5 ta latifani bepul ko'ring\n` +
        `• Davomini ko'rish uchun bir martalik to'lov qiling\n` +
        `• Yuzlab latifalardan bahramand bo'ling!\n\n` +
        `Boshlash uchun quyidagi tugmani bosing 👇`,
        {
            reply_markup: keyboard,
            parse_mode: "HTML"
        }
    );
}

/**
 * Bo'limlarni ko'rsatish
 */
export async function handleShowSections(ctx: Context) {
    const anecdoteRepo = AppDataSource.getRepository(Anecdote);

    // Bo'limlarni olish
    const sections = await anecdoteRepo
        .createQueryBuilder("anecdote")
        .select("DISTINCT anecdote.section", "section")
        .getRawMany();

    if (sections.length === 0) {
        // Agar DB bo'sh bo'lsa, API dan yuklaymiz
        await syncAnecdotesFromAPI();
        return handleShowSections(ctx);
    }

    const keyboard = new InlineKeyboard();

    // Faqat Tasodifiy tugma
    keyboard.text("🎲 Tasodifiy latifalar", "section:random");
    keyboard.row();
    keyboard.text("⬅️ Orqaga", "back_to_start");

    const totalCount = await anecdoteRepo.count();

    await ctx.editMessageText(
        `🎭 <b>Latifalar botiga xush kelibsiz!</b>\n\n` +
        `📚 Jami: <b>${totalCount} ta</b> qiziqarli latifa\n\n` +
        `💡 Har safar tasodifiy latifalar ko'rsatiladi!\n` +
        `🆓 Birinchi 5 ta - <b>BEPUL</b>\n` +
        `💳 Qolgan latifalarni ko'rish uchun bir martalik <b>1111 so'm</b> to'lov qiling\n\n` +
        `Boshlash uchun pastdagi tugmani bosing 👇`,
        {
            reply_markup: keyboard,
            parse_mode: "HTML"
        }
    );
}

/**
 * Bo'lim tanlanganda latifalarni ko'rsatish
 */
export async function handleSectionSelect(ctx: Context, section: string) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const anecdoteRepo = AppDataSource.getRepository(Anecdote);
    const hasPaid = await userService.hasPaid(userId);

    let query = anecdoteRepo.createQueryBuilder("anecdote");

    if (section !== "random") {
        query = query.where("anecdote.section = :section", { section });
    }

    // Tasodifiy 5 ta olish
    const anecdotes = await query
        .orderBy("RANDOM()")
        .limit(hasPaid ? 20 : 5)
        .getMany();

    if (anecdotes.length === 0) {
        await ctx.answerCallbackQuery({
            text: "Bu bo'limda latifalar topilmadi 😔",
            show_alert: true
        });
        return;
    }

    // Session yaratish
    sessions.set(userId, {
        anecdotes,
        currentIndex: 0,
        section
    });

    await showAnecdote(ctx, userId, 0);
}

/**
 * Latifani ko'rsatish
 */
async function showAnecdote(ctx: Context, userId: number, index: number) {
    const session = sessions.get(userId);
    if (!session) return;

    const anecdote = session.anecdotes[index];
    const total = session.anecdotes.length;
    const hasPaid = await userService.hasPaid(userId);

    // Ko'rilgan latifalar sonini oshirish
    await userService.incrementViewedAnecdotes(userId);

    // Increment views
    const anecdoteRepo = AppDataSource.getRepository(Anecdote);
    anecdote.views += 1;
    await anecdoteRepo.save(anecdote);

    const keyboard = new InlineKeyboard();

    if (index < total - 1) {
        keyboard.text("➡️ Keyingi", `next:${index + 1}`);
    }

    if (index > 0) {
        keyboard.text("⬅️ Oldingi", `next:${index - 1}`);
    }

    keyboard.row();

    // Agar to'lov qilmagan bo'lsa va oxirgi latifa ko'rsatilayotgan bo'lsa
    if (!hasPaid && index === total - 1) {
        keyboard.text("💳 To'lov qilish", "payment");
        keyboard.row();
    }

    keyboard.text("📂 Bo'limlarga qaytish", "show_sections");

    const text =
        `📖 <b>Latifa ${index + 1}/${total}</b>\n\n` +
        `${anecdote.content}\n\n` +
        `<i>👁 ${anecdote.views} marta ko'rilgan</i>`;

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
 * Keyingi/oldingi latifa
 */
export async function handleNext(ctx: Context, index: number) {
    const userId = ctx.from?.id;
    if (!userId) return;

    await showAnecdote(ctx, userId, index);
}

/**
 * To'lov oynasini ko'rsatish
 */
export async function handlePayment(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const user = await userService.findOrCreate(userId);

    if (user.hasPaid) {
        await ctx.answerCallbackQuery({
            text: "Siz allaqachon to'lov qilgansiz! ✅",
            show_alert: true
        });
        return;
    }

    // To'lov parametrlari
    const amount = Number(process.env.CLICK_DEFAULT_AMOUNT) || 5000;
    const transactionParam = generateTransactionParam();

    // Payment record yaratish
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

    // Click to'lov linkini yaratish
    // merchantUserId ni qo'shmasak, Click default qiymat beradi
    const paymentLink = generateClickPaymentLink({
        serviceId: process.env.CLICK_SERVICE_ID!,
        merchantId: process.env.CLICK_MERCHANT_ID!,
        amount,
        transactionParam,
        returnUrl: process.env.CLICK_RETURN_URL || `https://t.me/${ctx.me.username}`
        // merchantUserId ni intentionally qoldirish - bu muammoni keltirib chiqaradi
    });

    const keyboard = new InlineKeyboard()
        .url("💳 To'lash", paymentLink.url)
        .row()
        .text("✅ To'lovni tekshirish", `check_payment:${payment.id}`)
        .row()
        .text("❌ Bekor qilish", "cancel_payment");

    await ctx.editMessageText(
        `💰 <b>To'lov ma'lumotlari</b>\n\n` +
        `💵 Summa: <b>${amount.toLocaleString()} so'm</b>\n` +
        `🔐 Tranzaksiya: <code>${transactionParam}</code>\n\n` +
        `📱 To'lash uchun pastdagi tugmani bosing.\n` +
        `To'lovdan keyin "To'lovni tekshirish" tugmasini bosing.`,
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
            `Endi siz yuzlab latifalardan bahramand bo'lishingiz mumkin! 🎉\n\n` +
            `Davom etish uchun /start bosing.`,
            { parse_mode: "HTML" }
        );
    } else if (payment.status === PaymentStatus.PENDING) {
        await ctx.answerCallbackQuery({
            text: "To'lov hali tasdiqlanmadi. Iltimos biroz kuting ⏳",
            show_alert: true
        });
    } else {
        await ctx.answerCallbackQuery({
            text: "To'lov muvaffaqiyatsiz tugadi ❌",
            show_alert: true
        });
    }
}

/**
 * API dan latifalarni sinxronlash
 */
async function syncAnecdotesFromAPI() {
    const anecdoteRepo = AppDataSource.getRepository(Anecdote);

    try {
        // API da 12 ta sahifa bor (har birida ~15 ta latifa)
        for (let page = 1; page <= 12; page++) {
            const items = await fetchAnecdotesFromAPI(page);

            for (const item of items) {
                const formatted = formatAnecdote(item);

                const existing = await anecdoteRepo.findOne({
                    where: { externalId: formatted.externalId }
                });

                if (!existing) {
                    const anecdote = anecdoteRepo.create(formatted);
                    await anecdoteRepo.save(anecdote);
                }
            }
        }

        console.log("✅ Anecdotes synced successfully");
    } catch (error) {
        console.error("❌ Error syncing anecdotes:", error);
    }
}

/**
 * Bo'lim nomini olish
 */
function getSectionLabel(section: string): string {
    const labels: Record<string, string> = {
        "general": "🎭 Umumiy",
        "politics": "🏛 Siyosat",
        "family": "👨‍👩‍👧‍👦 Oila",
        "work": "💼 Ish",
        "school": "🎓 Maktab",
        "animals": "🐾 Hayvonlar",
        "technology": "💻 Texnologiya"
    };

    return labels[section] || `📌 ${section}`;
}

// Export sync function
export { syncAnecdotesFromAPI };
