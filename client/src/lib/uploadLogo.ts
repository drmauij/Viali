import { apiRequest } from "./queryClient";

/**
 * Compress an image File to a JPEG Blob (≤ 400×400, quality 0.8) using a
 * canvas. Mirrors the legacy `canvas.toDataURL` step but returns a Blob so
 * we can PUT it to S3 instead of base64-encoding into the DB.
 */
function compressImageToBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxSize = 400;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas 2d unavailable"));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("canvas toBlob produced null"))),
          "image/jpeg",
          0.8,
        );
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compress and upload a logo image to S3, returning the public URL to store
 * on `hospitals.logo_url` or `hospital_groups.logo_url`. Both columns just
 * hold a string — the browser will resolve `/api/public/logos/...` directly.
 */
export async function uploadLogo(
  file: File,
  kind: "hospital" | "group",
): Promise<string> {
  const blob = await compressImageToBlob(file);

  const presignedRes = await apiRequest("POST", "/api/uploads/logo-upload-url", {
    kind,
    filename: file.name,
  });
  const { uploadUrl, publicUrl } = (await presignedRes.json()) as {
    uploadUrl: string;
    publicUrl: string;
  };

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": "image/jpeg" },
  });
  if (!putRes.ok) {
    throw new Error(`S3 upload failed (${putRes.status})`);
  }

  return publicUrl;
}
