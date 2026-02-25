import { BotLanguage } from "../types/language.js";

const SUPPORTED_LANGUAGES = new Set<BotLanguage>(["uz", "en", "ru"]);

export function normalizeLanguage(value?: string | null): BotLanguage {
    const normalized = (value || "").trim().toLowerCase();
    if (normalized.startsWith("en")) return "en";
    if (normalized.startsWith("ru")) return "ru";
    if (SUPPORTED_LANGUAGES.has(normalized as BotLanguage)) {
        return normalized as BotLanguage;
    }
    return "uz";
}

export function detectLanguageFromTelegram(languageCode?: string | null): BotLanguage {
    return normalizeLanguage(languageCode);
}

type Messages = {
    noFacts: string;
    categoryLabel: string;
    nextFactButton: string;
    premiumButton: string;
    languageButton: string;
    payButton: string;
    checkPaymentButton: string;
    openFactsButton: string;
    sessionExpired: string;
    revokedLimitAlert: string;
    revokedLimitText: string;
    alreadyPremium: string;
    paymentNotFound: string;
    paymentChecking: string;
    paymentPending: string;
    paymentError: string;
    paymentFailed: string;
    paymentCancelled: string;
    paymentApprovedAlert: string;
    paymentApprovedText: (amount: number) => string;
    paymentRevokedText: string;
    paymentScreen: (amount: number) => string;
    paymentConfirmedNotification: (amount: number) => string;
    languageMenuTitle: string;
    languageChangedToast: string;
    factCardTitle: (index: number, total: number) => string;
    syncStarted: string;
    syncCompleted: string;
    syncFailed: string;
};

const UZ_MESSAGES: Messages = {
    noFacts: "Faktlar topilmadi 😔",
    categoryLabel: "Kategoriya",
    nextFactButton: "📚 Keyingi fakt",
    premiumButton: "🚀 Premium kirish",
    languageButton: "🌐 Til",
    payButton: "💳 To'lash",
    checkPaymentButton: "✅ To'lovni tekshirish",
    openFactsButton: "📚 Faktlarni ochish",
    sessionExpired: "Sessiya tugagan. /start ni bosing.",
    revokedLimitAlert: "❌ Obuna faol emas. Faqat 5 ta bepul fakt mavjud.",
    revokedLimitText:
        `⚠️ <b>Premium faol emas</b>\n\n` +
        `Siz faqat 5 ta bepul faktni ko'rishingiz mumkin.\n\n` +
        `Cheksiz faktlar uchun premiumni faollashtiring.`,
    alreadyPremium: "Siz allaqachon premium a'zosisiz ✅",
    paymentNotFound: "To'lov topilmadi ❌",
    paymentChecking: "🔍 To'lov tekshirilmoqda...",
    paymentPending:
        `⏳ <b>To'lov hali tasdiqlanmadi</b>\n\n` +
        `To'lovdan keyin biroz kutib, qayta tekshirib ko'ring.`,
    paymentError:
        `❌ <b>Xatolik yuz berdi</b>\n\n` +
        `Iltimos, qaytadan urinib ko'ring.`,
    paymentFailed: "To'lov muvaffaqiyatsiz ❌",
    paymentCancelled: "❌ To'lov bekor qilindi.\n\nQayta urinish uchun /start ni bosing.",
    paymentApprovedAlert: "To'lovingiz tasdiqlandi ✅",
    paymentApprovedText: (amount: number) =>
        `✅ <b>To'lov tasdiqlandi!</b>\n\n` +
        `💰 Summa: ${amount.toLocaleString()} so'm\n` +
        `🎉 Endi siz premium a'zosisiz.\n\n` +
        `Faktlarni o'qish uchun /start ni bosing.`,
    paymentRevokedText:
        `⚠️ <b>Obunangiz bekor qilingan</b>\n\n` +
        `Premium qayta ochilishi uchun yangidan to'lov qiling.\n\n` +
        `/start`,
    paymentScreen: (amount: number) =>
        `🚀 <b>PREMIUM FAKTLAR</b>\n\n` +
        `💰 Narx: <b>${amount.toLocaleString()} so'm</b>\n` +
        `♾️ Bir martalik to'lov, cheksiz kirish.\n\n` +
        `Premium bilan:\n` +
        `• O'zbek, ingliz va rus tilidagi barcha faktlar\n` +
        `• Har safar random faktlar oqimi\n` +
        `• Hech qanday limitlarsiz foydalanish\n\n` +
        `To'lovdan keyin "To'lovni tekshirish" ni bosing.`,
    paymentConfirmedNotification: (amount: number) =>
        `✅ <b>To'lovingiz tasdiqlandi!</b>\n\n` +
        `💰 Summa: ${amount.toLocaleString()} so'm\n` +
        `🎉 Endi botdan cheksiz foydalanishingiz mumkin.\n\n` +
        `Faktlarni davom ettirish uchun /start bosing.`,
    languageMenuTitle: `🌐 <b>Tilni tanlang</b>\n\nBot o'zbek, ingliz va rus tillarida ishlaydi.`,
    languageChangedToast: "Til yangilandi ✅",
    factCardTitle: (index: number, total: number) => `📚 <b>FAKT #${index}</b> • ${total} ta`,
    syncStarted: "🔄 Faktlar sinxronlashtirilmoqda...",
    syncCompleted: "✅ Faktlar sinxronlash tugadi",
    syncFailed: "❌ Faktlarni sinxronlashda xatolik"
};

