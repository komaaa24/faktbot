import "reflect-metadata";
import { DataSource } from "typeorm";
import { Joke } from "../entities/Joke.js";
import { Payment } from "../entities/Payment.js";
import { User } from "../entities/User.js";

export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASS || "postgres",
    database: process.env.DB_NAME || "latifalar",
    synchronize: false, // Production'da false bo'lishi kerak
    logging: process.env.NODE_ENV === "development",
    entities: [Joke, Payment, User],
    subscribers: [],
    migrations: ["dist/migrations/*.js"],
    migrationsTableName: "migrations"
});
