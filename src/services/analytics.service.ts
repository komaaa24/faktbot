import { AppDataSource } from "../database/data-source.js";
import { User } from "../entities/User.js";
import { Payment, PaymentStatus } from "../entities/Payment.js";
import { Joke } from "../entities/Joke.js";

/**
 * Analytics Service - Super Admin uchun statistika
 */
export class AnalyticsService {
    /**
     * Umumiy foydalanuvchilar statistikasi
     */
    async getUserStats() {
        const userRepo = AppDataSource.getRepository(User);

        const totalUsers = await userRepo.count();
        const paidUsers = await userRepo.count({ where: { hasPaid: true } });
        const freeUsers = totalUsers - paidUsers;

        // Oxirgi 24 soat
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);

        const newUsersToday = await userRepo
            .createQueryBuilder("user")
            .where("user.createdAt >= :yesterday", { yesterday })
            .getCount();

        return {
            totalUsers,
            paidUsers,
            freeUsers,
            conversionRate: totalUsers > 0 ? ((paidUsers / totalUsers) * 100).toFixed(2) : "0",
            newUsersToday
        };
    }

    /**
     * To'lovlar statistikasi
     */
    async getPaymentStats() {
        const paymentRepo = AppDataSource.getRepository(Payment);

        const totalPayments = await paymentRepo.count();
        const successfulPayments = await paymentRepo.count({
            where: { status: PaymentStatus.PAID }
        });
        const pendingPayments = await paymentRepo.count({
            where: { status: PaymentStatus.PENDING }
        });
        const failedPayments = await paymentRepo.count({
            where: { status: PaymentStatus.FAILED }
        });

        // Umumiy daromad
        const payments = await paymentRepo.find({
            where: { status: PaymentStatus.PAID }
        });
        const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

        // Bugungi daromad
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayPayments = payments.filter(p =>
            p.createdAt && p.createdAt >= today
        );
        const todayRevenue = todayPayments.reduce((sum, p) => sum + p.amount, 0);

        return {
            totalPayments,
            successfulPayments,
            pendingPayments,
            failedPayments,
            totalRevenue,
            todayRevenue,
            successRate: totalPayments > 0 ? ((successfulPayments / totalPayments) * 100).toFixed(2) : "0"
        };
    }

    /**
     * Latifalar statistikasi
     */
    async getJokeStats() {
        const jokeRepo = AppDataSource.getRepository(Joke);

        const totalJokes = await jokeRepo.count();

        // Umumiy ko'rishlar
        const jokes = await jokeRepo.find();
        const totalViews = jokes.reduce((sum, j) => sum + j.views, 0);
        const totalLikes = jokes.reduce((sum, j) => sum + j.likes, 0);
        const totalDislikes = jokes.reduce((sum, j) => sum + j.dislikes, 0);

        // Eng mashhur latifa
        const mostViewed = await jokeRepo.findOne({
            where: {},
            order: { views: "DESC" }
        });

        // Eng yoqtirilgan latifa
        const mostLiked = await jokeRepo.findOne({
            where: {},
            order: { likes: "DESC" }
        });

        return {
            totalJokes,
            totalViews,
            totalLikes,
            totalDislikes,
            avgViewsPerJoke: totalJokes > 0 ? (totalViews / totalJokes).toFixed(1) : "0",
            mostViewedJoke: mostViewed ? {
                content: mostViewed.content.substring(0, 100) + "...",
                views: mostViewed.views,
                category: mostViewed.category
            } : null,
            mostLikedJoke: mostLiked ? {
                content: mostLiked.content.substring(0, 100) + "...",
                likes: mostLiked.likes,
                category: mostLiked.category
            } : null
        };
    }

    /**
     * Funnel statistikasi (konversiya qadamlari)
     */
    async getFunnelStats() {
        const userRepo = AppDataSource.getRepository(User);
        const paymentRepo = AppDataSource.getRepository(Payment);

        // Qadam 1: /start bosganlar
        const totalUsers = await userRepo.count();

        // Qadam 2: Latifalarni ko'rganlar (viewedJokes > 0)
        const usersWhoViewed = await userRepo
            .createQueryBuilder("user")
            .where("user.viewedJokes > 0")
            .getCount();

        // Qadam 3: To'lov oynasini ochganlar
        const usersWhoClickedPayment = await paymentRepo
            .createQueryBuilder("payment")
            .select("COUNT(DISTINCT payment.userId)", "count")
            .getRawOne();

        const paymentClickCount = parseInt(usersWhoClickedPayment?.count || "0");

        // Qadam 4: To'lovni muvaffaqiyatli amalga oshirganlar
        const paidUsers = await userRepo.count({ where: { hasPaid: true } });

        return {
            step1_start: totalUsers,
            step2_viewed: usersWhoViewed,
            step3_clickedPayment: paymentClickCount,
            step4_paidSuccessfully: paidUsers,
            conversion_startToView: totalUsers > 0 ? ((usersWhoViewed / totalUsers) * 100).toFixed(2) : "0",
            conversion_viewToPaymentClick: usersWhoViewed > 0 ? ((paymentClickCount / usersWhoViewed) * 100).toFixed(2) : "0",
            conversion_clickToPaid: paymentClickCount > 0 ? ((paidUsers / paymentClickCount) * 100).toFixed(2) : "0",
            conversion_overall: totalUsers > 0 ? ((paidUsers / totalUsers) * 100).toFixed(2) : "0"
        };
    }

    /**
     * Oxirgi 7 kunlik trend
     */
    async getWeeklyTrend() {
        const userRepo = AppDataSource.getRepository(User);
        const paymentRepo = AppDataSource.getRepository(Payment);

        const trend = [];

        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);

            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const newUsers = await userRepo
                .createQueryBuilder("user")
                .where("user.createdAt >= :start", { start: date })
                .andWhere("user.createdAt < :end", { end: nextDate })
                .getCount();

            const newPayments = await paymentRepo
                .createQueryBuilder("payment")
                .where("payment.status = :status", { status: PaymentStatus.PAID })
                .andWhere("payment.createdAt >= :start", { start: date })
                .andWhere("payment.createdAt < :end", { end: nextDate })
                .getCount();

            trend.push({
                date: date.toLocaleDateString("uz-UZ"),
                newUsers,
                newPayments
            });
        }

        return trend;
    }

    /**
     * Top 5 foydalanuvchilar (eng ko'p she'r ko'rganlar)
     */
    async getTopUsers() {
        const userRepo = AppDataSource.getRepository(User);

        const topUsers = await userRepo.find({
            order: { viewedJokes: "DESC" },
            take: 5
        });

        return topUsers.map(user => ({
            telegramId: user.telegramId,
            username: user.username || "No username",
            firstName: user.firstName || "",
            viewedJokes: user.viewedJokes,
            hasPaid: user.hasPaid
        }));
    }

    /**
     * Real-time statistika (oxirgi 1 soat)
     */
    async getRealTimeStats() {
        const userRepo = AppDataSource.getRepository(User);
        const paymentRepo = AppDataSource.getRepository(Payment);

        const oneHourAgo = new Date();
        oneHourAgo.setHours(oneHourAgo.getHours() - 1);

        const recentUsers = await userRepo
            .createQueryBuilder("user")
            .where("user.createdAt >= :time", { time: oneHourAgo })
            .getCount();

        const recentPayments = await paymentRepo
            .createQueryBuilder("payment")
            .where("payment.createdAt >= :time", { time: oneHourAgo })
            .getCount();

        return {
            newUsersLastHour: recentUsers,
            newPaymentsLastHour: recentPayments
        };
    }
}
