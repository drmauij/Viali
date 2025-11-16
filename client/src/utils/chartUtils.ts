type VitalPoint = [number, number];

export function createLucideIconSeries(
  name: string,
  data: VitalPoint[],
  iconPath: string,
  color: string,
  yAxisIndex: number,
  size: number = 16,
  zLevel: number = 20,
  isCircleDot: boolean = false
) {
  return {
    type: 'custom',
    name,
    xAxisIndex: 0,
    yAxisIndex,
    data,
    zlevel: zLevel,
    z: 10,
    emphasis: {
      disabled: false,
      focus: 'self',
    },
    renderItem: (params: any, api: any) => {
      const point = api.coord([api.value(0), api.value(1)]);
      const scale = size / 24;
      
      if (isCircleDot) {
        return {
          type: 'group',
          cursor: 'pointer',
          x: point[0],
          y: point[1],
          children: [
            {
              type: 'circle',
              x: 0,
              y: 0,
              shape: { r: 10 * scale },
              style: {
                fill: 'none',
                stroke: color,
                lineWidth: 2,
              },
              emphasis: {
                style: {
                  lineWidth: 3.5,
                  stroke: color,
                },
              },
            },
            {
              type: 'circle',
              x: 0,
              y: 0,
              shape: { r: 1 * scale },
              style: {
                fill: 'none',
                stroke: color,
                lineWidth: 2,
              },
              emphasis: {
                style: {
                  lineWidth: 3.5,
                  stroke: color,
                },
              },
            },
          ],
          emphasis: {
            scaleX: 1.8,
            scaleY: 1.8,
          },
        };
      }
      
      return {
        type: 'path',
        x: point[0] - size / 2,
        y: point[1] - size / 2,
        shape: {
          pathData: iconPath,
          width: 24,
          height: 24,
        },
        style: {
          fill: 'none',
          stroke: color,
          lineWidth: 2,
        },
        scaleX: scale,
        scaleY: scale,
        cursor: 'pointer',
        emphasis: {
          scaleX: scale * 1.8,
          scaleY: scale * 1.8,
          style: {
            lineWidth: 3.5,
            stroke: color,
          },
        },
      };
    },
  };
}

export const CHART_LAYOUT = {
  VITALS_TOP: 32,
  VITALS_HEIGHT: 380,
  GRID_LEFT: 200,
  GRID_RIGHT: 10,
  get SWIMLANE_START() {
    return this.VITALS_TOP + this.VITALS_HEIGHT;
  },
} as const;

export function getChartColors(isDark: boolean) {
  return {
    hr: isDark ? "#ef4444" : "#dc2626",
    bp: {
      sys: isDark ? "#3b82f6" : "#2563eb",
      dia: isDark ? "#10b981" : "#059669",
    },
    spo2: isDark ? "#06b6d4" : "#0891b2",
    gridLine: isDark ? "#444444" : "#d1d5db",
    gridLineMinor: isDark ? "#333333" : "#e5e7eb",
    axisText: isDark ? "#ffffff" : "#000000",
  };
}
