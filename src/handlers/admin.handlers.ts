import { Context, InlineKeyboard } from "grammy";
import { AnalyticsService } from "../services/analytics.service.js";
import { AppDataSource } from "../database/data-source.js";
import { Payment, PaymentStatus } from "../entities/Payment.js";
import { User } from "../entities/User.js";
import { UserService } from "../services/user.service.js";
import { getMessages, normalizeLanguage } from "../services/i18n.service.js";

// Admin ID'lar ro'yxati
const ADMIN_IDS = [7789445876, 1083408];
const analyticsService = new AnalyticsService();
const userService = new UserService();

/**
 * Admin tekshirish
 */
function isSuperAdmin(userId: number | undefined): boolean {
    return userId !== undefined && ADMIN_IDS.includes(userId);
}

/**
 * /admin komandasi - Bosh sahifa
 */
export async function handleAdminPanel(ctx: Context) {
    const userId = ctx.from?.id;

    if (!isSuperAdmin(userId)) {
        await ctx.reply("⛔️ Sizda admin paneliga kirish huquqi yo'q!");
        return;
    }

    // Statistikani olish
    const userRepo = AppDataSource.getRepository(User);
    const paymentRepo = AppDataSource.getRepository(Payment);

    // DEBUG: Eng oxirgi 5 ta userni ko'ramiz
    const recentUsers = await userRepo
        .createQueryBuilder('user')
        .orderBy('user.createdAt', 'DESC')
        .limit(5)
        .getMany();

    console.log('🔍 DEBUG: Eng oxirgi 5 ta user:');
    recentUsers.forEach(u => {
        console.log(`  - ID: ${u.telegramId}, Created: ${u.createdAt}`);
    });
    console.log(`🔍 DEBUG: Server vaqti: ${new Date()}`);
    console.log(`🔍 DEBUG: UTC vaqti: ${new Date().toISOString()}`);


    // Nechta odam start bosgan (umumiy foydalanuvchilar)
    const totalUsers = await userRepo.count();

    // Nechta odam to'lov oyna bosgan (pending yoki paid to'lovlar)
    const totalPaymentAttempts = await paymentRepo.count();

    // 7 kunlik statistika - har kuni nechta yangi user va payment
    let weeklyStats = '\n📅 <b>7 kunlik statistika:</b>\n\n';

    // Timezone offset ni olamiz (Uzbekistan UTC+5)
    const tzOffset = 5 * 60; // 5 soat * 60 daqiqa = 300 minut

    for (let i = 6; i >= 0; i--) {
        // O'zbekiston vaqtida kun boshini hisoblaymiz
        const now = new Date();
        const localDate = new Date(now.getTime() + tzOffset * 60 * 1000);
        localDate.setUTCDate(localDate.getUTCDate() - i);
        localDate.setUTCHours(0, 0, 0, 0);

        const startDate = new Date(localDate.getTime() - tzOffset * 60 * 1000);
        const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

        // Shu kuni ro'yxatdan o'tganlar (UTC formatda query)
        const usersCount = await userRepo
            .createQueryBuilder('user')
            .where('user.createdAt >= :start', { start: startDate.toISOString() })
            .andWhere('user.createdAt < :end', { end: endDate.toISOString() })
            .getCount();

        // Shu kuni to'lov bosganlar (UTC formatda query)
        const paymentsCount = await paymentRepo
            .createQueryBuilder('payment')
            .where('payment.createdAt >= :start', { start: startDate.toISOString() })
            .andWhere('payment.createdAt < :end', { end: endDate.toISOString() })
            .getCount();

        // Display formatda ko'rsatish
        const displayDate = new Date(localDate);
        const dayName = displayDate.toLocaleDateString('uz-UZ', { weekday: 'short', day: '2-digit', month: '2-digit' });

        weeklyStats += `${dayName}:\n`;
        weeklyStats += `  └ Start bosganlar: ${usersCount} ta\n`;
        weeklyStats += `  └ To'lov oynasini ochganlar: ${paymentsCount} ta\n\n`;
    }

    const keyboard = new InlineKeyboard()
        .text("🔄 Yangilash", "admin:refresh");

    const message =
        `🎯 <b>BIZNES G'OYALARI BOT - ADMIN PANEL</b>\n\n` +
        `👋 Xush kelibsiz, admin!\n\n` +
        `📊 Botning to'liq statistikasi va analytics bu yerda.\n` +
        `Kerakli bo'limni tanlang:\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👥 <b>Jami start bosganlar:</b> ${totalUsers} ta\n` +
        `💰 <b>Jami to'lov oyna bosganlar:</b> ${totalPaymentAttempts} ta\n` +
        weeklyStats +
        `\n━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>Oxirgi yangilanish: ${new Date().toLocaleString("uz-UZ")}</i>`;

    if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
        await ctx.answerCallbackQuery();
    } else {
        await ctx.reply(message, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
    }
}

