import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import PatientQuestionnaire from "./PatientQuestionnaire";

export default function QuestionnaireAliasResolver() {
  const { alias } = useParams<{ alias: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/public/questionnaire/by-alias', alias],
    queryFn: async () => {
      const res = await fetch(`/api/public/questionnaire/by-alias/${alias}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'not_found');
      }
      return res.json() as Promise<{ token: string }>;
    },
    enabled: !!alias,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data?.token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Questionnaire not available</h1>
          <p className="text-gray-600">
            This questionnaire link is not active. Please contact your clinic for assistance.
          </p>
        </div>
      </div>
    );
  }

  return <PatientQuestionnaire resolvedToken={data.token} isHospitalLink />;
}
