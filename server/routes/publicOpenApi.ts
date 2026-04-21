import { Router, type Request, type Response } from "express";
import { dump as yamlDump } from "js-yaml";

function tokenParam() {
  return {
    name: "token",
    in: "path",
    required: true,
    schema: { type: "string" },
  } as const;
}
function providerIdParam() {
  return {
    name: "providerId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  } as const;
}
function errorRef() {
  return {
    description: "Error",
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/Error" } },
    },
  } as const;
}

export const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Viali Booking API",
    version: "1.0.0",
    description:
      "Public booking endpoints for Viali clinics. Agents and automation tools can use these to create appointments on behalf of patients. See /api.md for human-readable docs.",
  },
  servers: [
    { url: "{host}", variables: { host: { default: "https://use.viali.app" } } },
  ],
  components: {
    schemas: {
      Error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: {
            type: "string",
            enum: [
              "SLOT_TAKEN",
              "INVALID_BOOKING_DATA",
              "REFERRAL_REQUIRED",
              "NOSHOW_FEE_ACK_REQUIRED",
              "PROVIDER_NOT_BOOKABLE",
              "HOSPITAL_NOT_FOUND",
              "PROMO_INVALID",
              "CANCELLATION_DISABLED",
              "RATE_LIMITED",
              "IDEMPOTENCY_CONFLICT",
            ],
          },
          message: { type: "string" },
          fieldErrors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
      BookingRequest: {
        type: "object",
        required: [
          "providerId",
          "date",
          "startTime",
          "endTime",
          "firstName",
          "surname",
          "email",
          "phone",
        ],
        properties: {
          providerId: { type: "string", format: "uuid" },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          endTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          firstName: { type: "string", maxLength: 100 },
          surname: { type: "string", maxLength: 100 },
          email: { type: "string", format: "email", maxLength: 255 },
          phone: { type: "string", maxLength: 30 },
          notes: { type: "string", maxLength: 1000 },
          noShowFeeAcknowledged: {
            type: "boolean",
            description:
              "Required to be `true` when the hospital has a non-empty noShowFeeMessage (see GET /api/public/booking/{token}).",
          },
        },
      },
    },
  },
  paths: {
    "/api/public/booking/{token}": {
      get: {
        summary: "Hospital info + bookable providers",
        parameters: [tokenParam()],
        responses: {
          "200": { description: "OK" },
          "404": errorRef(),
        },
      },
    },
    "/api/public/booking/{token}/services": {
      get: { summary: "Service list", parameters: [tokenParam()], responses: { "200": { description: "OK" }, "404": errorRef() } },
    },
    "/api/public/booking/{token}/closures": {
      get: { summary: "Blocked dates", parameters: [tokenParam()], responses: { "200": { description: "OK" }, "404": errorRef() } },
    },
    "/api/public/booking/{token}/providers/{providerId}/available-dates": {
      get: {
        summary: "Dates with available slots in a range",
        parameters: [tokenParam(), providerIdParam()],
        responses: { "200": { description: "OK" }, "404": errorRef() },
      },
    },
    "/api/public/booking/{token}/providers/{providerId}/slots": {
      get: {
        summary: "Slots on a specific date",
        parameters: [
          tokenParam(),
          providerIdParam(),
          { name: "date", in: "query", required: true, schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
        ],
        responses: { "200": { description: "OK" }, "404": errorRef() },
      },
    },
    "/api/public/booking/{token}/best-provider": {
      get: { summary: "Next-available provider heuristic", parameters: [tokenParam()], responses: { "200": { description: "OK" }, "404": errorRef() } },
    },
    "/api/public/booking/{token}/prefill": {
      get: {
        summary: "Prefill patient data from a short-lived token",
        parameters: [
          tokenParam(),
          { name: "token", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" }, "404": errorRef() },
      },
    },
    "/api/public/booking/{token}/promo/{code}": {
      get: {
        summary: "Validate a promo code",
        parameters: [
          tokenParam(),
          { name: "code", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Valid promo" }, "404": errorRef() },
      },
    },
    "/api/public/booking/{token}/book": {
      post: {
        summary: "Create an appointment",
        parameters: [
          tokenParam(),
          {
            name: "Idempotency-Key",
            in: "header",
            required: false,
            description:
              "Optional. If provided, replaying the same request within 24h returns the original appointment (status 200, header X-Idempotent-Replay: true). Replaying the same key with a different body returns 409 IDEMPOTENCY_CONFLICT.",
            schema: { type: "string", maxLength: 200 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BookingRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Replayed existing appointment (idempotent)" },
          "201": { description: "Created" },
          "400": errorRef(),
          "404": errorRef(),
          "409": errorRef(),
          "429": errorRef(),
        },
        "x-rateLimit": { window: "15m", max: 30, scope: "per-IP" },
      },
    },
    "/api/clinic/appointments/cancel-info/{token}": {
      get: {
        summary: "Fetch appointment details for a cancellation token",
        description:
          "Given a single-use action token (delivered to the patient via email/SMS), returns the appointment details including noShowFeeMessage and hidePatientCancel. Agents MUST fetch this before posting to /cancel-by-token so they can surface the fee notice to the user.",
        parameters: [
          { name: "token", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Appointment details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    appointmentDate: { type: "string" },
                    appointmentTime: { type: "string" },
                    clinicName: { type: "string" },
                    noShowFeeMessage: {
                      type: ["string", "null"],
                      description:
                        "Non-empty when the clinic charges a no-show fee. Agents must show this to the user before cancellation.",
                    },
                    hidePatientCancel: {
                      type: "boolean",
                      description:
                        "If true, cancel-by-token will return 403 CANCELLATION_DISABLED.",
                    },
                  },
                },
              },
            },
          },
          "404": {
            description: "Token not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
          "410": {
            description: "Token already used or expired",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    alreadyUsed: { type: "boolean" },
                    expired: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/clinic/appointments/cancel-by-token": {
      post: {
        summary: "Cancel an appointment using a patient's action token",
        description:
          "Cancels a scheduled or confirmed appointment. The token is single-use and delivered to the patient via email or SMS. Returns 403 CANCELLATION_DISABLED when the hospital has hidePatientCancel = true.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token"],
                properties: {
                  token: { type: "string" },
                  reason: { type: "string", maxLength: 500 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Cancelled" },
          "403": errorRef(),
          "404": { description: "Token not found" },
          "409": { description: "Appointment cannot be cancelled (bad status)" },
          "410": { description: "Token already used or expired" },
        },
      },
    },
  },
} as const;

export function openApiJsonHandler(_req: Request, res: Response) {
  res.type("application/json").send(JSON.stringify(OPENAPI_SPEC, null, 2));
}
export function openApiYamlHandler(_req: Request, res: Response) {
  res.type("application/yaml").send(yamlDump(OPENAPI_SPEC));
}
export function wellKnownOpenApiRedirect(_req: Request, res: Response) {
  res.redirect(302, "/api/openapi.json");
}

const router = Router();
router.get("/api/openapi.json", openApiJsonHandler);
router.get("/api/openapi.yaml", openApiYamlHandler);
router.get("/.well-known/openapi.json", wellKnownOpenApiRedirect);
export default router;
