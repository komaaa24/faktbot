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
    links?: any;
    meta?: any;
}

/**
 * ProgramSoft API dan biznes g'oyalar olish
 */
export async function fetchJokesFromAPI(page: number = 1): Promise<JokeItem[]> {
    try {
        const apiBaseUrl = process.env.PROGRAMSOFT_API_URL || "https://www.programsoft.uz/api";
        const serviceId = process.env.PROGRAMSOFT_SERVICE_ID || "64";
        const base = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
        const url = `${base}/service/${serviceId}?page=${page}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const json = await response.json() as ProgramSoftResponse;

        // API response strukturasini tekshirish
        const items = json?.data || [];

        if (!Array.isArray(items)) {
            console.warn("API unexpected format, no items array found");
            return [];
        }

        return items;
    } catch (error) {
        console.error("Error fetching ideas from API:", error);
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
 * G'oyani formatlash
 */
export function formatJoke(item: JokeItem): {
    externalId: string;
    content: string;
    category?: string;
    title?: string;
    likes: number;
    dislikes: number;
} {
    const externalId = String(item.id);
    const raw = item.text || "G'oya topilmadi";
    const { title, body } = splitIdeaText(raw);
    const content = body || raw;
    const category = item.caption || undefined;

    return {
        externalId,
        content,
        category,
        title,
        likes: parseInt(item.likes || "0") || 0,
        dislikes: parseInt(item.dislikes || "0") || 0
    };
}