/**
 * Foydalanuvchilar statistikasi
 */
export async function handleAdminUsers(ctx: Context) {
    const userId = ctx.from?.id;
    if (!isSuperAdmin(userId)) return;

    await ctx.answerCallbackQuery({ text: "⏳ Yuklanmoqda..." });

    const stats = await analyticsService.getUserStats();

    const message =
        `👥 <b>FOYDALANUVCHILAR STATISTIKASI</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👤 <b>Jami foydalanuvchilar:</b> ${stats.totalUsers}\n` +
        `💳 <b>To'lov qilganlar:</b> ${stats.paidUsers}\n` +
        `🆓 <b>Bepul foydalanuvchilar:</b> ${stats.freeUsers}\n\n` +
        `📊 <b>Konversiya:</b> ${stats.conversionRate}%\n` +
        `🆕 <b>Bugun qo'shilganlar:</b> ${stats.newUsersToday}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>${new Date().toLocaleString("uz-UZ")}</i>`;

    const keyboard = new InlineKeyboard()
        .text("⬅️ Orqaga", "admin:main");

    await ctx.editMessageText(message, {
        reply_markup: keyboard,
        parse_mode: "HTML"
    });
}

/**
 * To'lovlar statistikasi
 */
export async function handleAdminPayments(ctx: Context) {
    const userId = ctx.from?.id;
    if (!isSuperAdmin(userId)) return;

    await ctx.answerCallbackQuery({ text: "⏳ Yuklanmoqda..." });

    const stats = await analyticsService.getPaymentStats();

    const message =
        `💰 <b>TO'LOVLAR STATISTIKASI</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💳 <b>Jami to'lovlar:</b> ${stats.totalPayments}\n` +
        `✅ <b>Muvaffaqiyatli:</b> ${stats.successfulPayments}\n` +
        `⏳ <b>Kutilmoqda:</b> ${stats.pendingPayments}\n` +
        `❌ <b>Muvaffaqiyatsiz:</b> ${stats.failedPayments}\n\n` +
        `📊 <b>Muvaffaqiyat:</b> ${stats.successRate}%\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💵 <b>Umumiy daromad:</b> ${stats.totalRevenue.toLocaleString()} so'm\n` +
        `📅 <b>Bugungi daromad:</b> ${stats.todayRevenue.toLocaleString()} so'm\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>${new Date().toLocaleString("uz-UZ")}</i>`;

    const keyboard = new InlineKeyboard()
        .text("⬅️ Orqaga", "admin:main");

    await ctx.editMessageText(message, {
        reply_markup: keyboard,
        parse_mode: "HTML"
    });
}

/**
 * G'oyalar statistikasi
 */
