// Lucide React icon SVG paths for vitals chart markers
// These paths are designed for stroke rendering (not fill)

export const VITAL_ICON_PATHS = {
  heart: {
    // Lucide Heart icon (24x24 viewBox)
    path: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
    viewBox: { width: 24, height: 24 },
    strokeWidth: 2,
  },
  chevronDown: {
    // Lucide ChevronDown icon (24x24 viewBox)
    path: 'm6 9 6 6 6-6',
    viewBox: { width: 24, height: 24 },
    strokeWidth: 2,
  },
  chevronUp: {
    // Lucide ChevronUp icon (24x24 viewBox)
    path: 'm18 15-6-6-6 6',
    viewBox: { width: 24, height: 24 },
    strokeWidth: 2,
  },
  circleDot: {
    // Lucide CircleDot icon (24x24 viewBox) - circle with center dot
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20Z M12 12h.01',
    viewBox: { width: 24, height: 24 },
    strokeWidth: 2,
  },
};

// Transform SVG path to center it at origin for ECharts rendering
export function getIconPathForECharts(
  iconKey: keyof typeof VITAL_ICON_PATHS,
  size: number = 16
) {
  const icon = VITAL_ICON_PATHS[iconKey];
  const scale = size / icon.viewBox.width;
  const offsetX = icon.viewBox.width / 2;
  const offsetY = icon.viewBox.height / 2;

  return {
    path: icon.path,
    scale,
    offsetX,
    offsetY,
    strokeWidth: icon.strokeWidth,
  };
}
