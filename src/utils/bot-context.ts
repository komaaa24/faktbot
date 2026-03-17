const DEFAULT_LEGACY_BOT_USERNAME = "legacy";

function cleanBotUsername(value?: string | null): string {
    return String(value || "").trim().replace(/^@/, "");
}

export function getLegacyBotUsername(): string {
    return (
        cleanBotUsername(process.env.LEGACY_BOT_USERNAME) ||
        cleanBotUsername(process.env.DEFAULT_BOT_USERNAME) ||
        DEFAULT_LEGACY_BOT_USERNAME
    );
}

export function normalizeBotUsername(botUsername?: string | null): string {
    return cleanBotUsername(botUsername) || getLegacyBotUsername();
}

export function buildScopedUserKey(botUsername: string, telegramId: number): string {
    return `${normalizeBotUsername(botUsername)}:${telegramId}`;
}
