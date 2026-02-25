import { Repository } from "typeorm";
import { User } from "../entities/User.js";
import { AppDataSource } from "../database/data-source.js";
import { BotLanguage } from "../types/language.js";
import { normalizeLanguage } from "./i18n.service.js";

export class UserService {
    private userRepo: Repository<User>;

    constructor() {
        this.userRepo = AppDataSource.getRepository(User);
    }

    /**
     * Foydalanuvchini topish yoki yaratish
     */
    async findOrCreate(telegramId: number, userData?: {
        username?: string;
        firstName?: string;
        lastName?: string;
        preferredLanguage?: string;
    }): Promise<User> {
        let user = await this.userRepo.findOne({
            where: { telegramId }
        });

        const fallbackLanguage = normalizeLanguage(userData?.preferredLanguage);

        if (!user) {
            user = this.userRepo.create({
                telegramId,
                username: userData?.username,
                firstName: userData?.firstName,
                lastName: userData?.lastName,
                preferredLanguage: fallbackLanguage
            });
            await this.userRepo.save(user);
        } else if (userData) {
            const nextUsername = userData.username || user.username;
            const nextFirstName = userData.firstName || user.firstName;
            const nextLastName = userData.lastName || user.lastName;
            const nextLanguage = normalizeLanguage(user.preferredLanguage || fallbackLanguage);

            const hasChanges =
                nextUsername !== user.username ||
                nextFirstName !== user.firstName ||
                nextLastName !== user.lastName ||
                nextLanguage !== user.preferredLanguage;

            if (hasChanges) {
                user.username = nextUsername;
                user.firstName = nextFirstName;
                user.lastName = nextLastName;
                user.preferredLanguage = nextLanguage;
                await this.userRepo.save(user);
            }
        }

        return user;
    }

    /**
     * Foydalanuvchi to'lov qildimi?
     */
    async hasPaid(telegramId: number): Promise<boolean> {
        const user = await this.userRepo.findOne({
            where: { telegramId }
        });
        return user?.hasPaid || false;
    }

    /**
     * Foydalanuvchini to'lagan deb belgilash
     */
    async markAsPaid(telegramId: number): Promise<void> {
        await this.userRepo.update(
            { telegramId },
            { hasPaid: true }
        );
    }

    /**
     * Foydalanuvchi ma'lumotlarini yangilash
     */
    async update(telegramId: number, data: Partial<User>): Promise<void> {
        await this.userRepo.update(
            { telegramId },
            data
        );
    }

    /**
     * Ko'rilgan g'oyalar sonini oshirish
     */
    async incrementViewedJokes(telegramId: number): Promise<void> {
        const user = await this.findOrCreate(telegramId);
        user.viewedJokes += 1;
        await this.userRepo.save(user);
    }

    async getPreferredLanguage(telegramId: number): Promise<BotLanguage> {
        const user = await this.userRepo.findOne({
            where: { telegramId }
        });

        return normalizeLanguage(user?.preferredLanguage);
    }

    async setPreferredLanguage(telegramId: number, language: BotLanguage): Promise<void> {
        await this.findOrCreate(telegramId, {
            preferredLanguage: language
        });

        await this.userRepo.update(
            { telegramId },
            { preferredLanguage: normalizeLanguage(language) }
        );
    }
}
