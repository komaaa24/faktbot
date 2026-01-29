import { Request, Response } from "express";
import { Repository } from "typeorm";
import { Payment, PaymentStatus } from "../entities/Payment.js";
import { AppDataSource } from "../database/data-source.js";
import { UserService } from "../services/user.service.js";
import { Bot } from "grammy";
import { verifyClickPaymentByMTI } from "../services/click-verify.service.js";

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

    const webhookSecret = (process.env.PAYMENT_WEBHOOK_SECRET || "").trim();
    if (webhookSecret) {
        const provided = String(req.headers["x-webhook-secret"] || "").trim();
        if (provided !== webhookSecret) {
            console.warn("❌ [WEBHOOK] Invalid webhook secret");
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
    }

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

    // Amount tekshirish (phishing/amount o'zgartirishdan himoya)
    const webhookAmount = Number(amount);
    if (!Number.isFinite(webhookAmount) || webhookAmount <= 0) {
        console.warn("⚠️ [WEBHOOK] Invalid amount in webhook:", amount);
        return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    if (webhookAmount !== payment.amount) {
        console.warn("❌ [WEBHOOK] Amount mismatch:", {
            expected: payment.amount,
            received: webhookAmount,
            tx
        });

        payment.status = PaymentStatus.FAILED;
        payment.metadata = {
            ...payment.metadata,
            failedAt: new Date().toISOString(),
            failedReason: "amount_mismatch",
            webhookAmount: webhookAmount
        };
        await paymentRepo.save(payment);

        return res.status(400).json({
            success: false,
            message: "Amount mismatch"
        });
    }

    // Status tekshirish (success, paid, completed)
    const paymentSuccess = status === "success" || status === "paid" || status === "completed";

    if (paymentSuccess) {
        // Click Merchant API orqali qayta tekshirish (agar konfiguratsiya bor bo'lsa)
        try {
            console.log("🔍 [WEBHOOK] Click verify request:", {
                tx: payment.transactionParam,
                createdAt: payment.createdAt
            });
            const clickResult = await verifyClickPaymentByMTI(payment.transactionParam, payment.createdAt);
            console.log("✅ [WEBHOOK] Click verify response:", clickResult);
            if (clickResult.errorNote !== "missing_click_config") {
                if (!clickResult.ok) {
                    console.warn("❌ [WEBHOOK] Click verify failed:", clickResult);
                    payment.status = PaymentStatus.FAILED;
                    payment.metadata = {
                        ...payment.metadata,
                        failedAt: new Date().toISOString(),
                        failedReason: "click_verify_failed",
                        clickVerify: clickResult
                    };
                    await paymentRepo.save(payment);
                    return res.status(400).json({ success: false, message: "Click verify failed" });
                }

                if (clickResult.paymentStatus !== undefined && clickResult.paymentStatus !== 1) {
                    console.warn("❌ [WEBHOOK] Click payment_status not paid:", clickResult.paymentStatus);
                    payment.status = PaymentStatus.FAILED;
                    payment.metadata = {
                        ...payment.metadata,
                        failedAt: new Date().toISOString(),
                        failedReason: "click_not_paid",
                        clickVerify: clickResult
                    };
                    await paymentRepo.save(payment);
                    return res.status(400).json({ success: false, message: "Click status not paid" });
                }
            } else {
                console.warn("⚠️ [WEBHOOK] Click verify skipped: missing config");
            }
        } catch (error) {
            console.error("❌ [WEBHOOK] Click verify error:", error);
            payment.status = PaymentStatus.FAILED;
            payment.metadata = {
                ...payment.metadata,
                failedAt: new Date().toISOString(),
                failedReason: "click_verify_error"
            };
            await paymentRepo.save(payment);
            return res.status(500).json({ success: false, message: "Click verify error" });
        }

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
                    `Biznes g'oyalarini o'qishni boshlash uchun /start tugmasini bosing.`,
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
