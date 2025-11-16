import { useState, useRef, useMemo, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { saveVitals } from "@/services/timelinePersistence";
import { apiRequest } from "@/lib/queryClient";
import { VITAL_ICON_PATHS } from "@/lib/vitalIconPaths";
import { Trash2, Pencil } from "lucide-react";

/**
 * VitalsTrack - Clean, focused vitals charting component
 * 
 * Features:
 * - HR, BP (sys/dia), SpO2 charts using ECharts
 * - Click-to-add vitals with value entry dialog
 * - Click-on-point to edit with time adjustment and delete
 * - Proper persistence with error handling
 * - Cache invalidation after mutations
 */

export type VitalPoint = [number, number]; // [timestamp(ms), value]

export interface VitalsData {
  hr: VitalPoint[];
  sysBP: VitalPoint[];
  diaBP: VitalPoint[];
  spo2: VitalPoint[];
}

export interface VitalsTrackProps {
  anesthesiaRecordId: string;
  timeRange: {
    start: number; // ms timestamp
    end: number;   // ms timestamp
  };
  vitalsData: VitalsData;
  onVitalsChange?: (data: VitalsData) => void;
  height?: number;
}

// Helper: Create custom series for Lucide icon symbols (supports stroke rendering)
function createLucideIconSeries(
  name: string,
  data: VitalPoint[],
  iconPath: string,
  color: string,
  yAxisIndex: number,
  size: number = 16,
  isCircleDot: boolean = false
) {
  return {
    type: 'custom',
    name,
    xAxisIndex: 0,
    yAxisIndex,
    data,
    zlevel: 20,
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

export function VitalsTrack({
  anesthesiaRecordId,
  timeRange,
  vitalsData,
  onVitalsChange,
  height = 400,
}: VitalsTrackProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const chartRef = useRef<any>(null);

  // Dialog states
  const [addDialog, setAddDialog] = useState<{
    open: boolean;
    timestamp: number | null;
  }>({ open: false, timestamp: null });
  
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    vitalType: 'hr' | 'sysBP' | 'diaBP' | 'spo2' | null;
    index: number | null;
    timestamp: number | null;
    value: number | null;
  }>({ open: false, vitalType: null, index: null, timestamp: null, value: null });

  // Form states for add dialog
  const [newHR, setNewHR] = useState("");
  const [newSysBP, setNewSysBP] = useState("");
  const [newDiaBP, setNewDiaBP] = useState("");
  const [newSpO2, setNewSpO2] = useState("");

  // Form states for edit dialog
  const [editValue, setEditValue] = useState("");
  const [editTime, setEditTime] = useState("");

  // Local vitals state
  const [localVitals, setLocalVitals] = useState<VitalsData>(vitalsData);

  // Detect theme
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  // Colors for vitals
  const hrColor = isDark ? "#ef4444" : "#dc2626";
  const bpColor = isDark ? "#3b82f6" : "#2563eb";
  const spo2Color = isDark ? "#10b981" : "#059669";

  // Save vitals mutation
  const saveVitalsMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await saveVitals(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/records', anesthesiaRecordId, 'vitals'] });
      toast({
        title: "Vitals saved",
        description: "Vital signs have been saved successfully.",
      });
    },
    onError: (error: any) => {
      console.error("Failed to save vitals:", error);
      toast({
        title: "Error saving vitals",
        description: error.message || "Failed to save vital signs. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update vitals mutation (for edit/delete)
  const updateVitalsMutation = useMutation({
    mutationFn: async ({ snapshotId, data }: { snapshotId: string; data: any }) => {
      const response = await apiRequest('PATCH', `/api/anesthesia/vitals/${snapshotId}`, { data });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/records', anesthesiaRecordId, 'vitals'] });
      toast({
        title: "Vitals updated",
        description: "Vital signs have been updated successfully.",
      });
    },
    onError: (error: any) => {
      console.error("Failed to update vitals:", error);
      toast({
        title: "Error updating vitals",
        description: error.message || "Failed to update vital signs. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Fetch snapshot mutation (to get snapshot ID for edit/delete)
  const fetchSnapshotMutation = useMutation({
    mutationFn: async (timestamp: number) => {
      const response = await apiRequest('GET', `/api/anesthesia/records/${anesthesiaRecordId}/vitals?timestamp=${timestamp}`);
      return await response.json();
    },
  });

  // Handle chart click to add new vitals
  const handleChartClick = (params: any) => {
    if (!params || params.componentType !== 'xAxis') return;
    
    const clickedTime = params.value;
    setAddDialog({ open: true, timestamp: clickedTime });
    setNewHR("");
    setNewSysBP("");
    setNewDiaBP("");
    setNewSpO2("");
  };

  // Handle point click to edit
  const handlePointClick = (params: any) => {
    if (!params || params.componentType !== 'series') return;

    const seriesName = params.seriesName;
    const dataIndex = params.dataIndex;
    const point = params.data as VitalPoint;

    let vitalType: 'hr' | 'sysBP' | 'diaBP' | 'spo2' | null = null;

    if (seriesName === 'HR') vitalType = 'hr';
    else if (seriesName === 'Sys BP') vitalType = 'sysBP';
    else if (seriesName === 'Dia BP') vitalType = 'diaBP';
    else if (seriesName === 'SpO2') vitalType = 'spo2';

    if (!vitalType) return;

    setEditDialog({
      open: true,
      vitalType,
      index: dataIndex,
      timestamp: point[0],
      value: point[1],
    });
    setEditValue(point[1].toString());
    setEditTime(new Date(point[0]).toISOString().slice(0, 16));
  };

  // Handle add vitals submit
  const handleAddSubmit = async () => {
    if (!addDialog.timestamp) return;

    const data: any = {};
    if (newHR) data.hr = parseFloat(newHR);
    if (newSysBP) data.sysBP = parseFloat(newSysBP);
    if (newDiaBP) data.diaBP = parseFloat(newDiaBP);
    if (newSpO2) data.spo2 = parseFloat(newSpO2);

    if (Object.keys(data).length === 0) {
      toast({
        title: "No values entered",
        description: "Please enter at least one vital sign value.",
        variant: "destructive",
      });
      return;
    }

    try {
      await saveVitalsMutation.mutateAsync({
        anesthesiaRecordId,
        timestamp: new Date(addDialog.timestamp),
        data,
      });

      // Update local state
      const updatedVitals = { ...localVitals };
      if (data.hr !== undefined) {
        updatedVitals.hr = ([...updatedVitals.hr, [addDialog.timestamp, data.hr] as VitalPoint] as VitalPoint[]).sort((a, b) => a[0] - b[0]);
      }
      if (data.sysBP !== undefined) {
        updatedVitals.sysBP = ([...updatedVitals.sysBP, [addDialog.timestamp, data.sysBP] as VitalPoint] as VitalPoint[]).sort((a, b) => a[0] - b[0]);
      }
      if (data.diaBP !== undefined) {
        updatedVitals.diaBP = ([...updatedVitals.diaBP, [addDialog.timestamp, data.diaBP] as VitalPoint] as VitalPoint[]).sort((a, b) => a[0] - b[0]);
      }
      if (data.spo2 !== undefined) {
        updatedVitals.spo2 = ([...updatedVitals.spo2, [addDialog.timestamp, data.spo2] as VitalPoint] as VitalPoint[]).sort((a, b) => a[0] - b[0]);
      }
      setLocalVitals(updatedVitals);
      onVitalsChange?.(updatedVitals);

      setAddDialog({ open: false, timestamp: null });
    } catch (error) {
      console.error("Failed to add vitals:", error);
    }
  };

  // Handle edit vitals submit
  const handleEditSubmit = async () => {
    if (!editDialog.vitalType || editDialog.index === null || !editDialog.timestamp) return;

    const newValue = parseFloat(editValue);
    const newTimestamp = new Date(editTime).getTime();

    if (isNaN(newValue)) {
      toast({
        title: "Invalid value",
        description: "Please enter a valid number.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Fetch snapshot to get ID
      const snapshots = await fetchSnapshotMutation.mutateAsync(editDialog.timestamp);
      if (!snapshots || snapshots.length === 0) {
        throw new Error("Snapshot not found");
      }

      const snapshot = snapshots[0];
      const updatedData = { ...snapshot.data };

      // Update the specific vital
      const vitalKey = editDialog.vitalType === 'sysBP' || editDialog.vitalType === 'diaBP' 
        ? editDialog.vitalType 
        : editDialog.vitalType;
      updatedData[vitalKey] = newValue;

      // PATCH with updated data
      await updateVitalsMutation.mutateAsync({
        snapshotId: snapshot.id,
        data: updatedData,
      });

      // Update local state
      const updatedVitals = { ...localVitals };
      updatedVitals[editDialog.vitalType] = [...updatedVitals[editDialog.vitalType]];
      updatedVitals[editDialog.vitalType][editDialog.index] = [newTimestamp, newValue];
      updatedVitals[editDialog.vitalType].sort((a, b) => a[0] - b[0]);
      setLocalVitals(updatedVitals);
      onVitalsChange?.(updatedVitals);

      setEditDialog({ open: false, vitalType: null, index: null, timestamp: null, value: null });
    } catch (error) {
      console.error("Failed to edit vitals:", error);
    }
  };

  // Handle delete vital
  const handleDelete = async () => {
    if (!editDialog.vitalType || editDialog.index === null || !editDialog.timestamp) return;

    try {
      // Fetch snapshot to get ID
      const snapshots = await fetchSnapshotMutation.mutateAsync(editDialog.timestamp);
      if (!snapshots || snapshots.length === 0) {
        throw new Error("Snapshot not found");
      }

      const snapshot = snapshots[0];
      const updatedData = { ...snapshot.data };

      // Remove the specific vital field
      const vitalKey = editDialog.vitalType === 'sysBP' || editDialog.vitalType === 'diaBP' 
        ? editDialog.vitalType 
        : editDialog.vitalType;
      delete updatedData[vitalKey];

      // PATCH with remaining vitals (effectively deleting this field)
      await updateVitalsMutation.mutateAsync({
        snapshotId: snapshot.id,
        data: updatedData,
      });

      // Update local state
      const updatedVitals = { ...localVitals };
      updatedVitals[editDialog.vitalType] = updatedVitals[editDialog.vitalType].filter((_, i) => i !== editDialog.index);
      setLocalVitals(updatedVitals);
      onVitalsChange?.(updatedVitals);

      setEditDialog({ open: false, vitalType: null, index: null, timestamp: null, value: null });
    } catch (error) {
      console.error("Failed to delete vital:", error);
    }
  };

  // Chart options
  const chartOptions = useMemo(() => {
    return {
      grid: {
        left: 60,
        right: 20,
        top: 40,
        bottom: 50,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
        },
      },
      legend: {
        data: ['HR', 'Sys BP', 'Dia BP', 'SpO2'],
        top: 10,
        textStyle: {
          color: isDark ? '#e5e7eb' : '#1f2937',
        },
      },
      xAxis: {
        type: 'time',
        min: timeRange.start,
        max: timeRange.end,
        axisLabel: {
          formatter: (value: number) => {
            const date = new Date(value);
            return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
          },
          color: isDark ? '#9ca3af' : '#6b7280',
        },
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db',
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: isDark ? '#374151' : '#e5e7eb',
            type: 'dashed',
          },
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'HR (bpm)',
          min: 40,
          max: 180,
          position: 'left',
          axisLabel: {
            color: isDark ? '#9ca3af' : '#6b7280',
          },
          axisLine: {
            lineStyle: {
              color: hrColor,
            },
          },
          splitLine: {
            show: true,
            lineStyle: {
              color: isDark ? '#374151' : '#e5e7eb',
              type: 'dashed',
            },
          },
        },
        {
          type: 'value',
          name: 'BP (mmHg)',
          min: 40,
          max: 220,
          position: 'right',
          offset: 0,
          axisLabel: {
            color: isDark ? '#9ca3af' : '#6b7280',
          },
          axisLine: {
            lineStyle: {
              color: bpColor,
            },
          },
          splitLine: {
            show: false,
          },
        },
        {
          type: 'value',
          name: 'SpO2 (%)',
          min: 85,
          max: 100,
          position: 'right',
          offset: 60,
          axisLabel: {
            color: isDark ? '#9ca3af' : '#6b7280',
          },
          axisLine: {
            lineStyle: {
              color: spo2Color,
            },
          },
          splitLine: {
            show: false,
          },
        },
      ],
      series: [
        // HR line
        {
          name: 'HR',
          type: 'line',
          yAxisIndex: 0,
          data: localVitals.hr,
          smooth: true,
          showSymbol: false,
          lineStyle: {
            color: hrColor,
            width: 2,
          },
        },
        // HR icon markers
        createLucideIconSeries('HR', localVitals.hr, VITAL_ICON_PATHS.heart.path, hrColor, 0, 16, false),
        // Sys BP line
        {
          name: 'Sys BP',
          type: 'line',
          yAxisIndex: 1,
          data: localVitals.sysBP,
          smooth: true,
          showSymbol: false,
          lineStyle: {
            color: bpColor,
            width: 2,
          },
        },
        // Sys BP icon markers
        createLucideIconSeries('Sys BP', localVitals.sysBP, VITAL_ICON_PATHS.chevronUp.path, bpColor, 1, 16, false),
        // Dia BP line
        {
          name: 'Dia BP',
          type: 'line',
          yAxisIndex: 1,
          data: localVitals.diaBP,
          smooth: true,
          showSymbol: false,
          lineStyle: {
            color: bpColor,
            width: 2,
            type: 'dashed',
          },
        },
        // Dia BP icon markers
        createLucideIconSeries('Dia BP', localVitals.diaBP, VITAL_ICON_PATHS.chevronDown.path, bpColor, 1, 16, false),
        // SpO2 line
        {
          name: 'SpO2',
          type: 'line',
          yAxisIndex: 2,
          data: localVitals.spo2,
          smooth: true,
          showSymbol: false,
          lineStyle: {
            color: spo2Color,
            width: 2,
          },
        },
        // SpO2 icon markers
        createLucideIconSeries('SpO2', localVitals.spo2, '', spo2Color, 2, 16, true),
      ],
    };
  }, [localVitals, timeRange, isDark]);

  const chartEvents = {
    click: (params: any) => {
      if (params.componentType === 'series') {
        handlePointClick(params);
      } else if (params.componentType === 'xAxis') {
        handleChartClick(params);
      }
    },
  };

  return (
    <div className="w-full" data-testid="vitals-track">
      <ReactECharts
        ref={chartRef}
        option={chartOptions}
        style={{ height: `${height}px`, width: '100%' }}
        onEvents={chartEvents}
        data-testid="vitals-chart"
      />

      {/* Add Vitals Dialog */}
      <Dialog open={addDialog.open} onOpenChange={(open) => setAddDialog({ open, timestamp: addDialog.timestamp })}>
        <DialogContent data-testid="dialog-add-vitals">
          <DialogHeader>
            <DialogTitle>Add Vital Signs</DialogTitle>
            <DialogDescription>
              Time: {addDialog.timestamp ? new Date(addDialog.timestamp).toLocaleString() : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="new-hr">Heart Rate (bpm)</Label>
                <Input
                  id="new-hr"
                  type="number"
                  value={newHR}
                  onChange={(e) => setNewHR(e.target.value)}
                  placeholder="e.g., 75"
                  data-testid="input-hr"
                />
              </div>
              <div>
                <Label htmlFor="new-spo2">SpO2 (%)</Label>
                <Input
                  id="new-spo2"
                  type="number"
                  value={newSpO2}
                  onChange={(e) => setNewSpO2(e.target.value)}
                  placeholder="e.g., 98"
                  data-testid="input-spo2"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="new-sysbp">Systolic BP (mmHg)</Label>
                <Input
                  id="new-sysbp"
                  type="number"
                  value={newSysBP}
                  onChange={(e) => setNewSysBP(e.target.value)}
                  placeholder="e.g., 120"
                  data-testid="input-sysbp"
                />
              </div>
              <div>
                <Label htmlFor="new-diabp">Diastolic BP (mmHg)</Label>
                <Input
                  id="new-diabp"
                  type="number"
                  value={newDiaBP}
                  onChange={(e) => setNewDiaBP(e.target.value)}
                  placeholder="e.g., 80"
                  data-testid="input-diabp"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialog({ open: false, timestamp: null })}
              data-testid="button-cancel-add"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddSubmit}
              disabled={saveVitalsMutation.isPending}
              data-testid="button-save-add"
            >
              {saveVitalsMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Vitals Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog({ ...editDialog, open })}>
        <DialogContent data-testid="dialog-edit-vitals">
          <DialogHeader>
            <DialogTitle>Edit Vital Sign</DialogTitle>
            <DialogDescription>
              {editDialog.vitalType === 'hr' && 'Heart Rate'}
              {editDialog.vitalType === 'sysBP' && 'Systolic Blood Pressure'}
              {editDialog.vitalType === 'diaBP' && 'Diastolic Blood Pressure'}
              {editDialog.vitalType === 'spo2' && 'SpO2'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-value">Value</Label>
              <Input
                id="edit-value"
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                data-testid="input-edit-value"
              />
            </div>
            <div>
              <Label htmlFor="edit-time">Time</Label>
              <Input
                id="edit-time"
                type="datetime-local"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                data-testid="input-edit-time"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={updateVitalsMutation.isPending}
              className="mr-auto"
              data-testid="button-delete-vital"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditDialog({ open: false, vitalType: null, index: null, timestamp: null, value: null })}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={updateVitalsMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateVitalsMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
