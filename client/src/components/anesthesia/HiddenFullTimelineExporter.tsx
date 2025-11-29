import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import { VITAL_ICON_PATHS } from "@/lib/vitalIconPaths";

export interface FullTimelineExportData {
  startTime: number;
  endTime: number;
  vitals?: {
    hr?: Array<{ timestamp: string; value: number }>;
    bp?: Array<{ timestamp: string; sys: number; dia: number }>;
    spo2?: Array<{ timestamp: string; value: number }>;
    temp?: Array<{ timestamp: string; value: number }>;
  };
  events?: Array<{
    id: string;
    timestamp: string;
    description: string;
    eventType: string | null;
  }>;
  medications?: Array<{
    id: string;
    itemId: string;
    timestamp: string;
    type: string;
    dose: string;
    unit: string | null;
    route: string | null;
    rate: string | null;
    endTimestamp: string | null;
  }>;
  anesthesiaItems?: Array<{
    id: string;
    name: string;
  }>;
  staffMembers?: Array<{
    id: string;
    role: string;
    name: string;
    timestamp: string | Date;
  }>;
  positions?: Array<{
    id: string;
    position: string;
    timestamp: string | Date;
  }>;
  ventilation?: {
    pip?: Array<{ timestamp: string; value: number } | [number | string, number]>;
    peep?: Array<{ timestamp: string; value: number } | [number | string, number]>;
    tidalVolume?: Array<{ timestamp: string; value: number } | [number | string, number]>;
    respiratoryRate?: Array<{ timestamp: string; value: number } | [number | string, number]>;
    fio2?: Array<{ timestamp: string; value: number } | [number | string, number]>;
    etco2?: Array<{ timestamp: string; value: number } | [number | string, number]>;
  };
  bis?: Array<{ timestamp: string; value: number } | [number | string, number]>;
  tof?: Array<{ timestamp: string; value: number } | [number | string, number]>;
}

export interface HiddenFullTimelineExporterRef {
  exportTimeline: (data: FullTimelineExportData) => Promise<string | null>;
}

interface Props {
  onReady?: () => void;
}

const EMPTY_DATA_URL_PREFIX = "data:image/png;base64,";

type DataPoint = [number, number];

const COLORS = {
  hr: "#ef4444",
  bp: "#000000",
  spo2: "#8b5cf6",
  temp: "#f97316",
  event: "#3b82f6",
  medication: "#10b981",
  infusion: "#6366f1",
  staff: "#8b5cf6",
  position: "#f59e0b",
  ventilation: "#06b6d4",
  bis: "#ec4899",
  tof: "#14b8a6",
};

const SWIMLANE_HEIGHTS = {
  vitals: 200,
  medications: 120,
  events: 40,
  staff: 60,
  positions: 30,
  ventilation: 80,
  bis: 40,
  tof: 40,
};

// Helper function to normalize data points that can be either [timestamp, value] arrays or {timestamp, value} objects
function normalizeDataPoints(
  data: Array<{ timestamp: string; value: number } | [number | string, number]> | undefined
): DataPoint[] {
  if (!data || data.length === 0) return [];
  
  return data.map((item) => {
    if (Array.isArray(item)) {
      // Coerce first value (timestamp) to number if it's a string
      const ts = typeof item[0] === 'string' 
        ? new Date(item[0]).getTime() 
        : item[0];
      return [ts, item[1]] as DataPoint;
    } else {
      const ts = typeof item.timestamp === 'string' 
        ? new Date(item.timestamp).getTime() 
        : item.timestamp;
      return [ts, item.value] as DataPoint;
    }
  });
}