export async function handleAdminPoems(ctx: Context) {
    const userId = ctx.from?.id;
    if (!isSuperAdmin(userId)) return;

    await ctx.answerCallbackQuery({ text: "⏳ Yuklanmoqda..." });

    const stats = await analyticsService.getJokeStats();

    let message =
        `💼 <b>G'OYALAR STATISTIKASI</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📖 <b>Jami g'oyalar:</b> ${stats.totalJokes}\n` +
        `👁 <b>Jami ko'rishlar:</b> ${stats.totalViews.toLocaleString()}\n` +
        `👍 <b>Jami like:</b> ${stats.totalLikes}\n` +
        `👎 <b>Jami dislike:</b> ${stats.totalDislikes}\n\n` +
        `📊 <b>O'rtacha ko'rish:</b> ${stats.avgViewsPerJoke} ta/g'oya\n\n`;

    if (stats.mostViewedJoke) {
        message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        message += `🔥 <b>Eng ommabop g'oya:</b>\n`;
        if (stats.mostViewedJoke.category) {
            message += `🏷️ ${stats.mostViewedJoke.category}\n`;
        }
        message += `👁 ${stats.mostViewedJoke.views} ko'rish\n`;
        message += `<i>"${stats.mostViewedJoke.content}"</i>\n\n`;
    }

    if (stats.mostLikedJoke) {
        message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        message += `👍 <b>Eng yoqtirilgan g'oya:</b>\n`;
        if (stats.mostLikedJoke.category) {
            message += `🏷️ ${stats.mostLikedJoke.category}\n`;
        }
        message += `👍 ${stats.mostLikedJoke.likes} like\n`;
        message += `<i>"${stats.mostLikedJoke.content}"</i>\n\n`;
    }

    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `<i>${new Date().toLocaleString("uz-UZ")}</i>`;

    const keyboard = new InlineKeyboard()
        .text("⬅️ Orqaga", "admin:main");

    await ctx.editMessageText(message, {
        reply_markup: keyboard,
        parse_mode: "HTML"
    });
}

/**
 * Funnel statistikasi (Konversiya qadamlari)
 */
export async function handleAdminFunnel(ctx: Context) {
    const userId = ctx.from?.id;
    if (!isSuperAdmin(userId)) return;

    await ctx.answerCallbackQuery({ text: "⏳ Yuklanmoqda..." });

    const stats = await analyticsService.getFunnelStats();

    const message =
        `📊 <b>KONVERSIYA FUNNEL</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>Qadam 1:</b> /start bosganlar\n` +
        `👤 ${stats.step1_start} kishi\n` +
        `📊 100%\n\n` +
        `⬇️ ${stats.conversion_startToView}% o'tdi\n\n` +
        `<b>Qadam 2:</b> G'oyalarni ko'rganlar\n` +
        `📖 ${stats.step2_viewed} kishi\n` +
        `📊 ${stats.conversion_startToView}%\n\n` +
        `⬇️ ${stats.conversion_viewToPaymentClick}% o'tdi\n\n` +
        `<b>Qadam 3:</b> To'lov oynasini ochganlar\n` +
        `💳 ${stats.step3_clickedPayment} kishi\n` +
        `📊 ${((stats.step3_clickedPayment / stats.step1_start) * 100).toFixed(2)}%\n\n` +
        `⬇️ ${stats.conversion_clickToPaid}% o'tdi\n\n` +
        `<b>Qadam 4:</b> To'lov qilganlar\n` +
        `✅ ${stats.step4_paidSuccessfully} kishi\n` +
        `📊 ${stats.conversion_overall}%\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🎯 <b>Umumiy konversiya:</b> ${stats.conversion_overall}%\n` +
        `<i>(/start dan to'lovgacha)</i>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>${new Date().toLocaleString("uz-UZ")}</i>`;

    const keyboard = new InlineKeyboard()
        .text("⬅️ Orqaga", "admin:main");

    await ctx.editMessageText(message, {
        reply_markup: keyboard,
        parse_mode: "HTML"
    });
}

/**
 * 7 kunlik trend
 */
