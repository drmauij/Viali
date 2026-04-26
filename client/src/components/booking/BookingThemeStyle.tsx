import type { BookingTheme } from "@shared/schema";

interface Props {
  theme: BookingTheme | null;
}

function fontUrl(theme: BookingTheme): string | null {
  const families: string[] = [];
  if (theme.headingFont) families.push(`family=${encodeURIComponent(theme.headingFont)}:wght@600`);
  if (theme.bodyFont) families.push(`family=${encodeURIComponent(theme.bodyFont)}:wght@400;500`);
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

export function BookingThemeStyle({ theme }: Props) {
  if (!theme) return null;

  const decls: string[] = [];
  if (theme.bgColor) decls.push(`--book-bg: ${theme.bgColor};`);
  if (theme.primaryColor) decls.push(`--book-primary: ${theme.primaryColor};`);
  if (theme.secondaryColor) decls.push(`--book-secondary: ${theme.secondaryColor};`);
  if (theme.headingFont) decls.push(`--book-heading-font: '${theme.headingFont}', sans-serif;`);
  if (theme.bodyFont) decls.push(`--book-body-font: '${theme.bodyFont}', sans-serif;`);

  const link = fontUrl(theme);

  // If no CSS vars to declare, render only the font link (or nothing).
  if (decls.length === 0) {
    if (!link) return null;
    return <link rel="stylesheet" href={link} />;
  }

  const css = `[data-booking-root] {\n  ${decls.join("\n  ")}\n}`;

  return (
    <>
      {link && <link rel="stylesheet" href={link} />}
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </>
  );
}
