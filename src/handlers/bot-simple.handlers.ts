import { Context, InlineKeyboard } from "grammy";
import { fetchAnecdotesFromAPI, formatAnecdote } from "../services/anecdote.service.js";

// In-memory storage
interface Anecdote {
    id: number;
    externalId: string;
    content: string;
    section: string;
    views: number;
}

interface User {
    telegramId: number;
    username?: string;
    firstName?: string;
    hasPaid: boolean;
    viewedAnecdotes: number;
}

interface UserSession {
    anecdotes: Anecdote[];
    currentIndex: number;
    section: string | null;
}

const anecdotes: Anecdote[] = [];
const users: Map<number, User> = new Map();
const sessions: Map<number, UserSession> = new Map();

let anecdoteIdCounter = 1;

/**
 * /start komandasi
 */
export async function handleStart(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Foydalanuvchini yaratish/yangilash
    if (!users.has(userId)) {
        users.set(userId, {
            telegramId: userId,
            username: ctx.from?.username,
            firstName: ctx.from?.first_name,
            hasPaid: false,
            viewedAnecdotes: 0
        });
    }

    const keyboard = new InlineKeyboard()
        .text("📚 Latifalarni ko'rish", "show_sections");

    await ctx.reply(
        `🎭 <b>Latifalar botiga xush kelibsiz!</b>\n\n` +
        `📖 Minglab qiziqarli latifalar sizni kutmoqda.\n\n` +
        `💡 <b>Qanday ishlaydi?</b>\n` +
        `• Turli bo'limlardan 5 ta latifani bepul ko'ring\n` +
        `• Davomini ko'rish uchun bir martalik to'lov qiling\n` +
        `• Cheksiz latifalardan bahramand bo'ling!\n\n` +
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
    if (anecdotes.length === 0) {
        await syncAnecdotesFromAPI();
    }

    const keyboard = new InlineKeyboard();

    // Faqat Tasodifiy tugma
    keyboard.text("🎲 Tasodifiy latifalar", "section:random");
    keyboard.row();
    keyboard.text("⬅️ Orqaga", "back_to_start");

    await ctx.editMessageText(
        `🎭 <b>Latifalar botiga xush kelibsiz!</b>\n\n` +
        `📚 Jami: <b>${anecdotes.length} ta</b> qiziqarli latifa\n\n` +
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

    const user = users.get(userId);
    if (!user) return;

    let filteredAnecdotes = section === "random"
        ? anecdotes
        : anecdotes.filter(a => a.section.toLowerCase() === section.toLowerCase());

    console.log(`🔍 Section: "${section}", Found: ${filteredAnecdotes.length} anecdotes`);

    if (filteredAnecdotes.length === 0) {
        await ctx.answerCallbackQuery({
            text: "Bu bo'limda latifalar topilmadi 😔",
            show_alert: true
        });
        return;
    }

    // Agar to'lagan bo'lsa - hamma, aks holda 5 ta (yoki mavjud hammasi)
    const shuffled = [...filteredAnecdotes].sort(() => Math.random() - 0.5);
    const limit = user.hasPaid ? shuffled.length : Math.min(5, shuffled.length);
    const selected = shuffled.slice(0, limit);

    // Session yaratish
    sessions.set(userId, {
        anecdotes: selected,
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
    const user = users.get(userId);
    if (!session || !user) return;

    const anecdote = session.anecdotes[index];
    const total = session.anecdotes.length;

    // Ko'rilgan latifalar sonini oshirish
    user.viewedAnecdotes += 1;
    anecdote.views += 1;

    const keyboard = new InlineKeyboard();

    // Navigatsiya tugmalari
    const hasNavigation = total > 1;
    if (hasNavigation) {
        if (index > 0) {
            keyboard.text("⬅️ Oldingi", `next:${index - 1}`);
        }
        if (index < total - 1) {
            keyboard.text("➡️ Keyingi", `next:${index + 1}`);
        }
        if (index > 0 || index < total - 1) {
            keyboard.row();
        }
    }

    // To'lov tugmasi faqat:
    // 1) To'lov qilmagan bo'lsa
    // 2) Bo'limda ko'p latifa bo'lsa (total >= 5)
    // 3) Oxirgi latifani ko'rayotgan bo'lsa
    const needsPayment = !user.hasPaid && total >= 5 && index === total - 1;
    if (needsPayment) {
        keyboard.text("💳 1111 so'm to'lov qiling", "payment");
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

    const user = users.get(userId);
    if (!user) return;

    if (user.hasPaid) {
        await ctx.answerCallbackQuery({
            text: "Siz allaqachon to'lov qilgansiz! ✅",
            show_alert: true
        });
        return;
    }

    // To'lov parametrlari
    const amount = 1111;
    const transactionParam = generateTransactionParam();

    // Click to'lov linkini yaratish
    const paymentUrl = `https://my.click.uz/services/pay?` +
        `service_id=${process.env.CLICK_SERVICE_ID}&` +
        `merchant_id=${process.env.CLICK_MERCHANT_ID}&` +
        `amount=${amount}&` +
        `transaction_param=${transactionParam}&` +
        `return_url=${encodeURIComponent(process.env.CLICK_RETURN_URL || "")}`;

    const keyboard = new InlineKeyboard()
        .url("💳 To'lash", paymentUrl)
        .row()
        .text("✅ To'lovni tekshirish", `check_payment:${transactionParam}`)
        .row()
        .text("❌ Bekor qilish", "cancel_payment");

    await ctx.editMessageText(
        `💰 <b>Qolgan latifalarni ko'rish uchun to'lov qiling</b>\n\n` +
        `💵 Bir martalik to'lov: <b>1111 so'm</b>\n` +
        `🎁 Cheksiz latifalardan bahramand bo'ling!\n\n` +
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
    await ctx.answerCallbackQuery({
        text: "To'lov funksiyasi hali ishga tushmagan. Demo rejimda ishlayapti.",
        show_alert: true
    });
}

/**
 * API dan latifalarni sinxronlash
 */
export async function syncAnecdotesFromAPI() {
    try {
        console.log("🔄 Fetching anecdotes from API...");

        // API da 12 ta sahifa bor
        for (let page = 1; page <= 12; page++) {
            console.log(`📄 Loading page ${page}/12...`);
            const items = await fetchAnecdotesFromAPI(page);

            for (const item of items) {
                const formatted = formatAnecdote(item);

                const existing = anecdotes.find(a => a.externalId === formatted.externalId);

                if (!existing) {
                    anecdotes.push({
                        id: anecdoteIdCounter++,
                        externalId: formatted.externalId,
                        content: formatted.content,
                        section: formatted.section,
                        views: 0
                    });
                }
            }
        }

        // Bo'limlarga ajratish statistikasi
        const sectionCounts = anecdotes.reduce((acc, a) => {
            acc[a.section] = (acc[a.section] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        console.log(`✅ Synced ${anecdotes.length} anecdotes from ${Object.keys(sectionCounts).length} sections`);
        console.log("📊 Bo'limlar statistikasi:");
        Object.entries(sectionCounts).forEach(([section, count]) => {
            console.log(`   - ${section}: ${count} ta`);
        });
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

/**
 * Transaction param generatsiya qilish
 */
function generateTransactionParam(): string {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}