export async function handleAdminTrend(ctx: Context) {
    const userId = ctx.from?.id;
    if (!isSuperAdmin(userId)) return;

    await ctx.answerCallbackQuery({ text: "⏳ Yuklanmoqda..." });

    const trend = await analyticsService.getWeeklyTrend();

    let message =
        `📈 <b>7 KUNLIK TREND</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n`;

    trend.forEach(day => {
        message += `📅 <b>${day.date}</b>\n`;
        message += `  👤 ${day.newUsers} yangi foydalanuvchi\n`;
        message += `  💰 ${day.newPayments} yangi to'lov\n\n`;
    });

    const totalNewUsers = trend.reduce((sum, d) => sum + d.newUsers, 0);
    const totalNewPayments = trend.reduce((sum, d) => sum + d.newPayments, 0);

    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    message += `📊 <b>7 kunlik jami:</b>\n`;
    message += `👤 ${totalNewUsers} yangi foydalanuvchi\n`;
    message += `💰 ${totalNewPayments} yangi to'lov\n\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `<i>${new Date().toLocaleString("uz-UZ")}</i>`;

    const keyboard = new InlineKeyboard()
        .text("⬅️ Orqaga", "admin:main");

    await ctx.editMessageText(message, {
        reply_markup: keyboard,
        parse_mode: "HTML"
    });
}

/**
 * Real-time statistika
 */
export async function handleAdminRealtime(ctx: Context) {
    const userId = ctx.from?.id;
    if (!isSuperAdmin(userId)) return;

    await ctx.answerCallbackQuery({ text: "⏳ Yuklanmoqda..." });

    const stats = await analyticsService.getRealTimeStats();

    const message =
        `🔥 <b>REAL-TIME STATISTIKA</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>Oxirgi 1 soatda:</b>\n\n` +
        `👤 <b>Yangi foydalanuvchilar:</b> ${stats.newUsersLastHour}\n` +
        `💰 <b>Yangi to'lovlar:</b> ${stats.newPaymentsLastHour}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `⚡️ Bot jonli ishlayapti!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>${new Date().toLocaleString("uz-UZ")}</i>`;

    const keyboard = new InlineKeyboard()
        .text("🔄 Yangilash", "admin:realtime")
        .row()
        .text("⬅️ Orqaga", "admin:main");

    await ctx.editMessageText(message, {
        reply_markup: keyboard,
        parse_mode: "HTML"
    });
}

/**
 * Top foydalanuvchilar
 */
export async function handleAdminTopUsers(ctx: Context) {
    const userId = ctx.from?.id;
    if (!isSuperAdmin(userId)) return;

    await ctx.answerCallbackQuery({ text: "⏳ Yuklanmoqda..." });

    const topUsers = await analyticsService.getTopUsers();

    let message =
        `👑 <b>TOP 5 FOYDALANUVCHILAR</b>\n` +
        `<i>(Eng ko'p sir ko'rganlar)</i>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n`;

    topUsers.forEach((user, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "👤";
        message += `${medal} <b>#${index + 1}</b>\n`;
        message += `👤 ${user.firstName} (@${user.username})\n`;
        message += `🆔 ${user.telegramId}\n`;
        message += `💡 ${user.viewedJokes} ta sir ko'rgan\n`;
        message += `💳 ${user.hasPaid ? "✅ To'lov qilgan" : "❌ To'lov qilmagan"}\n\n`;
    });

    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `<i>${new Date().toLocaleString("uz-UZ")}</i>`;

    const keyboard = new InlineKeyboard()
        .text("⬅️ Orqaga", "admin:main");

    await ctx.editMessageText(message, {
        reply_markup: keyboard,
        parse_mode: "HTML"
    });
}

/**
 * Pending to'lovlar ro'yxati
 */
