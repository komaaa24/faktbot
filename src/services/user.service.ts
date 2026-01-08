import { Repository } from "typeorm";
import { User } from "../entities/User.js";
import { AppDataSource } from "../database/data-source.js";

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
    }): Promise<User> {
        let user = await this.userRepo.findOne({
            where: { telegramId }
        });

        if (!user) {
            user = this.userRepo.create({
                telegramId,
                username: userData?.username,
                firstName: userData?.firstName,
                lastName: userData?.lastName,
            });
            await this.userRepo.save(user);
        } else if (userData) {
            // Update user info
            user.username = userData.username || user.username;
            user.firstName = userData.firstName || user.firstName;
            user.lastName = userData.lastName || user.lastName;
            await this.userRepo.save(user);
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
     * Ko'rilgan latifalar sonini oshirish
     */
    async incrementViewedJokes(telegramId: number): Promise<void> {
        const user = await this.findOrCreate(telegramId);
        user.viewedJokes += 1;
        await this.userRepo.save(user);
    }
}
