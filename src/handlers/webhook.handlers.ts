import { Request, Response } from "express";
import { Repository } from "typeorm";
import { Payment, PaymentStatus } from "../entities/Payment.js";
import { AppDataSource } from "../database/data-source.js";
import { UserService } from "../services/user.service.js";
import { Bot } from "grammy";

const userService = new UserService();

/**
 * 💰 Click to'lov webhook handler
 * To'lov amalga oshgach avtomatik tasdiqlanadi
 */
export async function handlePaymentWebhook(req: Request, res: Response, bot: Bot) {
    const { tx, status, amount, user_id } = req.body;

    console.log("📥 [WEBHOOK] Click payment notification:", {
        tx,
        status,
        amount,
        user_id,
        fullBody: req.body
    });

    if (!tx) {
        return res.status(400).json({
            error: "transaction_param required"
        });
    }

    const paymentRepo = AppDataSource.getRepository(Payment);

    // Tranzaksiyani topish
    const payment = await paymentRepo.findOne({
        where: { transactionParam: tx },
        relations: ["user"]
    });

    if (!payment) {
        console.warn("⚠️ [WEBHOOK] Payment not found for tx:", tx);
        return res.status(404).json({
            error: "Payment not found"
        });
    }

    // Agar allaqachon to'langan bo'lsa
    if (payment.status === PaymentStatus.PAID) {
        console.log("ℹ️ [WEBHOOK] Payment already completed for tx:", tx);
        return res.json({
            success: true,
            message: "Already paid"
        });
    }

    // Status tekshirish (success, paid, completed)
    const paymentSuccess = status === "success" || status === "paid" || status === "completed";

    if (paymentSuccess) {
        // To'lovni tasdiqlash
        payment.status = PaymentStatus.PAID;
        payment.metadata = {
            ...payment.metadata,
            paidAt: new Date().toISOString(),
            webhookAmount: amount,
            webhookUserId: user_id
        };
        await paymentRepo.save(payment);

        // Foydalanuvchini to'lagan deb belgilash
        const telegramId = payment.metadata?.telegramId;
        if (telegramId) {
            await userService.markAsPaid(telegramId);

            console.log(`✅ [WEBHOOK] User ${telegramId} marked as paid`);

            // 🎉 Telegram orqali tasdiq xabari yuborish
            try {
                await bot.api.sendMessage(
                    telegramId,
                    `✅ <b>To'lovingiz tasdiqlandi!</b>\n\n` +
                    `💰 Summa: ${payment.amount} so'm\n` +
                    `🎉 Endi botdan cheksiz foydalanishingiz mumkin!\n\n` +
                    `Latifalarni o'qishni boshlash uchun /start tugmasini bosing.`,
                    { parse_mode: "HTML" }
                );
                console.log(`📤 [WEBHOOK] Notification sent to user ${telegramId}`);
            } catch (error) {
                console.error("❌ [WEBHOOK] Failed to send notification:", error);
            }
        }

        console.log("✅ [WEBHOOK] Payment completed successfully");

        return res.json({
            success: true,
            message: "Payment completed"
        });
    } else {
        // To'lov muvaffaqiyatsiz
        payment.status = PaymentStatus.FAILED;
        payment.metadata = {
            ...payment.metadata,
            failedAt: new Date().toISOString(),
            failedReason: status
        };
        await paymentRepo.save(payment);

        console.log(`❌ [WEBHOOK] Payment failed: ${status}`);

        return res.json({
            success: false,
            message: "Payment failed"
        });
    }
}
