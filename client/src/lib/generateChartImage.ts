import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, CustomChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components';
import type { ChartExportResult } from "@/components/anesthesia/UnifiedTimeline";

echarts.use([CanvasRenderer, LineChart, CustomChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent]);

type VitalPoint = [number, number];

interface ClinicalSnapshotData {
  hr?: Array<{ timestamp: string; value: number }>;
  bp?: Array<{ timestamp: string; sys: number; dia: number }>;
  spo2?: Array<{ timestamp: string; value: number }>;
  temp?: Array<{ timestamp: string; value: number }>;
}

interface GenerateChartOptions {
  clinicalSnapshot: any;
  startTime?: number;
  endTime?: number;
  width?: number;
  height?: number;
}

const VITAL_ICON_PATHS = {
  heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  chevronDown: "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z",
  chevronUp: "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z",
};

function createIconSeries(
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
    renderItem: (params: any, api: any) => {
      const point = api.coord([api.value(0), api.value(1)]);
      const scale = size / 24;
      
      if (isCircleDot) {
        return {
          type: 'group',
          x: point[0],
          y: point[1],
          children: [
            {
              type: 'circle',
              x: 0,
              y: 0,
              shape: { r: 8 * scale },
              style: {
                fill: 'none',
                stroke: color,
                lineWidth: 2,
              },
            },
            {
              type: 'circle',
              x: 0,
              y: 0,
              shape: { r: 2 * scale },
              style: {
                fill: color,
                stroke: color,
                lineWidth: 1.5,
              },
            },
          ],
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
      };
    },
  };
}

