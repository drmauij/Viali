export type VerifyConfidence = 'high' | 'medium' | 'low';

interface ApptForHeuristic {
  serviceId: string | null;
  providerId: string;
}

export function computeVerifyConfidence(
  original: ApptForHeuristic,
  successor: ApptForHeuristic,
): VerifyConfidence {
  const sameService =
    original.serviceId != null &&
    successor.serviceId != null &&
    original.serviceId === successor.serviceId;
  const sameProvider = original.providerId === successor.providerId;

  if (sameService && sameProvider) return 'high';
  if (sameService || sameProvider) return 'medium';
  return 'low';
}
