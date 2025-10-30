import { useState } from "react";
import { EditableValue } from "@/components/EditableValue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatTime } from "@/lib/dateUtils";

export default function EditableValuesDemo() {
  const { toast } = useToast();

  // Example state for different value types
  const [patientName, setPatientName] = useState("John Doe");
  const [patientAge, setPatientAge] = useState(45);
  const [weight, setWeight] = useState(75.5);
  const [temperature, setTemperature] = useState(37.2);
  const [appointmentDate, setAppointmentDate] = useState(new Date());
  const [vitals, setVitals] = useState<Array<{ time: number; value: number }>>([
    { time: Date.now() - 3600000, value: 120 },
    { time: Date.now() - 1800000, value: 115 },
    { time: Date.now(), value: 118 },
  ]);

  const handleSaveText = async (value: string) => {
    setPatientName(value);
    toast({
      title: "Saved",
      description: "Patient name updated",
    });
  };

  const handleSaveNumber = async (value: number) => {
    setPatientAge(value);
    toast({
      title: "Saved",
      description: "Patient age updated",
    });
  };

  const handleSaveWeight = async (value: number) => {
    setWeight(value);
    toast({
      title: "Saved",
      description: "Weight updated",
    });
  };

  const handleSaveTemperature = async (value: number) => {
    setTemperature(value);
    toast({
      title: "Saved",
      description: "Temperature updated",
    });
  };

  const handleSaveDate = async (value: Date) => {
    setAppointmentDate(value);
    toast({
      title: "Saved",
      description: "Appointment date updated",
    });
  };

  const handleSaveVital = async (index: number, value: number, time?: number | Date) => {
    const newVitals = [...vitals];
    newVitals[index] = {
      value,
      time: time ? (typeof time === 'number' ? time : time.getTime()) : vitals[index].time,
    };
    setVitals(newVitals);
    toast({
      title: "Saved",
      description: "Vital sign updated",
    });
  };

  const handleDeleteVital = async (index: number) => {
    setVitals(vitals.filter((_, i) => i !== index));
    toast({
      title: "Deleted",
      description: "Vital sign removed",
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Editable Values Demo</h1>
        <p className="text-muted-foreground">
          Click on any value below to edit it. This demonstrates the universal edit functionality
          available throughout the application.
        </p>
      </div>

      <div className="space-y-6">
        {/* Text Values */}
        <Card>
          <CardHeader>
            <CardTitle>Text Values</CardTitle>
            <CardDescription>Click on the text to edit it</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground w-32">Patient Name:</span>
                <EditableValue
                  type="text"
                  value={patientName}
                  label="Patient Name"
                  onSave={handleSaveText}
                  placeholder="Enter patient name"
                  testId="editable-patient-name"
                >
                  <span className="font-semibold text-lg">{patientName}</span>
                </EditableValue>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Number Values */}
        <Card>
          <CardHeader>
            <CardTitle>Number Values</CardTitle>
            <CardDescription>Click on numbers to edit them with validation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground w-32">Age:</span>
                <EditableValue
                  type="number"
                  value={patientAge}
                  label="Patient Age"
                  onSave={handleSaveNumber}
                  min={0}
                  max={150}
                  step={1}
                  testId="editable-age"
                >
                  <span className="font-semibold text-lg">{patientAge} years</span>
                </EditableValue>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground w-32">Weight:</span>
                <EditableValue
                  type="number"
                  value={weight}
                  label="Weight"
                  onSave={handleSaveWeight}
                  min={0}
                  max={500}
                  step={0.1}
                  testId="editable-weight"
                >
                  <span className="font-semibold text-lg">{weight} kg</span>
                </EditableValue>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground w-32">Temperature:</span>
                <EditableValue
                  type="number"
                  value={temperature}
                  label="Body Temperature"
                  onSave={handleSaveTemperature}
                  min={30}
                  max={45}
                  step={0.1}
                  testId="editable-temperature"
                >
                  <span className="font-semibold text-lg">{temperature}°C</span>
                </EditableValue>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Date Values */}
        <Card>
          <CardHeader>
            <CardTitle>Date Values</CardTitle>
            <CardDescription>Click on dates to change them</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground w-32">Appointment:</span>
              <EditableValue
                type="date"
                value={appointmentDate}
                label="Appointment Date"
                onSave={handleSaveDate}
                testId="editable-appointment-date"
              >
                <span className="font-semibold text-lg">
                  {formatDate(appointmentDate)}
                </span>
              </EditableValue>
            </div>
          </CardContent>
        </Card>

        {/* Time-based Values (Vital Signs) */}
        <Card>
          <CardHeader>
            <CardTitle>Time-Based Values (Vital Signs)</CardTitle>
            <CardDescription>
              Click on values to edit both the value and timestamp. Delete option included.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {vitals.map((vital, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                >
                  <span className="text-sm text-muted-foreground w-32">
                    {formatTime(vital.time)}
                  </span>
                  <EditableValue
                    type="vital-point"
                    value={vital.value}
                    time={vital.time}
                    label="Heart Rate"
                    onSave={(value, time) => handleSaveVital(index, value, time)}
                    onDelete={() => handleDeleteVital(index)}
                    min={40}
                    max={200}
                    step={1}
                    allowTimeEdit={true}
                    allowDelete={true}
                    testId={`editable-vital-${index}`}
                  >
                    <span className="font-semibold text-lg">
                      {vital.value} <span className="text-sm text-muted-foreground">bpm</span>
                    </span>
                  </EditableValue>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Usage Instructions */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>How to Use EditableValue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold mb-2">Basic Usage:</h4>
                <pre className="bg-muted p-3 rounded-lg overflow-x-auto">
{`<EditableValue
  type="number"
  value={temperature}
  label="Temperature"
  onSave={(value) => setTemperature(value)}
  min={30}
  max={45}
  step={0.1}
>
  <span>{temperature}°C</span>
</EditableValue>`}
                </pre>
              </div>

              <div>
                <h4 className="font-semibold mb-2">With Time Editing (for vital signs):</h4>
                <pre className="bg-muted p-3 rounded-lg overflow-x-auto">
{`<EditableValue
  type="vital-point"
  value={120}
  time={Date.now()}
  label="Heart Rate"
  onSave={(value, time) => console.log(value, time)}
  onDelete={() => console.log('deleted')}
  allowTimeEdit={true}
  allowDelete={true}
>
  <span>{120} bpm</span>
</EditableValue>`}
                </pre>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Supported Types:</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><code>text</code> - String values</li>
                  <li><code>number</code> - Numeric values with min/max/step</li>
                  <li><code>date</code> - Date picker</li>
                  <li><code>vital-point</code> - Number with time editing and delete</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
