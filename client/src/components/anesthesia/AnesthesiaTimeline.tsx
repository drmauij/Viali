import { useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Timeline } from "vis-timeline/standalone";
import { DataSet } from "vis-data/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";

/**
 * AnesthesiaTimeline
 *
 * A clean, zoomable anesthesia record timeline with:
 * - Vital signs lines (HR, MAP, SpO2, EtCO2, etc.) on a continuous time axis
 * - Shaded target bands (e.g., MAP 65–85)
 * - Event rows (drugs, ventilation, infusions) with icons & labels
 * - Infusion strips (continuous ranges) + bolus markers
 * - Shared zoom/pan between chart (ECharts) and events (vis-timeline)
 */

export type VitalPoint = [number, number]; // [timestamp(ms), value]

export type Vitals = {
  hr?: VitalPoint[];
  map?: VitalPoint[];
  spo2?: VitalPoint[];
  etco2?: VitalPoint[];
  rr?: VitalPoint[]; // respiratory rate
};

export type Band = { yMin: number; yMax: number; label?: string; axis: "left" | "right" };

export type EventItem = {
  id: string | number;
  start: number; // ms
  end?: number; // ms (for ranges like infusions)
  group: string; // e.g., "Drugs", "Ventilation", "Infusions"
  content: string; // text label
  icon?: string; // emoji or image URL
  dose?: string; // e.g., "50 µg", "5 mg/kg/h"
  color?: string; // optional pill/strip color
  className?: string;
};

export type AnesthesiaData = {
  tStart: number; // overall window
  tEnd: number;
  vitals: Vitals;
  bands?: Band[]; // target bands for y axes
  events: EventItem[]; // discrete + ranged
};

