import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import { VITAL_ICON_PATHS } from "@/lib/vitalIconPaths";

export interface HiddenChartExporterRef {
  exportChart: (snapshotData: any) => Promise<string | null>;
}

interface Props {
  onReady?: () => void;
}

const EMPTY_DATA_URL_PREFIX = "data:image/png;base64,";

type VitalPoint = [number, number];

function createPdfIconSeries(
  name: string,
  data: VitalPoint[],
  iconPath: string,
  color: string,
  yAxisIndex: number,
  size: number = 20,
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
              shape: { r: 10 * scale },
              style: {
                fill: 'none',
                stroke: color,
                lineWidth: 3,
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
                lineWidth: 2,
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
          lineWidth: 3,
        },
        scaleX: scale,
        scaleY: scale,
      };
    },
  };
}

export const HiddenChartExporter = forwardRef<HiddenChartExporterRef, Props>(
  function HiddenChartExporter({ onReady }, ref) {
    const chartRef = useRef<any>(null);
    const [chartData, setChartData] = useState<any>(null);
    const [isExporting, setIsExporting] = useState(false);
    const resolveRef = useRef<((value: string | null) => void) | null>(null);
    const retryCountRef = useRef(0);
    const maxRetries = 5;

    useEffect(() => {
      console.log("[HIDDEN-CHART] Component mounted");
      onReady?.();
    }, [onReady]);

    const captureChart = useCallback(() => {
      console.log("[HIDDEN-CHART] Attempting to capture chart, retry:", retryCountRef.current);
      
      if (!chartRef.current) {
        console.warn("[HIDDEN-CHART] Chart ref not available");
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
          console.warn("[HIDDEN-CHART] Chart instance not available");
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
          console.warn("[HIDDEN-CHART] Chart export returned empty/invalid dataUrl, retrying...");
          if (retryCountRef.current < maxRetries) {
            retryCountRef.current++;
            setTimeout(() => captureChart(), 300);
            return;
          }
          console.error("[HIDDEN-CHART] Failed to get valid chart data after retries");
          resolveRef.current?.(null);
          setIsExporting(false);
          setChartData(null);
          retryCountRef.current = 0;
          return;
        }

        console.log("[HIDDEN-CHART] Chart exported successfully, dataUrl length:", dataUrl?.length);
        resolveRef.current?.(dataUrl);
        setIsExporting(false);
        setChartData(null);
        retryCountRef.current = 0;
      } catch (error) {
        console.error("[HIDDEN-CHART] Export failed:", error);
        resolveRef.current?.(null);
        setIsExporting(false);
        setChartData(null);
        retryCountRef.current = 0;
      }
    }, []);

    const handleChartReady = useCallback(() => {
      console.log("[HIDDEN-CHART] Chart ready event fired, isExporting:", isExporting);
      
      if (!isExporting) return;

      setTimeout(() => {
        captureChart();
      }, 800);
    }, [isExporting, captureChart]);

    useImperativeHandle(ref, () => ({
      exportChart: async (snapshotData: any): Promise<string | null> => {
        console.log("[HIDDEN-CHART] exportChart called");
        
        const data = snapshotData?.data || snapshotData;
        
        console.log("[HIDDEN-CHART] Data structure check:", {
          hasSnapshotData: !!snapshotData,
          hasNestedData: !!snapshotData?.data,
          hrCount: (data?.hr || []).length,
          bpCount: (data?.bp || []).length,
          spo2Count: (data?.spo2 || []).length,
          tempCount: (data?.temp || []).length,
        });
        
        return new Promise((resolve) => {
          if (!snapshotData) {
            console.warn("[HIDDEN-CHART] No snapshot data provided");
            resolve(null);
            return;
          }
          
          const hasData = 
            (data?.hr?.length > 0) ||
            (data?.bp?.length > 0) ||
            (data?.spo2?.length > 0) ||
            (data?.temp?.length > 0);
            
          if (!hasData) {
            console.warn("[HIDDEN-CHART] No vital signs data found in snapshot");
            resolve(null);
            return;
          }

          retryCountRef.current = 0;
          resolveRef.current = resolve;
          setChartData(snapshotData);
          setIsExporting(true);
        });
      },
    }), []);

    const buildChartOption = useCallback(() => {
      if (!chartData) return {};

      const snapshotData = chartData.data || chartData;

      console.log("[HIDDEN-CHART] Building chart option with data:", {
        hrCount: (snapshotData.hr || []).length,
        bpCount: (snapshotData.bp || []).length,
        spo2Count: (snapshotData.spo2 || []).length,
        tempCount: (snapshotData.temp || []).length,
      });

      const hrData: VitalPoint[] = (snapshotData.hr || [])
        .map((p: any) => [new Date(p.timestamp).getTime(), p.value] as VitalPoint)
        .sort((a: VitalPoint, b: VitalPoint) => a[0] - b[0]);
      
      const bpRaw = (snapshotData.bp || []).map((p: any) => ({
        time: new Date(p.timestamp).getTime(),
        sys: p.sys,
        dia: p.dia,
      })).sort((a: any, b: any) => a.time - b.time);
      
      const sysData: VitalPoint[] = bpRaw.map((d: any) => [d.time, d.sys] as VitalPoint);
      const diaData: VitalPoint[] = bpRaw.map((d: any) => [d.time, d.dia] as VitalPoint);
      
      const spo2Data: VitalPoint[] = (snapshotData.spo2 || [])
        .map((p: any) => [new Date(p.timestamp).getTime(), p.value] as VitalPoint)
        .sort((a: VitalPoint, b: VitalPoint) => a[0] - b[0]);

      const allTimes = [
        ...hrData.map((d) => d[0]),
        ...sysData.map((d) => d[0]),
        ...spo2Data.map((d) => d[0]),
      ].filter(Boolean);

      if (allTimes.length === 0) {
        console.warn("[HIDDEN-CHART] No valid timestamps found in data");
        return {};
      }

      const minTime = Math.min(...allTimes);
      const maxTime = Math.max(...allTimes);
      const timeRange = maxTime - minTime;
      const paddedMin = minTime - timeRange * 0.02;
      const paddedMax = maxTime + timeRange * 0.02;

      console.log("[HIDDEN-CHART] Time range:", {
        minTime: new Date(minTime).toISOString(),
        maxTime: new Date(maxTime).toISOString(),
        rangeMinutes: Math.round(timeRange / 60000),
      });

      const colors = {
        hr: "#ef4444",
        bp: "#000000",
        spo2: "#8b5cf6",
      };
      
      const textColor = "#1f2937";
      const gridColor = "#e5e7eb";

      const series: any[] = [];

      if (hrData.length > 0) {
        series.push({
          type: 'line',
          name: 'HR',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: hrData,
          lineStyle: { color: colors.hr, width: 2.5 },
          symbol: 'none',
          z: 15,
        });

        series.push(
          createPdfIconSeries(
            'Heart Rate',
            hrData,
            VITAL_ICON_PATHS.heart.path,
            colors.hr,
            0,
            20,
            100
          )
        );
      }

      if (sysData.length > 0 && diaData.length > 0) {
        series.push({
          type: 'line',
          name: 'Diastolic Base',
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
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0, 0, 0, 0.12)' },
                { offset: 1, color: 'rgba(0, 0, 0, 0.06)' }
              ]
            }
          },
          z: 8,
        });
      }

      if (sysData.length > 0) {
        series.push(
          createPdfIconSeries(
            'Systolic BP',
            sysData,
            VITAL_ICON_PATHS.chevronDown.path,
            colors.bp,
            0,
            20,
            30
          )
        );
      }

      if (diaData.length > 0) {
        series.push(
          createPdfIconSeries(
            'Diastolic BP',
            diaData,
            VITAL_ICON_PATHS.chevronUp.path,
            colors.bp,
            0,
            20,
            30
          )
        );
      }

      if (spo2Data.length > 0) {
        series.push({
          type: 'line',
          name: 'SpO2',
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: spo2Data,
          symbol: 'none',
          lineStyle: { color: colors.spo2, width: 2 },
          z: 9,
        });

        series.push(
          createPdfIconSeries(
            'SpO2 Points',
            spo2Data,
            '',
            colors.spo2,
            1,
            18,
            30,
            true
          )
        );
      }

      const leftAxisValues = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220];
      const rightAxisValues = [50, 60, 70, 80, 90, 100];

      const yAxisLabels: any[] = [];
      
      leftAxisValues.forEach((val) => {
        const yPercent = ((240 - val) / 240) * 100;
        yAxisLabels.push({
          type: "text",
          left: 55,
          top: `${14 + (yPercent / 100) * 72}%`,
          style: {
            text: val.toString(),
            fontSize: 14,
            fontFamily: "Arial, sans-serif",
            fill: textColor,
            textAlign: "right",
          },
          silent: true,
          z: 100,
        });
      });

      rightAxisValues.forEach((val) => {
        const yPercent = ((105 - val) / 60) * 100;
        yAxisLabels.push({
          type: "text",
          right: 55,
          top: `${14 + (yPercent / 100) * 72}%`,
          style: {
            text: val.toString(),
            fontSize: 14,
            fontFamily: "Arial, sans-serif",
            fill: colors.spo2,
            textAlign: "left",
          },
          silent: true,
          z: 100,
        });
      });

      return {
        backgroundColor: "#ffffff",
        animation: false,
        title: {
          text: "Vital Signs Timeline",
          left: "center",
          top: 15,
          textStyle: { 
            color: textColor, 
            fontSize: 28, 
            fontWeight: "bold",
            fontFamily: "Arial, sans-serif",
          },
        },
        tooltip: { 
          trigger: "axis",
          axisPointer: { type: "cross" },
        },
        legend: {
          data: [
            { name: 'HR', icon: 'path://' + VITAL_ICON_PATHS.heart.path, itemStyle: { color: colors.hr } },
            { name: 'Systolic BP', icon: 'path://' + VITAL_ICON_PATHS.chevronDown.path, itemStyle: { color: colors.bp } },
            { name: 'Diastolic BP', icon: 'path://' + VITAL_ICON_PATHS.chevronUp.path, itemStyle: { color: colors.bp } },
            { name: 'SpO2', icon: 'circle', itemStyle: { color: colors.spo2 } },
          ],
          bottom: 25,
          textStyle: { 
            color: textColor, 
            fontSize: 16,
            fontFamily: "Arial, sans-serif",
          },
          itemGap: 40,
          itemWidth: 24,
          itemHeight: 16,
        },
        grid: {
          left: 80,
          right: 80,
          top: 80,
          bottom: 100,
          containLabel: false,
        },
        graphic: yAxisLabels,
        xAxis: {
          type: "time",
          min: paddedMin,
          max: paddedMax,
          axisLabel: {
            formatter: (value: number) => {
              const date = new Date(value);
              return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
            },
            color: textColor,
            fontSize: 16,
            fontFamily: "Arial, sans-serif",
            rotate: 0,
          },
          axisLine: { 
            show: true,
            lineStyle: { color: "#9ca3af", width: 2 } 
          },
          axisTick: { show: true },
          splitLine: { 
            show: true, 
            lineStyle: { color: gridColor, type: "dashed" } 
          },
          name: "Time",
          nameLocation: "middle",
          nameGap: 45,
          nameTextStyle: {
            color: textColor,
            fontSize: 16,
            fontWeight: "bold",
            fontFamily: "Arial, sans-serif",
          },
        },
        yAxis: [
          {
            type: "value",
            name: "BP / HR",
            nameLocation: "middle",
            nameGap: 50,
            nameTextStyle: {
              color: textColor,
              fontSize: 16,
              fontWeight: "bold",
              fontFamily: "Arial, sans-serif",
            },
            min: 0,
            max: 240,
            interval: 20,
            axisLabel: { show: false },
            axisLine: { 
              show: true,
              lineStyle: { color: "#9ca3af", width: 2 } 
            },
            splitLine: { 
              show: true,
              lineStyle: { color: gridColor, type: "dashed" } 
            },
          },
          {
            type: "value",
            name: "SpO₂ %",
            nameLocation: "middle",
            nameGap: 50,
            nameTextStyle: {
              color: colors.spo2,
              fontSize: 16,
              fontWeight: "bold",
              fontFamily: "Arial, sans-serif",
            },
            min: 45,
            max: 105,
            interval: 10,
            axisLabel: { show: false },
            axisLine: { 
              show: true,
              lineStyle: { color: colors.spo2, width: 2 } 
            },
            splitLine: { show: false },
          },
        ],
        series,
      };
    }, [chartData]);

    return (
      <div
        style={{
          position: "fixed",
          left: "-9999px",
          top: "-9999px",
          width: "1800px",
          height: "900px",
          visibility: "hidden",
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {isExporting && chartData && (
          <ReactECharts
            ref={chartRef}
            option={buildChartOption()}
            style={{ width: "100%", height: "100%" }}
            onChartReady={handleChartReady}
            opts={{ renderer: "canvas" }}
          />
        )}
      </div>
    );
  }
);
