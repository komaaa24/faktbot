import { SherlarDataSource } from "../database/sherlar-data-source.js";

/**
 * Sherlar database service - to'lovlarni tekshirish
 * 
 * Jadval strukturasi:
 * - id: integer
 * - user_id: integer (Telegram ID)
 * - amount: numeric
 * - click_merchant_trans_id: varchar
 * - click_payment_id: bigint
 * - status: varchar
 * - created_at: timestamp
 * - updated_at: timestamp
 */
export class SherlarPaymentService {
    private async ensureConnection(): Promise<void> {
        if (!SherlarDataSource.isInitialized) {
            await SherlarDataSource.initialize();
            console.log("✅ Sherlar database connected");
        }
    }

    /**
     * Telegram ID orqali to'lov qilganmi tekshirish (sana bilan)
     * @param telegramId - Foydalanuvchi Telegram ID (user_id)
     * @returns { hasPaid: boolean, paymentDate?: Date } - To'lov va sana
     */
    async hasValidPayment(telegramId: number): Promise<{ hasPaid: boolean; paymentDate?: Date }> {
        try {
            await this.ensureConnection();

            // To'lovni tekshirish - user_id ustunidan foydalanish
            // Status: 'PAID' yoki 'paid' (case-insensitive)
            const query = `
                SELECT 
                    id, 
                    user_id, 
                    amount, 
                    status, 
                    created_at,
                    click_payment_id
                FROM payments
                WHERE user_id = $1
                  AND amount = 1111
                  AND UPPER(status) = 'PAID'
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await SherlarDataSource.query(query, [telegramId]);

            if (result && result.length > 0) {
                const payment = result[0];
                console.log(`✅ Payment found in sherlar DB:`, {
                    payment_id: payment.id,
                    user_id: payment.user_id,
                    amount: payment.amount,
                    status: payment.status,
                    created_at: payment.created_at
                });
                return {
                    hasPaid: true,
                    paymentDate: new Date(payment.created_at)
                };
            }

            console.log(`ℹ️ No payment found for user_id: ${telegramId} in sherlar DB`);
            return { hasPaid: false };

        } catch (error) {
            console.error("❌ Error checking sherlar payment:", error);
            if (error instanceof Error) {
                console.error("Error details:", error.message);
            }
            return { hasPaid: false };
        }
    }

    /**
     * Telegram ID orqali to'lov ma'lumotlarini olish
     * @param telegramId - Foydalanuvchi Telegram ID (user_id)
     * @returns Payment ma'lumotlari yoki null
     */
    async getPaymentInfo(telegramId: number): Promise<any> {
        try {
            await this.ensureConnection();

            const query = `
                SELECT 
                    id, 
                    user_id, 
                    amount, 
                    status, 
                    created_at,
                    updated_at,
                    click_payment_id,
                    click_merchant_trans_id
                FROM payments
                WHERE user_id = $1
                  AND amount = 1111
                  AND UPPER(status) = 'PAID'
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await SherlarDataSource.query(query, [telegramId]);

            if (result && result.length > 0) {
                console.log(`✅ Payment info retrieved for user_id: ${telegramId}`);
                return result[0];
            }

            console.log(`ℹ️ No payment info for user_id: ${telegramId}`);
            return null;

        } catch (error) {
            console.error("❌ Error getting payment info:", error);
            if (error instanceof Error) {
                console.error("Error details:", error.message);
            }
            return null;
        }
    }

    /**
     * Barcha to'lovlarni olish (admin uchun)
     * @param limit - Nechta to'lov olish
     */
    async getAllPayments(limit: number = 50): Promise<any[]> {
        try {
            await this.ensureConnection();

            const query = `
                SELECT 
                    id, 
                    user_id, 
                    amount, 
                    status, 
                    created_at,
                    click_payment_id
                FROM payments
                WHERE amount = 1111
                  AND UPPER(status) = 'PAID'
                ORDER BY created_at DESC
                LIMIT $1
            `;

            const result = await SherlarDataSource.query(query, [limit]);
            return result || [];

        } catch (error) {
            console.error("❌ Error getting all payments:", error);
            return [];
        }
    }

    async findPaidPaymentByTransactionId(transactionParam: string): Promise<{
        hasPaid: boolean;
        paymentDate?: Date;
        userId?: number;
        paymentId?: number;
    }> {
        try {
            await this.ensureConnection();

            const query = `
                SELECT
                    id,
                    user_id,
                    created_at
                FROM payments
                WHERE click_merchant_trans_id = $1
                  AND amount = 1111
                  AND UPPER(status) = 'PAID'
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await SherlarDataSource.query(query, [transactionParam]);
            if (result && result.length > 0) {
                const payment = result[0];
                return {
                    hasPaid: true,
                    paymentDate: new Date(payment.created_at),
                    userId: Number(payment.user_id),
                    paymentId: Number(payment.id)
                };
            }

            return { hasPaid: false };
        } catch (error) {
            console.error("❌ Error checking sherlar payment by transaction:", error);
            return { hasPaid: false };
        }
    }
}
