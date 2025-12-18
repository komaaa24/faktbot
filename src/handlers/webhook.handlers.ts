import { Request, Response } from "express";
import { Repository } from "typeorm";
import { Payment, PaymentStatus } from "../entities/Payment.js";
import { AppDataSource } from "../database/data-source.js";
import { UserService } from "../services/user.service.js";
import { generateClickResponseSignature, verifyClickSignature } from "../services/click.service.js";
import { Bot } from "grammy";

const userService = new UserService();

/**
 * Click PREPARE method
 * To'lovni tayyorlash (pre-authorization)
 * Docs: https://docs.click.uz/merchant-api-request/
 */
export async function handleClickPrepare(req: Request, res: Response, bot: Bot) {
    console.log("\n" + "═".repeat(80));
    console.log("🔔 CLICK PREPARE REQUEST RECEIVED");
    console.log("═".repeat(80));

    const {
        click_trans_id,
        service_id,
        merchant_trans_id,
        merchant_user_id,
        amount,
        action,
        sign_time,
        sign_string,
        error,
        error_note
    } = req.body;

    console.log("📦 Request Body:");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("");

    console.log("📋 Parsed Parameters:");
    console.log("  click_trans_id:", click_trans_id);
    console.log("  service_id:", service_id);
    console.log("  merchant_trans_id:", merchant_trans_id);
    console.log("  merchant_user_id:", merchant_user_id);
    console.log("  amount:", amount);
    console.log("  action:", action);
    console.log("  sign_time:", sign_time);
    console.log("  sign_string:", sign_string);
    console.log("");

    const secretKey = process.env.CLICK_SECRET_KEY!;
    console.log("🔑 Secret Key:", secretKey ? "✅ mavjud" : "❌ yo'q");
    console.log("");

    // Signature tekshirish
    console.log("🔐 Signature Verification:");
    console.log("  Expected format: clickTransId + serviceId + secretKey + merchantTransId + amount + action + signTime");
    console.log("  String to hash: " + click_trans_id + service_id + secretKey + merchant_trans_id + amount + action + sign_time);

    const isValidSignature = verifyClickSignature(
        click_trans_id,
        service_id,
        secretKey,
        merchant_trans_id,
        amount,
        action,
        sign_time,
        sign_string
    );

    console.log("  Received signature:", sign_string);
    console.log("  Signature valid:", isValidSignature ? "✅ YES" : "❌ NO");
    console.log("");

    if (!isValidSignature) {
        console.error("❌ PREPARE: Invalid signature!");
        console.error("═".repeat(80) + "\n");
        return res.json({
            click_trans_id,
            merchant_trans_id,
            merchant_prepare_id: null,
            error: -1,
            error_note: "SIGN_CHECK_FAILED: Invalid signature"
        });
    }

    const paymentRepo = AppDataSource.getRepository(Payment);

    // Tranzaksiyani topish
    console.log("🔍 Searching for transaction in database...");
    console.log("  Transaction Param:", merchant_trans_id);

    const payment = await paymentRepo.findOne({
        where: { transactionParam: merchant_trans_id },
        relations: ["user"]
    });

    if (!payment) {
        console.error("❌ PREPARE: Transaction not found in database!");
        console.error("  Searched for:", merchant_trans_id);
        console.error("═".repeat(80) + "\n");
        return res.json({
            click_trans_id,
            merchant_trans_id,
            merchant_prepare_id: null,
            error: -6,
            error_note: "TRANSACTION_NOT_FOUND: Transaction not found in database"
        });
    }

    console.log("✅ Transaction found:");
    console.log("  Payment ID:", payment.id);
    console.log("  User ID:", payment.userId);
    console.log("  Amount:", payment.amount);
    console.log("  Status:", payment.status);
    console.log("");

    // Summa tekshirish
    console.log("💰 Amount verification:");
    console.log("  Expected:", payment.amount);
    console.log("  Received:", amount);

    if (parseFloat(amount) !== parseFloat(payment.amount.toString())) {
        console.error("❌ PREPARE: Amount mismatch!");
        console.error("═".repeat(80) + "\n");
        return res.json({
            click_trans_id,
            merchant_trans_id,
            merchant_prepare_id: null,
            error: -2,
            error_note: "INVALID_AMOUNT: Incorrect amount"
        });
    }
    console.log("  ✅ Amount matches");
    console.log("");

    // Agar allaqachon to'langan bo'lsa
    if (payment.status === PaymentStatus.PAID) {
        console.warn("⚠️ PREPARE: Already paid!");
        console.warn("═".repeat(80) + "\n");
        return res.json({
            click_trans_id,
            merchant_trans_id,
            merchant_prepare_id: payment.id,
            error: -4,
            error_note: "ALREADY_PAID: This transaction already paid"
        });
    }

    // Merchant prepare ID sifatida payment.id ishlatamiz
    const merchantPrepareIdNum = payment.id;

    // Response signature yaratish
    console.log("🔐 Generating response signature...");
    console.log("  Format: clickTransId + serviceId + secretKey + merchantTransId + merchantPrepareId + amount + action + signTime");

    const responseSignature = generateClickResponseSignature(
        click_trans_id,
        service_id,
        secretKey,
        merchant_trans_id,
        merchantPrepareIdNum.toString(),
        amount,
        action,
        sign_time
    );

    console.log("  Response signature:", responseSignature);
    console.log("");

    // Muvaffaqiyatli javob
    const response = {
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id: merchantPrepareIdNum,
        error: 0,
        error_note: "Success",
        sign_time,
        sign_string: responseSignature
    };

    console.log("✅ PREPARE SUCCESS!");
    console.log("📤 Response:");
    console.log(JSON.stringify(response, null, 2));
    console.log("═".repeat(80) + "\n");

    return res.json(response);
}

