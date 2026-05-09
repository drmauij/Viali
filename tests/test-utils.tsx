import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export function makeQueryWrapper() {
  const client = makeQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
