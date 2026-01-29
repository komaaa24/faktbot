import "dotenv/config";
import { DataSource } from "typeorm";

/**
 * Tashqi sherlar database - to'lovlarni tekshirish uchun
 */
export const SherlarDataSource = new DataSource({
    type: "postgres",
    host: process.env.SHERLAR_DB_HOST || process.env.DB_HOST || "192.168.0.89",
    port: Number(process.env.SHERLAR_DB_PORT || process.env.DB_PORT) || 5432,
    username: process.env.SHERLAR_DB_USER || process.env.DB_USER || "postgres",
    password: process.env.SHERLAR_DB_PASS || process.env.DB_PASS || "123456",
    database: process.env.SHERLAR_DB_NAME || "sherlar",
    synchronize: false,
    logging: false,
    entities: [],
    subscribers: [],
    migrations: []
});
