import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Copy, Clock, Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const VITABYTE_ENDPOINTS = [
  { name: "verify", description: "Überprüfung des API-Keys" },
  { name: "getCustomerIds", description: "Alle verfügbaren Kundennummern" },
  { name: "createCustomer", description: "Erfassung eines Kunden" },
  { name: "modifyCustomer", description: "Modifikation eines Kunden" },
  { name: "getCustomerByMail", description: "Kunden über Mailadresse abfragen" },
  { name: "getCustomerByAHV", description: "Kunden über AHV-Nummer abfragen" },
  { name: "getAppointments", description: "Vereinbarte Termine eines Kunden" },
  { name: "getPatientHistory", description: "Suche in der Krankengeschichte" },
  { name: "getAttachment", description: "Datei aus Krankengeschichte" },
  { name: "getServices", description: "Onlinebuchbare Leistungen" },
  { name: "getSlots", description: "Verfügbare Termine" },
  { name: "createAppointment", description: "Termin erstellen" },
  { name: "modifyAppointment", description: "Termin ändern" },
  { name: "getProvider", description: "Provider (Behandler) abfragen" },
  { name: "getProviders", description: "Alle Provider abfragen" },
  { name: "getTreater", description: "Provider eines Patienten" },
];

interface RequestHistoryItem {
  id: string;
  endpoint: string;
  requestBody: string;
  response: string;
  status: number;
  duration: number;
  timestamp: Date;
}

export default function ApiPlayground() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.vitabyte.ch/v2");
  const [selectedEndpoint, setSelectedEndpoint] = useState("verify");
  const [requestBody, setRequestBody] = useState("{}");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastStatus, setLastStatus] = useState<number | null>(null);
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const [history, setHistory] = useState<RequestHistoryItem[]>([]);

  const buildRequestBody = () => {
    try {
      const parsed = JSON.parse(requestBody);
      return JSON.stringify({ api_key: apiKey, ...parsed }, null, 2);
    } catch {
      return JSON.stringify({ api_key: apiKey }, null, 2);
    }
  };

  const executeRequest = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "API Key fehlt",
        description: "Bitte geben Sie Ihren API Key ein",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setResponse("");
    setLastStatus(null);
    setLastDuration(null);

    const startTime = Date.now();
    const url = `${baseUrl}/${selectedEndpoint}`;

    try {
      let bodyToSend: Record<string, unknown> = { api_key: apiKey };
      try {
        const additionalParams = JSON.parse(requestBody);
        bodyToSend = { ...bodyToSend, ...additionalParams };
      } catch {
        // Keep just the api_key if parsing fails
      }

      const res = await fetch("/api/proxy-vitabyte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          body: bodyToSend,
        }),
      });

      const duration = Date.now() - startTime;
      const data = await res.json();
      const formattedResponse = JSON.stringify(data, null, 2);

      setResponse(formattedResponse);
      setLastStatus(res.status);
      setLastDuration(duration);

      const historyItem: RequestHistoryItem = {
        id: Date.now().toString(),
        endpoint: selectedEndpoint,
        requestBody: JSON.stringify(bodyToSend, null, 2),
        response: formattedResponse,
        status: res.status,
        duration,
        timestamp: new Date(),
      };
      setHistory((prev) => [historyItem, ...prev.slice(0, 19)]);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : "Unbekannter Fehler";
      setResponse(JSON.stringify({ error: errorMsg }, null, 2));
      setLastStatus(0);
      setLastDuration(duration);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Kopiert",
      description: "In Zwischenablage kopiert",
    });
  };

  const loadFromHistory = (item: RequestHistoryItem) => {
    setSelectedEndpoint(item.endpoint);
    try {
      const parsed = JSON.parse(item.requestBody);
      delete parsed.api_key;
      setRequestBody(JSON.stringify(parsed, null, 2));
    } catch {
      setRequestBody("{}");
    }
    setResponse(item.response);
    setLastStatus(item.status);
    setLastDuration(item.duration);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl" data-testid="api-playground-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Vitabyte API Playground</h1>
        <p className="text-muted-foreground mt-1">
          Testen Sie die Vitabyte API-Endpunkte und sehen Sie die Antworten in Echtzeit
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Konfiguration</CardTitle>
              <CardDescription>API-Key und Basis-URL konfigurieren</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="Ihr Vitabyte API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    data-testid="input-api-key"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="baseUrl">Basis-URL</Label>
                  <Select value={baseUrl} onValueChange={setBaseUrl}>
                    <SelectTrigger data-testid="select-base-url">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="https://api.vitabyte.ch/v2">Production (v2)</SelectItem>
                      <SelectItem value="https://dev.vitabyte.ch/v1">Development (v1)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Request</CardTitle>
              <CardDescription>Endpoint auswählen und Parameter definieren</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Endpoint</Label>
                <Select value={selectedEndpoint} onValueChange={setSelectedEndpoint}>
                  <SelectTrigger data-testid="select-endpoint">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VITABYTE_ENDPOINTS.map((ep) => (
                      <SelectItem key={ep.name} value={ep.name}>
                        <span className="font-mono">{ep.name}</span>
                        <span className="text-muted-foreground ml-2 text-sm">- {ep.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Request Body (JSON)</Label>
                <Textarea
                  className="font-mono text-sm min-h-[120px]"
                  placeholder='{"customerId": "12345"}'
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  data-testid="input-request-body"
                />
                <p className="text-xs text-muted-foreground">
                  Der API Key wird automatisch hinzugefügt. Hier nur zusätzliche Parameter eingeben.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <Button onClick={executeRequest} disabled={isLoading} data-testid="button-send-request">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Request senden
                </Button>
                <div className="text-sm text-muted-foreground">
                  POST {baseUrl}/{selectedEndpoint}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Response</CardTitle>
                <CardDescription>Antwort vom Server</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {lastStatus !== null && (
                  <Badge variant={lastStatus >= 200 && lastStatus < 300 ? "default" : "destructive"}>
                    {lastStatus >= 200 && lastStatus < 300 ? (
                      <Check className="h-3 w-3 mr-1" />
                    ) : (
                      <X className="h-3 w-3 mr-1" />
                    )}
                    Status: {lastStatus}
                  </Badge>
                )}
                {lastDuration !== null && (
                  <Badge variant="outline">
                    <Clock className="h-3 w-3 mr-1" />
                    {lastDuration}ms
                  </Badge>
                )}
                {response && (
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(response)} data-testid="button-copy-response">
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] rounded-md border bg-muted/50 p-4">
                <pre className="font-mono text-sm whitespace-pre-wrap" data-testid="text-response">
                  {response || "Noch keine Antwort. Senden Sie einen Request."}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Full Request Preview</CardTitle>
              <CardDescription>Der vollständige Request-Body</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px] rounded-md border bg-muted/50 p-4">
                <pre className="font-mono text-xs whitespace-pre-wrap">
                  {buildRequestBody()}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verlauf</CardTitle>
              <CardDescription>Letzte 20 Requests</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Noch keine Requests gesendet.</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((item) => (
                      <button
                        key={item.id}
                        className="w-full text-left p-3 rounded-md border hover:bg-muted/50 transition-colors"
                        onClick={() => loadFromHistory(item)}
                        data-testid={`button-history-item-${item.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm">{item.endpoint}</span>
                          <Badge
                            variant={item.status >= 200 && item.status < 300 ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {item.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {item.timestamp.toLocaleTimeString()} - {item.duration}ms
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
