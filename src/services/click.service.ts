import crypto from "crypto";

export interface ClickPaymentParams {
    serviceId: string;
    merchantId: string;
    amount: number;
    transactionParam: string;
    returnUrl: string;
    merchantUserId?: string;
}

export interface ClickPaymentLink {
    url: string;
    transactionParam: string;
}

/**
 * Click to'lov linkini yaratish
 */
export function generateClickPaymentLink(params: ClickPaymentParams): ClickPaymentLink {
    const {
        serviceId,
        merchantId,
        amount,
        transactionParam,
        returnUrl,
        merchantUserId
    } = params;

    // merchant_user_id ni qo'shmasak, Click -2046 xatoligini bermaydi
    const urlParams = new URLSearchParams({
        service_id: serviceId,
        merchant_id: merchantId,
        amount: amount.toString(),
        transaction_param: transactionParam,
        return_url: returnUrl,
    });

    // IMPORTANT: merchantUserId ni intentionally qo'shmaymiz
    // Chunki Click kabinetda bu user ro'yxatdan o'tmagan bo'lishi mumkin

    const url = `https://my.click.uz/services/pay?${urlParams.toString()}`;

    return {
        url,
        transactionParam
    };
}

/**
 * Transaction param generatsiya qilish (UUID)
 */
export function generateTransactionParam(): string {
    return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Click webhook signature tekshirish
 * Click docs: https://docs.click.uz/merchant-api-request/
 */
export function verifyClickSignature(
    clickTransId: string,
    serviceId: string,
    secretKey: string,
    merchantTransId: string,
    amount: string,
    action: string,
    signTime: string,
    receivedSignString: string
): boolean {
    const signString = md5(
        clickTransId +
        serviceId +
        secretKey +
        merchantTransId +
        amount +
        action +
        signTime
    );

    return signString === receivedSignString;
}

function md5(text: string): string {
    return crypto.createHash("md5").update(text).digest("hex");
}

/**
 * Click response signature yaratish
 */
export function generateClickResponseSignature(
    clickTransId: string,
    serviceId: string,
    secretKey: string,
    merchantTransId: string,
    merchantPrepareId: string,
    amount: string,
    action: string,
    signTime: string
): string {
    return md5(
        clickTransId +
        serviceId +
        secretKey +
        merchantTransId +
        merchantPrepareId +
        amount +
        action +
        signTime
    );
}
