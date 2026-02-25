import { Context, InlineKeyboard } from "grammy";
import { Joke } from "../entities/Joke.js";
import { User } from "../entities/User.js";
import { Payment, PaymentStatus } from "../entities/Payment.js";
import { AppDataSource } from "../database/data-source.js";
import { UserService } from "../services/user.service.js";
import { fetchFactsFromAPI, formatJoke } from "../services/joke.service.js";
import { generatePaymentLink, generateTransactionParam, getFixedPaymentAmount } from "../services/click.service.js";
import { writeFile } from "fs/promises";
import path from "path";
import axios from "axios";
import { SherlarPaymentService } from "../services/sherlar-payment.service.js";
import { BotLanguage } from "../types/language.js";
import { detectLanguageFromTelegram, getMessages, normalizeLanguage } from "../services/i18n.service.js";

const userService = new UserService();
const sherlarPaymentService = new SherlarPaymentService();

interface UserSession {
    jokes: Joke[];
    currentIndex: number;
    language: BotLanguage;
}

const sessions = new Map<number, UserSession>();

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function answerCallbackSafe(
    ctx: Context,
    options?: Parameters<Context["answerCallbackQuery"]>[0]
): Promise<void> {
    if (!ctx.callbackQuery) return;

    try {
        await ctx.answerCallbackQuery(options);
    } catch (error) {
        console.warn("⚠️ Failed to answer callback query:", error);
    }
}

async function resolveUserLanguage(ctx: Context, userId: number): Promise<BotLanguage> {
    const fromTelegram = detectLanguageFromTelegram(ctx.from?.language_code);

    const user = await userService.findOrCreate(userId, {
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name,
        preferredLanguage: fromTelegram
    });

    return normalizeLanguage(user.preferredLanguage);
}

async function showJoke(ctx: Context, userId: number, index: number, answerCallback = false) {
    const session = sessions.get(userId);
    if (!session) return;

    if (index < 0 || index >= session.jokes.length) {
        return;
    }

    session.currentIndex = index;

    const joke = session.jokes[index];
    const total = session.jokes.length;
    const hasPaid = await userService.hasPaid(userId);
    const messages = getMessages(session.language);

    await userService.incrementViewedJokes(userId);

    const jokeRepo = AppDataSource.getRepository(Joke);
    joke.views += 1;
    await jokeRepo.save(joke);

    const keyboard = new InlineKeyboard();

    if (index < total - 1) {
        keyboard.text(messages.nextFactButton, `next:${index + 1}`);
    }

    if (!hasPaid && index === total - 1) {
        keyboard.row();
        keyboard.text(messages.premiumButton, "payment");
    }

    keyboard.row();
    keyboard.text(messages.languageButton, "lang:menu");

    let text = `${messages.factCardTitle(index + 1, total)}\n\n`;

    if (joke.category) {
        text += `🏷️ <b>${messages.categoryLabel}:</b> ${escapeHtml(joke.category.trim())}\n\n`;
    }

    text += `${escapeHtml(joke.content.trim())}\n`;

    if (joke.views > 10) {
        text += `\n👁 ${joke.views.toLocaleString()} | `;
        text += `👍 ${joke.likes} | `;
        text += `👎 ${joke.dislikes}`;
    }

    if (ctx.callbackQuery) {
        await ctx.editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });

        if (answerCallback) {
            await answerCallbackSafe(ctx);
        }
    } else {
        await ctx.reply(text, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
    }
}

/**
 * /start komandasi
 */