export async function handleAdminPendingPayments(ctx: Context) {
    const userId = ctx.from?.id;
    if (!isSuperAdmin(userId)) return;

    await ctx.answerCallbackQuery({ text: "⏳ Yuklanmoqda..." });

    const paymentRepo = AppDataSource.getRepository(Payment);

    const pendingPayments = await paymentRepo.find({
        where: { status: PaymentStatus.PENDING },
        relations: ["user"],
        order: { createdAt: "DESC" },
        take: 10
    });

    let message = `⏳ <b>KUTILAYOTGAN TO'LOVLAR</b>\n\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (pendingPayments.length === 0) {
        message += `✅ Kutilayotgan to'lovlar yo'q!\n\n`;
    } else {
        message += `<b>Jami:</b> ${pendingPayments.length} ta\n\n`;

        pendingPayments.forEach((payment, index) => {
            const username = payment.user?.username || "No username";
            const firstName = payment.user?.firstName || "User";
            const telegramId = payment.metadata?.telegramId || payment.user?.telegramId;

            message += `<b>${index + 1}. ${firstName}</b> (@${username})\n`;
            message += `🆔 ${telegramId}\n`;
            message += `💰 ${payment.amount} so'm\n`;
            message += `📅 ${payment.createdAt.toLocaleString("uz-UZ")}\n`;
            message += `🔗 TX: <code>${payment.transactionParam}</code>\n\n`;
        });
    }

    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `<i>${new Date().toLocaleString("uz-UZ")}</i>`;

    const keyboard = new InlineKeyboard()
        .text("⬅️ Orqaga", "admin:main");

    await ctx.editMessageText(message, {
        reply_markup: keyboard,
        parse_mode: "HTML"
    });
}

/**
 * To'lovni qo'lda tasdiqlash
 */
export async function handleManualApprove(ctx: Context) {
    const userId = ctx.from?.id;
    if (!isSuperAdmin(userId)) return;

    await ctx.reply(
        `📝 <b>TO'LOVNI QO'LDA TASDIQLASH</b>\n\n` +
        `Foydalanuvchi Telegram ID'sini yuboring:\n` +
        `(Masalan: 7789445876)`,
        { parse_mode: "HTML" }
    );
}

/**
 * Telegram ID orqali to'lovni tasdiqlash
 */
export async function handleApproveBytelegramId(ctx: Context, telegramId: number) {
    const userId = ctx.from?.id;
    if (!isSuperAdmin(userId)) {
        await ctx.reply("⛔️ Sizda ruxsat yo'q!");
        return;
    }

    const userRepo = AppDataSource.getRepository(User);
    const paymentRepo = AppDataSource.getRepository(Payment);

    // Foydalanuvchini topish
    const user = await userRepo.findOne({
        where: { telegramId: telegramId }
    });

    if (!user) {
        await ctx.reply(
            `❌ <b>Xatolik!</b>\n\n` +
            `Telegram ID ${telegramId} topilmadi!\n` +
            `Foydalanuvchi botda /start bosganmi?`,
            { parse_mode: "HTML" }
        );
        return;
    }

    if (user.hasPaid) {
        await ctx.reply(
            `ℹ️ <b>Ma'lumot</b>\n\n` +
            `${user.firstName} (@${user.username || "no username"})\n` +
            `Allaqachon to'lov qilgan!`,
            { parse_mode: "HTML" }
        );
        return;
    }

    // Pending to'lovlarni topish
    const pendingPayment = await paymentRepo.findOne({
        where: {
            userId: user.id,
            status: PaymentStatus.PENDING
        }
    });

    if (pendingPayment) {
        // To'lovni tasdiqlash
        pendingPayment.status = PaymentStatus.PAID;
        pendingPayment.metadata = {
            ...pendingPayment.metadata,
            manuallyApprovedBy: userId,
            manuallyApprovedAt: new Date().toISOString()
        };
        await paymentRepo.save(pendingPayment);
    }

    // Foydalanuvchini to'lagan deb belgilash
    await userService.markAsPaid(telegramId);

    // Foydalanuvchiga xabar va tugma yuborish
    try {
        const userLanguage = normalizeLanguage(user.preferredLanguage);
        const messages = getMessages(userLanguage);

        const keyboard = new InlineKeyboard()
            .text(messages.openFactsButton, "show_jokes");

        await ctx.api.sendMessage(
            telegramId,
            messages.paymentConfirmedNotification(1111),
            {
                reply_markup: keyboard,
                parse_mode: "HTML"
            }
        );
    } catch (error) {
        console.error("Failed to send notification:", error);
    }

    await ctx.reply(
        `✅ <b>Muvaffaqiyatli!</b>\n\n` +
        `${user.firstName} (@${user.username || "no username"})\n` +
        `🆔 ${telegramId}\n\n` +
        `To'lov tasdiqlandi va foydalanuvchiga xabar yuborildi! 🎉`,
        { parse_mode: "HTML" }
    );
}

