import { useImperativeHandle } from "react";
import type {
  VitalPoint,
  TimelineEvent,
  UnifiedTimelineData,
  SwimlaneConfig,
  ChartExportResult,
  SwimlaneExportResult,
  UnifiedTimelineRef,
} from "./index";

interface UseTimelineExportParams {
  ref: React.ForwardedRef<UnifiedTimelineRef>;
  chartRef: React.RefObject<any>;
  isChartReady: boolean;
  activeSwimlaneRef: React.RefObject<SwimlaneConfig[]>;
  data: UnifiedTimelineData;
  anesthesiaRecord: any;
}

export function useTimelineExport({
  ref,
  chartRef,
  isChartReady,
  activeSwimlaneRef,
  data,
  anesthesiaRecord,
}: UseTimelineExportParams) {
  useImperativeHandle(ref, () => ({
    getChartImage: async (): Promise<string | null> => {
      if (!chartRef.current || !isChartReady) {
        console.warn('[CHART-EXPORT] Chart not ready for export');
        return null;
      }
      
      try {
        const chartInstance = chartRef.current.getEchartsInstance();
        if (!chartInstance) {
          console.warn('[CHART-EXPORT] Chart instance not available');
          return null;
        }
        
        const dataURL = chartInstance.getDataURL({
          type: 'png',
          pixelRatio: 2,
          backgroundColor: '#ffffff',
        });
        
        console.log('[CHART-EXPORT] Chart exported successfully');
        return dataURL;
      } catch (error) {
        console.error('[CHART-EXPORT] Error exporting chart:', error);
        return null;
      }
    },
    
    exportForPdf: async (): Promise<ChartExportResult | null> => {
      console.log('[PDF-CHART-EXPORT] exportForPdf called:', { 
        hasChartRef: !!chartRef.current, 
        isChartReady,
        hasSwimlanes: activeSwimlaneRef.current?.length ?? 0,
      });
      
      if (!chartRef.current || !isChartReady) {
        console.warn('[PDF-CHART-EXPORT] Chart not ready for export:', { hasChartRef: !!chartRef.current, isChartReady });
        return null;
      }
      
      try {
        const chartInstance = chartRef.current.getEchartsInstance();
        if (!chartInstance) {
          console.warn('[PDF-CHART-EXPORT] Chart instance not available');
          return null;
        }
        
        const currentOption = chartInstance.getOption();
        if (!currentOption) {
          console.warn('[PDF-CHART-EXPORT] Could not get current option');
          return null;
        }
        const currentDataZoom = currentOption.dataZoom?.[0];
        const originalStart = currentDataZoom?.start ?? 0;
        const originalEnd = currentDataZoom?.end ?? 100;
        const originalWidth = chartInstance.getWidth();
        const originalHeight = chartInstance.getHeight();
        
        const timestamps: number[] = [];
        
        if (data.vitals?.hr) {
          data.vitals.hr.forEach((p: VitalPoint) => timestamps.push(p[0]));
        }
        if (data.vitals?.sysBP) {
          data.vitals.sysBP.forEach((p: VitalPoint) => timestamps.push(p[0]));
        }
        if (data.vitals?.diaBP) {
          data.vitals.diaBP.forEach((p: VitalPoint) => timestamps.push(p[0]));
        }
        if (data.vitals?.spo2) {
          data.vitals.spo2.forEach((p: VitalPoint) => timestamps.push(p[0]));
        }
        
        if (data.medications) {
          data.medications.forEach((m: any) => {
            if (m.timestamp) timestamps.push(new Date(m.timestamp).getTime());
            if (m.endTimestamp) timestamps.push(new Date(m.endTimestamp).getTime());
          });
        }
        
        if (data.events) {
          data.events.forEach((e: TimelineEvent) => {
            if (e.time) timestamps.push(e.time);
          });
        }
        
        const timeMarkersArray = anesthesiaRecord?.timeMarkers;
        if (Array.isArray(timeMarkersArray)) {
          timeMarkersArray.forEach((m: any) => {
            if (m.time) timestamps.push(m.time);
          });
        }
        
        const validTimestamps = timestamps.filter(t => t && isFinite(t) && t > 0);
        
        const fullRange = data.endTime - data.startTime;
        const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
        
        let startPercent = 0;
        let endPercent = 100;
        
        if (validTimestamps.length > 0) {
          const minDataTime = Math.min(...validTimestamps);
          const maxDataTime = Math.max(...validTimestamps);
          const dataRange = maxDataTime - minDataTime;
          
          const centerTime = minDataTime + dataRange / 2;
          
          const windowSize = Math.max(FOUR_HOURS_MS, dataRange + 30 * 60 * 1000);
          
          let windowStart = centerTime - windowSize / 2;
          let windowEnd = centerTime + windowSize / 2;
          
          windowStart = Math.max(data.startTime, windowStart);
          windowEnd = Math.min(data.endTime, windowEnd);
          
          startPercent = Math.max(0, ((windowStart - data.startTime) / fullRange) * 100);
          endPercent = Math.min(100, ((windowEnd - data.startTime) / fullRange) * 100);
          
          console.log('[PDF-CHART-EXPORT] 4-hour window centered on data:', {
            minDataTime: new Date(minDataTime).toISOString(),
            maxDataTime: new Date(maxDataTime).toISOString(),
            centerTime: new Date(centerTime).toISOString(),
            windowStart: new Date(windowStart).toISOString(),
            windowEnd: new Date(windowEnd).toISOString(),
            startPercent: startPercent.toFixed(2),
            endPercent: endPercent.toFixed(2),
          });
        }
        
        const EXPORT_WIDTH = 1800;
        const VITALS_HEIGHT = 380;
        const VITALS_TOP = 32;
        
        const currentSwimlanes = activeSwimlaneRef.current ?? [];
        let swimlanesHeight: number;
        
        if (currentSwimlanes.length > 0) {
          swimlanesHeight = currentSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
        } else {
          swimlanesHeight = Math.max(400, originalHeight - VITALS_TOP - VITALS_HEIGHT);
        }
        
        const EXPORT_HEIGHT = VITALS_TOP + VITALS_HEIGHT + swimlanesHeight + 20;
        
        console.log('[PDF-CHART-EXPORT] Using fixed export dimensions:', {
          width: EXPORT_WIDTH,
          height: EXPORT_HEIGHT,
          swimlanesCount: currentSwimlanes.length,
          swimlanesHeight,
          originalWidth,
          originalHeight,
          usingFallback: currentSwimlanes.length === 0,
        });
        
        chartInstance.resize({
          width: EXPORT_WIDTH,
          height: EXPORT_HEIGHT,
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        chartInstance.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
        });
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const pixelRatio = 2;
        
        const dataURL = chartInstance.getDataURL({
          type: 'png',
          pixelRatio,
          backgroundColor: '#ffffff',
        });
        
        chartInstance.resize({
          width: originalWidth,
          height: originalHeight,
        });
        
        chartInstance.dispatchAction({
          type: 'dataZoom',
          start: originalStart,
          end: originalEnd,
        });
        
        console.log('[PDF-CHART-EXPORT] Chart exported for PDF:', {
          exportWidth: EXPORT_WIDTH,
          exportHeight: EXPORT_HEIGHT,
          pixelRatio,
          finalImageDimensions: `${EXPORT_WIDTH * pixelRatio}x${EXPORT_HEIGHT * pixelRatio}px`,
          imageSize: Math.round((dataURL?.length || 0) / 1024) + 'KB',
        });
        
        return {
          image: dataURL,
          width: EXPORT_WIDTH * pixelRatio,
          height: EXPORT_HEIGHT * pixelRatio,
        };
      } catch (error) {
        console.error('[PDF-CHART-EXPORT] Error exporting chart for PDF:', error);
        return null;
      }
    },
    
    exportSwimlanesForPdf: async (): Promise<SwimlaneExportResult | null> => {
      console.log('[PDF-SWIMLANES-EXPORT] exportSwimlanesForPdf called');
      
      if (!chartRef.current || !isChartReady) {
        console.warn('[PDF-SWIMLANES-EXPORT] Chart not ready for export');
        return null;
      }
      
      try {
        const chartInstance = chartRef.current.getEchartsInstance();
        if (!chartInstance) {
          console.warn('[PDF-SWIMLANES-EXPORT] Chart instance not available');
          return null;
        }
        
        const currentOption = chartInstance.getOption();
        const currentDataZoom = currentOption?.dataZoom?.[0];
        const originalStart = currentDataZoom?.start ?? 0;
        const originalEnd = currentDataZoom?.end ?? 100;
        const originalWidth = chartInstance.getWidth();
        const originalHeight = chartInstance.getHeight();
        
        const timestamps: number[] = [];
        if (data.vitals?.hr) data.vitals.hr.forEach((p: VitalPoint) => timestamps.push(p[0]));
        if (data.vitals?.sysBP) data.vitals.sysBP.forEach((p: VitalPoint) => timestamps.push(p[0]));
        if (data.vitals?.spo2) data.vitals.spo2.forEach((p: VitalPoint) => timestamps.push(p[0]));
        if (data.medications) {
          data.medications.forEach((m: any) => {
            if (m.timestamp) timestamps.push(new Date(m.timestamp).getTime());
            if (m.endTimestamp) timestamps.push(new Date(m.endTimestamp).getTime());
          });
        }
        if (data.events) {
          data.events.forEach((e: TimelineEvent) => {
            if (e.time) timestamps.push(e.time);
          });
        }
        
        const validTimestamps = timestamps.filter(t => t && isFinite(t) && t > 0);
        const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
        const fullRange = data.endTime - data.startTime;
        
        let timeRangeStart = data.startTime;
        let timeRangeEnd = data.endTime;
        let startPercent = 0;
        let endPercent = 100;
        
        if (validTimestamps.length > 0) {
          const minDataTime = Math.min(...validTimestamps);
          const maxDataTime = Math.max(...validTimestamps);
          const dataRange = maxDataTime - minDataTime;
          const centerTime = minDataTime + dataRange / 2;
          const windowSize = Math.max(FOUR_HOURS_MS, dataRange + 30 * 60 * 1000);
          
          let windowStart = Math.max(data.startTime, centerTime - windowSize / 2);
          let windowEnd = Math.min(data.endTime, centerTime + windowSize / 2);
          
          startPercent = Math.max(0, ((windowStart - data.startTime) / fullRange) * 100);
          endPercent = Math.min(100, ((windowEnd - data.startTime) / fullRange) * 100);
          timeRangeStart = windowStart;
          timeRangeEnd = windowEnd;
        }
        
        const EXPORT_WIDTH = 1800;
        const pixelRatio = 2;
        
        const exportSection = async (
          sectionName: string,
          gridIndices: number[],
          sectionHeight: number
        ): Promise<ChartExportResult | null> => {
          try {
            chartInstance.resize({ width: EXPORT_WIDTH, height: sectionHeight });
            await new Promise(resolve => setTimeout(resolve, 100));
            
            chartInstance.dispatchAction({
              type: 'dataZoom',
              start: startPercent,
              end: endPercent,
            });
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const dataURL = chartInstance.getDataURL({
              type: 'png',
              pixelRatio,
              backgroundColor: '#ffffff',
            });
            
            console.log(`[PDF-SWIMLANES-EXPORT] ${sectionName} exported:`, {
              dimensions: `${EXPORT_WIDTH}x${sectionHeight}px`,
              imageSize: Math.round((dataURL?.length || 0) / 1024) + 'KB',
            });
            
            return {
              image: dataURL,
              width: EXPORT_WIDTH * pixelRatio,
              height: sectionHeight * pixelRatio,
            };
          } catch (error) {
            console.error(`[PDF-SWIMLANES-EXPORT] Error exporting ${sectionName}:`, error);
            return null;
          }
        };
        
        const vitalsHeight = 420;
        const vitalsResult = await exportSection('Vitals', [0], vitalsHeight);
        
        const currentSwimlanes = activeSwimlaneRef.current ?? [];
        const medicationLanes = currentSwimlanes.filter(l => 
          l.id.startsWith('admingroup-') || l.id === 'medications'
        );
        const ventilationLanes = currentSwimlanes.filter(l => 
          l.id.startsWith('ventilation') || l.id === 'vent-entry'
        );
        const otherLanes = currentSwimlanes.filter(l => 
          !l.id.startsWith('admingroup-') && 
          !l.id.startsWith('ventilation') && 
          l.id !== 'medications' &&
          l.id !== 'vent-entry'
        );
        
        const medHeight = Math.max(200, medicationLanes.reduce((sum, l) => sum + l.height, 0) + 50);
        const ventHeight = Math.max(150, ventilationLanes.reduce((sum, l) => sum + l.height, 0) + 50);
        const otherHeight = Math.max(150, otherLanes.reduce((sum, l) => sum + l.height, 0) + 50);
        
        const medicationsResult = await exportSection('Medications', [], medHeight);
        const ventilationResult = await exportSection('Ventilation', [], ventHeight);
        const othersResult = await exportSection('Others', [], otherHeight);
        
        chartInstance.resize({ width: originalWidth, height: originalHeight });
        chartInstance.dispatchAction({
          type: 'dataZoom',
          start: originalStart,
          end: originalEnd,
        });
        
        console.log('[PDF-SWIMLANES-EXPORT] All sections exported successfully');
        
        return {
          vitals: vitalsResult,
          medications: medicationsResult,
          ventilation: ventilationResult,
          others: othersResult,
          timeRange: { start: timeRangeStart, end: timeRangeEnd },
        };
      } catch (error) {
        console.error('[PDF-SWIMLANES-EXPORT] Error exporting swimlanes:', error);
        return null;
      }
    },
  }), [isChartReady, data.vitals, data.medications, data.events, anesthesiaRecord?.timeMarkers, data.startTime, data.endTime]);
}
