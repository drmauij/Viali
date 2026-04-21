import type { Response } from "express";

export const PUBLIC_API_ERROR_CODES = {
  SLOT_TAKEN: {
    status: 409,
    message: "The selected slot is no longer available.",
  },
  INVALID_BOOKING_DATA: {
    status: 400,
    message: "The booking payload is invalid.",
  },
  REFERRAL_REQUIRED: {
    status: 400,
    message: "A referral source is required for this hospital.",
  },
  NOSHOW_FEE_ACK_REQUIRED: {
    status: 400,
    message:
      "This clinic has a no-show-fee notice. The booking request must include noShowFeeAcknowledged: true after the notice has been shown to the patient.",
  },
  PROVIDER_NOT_BOOKABLE: {
    status: 404,
    message: "The requested provider is not available for public booking.",
  },
  HOSPITAL_NOT_FOUND: {
    status: 404,
    message: "Booking page not found.",
  },
  PROMO_INVALID: {
    status: 404,
    message: "The promo code is unknown or expired.",
  },
  CANCELLATION_DISABLED: {
    status: 403,
    message:
      "This clinic does not allow patient-initiated cancellation. Contact the clinic directly.",
  },
  RATE_LIMITED: {
    status: 429,
    message: "Too many booking attempts, please try again later.",
  },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    message:
      "This Idempotency-Key has been used with a different request body.",
  },
} as const;

export type PublicApiErrorCode = keyof typeof PUBLIC_API_ERROR_CODES;

export function sendPublicApiError(
  res: Response,
  code: PublicApiErrorCode,
  extra?: Record<string, unknown>,
) {
  const entry = PUBLIC_API_ERROR_CODES[code];
  return res.status(entry.status).json({
    code,
    message: entry.message,
    ...(extra ?? {}),
  });
}
