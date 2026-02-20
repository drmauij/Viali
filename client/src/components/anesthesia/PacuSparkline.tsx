import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { useTranslation } from "react-i18next";
import type { VitalPointWithId, BPPointWithId } from "@/hooks/useVitalsQuery";

interface PacuSparklineProps {
  hr: VitalPointWithId[];
  bp: BPPointWithId[];
  spo2: VitalPointWithId[];
}

export function PacuSparkline({ hr, bp, spo2 }: PacuSparklineProps) {
  const { t } = useTranslation();
  const isEmpty = hr.length === 0 && bp.length === 0 && spo2.length === 0;

  const option = useMemo(() => {
    if (isEmpty) return null;

    const toMs = (ts: string) => new Date(ts).getTime();

    return {
      grid: { left: 0, right: 0, top: 2, bottom: 2 },
      xAxis: { type: 'time' as const, show: false },
      yAxis: [
        { type: 'value' as const, show: false, min: 30, max: 200 },
        { type: 'value' as const, show: false, min: 80, max: 100 },
      ],
      animation: false,
      series: [
        {
          name: 'HR',
          type: 'line' as const,
          yAxisIndex: 0,
          data: hr.map(p => [toMs(p.timestamp), p.value]),
          lineStyle: { color: '#ef4444', width: 1.5 },
          itemStyle: { color: '#ef4444' },
          showSymbol: false,
          silent: true,
        },
        {
          name: 'SYS',
          type: 'line' as const,
          yAxisIndex: 0,
          data: bp.map(p => [toMs(p.timestamp), p.sys]),
          lineStyle: { color: '#3b82f6', width: 1.5 },
          itemStyle: { color: '#3b82f6' },
          showSymbol: false,
          silent: true,
        },
        {
          name: 'DIA',
          type: 'line' as const,
          yAxisIndex: 0,
          data: bp.map(p => [toMs(p.timestamp), p.dia]),
          lineStyle: { color: '#3b82f6', width: 1, type: 'dashed' as const },
          itemStyle: { color: '#3b82f6' },
          showSymbol: false,
          silent: true,
        },
        {
          name: 'SpO2',
          type: 'line' as const,
          yAxisIndex: 1,
          data: spo2.map(p => [toMs(p.timestamp), p.value]),
          lineStyle: { color: '#22c55e', width: 1.5 },
          itemStyle: { color: '#22c55e' },
          showSymbol: false,
          silent: true,
        },
      ],
      tooltip: { show: false },
    };
  }, [hr, bp, spo2, isEmpty]);

  if (isEmpty) {
    return (
      <div className="h-[60px] flex items-center justify-center">
        <span className="text-xs text-muted-foreground">
          {t('anesthesia.pacu.noVitalsRecorded')}
        </span>
      </div>
    );
  }

  return (
    <ReactECharts
      option={option!}
      style={{ height: 60, width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge
    />
  );
}
