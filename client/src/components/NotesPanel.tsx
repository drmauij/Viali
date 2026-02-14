import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X, Trash2, Edit2, Save } from "lucide-react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import type { Note } from "@shared/schema";

interface NotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeHospital?: {
    id: string;
    name: string;
    unitId: string;
    unitName: string;
  };
}

export default function NotesPanel({ isOpen, onClose, activeHospital }: NotesPanelProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [newNoteContent, setNewNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [activeTab, setActiveTab] = useState<"personal" | "unit" | "hospital">("personal");

  // Scroll lock when panel is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Fetch notes based on active tab scope
  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey: [`/api/notes/${activeHospital?.id}`, activeHospital?.id, activeTab],
    queryFn: async () => {
      const response = await fetch(`/api/notes/${activeHospital?.id}?scope=${activeTab}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch notes');
      return response.json();
    },
    enabled: !!activeHospital?.id && isOpen,
  });

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (noteData: { content: string; scope: 'personal' | 'unit' | 'hospital' }) => {
      const response = await apiRequest("POST", `/api/notes`, {
        content: noteData.content,
        isShared: noteData.scope !== 'personal', // backward compatibility
        scope: noteData.scope,
        hospitalId: activeHospital?.id,
        unitId: activeHospital?.unitId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/notes/${activeHospital?.id}`] });
      setNewNoteContent("");
    },
  });

  // Update note mutation
  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, content, isShared }: { noteId: string; content: string; isShared: boolean }) => {
      const response = await apiRequest("PATCH", `/api/notes/${noteId}`, { content, isShared });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/notes/${activeHospital?.id}`] });
      setEditingNoteId(null);
      setEditContent("");
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const response = await apiRequest("DELETE", `/api/notes/${noteId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/notes/${activeHospital?.id}`] });
    },
  });

  const handleCreateNote = () => {
    if (!newNoteContent.trim()) return;
    
    createNoteMutation.mutate({ content: newNoteContent, scope: activeTab });
  };

  const handleEditNote = (note: Note) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  };

  const handleSaveEdit = (note: Note) => {
    if (!editContent.trim()) return;
    updateNoteMutation.mutate({
      noteId: note.id,
      content: editContent,
      isShared: note.isShared,
    });
  };

  const handleDeleteNote = (noteId: string) => {
    if (confirm(t("notes.deleteConfirm"))) {
      deleteNoteMutation.mutate(noteId);
    }
  };

  // Notes are already filtered by scope on the backend
  const displayedNotes = notes;

  const panelContent = (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[998]"
          onClick={onClose}
          data-testid="notes-overlay"
          style={{ touchAction: 'none' }}
        />
      )}

      {/* Slide Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-card border-l border-border shadow-xl z-[999] transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        data-testid="notes-panel"
        style={{ touchAction: 'pan-y', pointerEvents: 'auto' }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border relative z-10">
            <h2 className="text-lg font-semibold text-foreground">{t("notes.title")}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-accent flex items-center justify-center transition-colors relative z-10"
              data-testid="button-close-notes"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="p-4 border-b border-border">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "personal" | "unit" | "hospital")}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="personal" data-testid="tab-personal-notes">
                  {t("notes.myNotes")}
                </TabsTrigger>
                <TabsTrigger value="unit" data-testid="tab-unit-notes">
                  {t("notes.unitNotes")}
                </TabsTrigger>
                <TabsTrigger value="hospital" data-testid="tab-hospital-notes">
                  {t("notes.hospitalNotes")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Quick Add Form */}
          <div className="p-4 border-b border-border">
            <Textarea
              placeholder={
                activeTab === "personal"
                  ? t("notes.addPersonalNote")
                  : activeTab === "unit"
                  ? t("notes.addUnitNote")
                  : t("notes.addHospitalNote")
              }
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              className="mb-2 min-h-[80px]"
              data-testid="input-new-note"
            />
            <Button
              onClick={handleCreateNote}
              disabled={!newNoteContent.trim() || createNoteMutation.isPending}
              className="w-full"
              data-testid="button-add-note"
            >
              {createNoteMutation.isPending ? t("common.adding") : t("notes.addNote")}
            </Button>
          </div>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading ? (
              <div className="text-center text-muted-foreground">{t("notes.loadingNotes")}</div>
            ) : displayedNotes.length === 0 ? (
              <div className="text-center text-muted-foreground" data-testid={`empty-${activeTab}-notes`}>
                {activeTab === "personal" ? t("notes.noPersonalNotes") : activeTab === "unit" ? t("notes.noUnitNotes") : t("notes.noHospitalNotes")}
              </div>
            ) : (
              <>
                {displayedNotes.map((note) => (
                  <div
                    key={note.id}
                    className="bg-accent/50 rounded-lg p-3 border border-border"
                    data-testid={`note-${note.id}`}
                  >
                    {editingNoteId === note.id ? (
                      <>
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="mb-2 min-h-[80px]"
                          data-testid={`input-edit-note-${note.id}`}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(note)}
                            disabled={updateNoteMutation.isPending}
                            data-testid={`button-save-note-${note.id}`}
                          >
                            <Save className="w-4 h-4 mr-1" />
                            {t("common.save")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingNoteId(null);
                              setEditContent("");
                            }}
                            data-testid={`button-cancel-edit-${note.id}`}
                          >
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="prose prose-sm dark:prose-invert max-w-none mb-2">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {note.content}
                          </ReactMarkdown>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{note.createdAt && format(new Date(note.createdAt), "MMM d, yyyy h:mm a")}</span>
                          {/* Show edit/delete buttons based on permissions:
                              - Personal notes: only the creator
                              - Unit notes: creator OR any user in the same unit (unitId matches)
                              - Hospital notes: only the creator (admins handled by backend)
                          */}
                          {(note.userId === (user as any)?.id || 
                            (note.scope === 'unit' && note.unitId === activeHospital?.unitId)) && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditNote(note)}
                                className="hover:text-foreground transition-colors"
                                data-testid={`button-edit-note-${note.id}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className="hover:text-destructive transition-colors"
                                data-testid={`button-delete-note-${note.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );

  if (!isOpen && typeof window === 'undefined') {
    return null;
  }

  return typeof window !== 'undefined' 
    ? createPortal(panelContent, document.body)
    : null;
}