export function AnesthesiaTimeline({
  data,
  height = 520,
}: {
  data: AnesthesiaData;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const timelineRootRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<{ start: number; end: number }>({
    start: data.tStart,
    end: data.tEnd,
  });

  // Groups for the vis timeline (order defines vertical stacking)
  const groups = useMemo(
    () => [
      { id: "Drugs", content: "Medikamente" },
      { id: "Infusions", content: "Infusionen" },
      { id: "Ventilation", content: "Beatmung" },
      { id: "Events", content: "Ereignisse" },
    ],
    []
  );

  const items = useMemo(() => new DataSet<EventItem>(data.events), [data.events]);

  // ----- ECharts Option -----
  const option = useMemo(() => {
    const lrGrid = { left: 60, right: 60, top: 24, bottom: 120 };

    // helper to map vitals to series
    const mkLine = (
      name: string,
      pts?: VitalPoint[],
      yAxisIndex = 0,
      symbol: string | undefined = undefined
    ): echarts.SeriesOption | null =>
      !pts || pts.length === 0
        ? null
        : {
            name,
            type: "line",
            yAxisIndex,
            showSymbol: true,
            symbol: symbol ?? "circle",
            symbolSize: 8,
            smooth: true,
            lineStyle: { width: 2 },
            data: pts,
          } as echarts.SeriesOption;

    const series: echarts.SeriesOption[] = [];
    const hr = mkLine(
      "HR",
      data.vitals.hr,
      0,
      // heart shape path
      'path://M512 938L93 519a256 256 0 11362-362l57 57 57-57a256 256 0 01362 362L512 938z'
    );
    const map = mkLine("MAP", data.vitals.map, 1, "diamond");
    const spo2 = mkLine("SpO₂", data.vitals.spo2, 1, "triangle");
    const etco2 = mkLine("EtCO₂", data.vitals.etco2, 0, "rect");
    const rr = mkLine("RR", data.vitals.rr, 0, "roundRect");
    [hr, map, spo2, etco2, rr].forEach((s) => s && series.push(s));

    // markArea bands
    const markAreasLeft = (data.bands || [])
      .filter((b) => b.axis === "left")
      .map((b) => [{ yAxis: b.yMin, name: b.label || "" }, { yAxis: b.yMax }]);
    const markAreasRight = (data.bands || [])
      .filter((b) => b.axis === "right")
      .map((b) => [{ yAxis: b.yMin, name: b.label || "" }, { yAxis: b.yMax }]);

    // attach markArea to first series on each axis so it renders once
    if (series.length) {
      const leftSeries = series.find((s: any) => s.yAxisIndex === 0);
      const rightSeries = series.find((s: any) => s.yAxisIndex === 1);
      if (leftSeries && markAreasLeft.length) {
        (leftSeries as any).markArea = { itemStyle: { opacity: 0.12 }, data: markAreasLeft };
      }
      if (rightSeries && markAreasRight.length) {
        (rightSeries as any).markArea = { itemStyle: { opacity: 0.12 }, data: markAreasRight };
      }
    }

    return {
      backgroundColor: "#ffffff",
      animation: false,
      tooltip: { trigger: "axis", axisPointer: { type: "line" } },
      legend: { top: 4 },
      grid: lrGrid,
      xAxis: {
        type: "time",
        axisLabel: { formatter: "{HH}:{mm}" },
        minorTick: { show: true },
        minorSplitLine: { show: true },
        min: range.start,
        max: range.end,
      },
      yAxis: [
        { name: "Resp/EtCO₂", min: 0, max: 60, splitNumber: 6 },
        { name: "BP/SpO₂", min: 40, max: 120, splitNumber: 8 },
      ],
      dataZoom: [
        { type: "inside", throttle: 30, xAxisIndex: 0 },
        { type: "slider", height: 22, bottom: 88, xAxisIndex: 0 },
      ],
      series,
    } as echarts.EChartsOption;
  }, [data.vitals, data.bands, range.start, range.end]);

  // ----- vis-timeline setup -----
  useEffect(() => {
    if (!timelineRootRef.current) return;
    if (timelineRef.current) return; // init once

    const timeline = new Timeline(
      timelineRootRef.current,
      items,
      new DataSet(groups)
    );
    timelineRef.current = timeline;

    // style options
    timeline.setOptions({
      min: data.tStart - 5 * 60_000,
      max: data.tEnd + 5 * 60_000,
      start: data.tStart,
      end: data.tEnd,
      stack: false,
      zoomable: true,
      moveable: true,
      orientation: { axis: "top" },
      height: 180,
      margin: { item: 10, axis: 10 },
      groupOrder: (a: any, b: any) => ("" + a.id).localeCompare("" + b.id),
      template: (item: EventItem) => {
        const icon = item.icon?.startsWith("http")
          ? `<img src="${item.icon}" style="width:14px;height:14px;vertical-align:middle;margin-right:6px;border-radius:2px;"/>`
          : item.icon
          ? `<span style="margin-right:6px">${item.icon}</span>`
          : "";
        const dose = item.dose ? `<span style="opacity:.7">${item.dose}</span>` : "";
        return `<div style="font-size:12px;line-height:1.2">${icon}<strong>${item.content}</strong> ${dose}</div>`;
      },
      tooltip: { followMouse: true },
      selectable: true,
    });

    // When user pans/zooms the vis timeline, update chart range
    timeline.on("rangechanged", (props: any) => {
      const start = +new Date(props.start);
      const end = +new Date(props.end);
      setRange({ start, end });
    });

    return () => {
      timeline.destroy();
    };
  }, [groups, items, data.tStart, data.tEnd]);

  // Keep vis timeline in sync when chart range changes
  useEffect(() => {
    const tl = timelineRef.current;
    if (!tl) return;
    const r = tl.getWindow();
    const start = +new Date(r.start);
    const end = +new Date(r.end);
    if (Math.abs(start - range.start) > 5 || Math.abs(end - range.end) > 5) {
      tl.setWindow(range.start, range.end, { animation: false });
    }
  }, [range]);

  // Keyboard zoom shortcuts for chart (+= zoom in, -/_ zoom out)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['=','+','-','_'].includes(e.key)) return;
      const span = range.end - range.start;
      const factor = (e.key === '-' || e.key === '_') ? 1.3 : 1/1.3;
      const mid = range.start + span/2;
      const newSpan = span * factor;
      setRange({ start: Math.round(mid - newSpan/2), end: Math.round(mid + newSpan/2) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [range]);

  // Update vis-timeline items when data changes
  useEffect(() => {
    const tl = timelineRef.current;
    if (!tl) return;
    tl.setItems(items);
  }, [items]);

  return (
    <div ref={containerRef} className="w-full" style={{ background: "#fff" }}>
      <ReactECharts
        style={{ height: height - 180 }}
        option={option}
        notMerge
        lazyUpdate
        ref={chartRef}
        onEvents={{
          // Sync ECharts zoom/pan to vis-timeline
          dataZoom: () => {
            // After a dataZoom event, query the chart instance for the current axis range
            if (!chartRef.current) return;
            const chartInstance = chartRef.current.getEchartsInstance();
            if (!chartInstance) return;
            
            // Get the current option which has the updated xAxis min/max
            const currentOption = chartInstance.getOption();
            if (!currentOption || !currentOption.xAxis || !currentOption.xAxis[0]) return;
            
            const xAxis = currentOption.xAxis[0];
            const newStart = xAxis.min;
            const newEnd = xAxis.max;
            
            // Only update if the range actually changed
            if (newStart && newEnd && newStart !== range.start) {
              setRange({ start: newStart, end: newEnd });
            }
          },
          restore: () => {
            // Reset to full range when user clicks restore
            setRange({ start: data.tStart, end: data.tEnd });
          }
        }}
      />
      <div style={{ borderTop: "1px solid #eee" }} />
      <div ref={timelineRootRef} />
    </div>
  );
}
