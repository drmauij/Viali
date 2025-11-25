import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from "react";
import ReactECharts from "echarts-for-react";

export interface HiddenChartExporterRef {
  exportChart: (snapshotData: any) => Promise<string | null>;
}

interface Props {
  onReady?: () => void;
}

export const HiddenChartExporter = forwardRef<HiddenChartExporterRef, Props>(
  function HiddenChartExporter({ onReady }, ref) {
    const chartRef = useRef<any>(null);
    const [chartData, setChartData] = useState<any>(null);
    const [isExporting, setIsExporting] = useState(false);
    const resolveRef = useRef<((value: string | null) => void) | null>(null);

    useEffect(() => {
      console.log("[HIDDEN-CHART] Component mounted");
      onReady?.();
    }, [onReady]);

    const captureChart = useCallback(() => {
      console.log("[HIDDEN-CHART] Attempting to capture chart...");
      
      if (!chartRef.current) {
        console.warn("[HIDDEN-CHART] Chart ref not available");
        resolveRef.current?.(null);
        setIsExporting(false);
        setChartData(null);
        return;
      }

      try {
        const chartInstance = chartRef.current.getEchartsInstance();
        if (!chartInstance) {
          console.warn("[HIDDEN-CHART] Chart instance not available");
          resolveRef.current?.(null);
          setIsExporting(false);
          setChartData(null);
          return;
        }

        const dataUrl = chartInstance.getDataURL({
          type: "png",
          pixelRatio: 2,
          backgroundColor: "#ffffff",
        });

        console.log("[HIDDEN-CHART] Chart exported successfully, dataUrl length:", dataUrl?.length);
        resolveRef.current?.(dataUrl);
        setIsExporting(false);
        setChartData(null);
      } catch (error) {
        console.error("[HIDDEN-CHART] Export failed:", error);
        resolveRef.current?.(null);
        setIsExporting(false);
        setChartData(null);
      }
    }, []);

    const handleChartReady = useCallback(() => {
      console.log("[HIDDEN-CHART] Chart ready event fired, isExporting:", isExporting);
      
      if (!isExporting) return;

      setTimeout(() => {
        captureChart();
      }, 500);
    }, [isExporting, captureChart]);

    useImperativeHandle(ref, () => ({
      exportChart: async (snapshotData: any): Promise<string | null> => {
        console.log("[HIDDEN-CHART] exportChart called with data:", !!snapshotData);
        
        return new Promise((resolve) => {
          if (!snapshotData) {
            console.warn("[HIDDEN-CHART] No snapshot data provided");
            resolve(null);
            return;
          }

          resolveRef.current = resolve;
          setChartData(snapshotData);
          setIsExporting(true);
        });
      },
    }), []);

    const buildChartOption = useCallback(() => {
      if (!chartData) return {};

      const hrData = (chartData.hr || []).map((p: any) => [
        new Date(p.timestamp).getTime(),
        p.value,
      ]);
      const bpData = (chartData.bp || []).map((p: any) => ({
        time: new Date(p.timestamp).getTime(),
        sys: p.sys,
        dia: p.dia,
      }));
      const spo2Data = (chartData.spo2 || []).map((p: any) => [
        new Date(p.timestamp).getTime(),
        p.value,
      ]);
      const tempData = (chartData.temp || []).map((p: any) => [
        new Date(p.timestamp).getTime(),
        p.value,
      ]);

      const allTimes = [
        ...hrData.map((d: any) => d[0]),
        ...bpData.map((d: any) => d.time),
        ...spo2Data.map((d: any) => d[0]),
        ...tempData.map((d: any) => d[0]),
      ].filter(Boolean);

      const minTime = allTimes.length > 0 ? Math.min(...allTimes) : Date.now();
      const maxTime = allTimes.length > 0 ? Math.max(...allTimes) : Date.now();

      const textColor = "#374151";
      const gridColor = "#e5e7eb";

      return {
        backgroundColor: "#ffffff",
        title: {
          text: "Vital Signs Timeline",
          left: "center",
          textStyle: { color: textColor, fontSize: 16, fontWeight: "bold" },
        },
        tooltip: { trigger: "axis" },
        legend: {
          data: ["HR (bpm)", "BP Sys", "BP Dia", "SpO2 (%)", "Temp (°C)"],
          bottom: 10,
          textStyle: { color: textColor, fontSize: 11 },
        },
        grid: {
          left: 70,
          right: 50,
          top: 60,
          bottom: 80,
        },
        xAxis: {
          type: "time",
          min: minTime,
          max: maxTime,
          axisLabel: {
            formatter: (value: number) => {
              const date = new Date(value);
              return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
            },
            color: textColor,
            fontSize: 11,
          },
          axisLine: { lineStyle: { color: gridColor } },
          splitLine: { show: true, lineStyle: { color: gridColor } },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: textColor, fontSize: 11 },
          axisLine: { lineStyle: { color: gridColor } },
          splitLine: { lineStyle: { color: gridColor } },
        },
        series: [
          {
            name: "HR (bpm)",
            type: "line",
            data: hrData,
            symbol: "circle",
            symbolSize: 8,
            lineStyle: { color: "#3b82f6", width: 2 },
            itemStyle: { color: "#3b82f6" },
          },
          {
            name: "BP Sys",
            type: "line",
            data: bpData.map((d: any) => [d.time, d.sys]),
            symbol: "triangle",
            symbolSize: 8,
            lineStyle: { color: "#dc2626", width: 2 },
            itemStyle: { color: "#dc2626" },
          },
          {
            name: "BP Dia",
            type: "line",
            data: bpData.map((d: any) => [d.time, d.dia]),
            symbol: "triangle",
            symbolSize: 8,
            lineStyle: { color: "#ef4444", width: 2 },
            itemStyle: { color: "#ef4444" },
          },
          {
            name: "SpO2 (%)",
            type: "line",
            data: spo2Data,
            symbol: "diamond",
            symbolSize: 8,
            lineStyle: { color: "#22c55e", width: 2 },
            itemStyle: { color: "#22c55e" },
          },
          {
            name: "Temp (°C)",
            type: "line",
            data: tempData,
            symbol: "rect",
            symbolSize: 8,
            lineStyle: { color: "#f97316", width: 2 },
            itemStyle: { color: "#f97316" },
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
          width: "1400px",
          height: "700px",
          visibility: "hidden",
          pointerEvents: "none",
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
