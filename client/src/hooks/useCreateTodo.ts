import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useCreateTodo(hospitalId: string | undefined) {
  const { toast } = useToast();

  const createTodoMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!hospitalId) throw new Error("No hospital selected");
      const response = await apiRequest("POST", `/api/hospitals/${hospitalId}/todos`, { title });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', hospitalId, 'todos'] });
      toast({ title: "Added to To-Do", description: "Note converted to a task" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create task", variant: "destructive" });
    },
  });

  const createTodo = (text: string, patientId?: string, patientName?: string) => {
    let title = text.slice(0, 200);
    if (patientId && patientName) {
      title = `#[${patientName}](${patientId}) ${title}`;
    }
    createTodoMutation.mutate(title);
  };

  return { createTodo, isPending: createTodoMutation.isPending };
}
