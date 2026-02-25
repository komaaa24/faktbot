import { BotLanguage } from "../types/language.js";

interface JokeItem {
    id: number;
    text: string;
    caption?: string;
    published_date?: string;
    likes?: string;
    dislikes?: string;
}

interface ProgramSoftResponse {
    data?: JokeItem[];
    links?: {
        first?: string | null;
        last?: string | null;
        prev?: string | null;
        next?: string | null;
    };
    meta?: {
        current_page?: number;
        last_page?: number;
        per_page?: number;
        total?: number;
    };
}

export interface FetchFactsPageResult {
    items: JokeItem[];
    currentPage: number;
    lastPage?: number;
}

function resolveServiceId(language: BotLanguage): string {
    const envKeyByLanguage: Record<BotLanguage, string> = {
        uz: "PROGRAMSOFT_UZ_SERVICE_ID",
        en: "PROGRAMSOFT_EN_SERVICE_ID",
        ru: "PROGRAMSOFT_RU_SERVICE_ID"
    };

    const envKey = envKeyByLanguage[language];
    const serviceId = (process.env[envKey] || "").trim();

    if (!serviceId) {
        throw new Error(`Missing required env variable: ${envKey}`);
    }

    return serviceId;
}

function resolveApiBaseUrl(): string {
    const apiBaseUrl = (process.env.PROGRAMSOFT_API_URL || "").trim();
    if (!apiBaseUrl) {
        throw new Error("Missing required env variable: PROGRAMSOFT_API_URL");
    }
    return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

/**
 * ProgramSoft API dan faktlarni olish (til bo'yicha)
 */
export async function fetchFactsFromAPI(
    language: BotLanguage,
    page: number = 1
): Promise<FetchFactsPageResult> {
    try {
        const base = resolveApiBaseUrl();
        const serviceId = resolveServiceId(language);
        const url = `${base}/service/${serviceId}?page=${page}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const json = (await response.json()) as ProgramSoftResponse;
        const items = json?.data || [];

        if (!Array.isArray(items)) {
            console.warn(`⚠️ API unexpected format for ${language} page ${page}`);
            return {
                items: [],
                currentPage: page,
                lastPage: undefined
            };
        }

        return {
            items,
            currentPage: json.meta?.current_page || page,
            lastPage: json.meta?.last_page
        };
    } catch (error) {
        console.error(`❌ Error fetching facts from API (${language}, page=${page}):`, error);
        throw error;
    }
}

const KNOWN_LABELS = new Set([
    "tavsif",
    "boshlash usuli",
    "konikmalar",
    "ko'nikmalar",
    "sarmoya",
    "investitsiya",
    "kapital",
    "daromad",
    "bozor",
    "marketing",
    "resurslar",
    "auditoriya",
    "xavflar",
    "afzalliklar",
    "kamchiliklar",
    "talab"
]);

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
    if (!label) return false;
    return KNOWN_LABELS.has(label) || label.length <= 24;
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

/**
 * Faktni standart formatga o'tkazish
 */
export function formatJoke(item: JokeItem, language: BotLanguage): {
    externalId: string;
    content: string;
    category?: string;
    title?: string;
    language: BotLanguage;
    likes: number;
    dislikes: number;
} {
    const externalId = `${language}:${item.id}`;
    const raw = item.text || "Fact not found";
    const { title, body } = splitIdeaText(raw);
    const content = body || raw;
    const category = item.caption?.trim() || undefined;

    return {
        externalId,
        content,
        category,
        title,
        language,
        likes: parseInt(item.likes || "0", 10) || 0,
        dislikes: parseInt(item.dislikes || "0", 10) || 0
    };
}
