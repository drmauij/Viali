import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from "react";
import ReactECharts from "echarts-for-react";

export interface HiddenChartExporterRef {
  exportChart: (snapshotData: any) => Promise<string | null>;
}

interface Props {
  onReady?: () => void;
}

const EMPTY_DATA_URL_PREFIX = "data:image/png;base64,";

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
          pixelRatio: 3, // Higher resolution for better print quality
          backgroundColor: "#ffffff",
        });

        // Validate the data URL is not empty (just the prefix)
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

      // Wait longer for the chart to fully render
      setTimeout(() => {
        captureChart();
      }, 800);
    }, [isExporting, captureChart]);

    useImperativeHandle(ref, () => ({
      exportChart: async (snapshotData: any): Promise<string | null> => {
        console.log("[HIDDEN-CHART] exportChart called");
        
        // Extract the nested data structure
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
          
          // Check if there's actually data to display
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

      // Clinical snapshot data is nested inside .data property
      const snapshotData = chartData.data || chartData;

      console.log("[HIDDEN-CHART] Building chart option with data:", {
        hrCount: (snapshotData.hr || []).length,
        bpCount: (snapshotData.bp || []).length,
        spo2Count: (snapshotData.spo2 || []).length,
        tempCount: (snapshotData.temp || []).length,
      });

      const hrData = (snapshotData.hr || []).map((p: any) => [
        new Date(p.timestamp).getTime(),
        p.value,
      ]);
      const bpData = (snapshotData.bp || []).map((p: any) => ({
        time: new Date(p.timestamp).getTime(),
        sys: p.sys,
        dia: p.dia,
      }));
      const spo2Data = (snapshotData.spo2 || []).map((p: any) => [
        new Date(p.timestamp).getTime(),
        p.value,
      ]);
      const tempData = (snapshotData.temp || []).map((p: any) => [
        new Date(p.timestamp).getTime(),
        p.value,
      ]);

      const allTimes = [
        ...hrData.map((d: any) => d[0]),
        ...bpData.map((d: any) => d.time),
        ...spo2Data.map((d: any) => d[0]),
        ...tempData.map((d: any) => d[0]),
      ].filter(Boolean);

      if (allTimes.length === 0) {
        console.warn("[HIDDEN-CHART] No valid timestamps found in data");
        return {};
      }

      const minTime = Math.min(...allTimes);
      const maxTime = Math.max(...allTimes);
      
      // Add 5% padding to time range
      const timeRange = maxTime - minTime;
      const paddedMin = minTime - timeRange * 0.02;
      const paddedMax = maxTime + timeRange * 0.02;

      console.log("[HIDDEN-CHART] Time range:", {
        minTime: new Date(minTime).toISOString(),
        maxTime: new Date(maxTime).toISOString(),
        rangeMinutes: Math.round(timeRange / 60000),
      });

      // Professional medical chart styling - matching app appearance
      const colors = {
        hr: "#3b82f6",      // Blue for heart rate
        bpSys: "#dc2626",   // Red for BP systolic
        bpDia: "#f87171",   // Light red for BP diastolic  
        spo2: "#22c55e",    // Green for SpO2
        temp: "#f97316",    // Orange for temperature
      };
      
      const textColor = "#1f2937";
      const gridColor = "#e5e7eb";

      return {
        backgroundColor: "#ffffff",
        animation: false, // Disable animation for faster capture
        title: {
          text: "Vital Signs Timeline",
          left: "center",
          top: 10,
          textStyle: { 
            color: textColor, 
            fontSize: 24, 
            fontWeight: "bold",
            fontFamily: "Arial, sans-serif",
          },
        },
        tooltip: { 
          trigger: "axis",
          axisPointer: { type: "cross" },
        },
        legend: {
          data: ["HR (bpm)", "BP Sys (mmHg)", "BP Dia (mmHg)", "SpO2 (%)", "Temp (°C)"],
          bottom: 20,
          textStyle: { 
            color: textColor, 
            fontSize: 14,
            fontFamily: "Arial, sans-serif",
          },
          itemGap: 30,
          icon: "roundRect",
        },
        grid: {
          left: 80,
          right: 60,
          top: 80,
          bottom: 100,
          containLabel: true,
        },
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
            fontSize: 14,
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
          nameGap: 40,
          nameTextStyle: {
            color: textColor,
            fontSize: 14,
            fontWeight: "bold",
          },
        },
        yAxis: {
          type: "value",
          axisLabel: { 
            color: textColor, 
            fontSize: 14,
            fontFamily: "Arial, sans-serif",
          },
          axisLine: { 
            show: true,
            lineStyle: { color: "#9ca3af", width: 2 } 
          },
          splitLine: { 
            lineStyle: { color: gridColor, type: "dashed" } 
          },
          name: "Value",
          nameLocation: "middle",
          nameGap: 50,
          nameTextStyle: {
            color: textColor,
            fontSize: 14,
            fontWeight: "bold",
          },
        },
        series: [
          {
            name: "HR (bpm)",
            type: "line",
            data: hrData,
            symbol: "circle",
            symbolSize: 10,
            lineStyle: { color: colors.hr, width: 3 },
            itemStyle: { color: colors.hr },
            emphasis: { focus: "series" },
          },
          {
            name: "BP Sys (mmHg)",
            type: "line",
            data: bpData.map((d: any) => [d.time, d.sys]),
            symbol: "triangle",
            symbolSize: 10,
            lineStyle: { color: colors.bpSys, width: 3 },
            itemStyle: { color: colors.bpSys },
            emphasis: { focus: "series" },
          },
          {
            name: "BP Dia (mmHg)",
            type: "line",
            data: bpData.map((d: any) => [d.time, d.dia]),
            symbol: "emptyTriangle",
            symbolSize: 10,
            lineStyle: { color: colors.bpDia, width: 2, type: "dashed" },
            itemStyle: { color: colors.bpDia },
            emphasis: { focus: "series" },
          },
          {
            name: "SpO2 (%)",
            type: "line",
            data: spo2Data,
            symbol: "diamond",
            symbolSize: 10,
            lineStyle: { color: colors.spo2, width: 3 },
            itemStyle: { color: colors.spo2 },
            emphasis: { focus: "series" },
          },
          {
            name: "Temp (°C)",
            type: "line",
            data: tempData,
            symbol: "rect",
            symbolSize: 10,
            lineStyle: { color: colors.temp, width: 3 },
            itemStyle: { color: colors.temp },
            emphasis: { focus: "series" },
          },
        ],
      };
    }, [chartData]);

    return (
      <div
        style={{
          position: "fixed",
          left: "-9999px",
          top: "-9999px",
          width: "1800px",  // Larger for better resolution
          height: "900px",
          visibility: "hidden",
          pointerEvents: "none",
          overflow: "hidden",
        }}
        data-testid="hidden-chart-exporter"
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
