/**
 * Normalize a phone number for matching purposes.
 * Strips formatting, detects Swiss (+41) and German (+49) prefixes
 * (including bare digits without +), and handles short Swiss mobile numbers.
 *
 * Swiss numbers normalize to local format: 079...
 * German numbers normalize to E.164 format: +49170...
 */
export function normalizePhoneForMatching(phone: string): string {
  // Step 1: Strip formatting characters (spaces, dashes, parentheses, dots)
  let p = phone.replace(/[\s\-\(\)\.]/g, '');

  // Step 2: Handle +41 / 0041 → local Swiss format
  if (p.startsWith('+41')) {
    return '0' + p.slice(3);
  }
  if (p.startsWith('0041')) {
    return '0' + p.slice(4);
  }

  // Step 3: Handle +49 / 0049 → E.164 German format
  if (p.startsWith('+49')) {
    return p; // already in +49 format
  }
  if (p.startsWith('0049')) {
    return '+49' + p.slice(4);
  }

  // Step 4: Handle bare 41... (no +) — Swiss international prefix
  // Swiss numbers: 41 + 8 digits = 10 digits, 41 + 9 digits = 11 digits, or 41 + 10 digits = 12 digits
  if (p.startsWith('41') && p.length >= 10 && p.length <= 12) {
    return '0' + p.slice(2);
  }

  // Step 5: Handle bare 49... (no +) — German international prefix
  // German numbers: 49 + 9-11 digits = 11-13 digits
  if (p.startsWith('49') && p.length >= 11 && p.length <= 13) {
    return '+' + p;
  }

  // Step 6: Short Swiss mobile — 8-9 digits starting with 7
  if (p.match(/^7\d{7,8}$/)) {
    return '0' + p;
  }

  // Step 7: Pass-through for everything else
  return p;
}
