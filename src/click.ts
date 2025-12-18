import { v4 as uuidv4 } from "uuid";

/**
 * Click to'lov linkini generatsiya qilish
 * Bir martalik to'lov uchun
 */
export function generateClickLink(amount: number, extraParams?: Record<string, string>) {
  const tx = uuidv4().replace(/-/g, "");
  const additional_param3 = extraParams?.additional_param3 || uuidv4().replace(/-/g, "");
  const additional_param4 = extraParams?.additional_param4 || "basic";

  const serviceId = process.env.CLICK_SERVICE_ID || "";
  const merchantId = process.env.CLICK_MERCHANT_ID || "";
  const merchantUserId = process.env.CLICK_MERCHANT_USER_ID || "";
  const returnUrl = process.env.CLICK_RETURN_URL || "";

  // Click to'lov linki
  const params = new URLSearchParams({
    service_id: serviceId,
    merchant_id: merchantId,
    merchant_user_id: merchantUserId,
    amount: String(amount),
    transaction_param: tx,
    return_url: returnUrl
  });

  const link = `https://my.click.uz/services/pay?${params.toString()}`;

  console.log(`💳 Click link generated: ${link}`);
  console.log(`📝 Transaction ID: ${tx}`);

  return { link, tx };
}