const EN_MESSAGES: Messages = {
    noFacts: "No facts found 😔",
    categoryLabel: "Category",
    nextFactButton: "📚 Next fact",
    premiumButton: "🚀 Premium access",
    languageButton: "🌐 Language",
    payButton: "💳 Pay now",
    checkPaymentButton: "✅ Check payment",
    openFactsButton: "📚 Open facts",
    sessionExpired: "Session expired. Please press /start.",
    revokedLimitAlert: "❌ Subscription is inactive. Only 5 free facts are available.",
    revokedLimitText:
        `⚠️ <b>Premium is inactive</b>\n\n` +
        `You can view only 5 free facts.\n\n` +
        `Activate premium for unlimited access.`,
    alreadyPremium: "You already have premium ✅",
    paymentNotFound: "Payment not found ❌",
    paymentChecking: "🔍 Checking payment...",
    paymentPending:
        `⏳ <b>Payment is not confirmed yet</b>\n\n` +
        `Please wait a bit and check again.`,
    paymentError:
        `❌ <b>Something went wrong</b>\n\n` +
        `Please try again.`,
    paymentFailed: "Payment failed ❌",
    paymentCancelled: "❌ Payment cancelled.\n\nPress /start to try again.",
    paymentApprovedAlert: "Your payment is confirmed ✅",
    paymentApprovedText: (amount: number) =>
        `✅ <b>Payment confirmed!</b>\n\n` +
        `💰 Amount: ${amount.toLocaleString()} UZS\n` +
        `🎉 Premium access is now active.\n\n` +
        `Press /start to continue reading facts.`,
    paymentRevokedText:
        `⚠️ <b>Your subscription was revoked</b>\n\n` +
        `Please pay again to reactivate premium.\n\n` +
        `/start`,
    paymentScreen: (amount: number) =>
        `🚀 <b>PREMIUM FACTS</b>\n\n` +
        `💰 Price: <b>${amount.toLocaleString()} UZS</b>\n` +
        `♾️ One-time payment, unlimited access.\n\n` +
        `With premium you get:\n` +
        `• Full Uzbek + English + Russian fact catalog\n` +
        `• Random fact feed every session\n` +
        `• No viewing limits\n\n` +
        `After payment, tap "Check payment".`,
    paymentConfirmedNotification: (amount: number) =>
        `✅ <b>Your payment is confirmed!</b>\n\n` +
        `💰 Amount: ${amount.toLocaleString()} UZS\n` +
        `🎉 You now have unlimited bot access.\n\n` +
        `Press /start to continue.`,
    languageMenuTitle: `🌐 <b>Choose language</b>\n\nThe bot supports Uzbek, English, and Russian.`,
    languageChangedToast: "Language updated ✅",
    factCardTitle: (index: number, total: number) => `📚 <b>FACT #${index}</b> • ${total} total`,
    syncStarted: "🔄 Syncing facts...",
    syncCompleted: "✅ Facts synced successfully",
    syncFailed: "❌ Failed to sync facts"
};