function createIconSeries(
  name: string,
  data: DataPoint[],
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

export const HiddenFullTimelineExporter = forwardRef<HiddenFullTimelineExporterRef, Props>(
  function HiddenFullTimelineExporter({ onReady }, ref) {
    const chartRef = useRef<any>(null);
    const [chartData, setChartData] = useState<FullTimelineExportData | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const resolveRef = useRef<((value: string | null) => void) | null>(null);
    const retryCountRef = useRef(0);
    const maxRetries = 5;

    useEffect(() => {
      console.log("[FULL-TIMELINE-EXPORT] Component mounted");
      onReady?.();
    }, [onReady]);

    const captureChart = useCallback(() => {
      console.log("[FULL-TIMELINE-EXPORT] Attempting capture, retry:", retryCountRef.current);
      
      if (!chartRef.current) {
        console.warn("[FULL-TIMELINE-EXPORT] Chart ref not available");
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          setTimeout(() => captureChart(), 200);
          return;
        }
        resolveRef.current?.(null);
        setIsExporting(false);
        setChartData(null);
        retryCountRef.current = 0;
        return;
      }

      try {
        const chartInstance = chartRef.current.getEchartsInstance();
        if (!chartInstance) {
          console.warn("[FULL-TIMELINE-EXPORT] Chart instance not available");
          if (retryCountRef.current < maxRetries) {
            retryCountRef.current++;
            setTimeout(() => captureChart(), 200);
            return;
          }
          resolveRef.current?.(null);
          setIsExporting(false);
          setChartData(null);
          retryCountRef.current = 0;
          return;
        }

        const dataUrl = chartInstance.getDataURL({
          type: "png",
          pixelRatio: 3,
          backgroundColor: "#ffffff",
        });

        const isValidDataUrl = dataUrl && dataUrl.length > EMPTY_DATA_URL_PREFIX.length + 100;
        
        if (!isValidDataUrl) {
          console.warn("[FULL-TIMELINE-EXPORT] Empty/invalid dataUrl, retrying...");
          if (retryCountRef.current < maxRetries) {
            retryCountRef.current++;
            setTimeout(() => captureChart(), 300);
            return;
          }
          console.error("[FULL-TIMELINE-EXPORT] Failed after retries");
          resolveRef.current?.(null);
          setIsExporting(false);
          setChartData(null);
          retryCountRef.current = 0;
          return;
        }

        console.log("[FULL-TIMELINE-EXPORT] Chart exported, length:", dataUrl?.length);
        resolveRef.current?.(dataUrl);
        setIsExporting(false);
        setChartData(null);
        retryCountRef.current = 0;
      } catch (error) {
        console.error("[FULL-TIMELINE-EXPORT] Export failed:", error);
        resolveRef.current?.(null);
        setIsExporting(false);
        setChartData(null);
        retryCountRef.current = 0;
      }
    }, []);

    const handleChartReady = useCallback(() => {
      console.log("[FULL-TIMELINE-EXPORT] Chart ready, isExporting:", isExporting);
      
      if (!isExporting) return;

      setTimeout(() => {
        captureChart();
      }, 1000);
    }, [isExporting, captureChart]);

    useImperativeHandle(ref, () => ({
      exportTimeline: async (data: FullTimelineExportData): Promise<string | null> => {
        console.log("[FULL-TIMELINE-EXPORT] exportTimeline called");
        
        return new Promise((resolve) => {
          if (!data) {
            console.warn("[FULL-TIMELINE-EXPORT] No data provided");
            resolve(null);
            return;
          }
          
          retryCountRef.current = 0;
          resolveRef.current = resolve;
          setChartData(data);
          setIsExporting(true);
        });
      },
    }), []);

    const buildChartOption = useCallback(() => {
      if (!chartData) return {};

      const { startTime, endTime, vitals, events, medications, anesthesiaItems, staffMembers, positions, ventilation, bis, tof } = chartData;

      console.log("[FULL-TIMELINE-EXPORT] Building chart with data:", {
        hrCount: vitals?.hr?.length || 0,
        bpCount: vitals?.bp?.length || 0,
        eventsCount: events?.length || 0,
        medsCount: medications?.length || 0,
        staffCount: staffMembers?.length || 0,
        positionsCount: positions?.length || 0,
      });

      // Calculate actual data range from all data points to trim empty periods
      const allTimestamps: number[] = [];
      
      // Collect timestamps from vitals
      const addVitalTimestamps = (data: DataPoint[] | undefined) => {
        if (data) data.forEach(point => allTimestamps.push(point[0]));
      };
      addVitalTimestamps(normalizeDataPoints(vitals?.hr));
      // BP data has different structure {timestamp, sys, dia}, handle separately
      if (vitals?.bp) {
        vitals.bp.forEach((bp: any) => {
          const ts = typeof bp.timestamp === 'string' 
            ? new Date(bp.timestamp).getTime() 
            : bp.timestamp;
          if (ts && !isNaN(ts)) allTimestamps.push(ts);
        });
      }
      addVitalTimestamps(normalizeDataPoints(vitals?.spo2));
      addVitalTimestamps(normalizeDataPoints(vitals?.temp));
      
      // Collect timestamps from events
      if (events) {
        events.forEach((event: any) => {
          const ts = typeof event.timestamp === 'string' 
            ? new Date(event.timestamp).getTime() 
            : event.timestamp;
          if (ts && !isNaN(ts)) allTimestamps.push(ts);
        });
      }
      
      // Collect timestamps from medications
      if (medications) {
        medications.forEach((med: any) => {
          const ts = typeof med.timestamp === 'string' 
            ? new Date(med.timestamp).getTime() 
            : med.timestamp;
          if (ts && !isNaN(ts)) allTimestamps.push(ts);
          if (med.endTimestamp) {
            const endTs = typeof med.endTimestamp === 'string' 
              ? new Date(med.endTimestamp).getTime() 
              : med.endTimestamp;
            if (endTs && !isNaN(endTs)) allTimestamps.push(endTs);
          }
        });
      }
      
      // Collect timestamps from staff and positions
      if (staffMembers) {
        staffMembers.forEach((s: any) => {
          const ts = typeof s.timestamp === 'string' 
            ? new Date(s.timestamp).getTime() 
            : s.timestamp;
          if (ts && !isNaN(ts)) allTimestamps.push(ts);
        });
      }
      if (positions) {
        positions.forEach((p: any) => {
          const ts = typeof p.timestamp === 'string' 
            ? new Date(p.timestamp).getTime() 
            : p.timestamp;
          if (ts && !isNaN(ts)) allTimestamps.push(ts);
        });
      }
      
      // Collect timestamps from ventilation, BIS, TOF
      addVitalTimestamps(normalizeDataPoints(ventilation?.pip));
      addVitalTimestamps(normalizeDataPoints(ventilation?.peep));
      addVitalTimestamps(normalizeDataPoints(ventilation?.fio2));
      addVitalTimestamps(normalizeDataPoints(bis));
      addVitalTimestamps(normalizeDataPoints(tof));
      
      // Calculate actual range from data, or fall back to provided times
      let actualMin = startTime;
      let actualMax = endTime;
      
      if (allTimestamps.length > 0) {
        actualMin = Math.min(...allTimestamps);
        actualMax = Math.max(...allTimestamps);
      }
      
      // Add 5% padding on each side for visual clarity
      const timeRange = actualMax - actualMin;
      const padding = Math.max(timeRange * 0.05, 5 * 60 * 1000); // At least 5 minutes padding
      const paddedMin = actualMin - padding;
      const paddedMax = actualMax + padding;
      
      console.log("[FULL-TIMELINE-EXPORT] Time range calculated:", {
        providedStart: new Date(startTime).toISOString(),
        providedEnd: new Date(endTime).toISOString(),
        actualDataStart: new Date(actualMin).toISOString(),
        actualDataEnd: new Date(actualMax).toISOString(),
        dataPoints: allTimestamps.length,
      });

      const hasMedications = medications && medications.length > 0;
      const hasEvents = events && events.length > 0;
      const hasStaff = staffMembers && staffMembers.length > 0;
      const hasPositions = positions && positions.length > 0;
      const hasVentilation = ventilation && (
        (ventilation.etco2?.length || 0) > 0 ||
        (ventilation.pip?.length || 0) > 0 ||
        (ventilation.peep?.length || 0) > 0 ||
        (ventilation.tidalVolume?.length || 0) > 0 ||
        (ventilation.respiratoryRate?.length || 0) > 0 ||
        (ventilation.fio2?.length || 0) > 0
      );
      const hasBIS = bis && bis.length > 0;
      const hasTOF = tof && tof.length > 0;

      let currentTop = 60;
      const grids: any[] = [];
      const xAxes: any[] = [];
      const yAxes: any[] = [];
      const series: any[] = [];
      let yAxisIndex = 0;
      let gridIndex = 0;

      const gridLeft = 200;
      const gridRight = 30;

      const formatTimeLabel = (value: number) => {
        const date = new Date(value);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      };

      grids.push({
        left: gridLeft,
        right: gridRight,
        top: currentTop,
        height: SWIMLANE_HEIGHTS.vitals,
      });
      
      xAxes.push({
        type: 'time',
        gridIndex: gridIndex,
        min: paddedMin,
        max: paddedMax,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { show: true, lineStyle: { color: '#e5e7eb', type: 'dashed' } },
      });

      yAxes.push({
        type: 'value',
        gridIndex: gridIndex,
        name: 'HR/BP',
        nameLocation: 'middle',
        nameGap: 50,
        min: 20,
        max: 200,
        splitLine: { show: true, lineStyle: { color: '#f3f4f6' } },
        axisLabel: { fontSize: 10 },
      });

      yAxes.push({
        type: 'value',
        gridIndex: gridIndex,
        name: 'SpO₂',
        nameLocation: 'middle',
        nameGap: 35,
        position: 'right',
        min: 85,
        max: 100,
        splitLine: { show: false },
        axisLabel: { fontSize: 10 },
      });

      const hrData: DataPoint[] = (vitals?.hr || [])
        .map((p) => [new Date(p.timestamp).getTime(), p.value] as DataPoint)
        .sort((a, b) => a[0] - b[0]);
      
      const bpRaw = (vitals?.bp || []).map((p) => ({
        time: new Date(p.timestamp).getTime(),
        sys: p.sys,
        dia: p.dia,
      })).sort((a, b) => a.time - b.time);
      
      const sysData: DataPoint[] = bpRaw.map((d) => [d.time, d.sys] as DataPoint);
      const diaData: DataPoint[] = bpRaw.map((d) => [d.time, d.dia] as DataPoint);
      
      const spo2Data: DataPoint[] = (vitals?.spo2 || [])
        .map((p) => [new Date(p.timestamp).getTime(), p.value] as DataPoint)
        .sort((a, b) => a[0] - b[0]);

      if (hrData.length > 0) {
        series.push({
          type: 'line',
          name: 'HR',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: hrData,
          lineStyle: { color: COLORS.hr, width: 2 },
          symbol: 'none',
          z: 15,
        });
        series.push(createIconSeries('Heart Rate', hrData, VITAL_ICON_PATHS.heart.path, COLORS.hr, 0, 16, 100));
      }

      if (sysData.length > 0 && diaData.length > 0) {
        series.push({
          type: 'line',
          name: 'Diastolic',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: diaData,
          symbol: 'none',
          lineStyle: { color: COLORS.bp, width: 1, opacity: 0.3 },
          stack: 'bp',
          z: 7,
        });

        const diffData = sysData.map((sysPoint, idx) => {
          const diaPoint = diaData[idx];
          if (diaPoint && sysPoint[0] === diaPoint[0]) {
            return [sysPoint[0], sysPoint[1] - diaPoint[1]] as DataPoint;
          }
          return null;
        }).filter((p): p is DataPoint => p !== null);

        series.push({
          type: 'line',
          name: 'BP Range',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: diffData,
          symbol: 'none',
          lineStyle: { color: COLORS.bp, width: 1, opacity: 0.3 },
          stack: 'bp',
          areaStyle: { color: 'rgba(0, 0, 0, 0.08)' },
          z: 8,
        });

        series.push(createIconSeries('Systolic', sysData, VITAL_ICON_PATHS.chevronDown.path, COLORS.bp, 0, 16, 30));
        series.push(createIconSeries('Diastolic', diaData, VITAL_ICON_PATHS.chevronUp.path, COLORS.bp, 0, 16, 30));
      }

      if (spo2Data.length > 0) {
        series.push({
          type: 'line',
          name: 'SpO2',
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: spo2Data,
          lineStyle: { color: COLORS.spo2, width: 2 },
          symbol: 'none',
          z: 16,
        });
        series.push(createIconSeries('SpO2', spo2Data, VITAL_ICON_PATHS.circleDot.path, COLORS.spo2, 1, 16, 100, true));
      }

      yAxisIndex = 2;
      gridIndex = 1;
      currentTop += SWIMLANE_HEIGHTS.vitals + 30;

      if (hasMedications) {
        grids.push({
          left: gridLeft,
          right: gridRight,
          top: currentTop,
          height: SWIMLANE_HEIGHTS.medications,
        });

        xAxes.push({
          type: 'time',
          gridIndex: gridIndex,
          min: paddedMin,
          max: paddedMax,
          axisLabel: { show: false },
          axisTick: { show: false },
          axisLine: { show: false },
          splitLine: { show: true, lineStyle: { color: '#e5e7eb', type: 'dashed' } },
        });

        yAxes.push({
          type: 'category',
          gridIndex: gridIndex,
          name: 'Medications',
          nameLocation: 'middle',
          nameGap: 80,
          data: [],
          axisLabel: { show: false },
          axisTick: { show: false },
          axisLine: { show: false },
        });

        const itemMap = new Map(anesthesiaItems?.map(item => [item.id, item.name]) || []);
        const uniqueItems = Array.from(new Set(medications.map(m => m.itemId)));
        const itemIndices = new Map(uniqueItems.map((id, idx) => [id, idx]));
        const laneHeight = SWIMLANE_HEIGHTS.medications / Math.max(uniqueItems.length, 1);

        medications.forEach((med) => {
          const itemName = itemMap.get(med.itemId) || 'Unknown';
          const laneIndex = itemIndices.get(med.itemId) || 0;
          const medTime = new Date(med.timestamp).getTime();
          const endTime = med.endTimestamp ? new Date(med.endTimestamp).getTime() : null;
          const isInfusion = med.type === 'infusion' && endTime;

          if (isInfusion && endTime) {
            series.push({
              type: 'custom',
              xAxisIndex: gridIndex,
              yAxisIndex: yAxisIndex,
              data: [[medTime, laneIndex]],
              renderItem: (params: any, api: any) => {
                const startX = api.coord([medTime, 0])[0];
                const endX = api.coord([endTime, 0])[0];
                const y = currentTop + (laneIndex * laneHeight) + laneHeight / 2;
                
                return {
                  type: 'group',
                  children: [
                    {
                      type: 'rect',
                      shape: {
                        x: startX,
                        y: y - 8,
                        width: Math.max(endX - startX, 4),
                        height: 16,
                        r: 3,
                      },
                      style: {
                        fill: COLORS.infusion,
                        opacity: 0.7,
                      },
                    },
                    {
                      type: 'text',
                      x: startX + 4,
                      y: y + 3,
                      style: {
                        text: `${itemName} ${med.rate || ''}`,
                        fill: '#fff',
                        fontSize: 9,
                        fontWeight: 'bold',
                      },
                    },
                  ],
                };
              },
              z: 50,
            });
          } else {
            series.push({
              type: 'custom',
              xAxisIndex: gridIndex,
              yAxisIndex: yAxisIndex,
              data: [[medTime, laneIndex]],
              renderItem: (params: any, api: any) => {
                const x = api.coord([medTime, 0])[0];
                const y = currentTop + (laneIndex * laneHeight) + laneHeight / 2;
                
                return {
                  type: 'group',
                  children: [
                    {
                      type: 'rect',
                      shape: {
                        x: x - 2,
                        y: y - 10,
                        width: 4,
                        height: 20,
                        r: 2,
                      },
                      style: {
                        fill: COLORS.medication,
                      },
                    },
                    {
                      type: 'text',
                      x: x + 6,
                      y: y + 3,
                      style: {
                        text: `${itemName} ${med.dose}${med.unit || ''}`,
                        fill: '#374151',
                        fontSize: 9,
                      },
                    },
                  ],
                };
              },
              z: 50,
            });
          }
        });

        uniqueItems.forEach((itemId, idx) => {
          const itemName = itemMap.get(itemId) || 'Unknown';
          series.push({
            type: 'custom',
            data: [[paddedMin, 0]],
            renderItem: () => ({
              type: 'text',
              x: 10,
              y: currentTop + (idx * laneHeight) + laneHeight / 2 + 3,
              style: {
                text: itemName.length > 25 ? itemName.substring(0, 22) + '...' : itemName,
                fill: '#374151',
                fontSize: 9,
                fontWeight: 'bold',
              },
            }),
            z: 100,
          });
        });

        yAxisIndex++;
        gridIndex++;
        currentTop += SWIMLANE_HEIGHTS.medications + 20;
      }

      if (hasEvents) {
        grids.push({
          left: gridLeft,
          right: gridRight,
          top: currentTop,
          height: SWIMLANE_HEIGHTS.events,
        });

        xAxes.push({
          type: 'time',
          gridIndex: gridIndex,
          min: paddedMin,
          max: paddedMax,
          axisLabel: { show: false },
          axisTick: { show: false },
          axisLine: { show: false },
          splitLine: { show: true, lineStyle: { color: '#e5e7eb', type: 'dashed' } },
        });

        yAxes.push({
          type: 'value',
          gridIndex: gridIndex,
          name: 'Events',
          nameLocation: 'middle',
          nameGap: 80,
          min: 0,
          max: 1,
          axisLabel: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        });

        events.forEach((event) => {
          const eventTime = new Date(event.timestamp).getTime();
          series.push({
            type: 'custom',
            xAxisIndex: gridIndex,
            yAxisIndex: yAxisIndex,
            data: [[eventTime, 0.5]],
            renderItem: (params: any, api: any) => {
              const x = api.coord([eventTime, 0.5])[0];
              const y = currentTop + SWIMLANE_HEIGHTS.events / 2;
              
              return {
                type: 'group',
                children: [
                  {
                    type: 'circle',
                    shape: { cx: x, cy: y, r: 6 },
                    style: { fill: COLORS.event },
                  },
                  {
                    type: 'text',
                    x: x + 10,
                    y: y + 3,
                    style: {
                      text: event.description.length > 30 ? event.description.substring(0, 27) + '...' : event.description,
                      fill: '#374151',
                      fontSize: 9,
                    },
                  },
                ],
              };
            },
            z: 50,
          });
        });

        yAxisIndex++;
        gridIndex++;
        currentTop += SWIMLANE_HEIGHTS.events + 20;
      }

      if (hasStaff) {
        grids.push({
          left: gridLeft,
          right: gridRight,
          top: currentTop,
          height: SWIMLANE_HEIGHTS.staff,
        });

        xAxes.push({
          type: 'time',
          gridIndex: gridIndex,
          min: paddedMin,
          max: paddedMax,
          axisLabel: { show: false },
          axisTick: { show: false },
          axisLine: { show: false },
          splitLine: { show: true, lineStyle: { color: '#e5e7eb', type: 'dashed' } },
        });

        yAxes.push({
          type: 'category',
          gridIndex: gridIndex,
          name: 'Staff',
          nameLocation: 'middle',
          nameGap: 80,
          data: ['Doctor', 'Nurse', 'Assistant'],
          axisLabel: { fontSize: 9 },
          axisTick: { show: false },
        });

        const roleMap: Record<string, number> = { doctor: 0, nurse: 1, assistant: 2 };

        staffMembers.forEach((staff) => {
          const staffTime = new Date(staff.timestamp).getTime();
          const roleIndex = roleMap[staff.role] ?? 0;
          
          series.push({
            type: 'custom',
            xAxisIndex: gridIndex,
            yAxisIndex: yAxisIndex,
            data: [[staffTime, roleIndex]],
            renderItem: (params: any, api: any) => {
              const x = api.coord([staffTime, roleIndex])[0];
              const y = api.coord([staffTime, roleIndex])[1];
              
              return {
                type: 'group',
                children: [
                  {
                    type: 'rect',
                    shape: { x: x - 2, y: y - 8, width: 4, height: 16, r: 2 },
                    style: { fill: COLORS.staff },
                  },
                  {
                    type: 'text',
                    x: x + 8,
                    y: y + 3,
                    style: {
                      text: staff.name,
                      fill: '#374151',
                      fontSize: 9,
                    },
                  },
                ],
              };
            },
            z: 50,
          });
        });

        yAxisIndex++;
        gridIndex++;
        currentTop += SWIMLANE_HEIGHTS.staff + 20;
      }

      if (hasPositions) {
        grids.push({
          left: gridLeft,
          right: gridRight,
          top: currentTop,
          height: SWIMLANE_HEIGHTS.positions,
        });

        xAxes.push({
          type: 'time',
          gridIndex: gridIndex,
          min: paddedMin,
          max: paddedMax,
          axisLabel: { 
            show: true, 
            formatter: formatTimeLabel,
            fontSize: 10,
          },
          axisTick: { show: true },
          axisLine: { show: true },
          splitLine: { show: true, lineStyle: { color: '#e5e7eb', type: 'dashed' } },
        });

        yAxes.push({
          type: 'value',
          gridIndex: gridIndex,
          name: 'Position',
          nameLocation: 'middle',
          nameGap: 80,
          min: 0,
          max: 1,
          axisLabel: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        });

        const sortedPositions = [...positions].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        sortedPositions.forEach((pos, idx) => {
          const posTime = new Date(pos.timestamp).getTime();
          const nextTime = idx < sortedPositions.length - 1 
            ? new Date(sortedPositions[idx + 1].timestamp).getTime() 
            : paddedMax;
          
          series.push({
            type: 'custom',
            xAxisIndex: gridIndex,
            yAxisIndex: yAxisIndex,
            data: [[posTime, 0.5]],
            renderItem: (params: any, api: any) => {
              const startX = api.coord([posTime, 0.5])[0];
              const endX = api.coord([nextTime, 0.5])[0];
              const y = currentTop + SWIMLANE_HEIGHTS.positions / 2;
              
              return {
                type: 'group',
                children: [
                  {
                    type: 'rect',
                    shape: {
                      x: startX,
                      y: y - 10,
                      width: Math.max(endX - startX - 2, 4),
                      height: 20,
                      r: 3,
                    },
                    style: {
                      fill: COLORS.position,
                      opacity: 0.6,
                    },
                  },
                  {
                    type: 'text',
                    x: startX + 5,
                    y: y + 4,
                    style: {
                      text: pos.position,
                      fill: '#000',
                      fontSize: 10,
                      fontWeight: 'bold',
                    },
                  },
                ],
              };
            },
            z: 50,
          });
        });

        currentTop += SWIMLANE_HEIGHTS.positions + 20;
      }

      // Ventilation parameters swimlane - numeric text display (like in the app)
      if (hasVentilation) {
        // Define ventilation parameters to display
        const ventParams = [
          { key: 'etco2', label: 'etCO2', data: normalizeDataPoints(ventilation.etco2), color: '#6366f1' },
          { key: 'pip', label: 'P insp', data: normalizeDataPoints(ventilation.pip), color: '#22c55e' },
          { key: 'peep', label: 'PEEP', data: normalizeDataPoints(ventilation.peep), color: '#3b82f6' },
          { key: 'tidalVolume', label: 'TV', data: normalizeDataPoints(ventilation.tidalVolume), color: '#8b5cf6' },
          { key: 'respiratoryRate', label: 'RR', data: normalizeDataPoints(ventilation.respiratoryRate), color: '#ec4899' },
          { key: 'fio2', label: 'FiO2', data: normalizeDataPoints(ventilation.fio2), color: '#f59e0b' },
        ].filter(p => p.data.length > 0);
        
        const ventRowHeight = 20;
        const ventTotalHeight = ventParams.length * ventRowHeight;
        
        // Create a grid for each ventilation parameter row
        ventParams.forEach((param, idx) => {
          grids.push({
            left: gridLeft,
            right: gridRight,
            top: currentTop + (idx * ventRowHeight),
            height: ventRowHeight,
          });

          xAxes.push({
            type: 'time',
            gridIndex: gridIndex + idx,
            min: paddedMin,
            max: paddedMax,
            axisLabel: { show: idx === ventParams.length - 1, formatter: formatTimeLabel, fontSize: 9 },
            axisTick: { show: idx === ventParams.length - 1 },
            axisLine: { show: idx === ventParams.length - 1 },
            splitLine: { show: true, lineStyle: { color: '#f3f4f6', type: 'dashed' } },
          });

          yAxes.push({
            type: 'category',
            gridIndex: gridIndex + idx,
            data: [param.label],
            axisLabel: { fontSize: 10, fontWeight: 'bold', color: param.color },
            axisTick: { show: false },
            axisLine: { show: false },
          });

          // Create value map for this parameter
          const valuesMap = new Map(param.data.map(([time, val]) => [time, val]));
          
          // Add scatter series with text labels for numeric values
          series.push({
            type: 'scatter',
            name: param.label,
            xAxisIndex: gridIndex + idx,
            yAxisIndex: yAxisIndex + idx,
            data: param.data.map(([time]) => [time, param.label]),
            symbol: 'none',
            label: {
              show: true,
              formatter: (params: any) => {
                const timestamp = params.value[0];
                return valuesMap.get(timestamp)?.toString() || '';
              },
              fontSize: 11,
              fontWeight: '600',
              fontFamily: 'monospace',
              color: param.color,
            },
            z: 20,
          });
        });

        yAxisIndex += ventParams.length;
        gridIndex += ventParams.length;
        currentTop += ventTotalHeight + 20;
      }

      // BIS swimlane (Bispectral Index - depth of anesthesia)
      if (hasBIS) {
        grids.push({
          left: gridLeft,
          right: gridRight,
          top: currentTop,
          height: SWIMLANE_HEIGHTS.bis,
        });

        xAxes.push({
          type: 'time',
          gridIndex: gridIndex,
          min: paddedMin,
          max: paddedMax,
          axisLabel: { show: false },
          axisTick: { show: false },
          axisLine: { show: false },
          splitLine: { show: true, lineStyle: { color: '#e5e7eb', type: 'dashed' } },
        });

        yAxes.push({
          type: 'value',
          gridIndex: gridIndex,
          name: 'BIS',
          nameLocation: 'middle',
          nameGap: 80,
          min: 0,
          max: 100,
          axisLabel: { fontSize: 9 },
          axisTick: { show: false },
        });

        const bisData = normalizeDataPoints(bis);
        series.push({
          type: 'line',
          name: 'BIS',
          xAxisIndex: gridIndex,
          yAxisIndex: yAxisIndex,
          data: bisData,
          lineStyle: { color: COLORS.bis, width: 2 },
          areaStyle: { color: COLORS.bis, opacity: 0.2 },
          symbol: 'circle',
          symbolSize: 4,
          itemStyle: { color: COLORS.bis },
          z: 20,
        });

        yAxisIndex++;
        gridIndex++;
        currentTop += SWIMLANE_HEIGHTS.bis + 20;
      }

      // TOF swimlane (Train of Four - neuromuscular blockade)
      if (hasTOF) {
        grids.push({
          left: gridLeft,
          right: gridRight,
          top: currentTop,
          height: SWIMLANE_HEIGHTS.tof,
        });

        xAxes.push({
          type: 'time',
          gridIndex: gridIndex,
          min: paddedMin,
          max: paddedMax,
          axisLabel: { 
            show: true, 
            formatter: formatTimeLabel,
            fontSize: 10,
          },
          axisTick: { show: true },
          axisLine: { show: true },
          splitLine: { show: true, lineStyle: { color: '#e5e7eb', type: 'dashed' } },
        });

        yAxes.push({
          type: 'value',
          gridIndex: gridIndex,
          name: 'TOF',
          nameLocation: 'middle',
          nameGap: 80,
          min: 0,
          max: 4,
          axisLabel: { fontSize: 9 },
          axisTick: { show: false },
        });

        const tofData = normalizeDataPoints(tof);
        series.push({
          type: 'line',
          name: 'TOF',
          xAxisIndex: gridIndex,
          yAxisIndex: yAxisIndex,
          data: tofData,
          lineStyle: { color: COLORS.tof, width: 2, type: 'solid' },
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: COLORS.tof },
          z: 20,
        });

        currentTop += SWIMLANE_HEIGHTS.tof + 20;
      }

      const totalHeight = currentTop + 40;

      return {
        animation: false,
        backgroundColor: '#ffffff',
        title: {
          text: 'Anesthesia Timeline',
          left: 'center',
          top: 10,
          textStyle: {
            fontSize: 16,
            fontWeight: 'bold',
            color: '#1f2937',
          },
        },
        grid: grids,
        xAxis: xAxes,
        yAxis: yAxes,
        series,
      };
    }, [chartData]);

    if (!isExporting || !chartData) {
      return null;
    }

    const { startTime, endTime, medications, events, staffMembers, positions, ventilation, bis, tof } = chartData;
    const hasMedications = medications && medications.length > 0;
    const hasEvents = events && events.length > 0;
    const hasStaff = staffMembers && staffMembers.length > 0;
    const hasPositions = positions && positions.length > 0;
    
    // Count ventilation parameters that have data
    const ventParamsWithData = ventilation ? [
      (ventilation.etco2?.length || 0) > 0,
      (ventilation.pip?.length || 0) > 0,
      (ventilation.peep?.length || 0) > 0,
      (ventilation.tidalVolume?.length || 0) > 0,
      (ventilation.respiratoryRate?.length || 0) > 0,
      (ventilation.fio2?.length || 0) > 0,
    ].filter(Boolean).length : 0;
    const hasVentilation = ventParamsWithData > 0;
    
    const hasBIS = bis && bis.length > 0;
    const hasTOF = tof && tof.length > 0;

    let totalHeight = SWIMLANE_HEIGHTS.vitals + 100;
    if (hasMedications) totalHeight += SWIMLANE_HEIGHTS.medications + 20;
    if (hasEvents) totalHeight += SWIMLANE_HEIGHTS.events + 20;
    if (hasStaff) totalHeight += SWIMLANE_HEIGHTS.staff + 20;
    if (hasPositions) totalHeight += SWIMLANE_HEIGHTS.positions + 20;
    if (hasVentilation) totalHeight += (ventParamsWithData * 20) + 20;
    if (hasBIS) totalHeight += SWIMLANE_HEIGHTS.bis + 20;
    if (hasTOF) totalHeight += SWIMLANE_HEIGHTS.tof + 40;

    const option = buildChartOption();

    return (
      <div
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '-9999px',
          width: '1400px',
          height: `${totalHeight}px`,
          backgroundColor: '#ffffff',
          zIndex: -1000,
          overflow: 'hidden',
        }}
      >
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ width: '100%', height: '100%' }}
          onChartReady={handleChartReady}
          opts={{ renderer: 'canvas' }}
        />
      </div>
    );
  }
);

export default HiddenFullTimelineExporter;