export async function generateChartImageFromSnapshot(options: GenerateChartOptions): Promise<ChartExportResult | null> {
  const { clinicalSnapshot, width = 1400, height = 400 } = options;
  
  if (!clinicalSnapshot) {
    console.warn('[CHART-GEN] No clinical snapshot provided');
    return null;
  }

  const snapshotData: ClinicalSnapshotData = clinicalSnapshot.data || clinicalSnapshot;

  const hrData: VitalPoint[] = (snapshotData.hr || [])
    .map((p) => [new Date(p.timestamp).getTime(), p.value] as VitalPoint)
    .filter(p => !isNaN(p[0]) && !isNaN(p[1]))
    .sort((a, b) => a[0] - b[0]);
  
  const bpRaw = (snapshotData.bp || []).map((p) => ({
    time: new Date(p.timestamp).getTime(),
    sys: p.sys,
    dia: p.dia,
  })).filter(p => !isNaN(p.time)).sort((a, b) => a.time - b.time);
  
  const sysData: VitalPoint[] = bpRaw.map((d) => [d.time, d.sys] as VitalPoint);
  const diaData: VitalPoint[] = bpRaw.map((d) => [d.time, d.dia] as VitalPoint);
  
  const spo2Data: VitalPoint[] = (snapshotData.spo2 || [])
    .map((p) => [new Date(p.timestamp).getTime(), p.value] as VitalPoint)
    .filter(p => !isNaN(p[0]) && !isNaN(p[1]))
    .sort((a, b) => a[0] - b[0]);

  const hasData = hrData.length > 0 || sysData.length > 0 || spo2Data.length > 0;
  
  if (!hasData) {
    console.warn('[CHART-GEN] No vital signs data found in snapshot');
    return null;
  }

  const allTimes = [
    ...hrData.map((d) => d[0]),
    ...sysData.map((d) => d[0]),
    ...spo2Data.map((d) => d[0]),
  ].filter(Boolean);

  const minTime = Math.min(...allTimes);
  const maxTime = Math.max(...allTimes);
  const dataRange = maxTime - minTime;
  
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
  const windowSize = Math.max(FOUR_HOURS_MS, dataRange + 30 * 60 * 1000);
  const centerTime = minTime + dataRange / 2;
  const paddedMin = centerTime - windowSize / 2;
  const paddedMax = centerTime + windowSize / 2;

  // Calculate y-axis ranges from actual data (with padding)
  const allHrBpValues = [
    ...hrData.map(d => d[1]),
    ...sysData.map(d => d[1]),
    ...diaData.map(d => d[1]),
  ].filter(v => !isNaN(v) && isFinite(v));
  
  const allSpo2Values = spo2Data.map(d => d[1]).filter(v => !isNaN(v) && isFinite(v));
  
  // HR/BP axis: use data range with 15% padding, min 40-180 range
  let hrBpMin = allHrBpValues.length > 0 ? Math.min(...allHrBpValues) : 60;
  let hrBpMax = allHrBpValues.length > 0 ? Math.max(...allHrBpValues) : 120;
  const hrBpRange = hrBpMax - hrBpMin;
  const hrBpPadding = Math.max(hrBpRange * 0.15, 10);
  hrBpMin = Math.max(30, Math.floor((hrBpMin - hrBpPadding) / 10) * 10);
  hrBpMax = Math.min(220, Math.ceil((hrBpMax + hrBpPadding) / 10) * 10);
  
  // SpO2 axis: use data range with padding, typically 90-100
  let spo2Min = allSpo2Values.length > 0 ? Math.min(...allSpo2Values) : 95;
  let spo2Max = allSpo2Values.length > 0 ? Math.max(...allSpo2Values) : 100;
  spo2Min = Math.max(80, Math.floor(spo2Min - 3));
  spo2Max = Math.min(100, Math.ceil(spo2Max + 1));

  console.log('[CHART-GEN] Generating chart with calculated ranges:', {
    minTime: new Date(minTime).toISOString(),
    maxTime: new Date(maxTime).toISOString(),
    hrBpRange: `${hrBpMin}-${hrBpMax}`,
    spo2Range: `${spo2Min}-${spo2Max}`,
    dataPoints: allTimes.length,
  });

  const colors = {
    hr: "#ef4444",
    bp: "#000000",
    spo2: "#8b5cf6",
  };

  const series: any[] = [];

  if (hrData.length > 0) {
    series.push({
      type: 'line',
      name: 'HR',
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: hrData,
      lineStyle: { color: colors.hr, width: 2 },
      symbol: 'none',
      z: 15,
    });
    series.push(createIconSeries('Heart Rate', hrData, VITAL_ICON_PATHS.heart, colors.hr, 0, 14, 100));
  }

  if (sysData.length > 0 && diaData.length > 0) {
    series.push({
      type: 'line',
      name: 'Diastolic',
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: diaData,
      symbol: 'none',
      lineStyle: { color: colors.bp, width: 1, opacity: 0.3 },
      stack: 'bp',
      z: 7,
    });

    const diffData = sysData.map((sysPoint, idx) => {
      const diaPoint = diaData[idx];
      if (diaPoint && sysPoint[0] === diaPoint[0]) {
        return [sysPoint[0], sysPoint[1] - diaPoint[1]] as VitalPoint;
      }
      return null;
    }).filter((p): p is VitalPoint => p !== null);

    series.push({
      type: 'line',
      name: 'BP Range',
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: diffData,
      symbol: 'none',
      lineStyle: { color: colors.bp, width: 1, opacity: 0.3 },
      stack: 'bp',
      areaStyle: { color: 'rgba(0, 0, 0, 0.08)' },
      z: 8,
    });

    series.push(createIconSeries('Systolic', sysData, VITAL_ICON_PATHS.chevronDown, colors.bp, 0, 14, 30));
    series.push(createIconSeries('Diastolic BP', diaData, VITAL_ICON_PATHS.chevronUp, colors.bp, 0, 14, 30));
  }

  if (spo2Data.length > 0) {
    series.push({
      type: 'line',
      name: 'SpO2',
      xAxisIndex: 0,
      yAxisIndex: 1,
      data: spo2Data,
      lineStyle: { color: colors.spo2, width: 2 },
      symbol: 'none',
      z: 16,
    });
    series.push(createIconSeries('SpO2 Points', spo2Data, '', colors.spo2, 1, 14, 100, true));
  }

  const option = {
    backgroundColor: '#ffffff',
    animation: false,
    title: {
      text: 'Vital Signs Timeline',
      left: 'center',
      top: 10,
      textStyle: {
        color: '#1f2937',
        fontSize: 16,
        fontWeight: 'bold',
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    legend: {
      data: ['HR', 'Systolic', 'Diastolic BP', 'SpO2'],
      bottom: 10,
      textStyle: { color: '#1f2937', fontSize: 11 },
    },
    grid: {
      left: 60,
      right: 60,
      top: 50,
      bottom: 60,
    },
    xAxis: {
      type: 'time',
      min: paddedMin,
      max: paddedMax,
      axisLabel: {
        formatter: (value: number) => {
          const date = new Date(value);
          return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        },
        color: '#1f2937',
        fontSize: 11,
      },
      axisLine: { show: true, lineStyle: { color: '#9ca3af' } },
      splitLine: { show: true, lineStyle: { color: '#e5e7eb', type: 'dashed' } },
    },
    yAxis: [
      {
        type: 'value',
        name: 'HR/BP',
        min: hrBpMin,
        max: hrBpMax,
        axisLabel: { color: '#1f2937', fontSize: 10 },
        axisLine: { show: true, lineStyle: { color: '#9ca3af' } },
        splitLine: { show: true, lineStyle: { color: '#f3f4f6' } },
      },
      {
        type: 'value',
        name: 'SpO₂',
        position: 'right',
        min: spo2Min,
        max: spo2Max,
        axisLabel: { color: colors.spo2, fontSize: 10 },
        axisLine: { show: true, lineStyle: { color: colors.spo2 } },
        splitLine: { show: false },
      },
    ],
    series,
  };

  const pixelRatio = 2;

  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const chart = echarts.init(canvas as any);
      chart.setOption(option);
      
      setTimeout(() => {
        try {
          const dataURL = chart.getDataURL({
            type: 'png',
            pixelRatio,
            backgroundColor: '#ffffff',
          });
          
          chart.dispose();
          
          console.log('[CHART-GEN] Chart generated successfully:', {
            size: Math.round(dataURL.length / 1024) + 'KB',
            dimensions: `${width * pixelRatio}x${height * pixelRatio}px`,
          });
          
          resolve({
            image: dataURL,
            width: width * pixelRatio,
            height: height * pixelRatio,
          });
        } catch (error) {
          console.error('[CHART-GEN] Failed to export chart:', error);
          chart.dispose();
          resolve(null);
        }
      }, 200);
    } catch (error) {
      console.error('[CHART-GEN] Failed to create chart:', error);
      resolve(null);
    }
  });
}
