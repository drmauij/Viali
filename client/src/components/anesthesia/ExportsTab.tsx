import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

interface ExportsTabProps {
  caseId: string;
}

export default function ExportsTab({ caseId }: ExportsTabProps) {
  const handleDownloadCSV = () => {
    console.log("Downloading CSV for case:", caseId);
    // Mock CSV download
  };

  const handleDownloadPDF = () => {
    console.log("Downloading PDF for case:", caseId);
    // Mock PDF download
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Export Anesthesia Record</h2>
        <p className="text-sm text-muted-foreground">
          Download complete case documentation in your preferred format
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
              CSV Export
            </CardTitle>
            <CardDescription>
              Long format timeline data with timestamps, modules, labels, values, units, and sources
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-md font-mono text-xs">
              <div className="space-y-1">
                <div>ts,module,label,value,unit,source,details_json</div>
                <div className="text-muted-foreground">2025-10-09T14:35:00Z,intraop,HR,72,bpm,manual,{"{}"}</div>
                <div className="text-muted-foreground">2025-10-09T14:35:00Z,intraop,SpO2,98,%,manual,{"{}"}</div>
                <div className="text-muted-foreground">2025-10-09T14:38:00Z,intraop,drug,Propofol,mg,voice,{"{...}"}</div>
                <div className="text-muted-foreground">...</div>
              </div>
            </div>
            <Button onClick={handleDownloadCSV} className="w-full gap-2" data-testid="button-download-csv">
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-red-600" />
              PDF Export
            </CardTitle>
            <CardDescription>
              Printable anesthesia record with header, pre-op summary, intra-op timeline, charts, and post-op summary
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-md text-sm space-y-2">
              <div className="font-medium">PDF Contents:</div>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Case & Patient Information Header</li>
                <li>• Pre-operative Assessment Summary</li>
                <li>• Intra-operative Timeline Tables</li>
                <li>• Vital Signs Charts (HR, SpO₂, EtCO₂)</li>
                <li>• Drug Administration Log</li>
                <li>• Post-operative Summary & Disposition</li>
                <li>• Signature Blocks</li>
              </ul>
            </div>
            <Button onClick={handleDownloadPDF} className="w-full gap-2" data-testid="button-download-pdf">
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Privacy & De-identification</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
              <div className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full mt-1.5"></div>
              <div>
                <p className="font-medium text-green-800 dark:text-green-200">All identifiers redacted</p>
                <p className="text-green-700 dark:text-green-300 text-xs mt-1">
                  Patient names, MRNs, and other PHI have been replaced with pseudonyms or removed
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-1.5"></div>
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-200">AI audit trail included</p>
                <p className="text-blue-700 dark:text-blue-300 text-xs mt-1">
                  All AI-assisted extractions include model IDs, prompts, and redaction masks for traceability
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
