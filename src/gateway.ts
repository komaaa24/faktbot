import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import { AppDataSource } from "./database/data-source.js";
import { SherlarDataSource } from "./database/sherlar-data-source.js";
import { Payment, PaymentStatus } from "./entities/Payment.js";
import { User } from "./entities/User.js";
import { UserService } from "./services/user.service.js";
import { generatePaymentLink, generateTransactionParam, getFixedPaymentAmount } from "./services/click.service.js";

function required(name: string): string {
    const value = (process.env[name] || "").trim();
    if (!value) throw new Error(`Missing env: ${name}`);
    return value;
}

async function main() {
    const PORT = 9999; // Fixed port for payment gateway
    const userService = new UserService();

    console.log("🚀 Starting Payment Gateway...");
    console.log("📦 Connecting to main database...");
    await AppDataSource.initialize();
    console.log("✅ Main database connected");

    console.log("📦 Connecting to sherlar database...");
    await SherlarDataSource.initialize();
    console.log("✅ Sherlar database connected");

    const app = express();
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    app.get("/health", (req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime() });
    });

    // Universal payment link generator (Click) for all bots
    // Example: /payme_url.php?user_id=7789445876&amount=5000&bot_key=biznes_goyalar_bot
    app.get("/payme_url.php", async (req, res) => {
        try {
            const apiKey = (process.env.PAYMENT_API_KEY || "").trim();
            if (apiKey) {
                const provided = String(req.query.key || req.headers["x-api-key"] || "").trim();
                if (provided !== apiKey) return res.status(401).send("unauthorized");
            }

            const rawUserId = String(req.query.user_id || "").trim();
            const rawAmount = String(req.query.amount || "").trim();
            const botKey = String(req.query.bot_key || "").trim();
            const format = String(req.query.format || "json").trim().toLowerCase();

            const telegramId = Number(rawUserId);
            if (!Number.isFinite(telegramId) || telegramId <= 0) return res.status(400).send("invalid user_id");

            // Qat'iy narx ishlatamiz
            const amount = getFixedPaymentAmount(); // 1111 so'm

            const userRepo = AppDataSource.getRepository(User);
            let user = await userRepo.findOne({ where: { telegramId } });

            if (!user) {
                user = userRepo.create({
                    telegramId,
                    username: String(req.query.username || "") || undefined,
                    firstName: String(req.query.first_name || "") || undefined,
                    lastName: String(req.query.last_name || "") || undefined
                });
                await userRepo.save(user);
            }

            const transactionParam = generateTransactionParam();

            const paymentRepo = AppDataSource.getRepository(Payment);
            const payment = paymentRepo.create({
                transactionParam,
                userId: user.id,
                amount,
                status: PaymentStatus.PENDING,
                metadata: {
                    telegramId,
                    botKey,
                    source: "gateway"
                }
            });
            await paymentRepo.save(payment);

            // Return URL - to'lovdan keyin botga qaytish
            const returnUrl = botKey
                ? `https://t.me/${botKey.replace('_bot', '')}_bot`
                : `https://t.me/biznes_goyalar_bot`;

            const paymentLink = generatePaymentLink({
                amount,
                transactionParam,
                userId: telegramId, // Telegram ID qo'shish
                returnUrl // To'lovdan keyin qaytish
            });

            if (format === "text" || format === "url") {
                return res.type("text/plain").send(paymentLink.url);
            }

            return res.json({
                ok: true,
                url: paymentLink.url,
                payment_id: payment.id,
                transaction_param: transactionParam,
                return_url: returnUrl
            });
        } catch (error) {
            console.error("payme_url.php error:", error);
            return res.status(500).send("internal error");
        }
    });

    // Payment webhook (oddiy to'lov)
    app.post("/webhook/pay", async (req, res) => {
        try {
            const { tx, status, user_id } = req.body;

            console.log("📥 [GATEWAY] Payment webhook:", { tx, status, user_id });

            // To'lov muvaffaqiyatli bo'lsa, sherlar DB'ga ham yozamiz
            if (status === "success" || status === "paid" || status === "completed") {
                if (user_id) {
                    try {
                        // Sherlar DB'ga yozish
                        const query = `
                            INSERT INTO payments (user_id, amount, status, created_at, updated_at, click_merchant_trans_id)
                            VALUES ($1, $2, $3, NOW(), NOW(), $4)
                            ON CONFLICT (click_merchant_trans_id) 
                            DO UPDATE SET 
                                status = EXCLUDED.status,
                                updated_at = NOW()
                            RETURNING id, user_id, amount, status
                        `;

                        const result = await SherlarDataSource.query(query, [
                            user_id,
                            1111, // Fixed amount
                            'PAID',
                            tx
                        ]);

                        console.log("✅ [GATEWAY] Payment saved to sherlar DB:", result[0]);
                    } catch (dbError) {
                        console.error("❌ [GATEWAY] Failed to save to sherlar DB:", dbError);
                    }
                }
            }

            // Bot obyekti webhook handler'ga yuboramiz
            // Forward notification to main bot (localhost:9988)
            const paymentRepo = AppDataSource.getRepository(Payment);
            const payment = await paymentRepo.findOne({
                where: { transactionParam: tx },
                relations: ["user"]
            });

            if (payment) {
                if (status === "success" || status === "paid" || status === "completed") {
                    // Update payment status
                    payment.status = PaymentStatus.PAID;
                    await paymentRepo.save(payment);

                    const telegramId = payment.metadata?.telegramId || user_id;
                    if (telegramId) {
                        // Update user: hasPaid=true, clear revokedAt
                        const userRepo = AppDataSource.getRepository(User);
                        await userRepo
                            .createQueryBuilder()
                            .update(User)
                            .set({ hasPaid: true, revokedAt: () => "NULL" })
                            .where("telegramId = :telegramId", { telegramId })
                            .execute();
                        console.log(`✅ [GATEWAY] User ${telegramId} marked as paid, revokedAt cleared`);

                        // Forward notification request to main bot
                        try {
                            await axios.post('http://localhost:9988/internal/send-payment-notification', {
                                telegramId,
                                amount: payment.amount
                            }, { timeout: 5000 });
                            console.log(`📤 [GATEWAY] Notification request forwarded to main bot for user ${telegramId}`);
                        } catch (notifError) {
                            console.error("❌ [GATEWAY] Failed to forward notification:", notifError instanceof Error ? notifError.message : notifError);
                        }
                    }
                }
            }

            return res.json({ success: true, message: "Payment processed" });
        } catch (error) {
            console.error("Webhook error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    });

    app.post("/api/pay", async (req, res) => {
        try {
            const { tx, status, user_id } = req.body;

            console.log("📥 [GATEWAY] API payment:", { tx, status, user_id });

            // To'lov muvaffaqiyatli bo'lsa, sherlar DB'ga ham yozamiz
            if (status === "success" || status === "paid" || status === "completed") {
                if (user_id) {
                    try {
                        // Sherlar DB'ga yozish
                        const query = `
                            INSERT INTO payments (user_id, amount, status, created_at, updated_at, click_merchant_trans_id)
                            VALUES ($1, $2, $3, NOW(), NOW(), $4)
                            ON CONFLICT (click_merchant_trans_id) 
                            DO UPDATE SET 
                                status = EXCLUDED.status,
                                updated_at = NOW()
                            RETURNING id, user_id, amount, status
                        `;

                        const result = await SherlarDataSource.query(query, [
                            user_id,
                            1111, // Fixed amount
                            'PAID',
                            tx
                        ]);

                        console.log("✅ [GATEWAY] Payment saved to sherlar DB:", result[0]);
                    } catch (dbError) {
                        console.error("❌ [GATEWAY] Failed to save to sherlar DB:", dbError);
                    }
                }
            }

            // Same notification logic as /webhook/pay
            const paymentRepo = AppDataSource.getRepository(Payment);
            const payment = await paymentRepo.findOne({
                where: { transactionParam: tx },
                relations: ["user"]
            });

            if (payment) {
                if (status === "success" || status === "paid" || status === "completed") {
                    payment.status = PaymentStatus.PAID;
                    await paymentRepo.save(payment);

                    const telegramId = payment.metadata?.telegramId || user_id;
                    if (telegramId) {
                        // Update user: hasPaid=true, clear revokedAt
                        const userRepo = AppDataSource.getRepository(User);
                        await userRepo
                            .createQueryBuilder()
                            .update(User)
                            .set({ hasPaid: true, revokedAt: () => "NULL" })
                            .where("telegramId = :telegramId", { telegramId })
                            .execute();
                        console.log(`✅ [GATEWAY] User ${telegramId} marked as paid, revokedAt cleared`);

                        try {
                            await axios.post('http://localhost:9988/internal/send-payment-notification', {
                                telegramId,
                                amount: payment.amount
                            }, { timeout: 5000 });
                            console.log(`📤 [GATEWAY] Notification request forwarded to main bot for user ${telegramId}`);
                        } catch (notifError) {
                            console.error("❌ [GATEWAY] Failed to forward notification:", notifError instanceof Error ? notifError.message : notifError);
                        }
                    }
                }
            }

            return res.json({ success: true, message: "Payment processed" });
        } catch (error) {
            console.error("Webhook error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    });

    app.listen(PORT, () => console.log(`🌐 Payment Gateway running on port ${PORT}`));
}

main().catch((err) => {
    console.error("❌ Fatal:", err);
    process.exit(1);
});