export async function handleStart(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const language = await resolveUserLanguage(ctx, userId);

    const user = await userService.findOrCreate(userId, {
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name,
        preferredLanguage: language
    });

    let hasPaid = user.hasPaid;

    if (!hasPaid) {
        console.log(`🔍 [START] Checking sherlar database for user: ${userId}`);
        try {
            const paymentResult = await sherlarPaymentService.hasValidPayment(userId);

            if (paymentResult.hasPaid) {
                if (user.revokedAt && paymentResult.paymentDate) {
                    if (paymentResult.paymentDate < user.revokedAt) {
                        console.log("⚠️ [START] Payment found but user was revoked. Skipping.");
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

    await handleShowJokes(ctx, { answerCallback: Boolean(ctx.callbackQuery) });
}

/**
 * Faktlarni ko'rsatish
 */
export async function handleShowJokes(
    ctx: Context,
    options?: { answerCallback?: boolean }
) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const language = await resolveUserLanguage(ctx, userId);
    const messages = getMessages(language);
    const jokeRepo = AppDataSource.getRepository(Joke);

    const hasPaid = await userService.hasPaid(userId);

    const languageCount = await jokeRepo.count({
        where: { language }
    });

    if (languageCount === 0) {
        await syncJokesFromAPI([language]);
    }

    let query = jokeRepo
        .createQueryBuilder("joke")
        .where("joke.language = :language", { language })
        .orderBy("RANDOM()");

    if (!hasPaid) {
        query = query.limit(5);
    }

    let jokes = await query.getMany();

    if (jokes.length === 0) {
        const fallbackLanguages = (["uz", "en", "ru"] as BotLanguage[]).filter((lang) => lang !== language);

        for (const fallbackLanguage of fallbackLanguages) {
            let fallbackQuery = jokeRepo
                .createQueryBuilder("joke")
                .where("joke.language = :language", { language: fallbackLanguage })
                .orderBy("RANDOM()");

            if (!hasPaid) {
                fallbackQuery = fallbackQuery.limit(5);
            }

            jokes = await fallbackQuery.getMany();
            if (jokes.length > 0) {
                break;
            }
        }
    }

    if (jokes.length === 0) {
        if (ctx.callbackQuery) {
            await answerCallbackSafe(ctx, {
                text: messages.noFacts,
                show_alert: true
            });
        } else {
            await ctx.reply(messages.noFacts);
        }
        return;
    }

    const sessionLanguage = normalizeLanguage(jokes[0].language);

    sessions.set(userId, {
        jokes,
        currentIndex: 0,
        language: sessionLanguage
    });

    const shouldAnswerCallback =
        options?.answerCallback !== undefined ? options.answerCallback : Boolean(ctx.callbackQuery);

    await showJoke(ctx, userId, 0, shouldAnswerCallback);
}

/**
 * Keyingi fakt
 */
export async function handleNext(ctx: Context, index: number) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const hasPaid = await userService.hasPaid(userId);
    const session = sessions.get(userId);
    const language = session?.language || (await resolveUserLanguage(ctx, userId));
    const messages = getMessages(language);

    if (!session) {
        await answerCallbackSafe(ctx, {
            text: messages.sessionExpired,
            show_alert: true
        });
        return;
    }

    if (!hasPaid && index >= 5) {
        await answerCallbackSafe(ctx, {
            text: messages.revokedLimitAlert,
            show_alert: true
        });

        const keyboard = new InlineKeyboard()
            .text(messages.premiumButton, "payment")
            .row()
            .text(messages.languageButton, "lang:menu");

        await ctx.editMessageText(messages.revokedLimitText, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
        return;
    }

    await showJoke(ctx, userId, index, true);
}

/**
 * To'lov oynasi
 */
export async function handlePayment(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const language = await resolveUserLanguage(ctx, userId);
    const messages = getMessages(language);

    const user = await userService.findOrCreate(userId, {
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name,
        preferredLanguage: language
    });

    if (user.hasPaid) {
        await answerCallbackSafe(ctx, {
            text: messages.alreadyPremium,
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

    const botUsername = ctx.me?.username || "faktlar_bot";
    const returnUrl = `https://t.me/${botUsername}`;

    const paymentLink = generatePaymentLink({
        amount,
        transactionParam,
        userId,
        returnUrl
    });

    const keyboard = new InlineKeyboard()
        .url(messages.payButton, paymentLink.url)
        .row()
        .text(messages.checkPaymentButton, `check_payment:${payment.id}`)
        .row()
        .text(messages.languageButton, "lang:menu");

    if (ctx.callbackQuery) {
        await ctx.editMessageText(messages.paymentScreen(amount), {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
        await answerCallbackSafe(ctx);
    } else {
        await ctx.reply(messages.paymentScreen(amount), {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
    }
}

/**
 * To'lovni tekshirish
 */
export async function handleCheckPayment(ctx: Context, paymentId: number) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const language = await resolveUserLanguage(ctx, userId);
    const messages = getMessages(language);

    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({
        where: { id: paymentId },
        relations: ["user"]
    });

    if (!payment) {
        await answerCallbackSafe(ctx, {
            text: messages.paymentNotFound,
            show_alert: true
        });
        return;
    }

    if (payment.status === PaymentStatus.PAID) {
        await answerCallbackSafe(ctx, {
            text: messages.paymentApprovedAlert,
            show_alert: true
        });

        await ctx.editMessageText(messages.paymentApprovedText(Number(payment.amount)), {
            parse_mode: "HTML"
        });
        return;
    }

    if (payment.status === PaymentStatus.PENDING) {
        await answerCallbackSafe(ctx, {
            text: messages.paymentChecking,
            show_alert: false
        });

        try {
            const paymentResult = await sherlarPaymentService.hasValidPayment(userId);

            if (paymentResult.hasPaid) {
                const userRepo = AppDataSource.getRepository(User);
                const dbUser = await userRepo.findOne({ where: { telegramId: userId } });

                if (dbUser?.revokedAt && paymentResult.paymentDate && paymentResult.paymentDate < dbUser.revokedAt) {
                    await ctx.editMessageText(messages.paymentRevokedText, {
                        parse_mode: "HTML"
                    });
                    return;
                }

                payment.status = PaymentStatus.PAID;
                await paymentRepo.save(payment);

                await userRepo
                    .createQueryBuilder()
                    .update(User)
                    .set({ hasPaid: true, revokedAt: () => "NULL" })
                    .where("telegramId = :telegramId", { telegramId: userId })
                    .execute();

                await ctx.editMessageText(messages.paymentApprovedText(Number(payment.amount)), {
                    parse_mode: "HTML"
                });
            } else {
                await ctx.editMessageText(messages.paymentPending, {
                    parse_mode: "HTML"
                });
            }
        } catch (error) {
            console.error("❌ [CHECK_PAYMENT] Error:", error);
            await ctx.editMessageText(messages.paymentError, {
                parse_mode: "HTML"
            });
        }
        return;
    }

    await answerCallbackSafe(ctx, {
        text: messages.paymentFailed,
        show_alert: true
    });
}

/**
 * Til menyusi
 */
export async function handleLanguageMenu(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const currentLanguage = await resolveUserLanguage(ctx, userId);
    const messages = getMessages(currentLanguage);

    const keyboard = new InlineKeyboard()
        .text(`${currentLanguage === "uz" ? "✅ " : ""}🇺🇿 O'zbek`, "lang:set:uz")
        .row()
        .text(`${currentLanguage === "en" ? "✅ " : ""}🇬🇧 English`, "lang:set:en")
        .row()
        .text(`${currentLanguage === "ru" ? "✅ " : ""}🇷🇺 Русский`, "lang:set:ru");

    if (ctx.callbackQuery) {
        await ctx.editMessageText(messages.languageMenuTitle, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
        await answerCallbackSafe(ctx);
    } else {
        await ctx.reply(messages.languageMenuTitle, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
    }
}

/**
 * Tilni yangilash
 */
export async function handleSetLanguage(ctx: Context, language: BotLanguage) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const normalized = normalizeLanguage(language);
    await userService.setPreferredLanguage(userId, normalized);

    sessions.delete(userId);

    const messages = getMessages(normalized);
    await answerCallbackSafe(ctx, {
        text: messages.languageChangedToast,
        show_alert: false
    });

    await handleShowJokes(ctx, { answerCallback: false });
}

/**
 * API dan faktlarni sinxronlash
 */
export async function syncJokesFromAPI(languages: BotLanguage[] = ["uz", "en", "ru"]): Promise<void> {
    const jokeRepo = AppDataSource.getRepository(Joke);

    try {
        for (const language of languages) {
            const envPagesValue = language === "uz"
                ? process.env.PROGRAMSOFT_UZ_PAGES
                : language === "en"
                    ? process.env.PROGRAMSOFT_EN_PAGES
                    : process.env.PROGRAMSOFT_RU_PAGES;
            const configuredPages = Number(envPagesValue);
            const pageLimit = Number.isFinite(configuredPages) && configuredPages > 0 ? configuredPages : 30;

            let page = 1;
            let synced = 0;

            while (page <= pageLimit) {
                const result = await fetchFactsFromAPI(language, page);
                if (result.items.length === 0) {
                    break;
                }

                const rows = result.items.map((item) => formatJoke(item, language));
                await jokeRepo.upsert(rows, ["externalId"]);
                synced += rows.length;

                if (result.lastPage && page >= result.lastPage) {
                    break;
                }

                page += 1;
            }

            console.log(`✅ Synced ${synced} facts for language=${language}`);
        }

        console.log("✅ Content synced successfully");
    } catch (error) {
        console.error("❌ Error syncing facts:", error);
        throw error;
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
