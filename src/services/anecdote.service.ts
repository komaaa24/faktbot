interface AnecdoteItem {
    id: number;
    text: string;
    caption?: string;
    published_date?: string;
    likes?: string;
    dislikes?: string;
}

interface ProgramSoftResponse {
    data?: AnecdoteItem[];
    links?: any;
    meta?: any;
}

/**
 * ProgramSoft API dan latifalarni olish
 */
export async function fetchAnecdotesFromAPI(page: number = 1): Promise<AnecdoteItem[]> {
    try {
        const url = `https://www.programsoft.uz/api/service/1?page=${page}`;
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
        console.error("Error fetching anecdotes from API:", error);
        throw error;
    }
}

/**
 * Latifani formatlash
 */
export function formatAnecdote(item: AnecdoteItem): {
    externalId: string;
    content: string;
    section: string;
} {
    const externalId = String(item.id);
    const content = item.text || "Latifa topilmadi";
    const section = item.caption || "Umumiy";

    return {
        externalId,
        content,
        section
    };
}
