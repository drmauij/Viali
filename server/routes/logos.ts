import { Router } from "express";
import { isAuthenticated } from "../auth/google";
import { ObjectStorageService } from "../objectStorage";
import logger from "../logger";

const logosRouter = Router();

/**
 * Logo upload + public download.
 *
 * Logos appear on public-facing surfaces (the booking page at `/book/:token`
 * shows the clinic's logo to unauthenticated visitors), so we serve them
 * from a dedicated public route. The upload step still requires auth — only
 * a logged-in user with hospital access can mint a new upload URL.
 *
 * Storage layout in S3: `logos/<kind>/<uuid>.<ext>` where kind is "hospital"
 * or "group". The full object path stored in `hospitals.logo_url` /
 * `hospital_groups.logo_url` is `/api/public/logos/<kind>/<uuid>.<ext>`,
 * which is what `<img src>` consumes.
 *
 * Existing data-URL logos in the DB continue to render fine (the field is
 * just a string the browser dereferences) — there's no migration step.
 */

const VALID_KINDS = new Set(["hospital", "group"]);

logosRouter.post("/api/uploads/logo-upload-url", isAuthenticated, async (req: any, res) => {
  try {
    const kind = (req.body?.kind ?? "hospital") as string;
    if (!VALID_KINDS.has(kind)) {
      return res.status(400).json({ message: "kind must be 'hospital' or 'group'" });
    }
    const filename: string | undefined = req.body?.filename;

    const objectStorage = new ObjectStorageService();
    if (!objectStorage.isConfigured()) {
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const { uploadURL, storageKey } = await objectStorage.getUploadURLForFolder(
      `logos/${kind}`,
      filename || "logo.jpg",
    );

    // storageKey from getUploadURLForFolder is `/objects/logos/<kind>/<uuid>.<ext>`.
    // Rewrite to `/api/public/logos/<kind>/<uuid>.<ext>` — strip the leading
    // `/objects/logos/` (NOT just `/objects/`, otherwise the `logos/` segment
    // gets duplicated in the public URL and the download route 404s).
    const publicUrl = storageKey.replace(/^\/objects\/logos\//, "/api/public/logos/");

    res.json({ uploadUrl: uploadURL, publicUrl });
  } catch (err) {
    logger.error("Error generating logo upload URL:", err);
    res.status(500).json({ message: "Failed to generate logo upload URL" });
  }
});

/**
 * Public logo download. Path format: `/api/public/logos/<kind>/<uuid>.<ext>`.
 * Maps onto S3 key `logos/<kind>/<uuid>.<ext>`. No auth — these are
 * intentionally world-readable (booking page, marketing surfaces).
 *
 * Hardened against directory traversal: the path must start with
 * `hospital/` or `group/` followed by the object name. Anything else 404s.
 */
logosRouter.get("/api/public/logos/:objectPath(*)", async (req, res) => {
  try {
    let objectPath = req.params.objectPath as string;
    // Tolerate legacy/broken URLs that include a duplicated `logos/`
    // segment (a previous version of the upload endpoint emitted
    // /api/public/logos/logos/<kind>/<uuid>.jpg). Strip it so the
    // existing rows in DB don't 404 forever.
    if (objectPath.startsWith("logos/")) {
      objectPath = objectPath.slice("logos/".length);
    }
    const firstSegment = objectPath.split("/")[0];
    if (!VALID_KINDS.has(firstSegment)) {
      return res.status(404).json({ message: "Not found" });
    }

    const objectStorage = new ObjectStorageService();
    if (!objectStorage.isConfigured()) {
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const storageKey = `/objects/logos/${objectPath}`;
    await objectStorage.downloadObject(storageKey, res, 86400);
  } catch (err: any) {
    logger.error("Error serving logo:", err);
    if (err?.name === "ObjectNotFoundError") {
      return res.status(404).json({ message: "Logo not found" });
    }
    if (!res.headersSent) res.status(500).json({ message: "Failed to serve logo" });
  }
});

export default logosRouter;
