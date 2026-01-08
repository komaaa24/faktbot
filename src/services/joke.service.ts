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
 * ProgramSoft API dan latifalarni olish
 */
export async function fetchJokesFromAPI(page: number = 1): Promise<JokeItem[]> {
    try {
        const apiBaseUrl = process.env.PROGRAMSOFT_API_URL || "https://www.programsoft.uz/api";
        const serviceId = process.env.PROGRAMSOFT_SERVICE_ID || "1";
        const url = `${apiBaseUrl}/service/${serviceId}?page=${page}`;
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
        console.error("Error fetching jokes from API:", error);
        throw error;
    }
}

/**
 * Latifani formatlash
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
    const content = item.text || "Latifa topilmadi";
    const category = item.caption || undefined;

    return {
        externalId,
        content,
        category,
        title: undefined,
        likes: parseInt(item.likes || "0") || 0,
        dislikes: parseInt(item.dislikes || "0") || 0
    };
}