const RU_MESSAGES: Messages = {
    noFacts: "Факты не найдены 😔",
    categoryLabel: "Категория",
    nextFactButton: "📚 Следующий факт",
    premiumButton: "🚀 Премиум доступ",
    languageButton: "🌐 Язык",
    payButton: "💳 Оплатить",
    checkPaymentButton: "✅ Проверить оплату",
    openFactsButton: "📚 Открыть факты",
    sessionExpired: "Сессия истекла. Нажмите /start.",
    revokedLimitAlert: "❌ Подписка не активна. Доступно только 5 бесплатных фактов.",
    revokedLimitText:
        `⚠️ <b>Премиум не активен</b>\n\n` +
        `Вы можете смотреть только 5 бесплатных фактов.\n\n` +
        `Активируйте премиум для безлимитного доступа.`,
    alreadyPremium: "У вас уже есть премиум ✅",
    paymentNotFound: "Платеж не найден ❌",
    paymentChecking: "🔍 Проверяем оплату...",
    paymentPending:
        `⏳ <b>Оплата пока не подтверждена</b>\n\n` +
        `Подождите немного и проверьте снова.`,
    paymentError:
        `❌ <b>Произошла ошибка</b>\n\n` +
        `Пожалуйста, попробуйте снова.`,
    paymentFailed: "Оплата не прошла ❌",
    paymentCancelled: "❌ Оплата отменена.\n\nНажмите /start, чтобы попробовать снова.",
    paymentApprovedAlert: "Ваш платеж подтвержден ✅",
    paymentApprovedText: (amount: number) =>
        `✅ <b>Оплата подтверждена!</b>\n\n` +
        `💰 Сумма: ${amount.toLocaleString()} UZS\n` +
        `🎉 Премиум доступ активирован.\n\n` +
        `Нажмите /start для продолжения.`,
    paymentRevokedText:
        `⚠️ <b>Ваша подписка была отозвана</b>\n\n` +
        `Оплатите заново, чтобы снова активировать премиум.\n\n` +
        `/start`,
    paymentScreen: (amount: number) =>
        `🚀 <b>ПРЕМИУМ ФАКТЫ</b>\n\n` +
        `💰 Цена: <b>${amount.toLocaleString()} UZS</b>\n` +
        `♾️ Разовая оплата, безлимитный доступ.\n\n` +
        `С премиумом вы получаете:\n` +
        `• Факты на узбекском, английском и русском\n` +
        `• Случайную ленту фактов при каждом запуске\n` +
        `• Без ограничений по просмотрам\n\n` +
        `После оплаты нажмите "Проверить оплату".`,
    paymentConfirmedNotification: (amount: number) =>
        `✅ <b>Ваш платеж подтвержден!</b>\n\n` +
        `💰 Сумма: ${amount.toLocaleString()} UZS\n` +
        `🎉 Теперь у вас безлимитный доступ к боту.\n\n` +
        `Нажмите /start, чтобы продолжить.`,
    languageMenuTitle: `🌐 <b>Выберите язык</b>\n\nБот поддерживает узбекский, английский и русский.`,
    languageChangedToast: "Язык обновлен ✅",
    factCardTitle: (index: number, total: number) => `📚 <b>ФАКТ #${index}</b> • всего ${total}`,
    syncStarted: "🔄 Синхронизация фактов...",
    syncCompleted: "✅ Факты успешно синхронизированы",
    syncFailed: "❌ Ошибка синхронизации фактов"
};

export function getMessages(language: BotLanguage): Messages {
    if (language === "en") return EN_MESSAGES;
    if (language === "ru") return RU_MESSAGES;
    return UZ_MESSAGES;
}