/**
 * Click COMPLETE method
 * To'lovni yakunlash
 * Docs: https://docs.click.uz/merchant-api-request/
 */
export async function handleClickComplete(req: Request, res: Response, bot: Bot) {
    console.log("\n" + "═".repeat(80));
    console.log("🔔 CLICK COMPLETE REQUEST RECEIVED");
    console.log("═".repeat(80));

    const {
        click_trans_id,
        service_id,
        merchant_trans_id,
        merchant_prepare_id,
        merchant_user_id,
        amount,
        action,
        sign_time,
        sign_string,
        error
    } = req.body;

    console.log("📦 Request Body:");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("");

    console.log("📋 Parsed Parameters:");
    console.log("  click_trans_id:", click_trans_id);
    console.log("  service_id:", service_id);
    console.log("  merchant_trans_id:", merchant_trans_id);
    console.log("  merchant_prepare_id:", merchant_prepare_id);
    console.log("  merchant_user_id:", merchant_user_id);
    console.log("  amount:", amount);
    console.log("  action:", action);
    console.log("  sign_time:", sign_time);
    console.log("  sign_string:", sign_string);
    console.log("  error:", error);
    console.log("");

    const secretKey = process.env.CLICK_SECRET_KEY!;
    console.log("🔑 Secret Key:", secretKey ? "✅ mavjud" : "❌ yo'q");
    console.log("");

    // Signature tekshirish - COMPLETE uchun merchantPrepareId kerak!
    console.log("🔐 Signature Verification (COMPLETE):");
    console.log("  Expected format: clickTransId + serviceId + secretKey + merchantTransId + merchantPrepareId + amount + action + signTime");
    console.log("  String to hash: " + click_trans_id + service_id + secretKey + merchant_trans_id + merchant_prepare_id + amount + action + sign_time);

    const isValidSignature = verifyClickSignature(
        click_trans_id,
        service_id,
        secretKey,
        merchant_trans_id,
        amount,
        action,
        sign_time,
        sign_string,
        merchant_prepare_id  // COMPLETE uchun zarur - Octo usuli
    );

    console.log("  Received signature:", sign_string);
    console.log("  Signature valid:", isValidSignature ? "✅ YES" : "❌ NO");
    console.log("");

    if (!isValidSignature) {
        console.error("❌ COMPLETE: Invalid signature!");
        console.error("═".repeat(80) + "\n");
        return res.json({
            click_trans_id,
            merchant_trans_id,
            merchant_prepare_id,
            error: -1,
            error_note: "SIGN_CHECK_FAILED: Invalid signature"
        });
    }

    // Agar Click o'zidan xatolik yuborgan bo'lsa
    // MUHIM: error string bo'lishi mumkin, number ga o'tkazamiz
    const clickErrorCode = parseInt(error);
    console.log("🔍 Initial Error Check:");
    console.log("  error (raw):", error, "type:", typeof error);
    console.log("  error (parsed):", clickErrorCode);

    if (clickErrorCode < 0) {
        console.error("❌ COMPLETE: Click sent error:", clickErrorCode);
        console.error("═".repeat(80) + "\n");
        return res.json({
            click_trans_id,
            merchant_trans_id,
            merchant_prepare_id,
            error: clickErrorCode,
            error_note: "Error from Click"
        });
    }
    console.log("  ✅ No initial error from Click");
    console.log("");

    const paymentRepo = AppDataSource.getRepository(Payment);

    // Tranzaksiyani topish
    console.log("🔍 Searching for transaction in database...");
    console.log("  Transaction Param:", merchant_trans_id);
    console.log("  Prepare ID:", merchant_prepare_id);

    const payment = await paymentRepo.findOne({
        where: {
            transactionParam: merchant_trans_id,
            id: parseInt(merchant_prepare_id)
        },
        relations: ["user"]
    });

    if (!payment) {
        console.error("❌ COMPLETE: Transaction not found in database!");
        console.error("  Searched for transaction_param:", merchant_trans_id);
        console.error("  Searched for id:", merchant_prepare_id);
        console.error("═".repeat(80) + "\n");
        return res.json({
            click_trans_id,
            merchant_trans_id,
            merchant_prepare_id,
            error: -6,
            error_note: "TRANSACTION_NOT_FOUND: Transaction not found in database"
        });
    }

    console.log("✅ Transaction found:");
    console.log("  Payment ID:", payment.id);
    console.log("  User ID:", payment.userId);
    console.log("  Amount:", payment.amount);
    console.log("  Status:", payment.status);
    console.log("");

    // Agar Click error qaytargan bo'lsa
    // MUHIM: error string bo'lishi mumkin, number ga o'tkazamiz
    const clickError = parseInt(error);
    console.log("🔍 Click Error Check:");
    console.log("  error (raw):", error, "type:", typeof error);
    console.log("  error (parsed):", clickError, "type:", typeof clickError);

    if (clickError !== 0) {
        console.error(`❌ COMPLETE: Payment failed with Click error: ${clickError}`);
        payment.status = PaymentStatus.FAILED;
        payment.metadata = {
            ...payment.metadata,
            clickError: clickError,
            failedAt: new Date().toISOString()
        };
        await paymentRepo.save(payment);

        return res.json({
            click_trans_id,
            merchant_trans_id,
            merchant_prepare_id,
            error: -9,
            error_note: "Transaction cancelled"
        });
    }

    console.log("  ✅ Click error is 0 (SUCCESS)");
    console.log("");

    // Agar allaqachon to'langan bo'lsa
    if (payment.status === PaymentStatus.PAID) {
        const responseSignature = generateClickResponseSignature(
            click_trans_id,
            service_id,
            secretKey,
            merchant_trans_id,
            merchant_prepare_id,
            amount,
            action,
            sign_time
        );

        return res.json({
            click_trans_id,
            merchant_trans_id,
            merchant_prepare_id,
            error: -4,
            error_note: "Already paid",
            sign_time,
            sign_string: responseSignature
        });
    }

    // To'lovni yakunlash
    console.log("💳 Processing payment...");
    payment.status = PaymentStatus.PAID;
    payment.clickTransId = click_trans_id;
    payment.merchantTransId = merchant_trans_id;
    await paymentRepo.save(payment);
    console.log("  ✅ Payment status updated to PAID");
    console.log("");

    // Foydalanuvchini to'lagan deb belgilash
    const telegramId = payment.metadata?.telegramId;
    console.log("👤 User notification:");
    console.log("  Telegram ID:", telegramId);

    if (telegramId) {
        await userService.markAsPaid(telegramId);
        console.log("  ✅ User marked as paid");

        // Telegram orqali xabar yuborish
        try {
            await bot.api.sendMessage(
                telegramId,
                `✅ <b>To'lovingiz muvaffaqiyatli amalga oshirildi!</b>\n\n` +
                `💰 Summa: ${amount} so'm\n` +
                `🎉 Endi siz yuzlab latifalardan bahramand bo'lishingiz mumkin!\n\n` +
                `Davom etish uchun /start buyrug'ini bering.`,
                { parse_mode: "HTML" }
            );
            console.log("  ✅ Telegram notification sent");
        } catch (error) {
            console.error("  ❌ Failed to send notification:", error);
        }
    }
    console.log("");

    // Response signature yaratish
    console.log("🔐 Generating response signature...");
    console.log("  Format: clickTransId + serviceId + secretKey + merchantTransId + merchantPrepareId + amount + action + signTime");

    const responseSignature = generateClickResponseSignature(
        click_trans_id,
        service_id,
        secretKey,
        merchant_trans_id,
        merchant_prepare_id,
        amount,
        action,
        sign_time
    );

    console.log("  Response signature:", responseSignature);
    console.log("");

    const response = {
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id,
        error: 0,
        error_note: "Success",
        sign_time,
        sign_string: responseSignature
    };

    console.log("✅ COMPLETE SUCCESS!");
    console.log("📤 Response:");
    console.log(JSON.stringify(response, null, 2));
    console.log("═".repeat(80) + "\n");

    return res.json(response);
}
