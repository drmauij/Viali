import { Router, type Request, type Response } from "express";

export const MCP_SERVER_CARD = {
  $schema: "https://modelcontextprotocol.io/schema/server-card/draft",
  name: "viali-booking",
  title: "Viali Booking",
  version: "1.0.0",
  description:
    "Appointment booking for a Viali-powered clinic. Agents can list services, find available slots, and create appointments on behalf of patients.",
  vendor: {
    name: "Viali",
    url: "https://use.viali.app",
  },
  documentation: {
    openapi: "/api/openapi.json",
    markdown: "/api.md",
    human: "/api",
  },
  capabilities: {
    tools: { listChanged: false },
  },
  authentication: {
    type: "none",
    note:
      "The hospital's booking token is part of every endpoint URL; no bearer token, API key, or OAuth flow is required.",
  },
  tools: [
    {
      name: "list_services",
      title: "List services",
      description:
        "List all services bookable at this clinic (e.g. consultations, procedures). Returns codes, names, durations, and optional service groups.",
      inputSchema: {
        type: "object",
        properties: {
          token: {
            type: "string",
            description:
              "The clinic's public booking token (from the /book/<token> URL).",
          },
        },
        required: ["token"],
      },
      _meta: {
        http: {
          method: "GET",
          path: "/api/public/booking/{token}/services",
        },
      },
    },
    {
      name: "list_providers",
      title: "List bookable providers",
      description:
        "List all providers (doctors, surgeons, practitioners) who accept public bookings at this clinic.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Hospital booking token." },
        },
        required: ["token"],
      },
      _meta: {
        http: { method: "GET", path: "/api/public/booking/{token}" },
      },
    },
    {
      name: "list_available_dates",
      title: "List available dates",
      description:
        "List dates in a range on which a provider has at least one bookable slot.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string" },
          providerId: {
            type: "string",
            format: "uuid",
            description: "The provider's ID (from list_providers).",
          },
        },
        required: ["token", "providerId"],
      },
      _meta: {
        http: {
          method: "GET",
          path: "/api/public/booking/{token}/providers/{providerId}/available-dates",
        },
      },
    },
    {
      name: "list_slots",
      title: "List time slots",
      description:
        "List the bookable time slots for a provider on a specific date.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string" },
          providerId: { type: "string", format: "uuid" },
          date: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            description: "Date in YYYY-MM-DD format.",
          },
        },
        required: ["token", "providerId", "date"],
      },
      _meta: {
        http: {
          method: "GET",
          path: "/api/public/booking/{token}/providers/{providerId}/slots",
          queryParams: ["date"],
        },
      },
    },
    {
      name: "get_best_provider",
      title: "Find the next-available provider",
      description:
        "Given a service and a target date, find the provider with the nearest available slot.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string" },
          service: { type: "string", description: "Service code." },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        },
        required: ["token", "service", "date"],
      },
      _meta: {
        http: {
          method: "GET",
          path: "/api/public/booking/{token}/best-provider",
          queryParams: ["service", "date"],
        },
      },
    },
    {
      name: "book_appointment",
      title: "Book an appointment",
      description:
        "Create an appointment for a patient. Supports retries via the Idempotency-Key header: same key + same body within 24h returns the original appointment (status 200); same key + different body returns 409 IDEMPOTENCY_CONFLICT.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string" },
          providerId: { type: "string", format: "uuid" },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          endTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          firstName: { type: "string", maxLength: 100 },
          surname: { type: "string", maxLength: 100 },
          email: { type: "string", format: "email", maxLength: 255 },
          phone: { type: "string", maxLength: 30 },
          notes: { type: "string", maxLength: 1000 },
        },
        required: [
          "token",
          "providerId",
          "date",
          "startTime",
          "endTime",
          "firstName",
          "surname",
          "email",
          "phone",
        ],
      },
      _meta: {
        http: {
          method: "POST",
          path: "/api/public/booking/{token}/book",
          headers: {
            "Idempotency-Key": {
              required: false,
              description:
                "Optional UUID-like string to make the booking safely retriable.",
            },
          },
        },
      },
    },
    {
      name: "validate_promo",
      title: "Validate a promo code",
      description:
        "Check whether a promo code is currently valid at this clinic and retrieve its discount metadata.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string" },
          code: { type: "string" },
        },
        required: ["token", "code"],
      },
      _meta: {
        http: {
          method: "GET",
          path: "/api/public/booking/{token}/promo/{code}",
        },
      },
    },
    {
      name: "get_cancel_info",
      title: "Get cancellation info for an appointment",
      description:
        "Fetch an appointment's details using the single-use action token the patient received via email/SMS. Returns noShowFeeMessage and hidePatientCancel flags. Agents MUST call this before cancel_appointment and relay any no-show fee notice to the user.",
      inputSchema: {
        type: "object",
        properties: {
          actionToken: {
            type: "string",
            description:
              "The appointment action token from the patient's cancel link (email/SMS).",
          },
        },
        required: ["actionToken"],
      },
      _meta: {
        http: {
          method: "GET",
          path: "/api/clinic/appointments/cancel-info/{actionToken}",
        },
      },
    },
    {
      name: "cancel_appointment",
      title: "Cancel an appointment",
      description:
        "Cancel a scheduled or confirmed appointment using the patient's single-use action token. IMPORTANT: call get_cancel_info first — when a no-show fee message is present, show it to the user and obtain explicit confirmation before cancelling. Returns 403 CANCELLATION_DISABLED if the clinic has hidePatientCancel enabled.",
      inputSchema: {
        type: "object",
        properties: {
          actionToken: { type: "string" },
          reason: {
            type: "string",
            maxLength: 500,
            description:
              "Optional. Free-form cancellation reason — appears in the clinic's alert email.",
          },
        },
        required: ["actionToken"],
      },
      _meta: {
        http: {
          method: "POST",
          path: "/api/clinic/appointments/cancel-by-token",
          bodyShape: {
            token: "{actionToken}",
            reason: "{reason}",
          },
        },
      },
    },
  ],
} as const;

export function mcpCardHandler(_req: Request, res: Response) {
  res
    .type("application/json")
    .setHeader("Cache-Control", "public, max-age=300")
    .send(JSON.stringify(MCP_SERVER_CARD, null, 2));
}

const router = Router();
// Serve the same content at all three well-known paths agents commonly probe.
router.get("/.well-known/mcp.json", mcpCardHandler);
router.get("/.well-known/mcp/server-card.json", mcpCardHandler);
router.get("/.well-known/mcp/server-cards.json", mcpCardHandler);
export default router;