/**
 * Obunani bekor qilish (Super Admin)
 * /revoke TELEGRAM_ID
 */
export async function handleRevokeByTelegramId(ctx: Context, telegramId: number) {
    const userId = ctx.from?.id;
    if (!isSuperAdmin(userId)) {
        return ctx.reply("⛔️ Bu buyruq faqat super admin uchun!");
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { telegramId } });

    if (!user) {
        return ctx.reply(
            `❌ <b>Foydalanuvchi topilmadi!</b>\n\n` +
            `🆔 Telegram ID: ${telegramId}\n\n` +
            `Bu ID bilan foydalanuvchi database'da yo'q.`,
            { parse_mode: "HTML" }
        );
    }

    // Obunani bekor qilish
    if (!user.hasPaid) {
        return ctx.reply(
            `⚠️ <b>Obuna allaqachon yo'q!</b>\n\n` +
            `${user.firstName} (@${user.username || "no username"})\n` +
            `🆔 ${telegramId}\n\n` +
            `Bu foydalanuvchi to'lov qilmagan yoki obuna allaqachon bekor qilingan.`,
            { parse_mode: "HTML" }
        );
    }

    // Obunani bekor qilish va revokedAt ni set qilish
    user.hasPaid = false;
    user.revokedAt = new Date();
    await userRepo.save(user);

    // Foydalanuvchiga xabar yuborish
    try {
        const userLanguage = normalizeLanguage(user.preferredLanguage);
        const messages = getMessages(userLanguage);

        await ctx.api.sendMessage(
            telegramId,
            messages.paymentRevokedText,
            { parse_mode: "HTML" }
        );
    } catch (error) {
        console.error("Failed to send revoke notification:", error);
    }

    await ctx.reply(
        `✅ <b>Obuna bekor qilindi!</b>\n\n` +
        `${user.firstName} (@${user.username || "no username"})\n` +
        `🆔 ${telegramId}\n\n` +
        `Foydalanuvchining obunasi bekor qilindi va xabar yuborildi! 🚫`,
        { parse_mode: "HTML" }
    );
}

/**
 * Admin callback query handler
 */
export async function handleAdminCallback(ctx: Context, action: string) {
    switch (action) {
        case "main":
            await handleAdminPanel(ctx);
            break;
        case "users":
            await handleAdminUsers(ctx);
            break;
        case "payments":
            await handleAdminPayments(ctx);
            break;
        case "pending":
            await handleAdminPendingPayments(ctx);
            break;
        case "poems":
            await handleAdminPoems(ctx);
            break;
        case "funnel":
            await handleAdminFunnel(ctx);
            break;
        case "trend":
            await handleAdminTrend(ctx);
            break;
        case "realtime":
            await handleAdminRealtime(ctx);
            break;
        case "topusers":
            await handleAdminTopUsers(ctx);
            break;
        case "refresh":
            await handleAdminPanel(ctx);
            break;
    }
}
