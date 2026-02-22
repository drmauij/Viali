import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Plus, Copy, Check, Send, Trash2, Link as LinkIcon, Mail, User, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";

interface WorklogLink {
  id: string;
  hospitalId: string;
  unitId: string;
  email: string;
  token: string;
  isActive: boolean;
  createdAt: string;
}

interface StaffUser {
  id: string;
  name: string;
  email: string | null;
  canLogin: boolean;
}

interface WorklogLinkManagerProps {
  hospitalId: string;
  unitId: string;
  unitName: string;
}

export function WorklogLinkManager({ hospitalId, unitId, unitName }: WorklogLinkManagerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showNewLinkDialog, setShowNewLinkDialog] = useState(false);
  const [newLinkEmail, setNewLinkEmail] = useState("");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [staffSearchInput, setStaffSearchInput] = useState("");
  const [emailOverride, setEmailOverride] = useState("");

  const { data: worklogLinks = [], isLoading } = useQuery<WorklogLink[]>({
    queryKey: [`/api/hospitals/${hospitalId}/units/${unitId}/worklog/links`],
    enabled: !!hospitalId && !!unitId,
  });

  // Fetch staff-only users for the staff picker
  const { data: staffUsers = [] } = useQuery<StaffUser[]>({
    queryKey: [`/api/hospitals/${hospitalId}/worklog/staff-users`],
    enabled: !!hospitalId && showNewLinkDialog,
  });

  const filteredStaff = useMemo(() => {
    if (!staffSearchInput) return staffUsers;
    const q = staffSearchInput.toLowerCase();
    return staffUsers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.email && s.email.toLowerCase().includes(q))
    );
  }, [staffUsers, staffSearchInput]);

  const isAutoEmail = (email: string | null) => email?.endsWith('@staff.local');

  const createLinkMutation = useMutation({
    mutationFn: async ({ email, userId }: { email: string; userId?: string }) => {
      // If user has auto-generated email and we have a real override, update their email first
      if (userId && emailOverride && emailOverride !== selectedStaff?.email) {
        const updateRes = await apiRequest('PATCH', `/api/admin/users/${userId}/email`, {
          email: emailOverride,
          hospitalId,
        });
        if (!updateRes.ok) {
          const data = await updateRes.json();
          throw new Error(data.message || 'Failed to update email');
        }
      }
      const finalEmail = emailOverride || email;
      return apiRequest('POST', `/api/hospitals/${hospitalId}/units/${unitId}/worklog/links`, { email: finalEmail, sendEmail: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${hospitalId}/units/${unitId}/worklog/links`] });
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${hospitalId}/worklog/staff-users`] });
      toast({
        title: t('worklogs.linkCreated'),
        description: t('worklogs.linkCreatedAndSent'),
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('worklogs.linkCreateFailed'),
        variant: "destructive",
      });
    },
  });

  const sendLinkMutation = useMutation({
    mutationFn: async ({ linkId }: { linkId: string }) => {
      return apiRequest('POST', `/api/hospitals/${hospitalId}/worklog/links/${linkId}/send`, {});
    },
    onSuccess: () => {
      toast({
        title: t('worklogs.linkSent'),
        description: t('worklogs.linkResent'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('worklogs.emailSendFailed'),
        variant: "destructive",
      });
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async ({ linkId }: { linkId: string }) => {
      return apiRequest('DELETE', `/api/hospitals/${hospitalId}/worklog/links/${linkId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${hospitalId}/units/${unitId}/worklog/links`] });
      toast({
        title: t('worklogs.linkDeleted'),
        description: t('worklogs.linkDeletedDesc'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('worklogs.linkDeleteFailed'),
        variant: "destructive",
      });
    },
  });

  const handleCopyLink = async (link: WorklogLink) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${baseUrl}/worklog/${link.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(link.id);
      toast({
        title: t('worklogs.linkCopied'),
        description: t('worklogs.linkCopiedDesc'),
      });
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (err) {
      toast({
        title: t('common.error'),
        description: t('worklogs.linkCopyFailed'),
        variant: "destructive",
      });
    }
  };

  const handleCloseDialog = () => {
    setShowNewLinkDialog(false);
    setNewLinkEmail("");
    setSelectedStaff(null);
    setStaffSearchInput("");
    setEmailOverride("");
  };

  const handleSelectStaff = (staff: StaffUser) => {
    setSelectedStaff(staff);
    setStaffSearchInput("");
    if (staff.email && !isAutoEmail(staff.email)) {
      setEmailOverride(staff.email);
    } else {
      setEmailOverride("");
    }
  };

  const handleDeselectStaff = () => {
    setSelectedStaff(null);
    setEmailOverride("");
  };

  const handleCreateLink = () => {
    const email = selectedStaff ? (emailOverride || selectedStaff.email || "") : newLinkEmail;
    if (!email || isAutoEmail(email)) {
      toast({
        title: t('common.error'),
        description: t('worklogs.emailRequired'),
        variant: "destructive",
      });
      return;
    }
    createLinkMutation.mutate({ email, userId: selectedStaff?.id });
  };

  const effectiveEmail = selectedStaff ? emailOverride : newLinkEmail;
  const canCreate = !!effectiveEmail && !isAutoEmail(effectiveEmail) && !createLinkMutation.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />
              {t('worklogs.externalTimeTracking')}
            </CardTitle>
            <CardDescription>
              {t('worklogs.linksForExternalWorkers', { unitName })}
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowNewLinkDialog(true)} data-testid="button-new-worklog-link">
            <Plus className="w-4 h-4 mr-1" />
            {t('worklogs.newLink')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : worklogLinks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t('worklogs.noLinks')}</p>
            <p className="text-sm">{t('worklogs.noLinksHint')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {worklogLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                data-testid={`worklog-link-${link.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{link.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('worklogs.createdOn')}: {formatDate(link.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleCopyLink(link)}
                    title={t('worklogs.copyLink')}
                    data-testid={`button-copy-link-${link.id}`}
                  >
                    {copiedLink === link.id ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => sendLinkMutation.mutate({ linkId: link.id })}
                    disabled={sendLinkMutation.isPending}
                    title={t('worklogs.resendLink')}
                    data-testid={`button-send-link-${link.id}`}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteLinkMutation.mutate({ linkId: link.id })}
                    disabled={deleteLinkMutation.isPending}
                    title={t('worklogs.deleteLink')}
                    className="text-destructive hover:text-destructive"
                    data-testid={`button-delete-link-${link.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showNewLinkDialog} onOpenChange={(open) => { if (!open) handleCloseDialog(); else setShowNewLinkDialog(true); }}>
        <DialogContent data-testid="dialog-new-worklog-link" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('worklogs.createNewLink')}</DialogTitle>
            <DialogDescription>
              {t('worklogs.createLinkDescriptionExtended')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Staff user picker */}
            {staffUsers.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('worklogs.selectStaffMember')}</Label>
                {selectedStaff ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-md border bg-muted/30">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{selectedStaff.name}</span>
                      {selectedStaff.email && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {selectedStaff.email}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs px-2"
                      onClick={handleDeselectStaff}
                    >
                      {t('worklogs.changeSelection')}
                    </Button>
                  </div>
                ) : (
                  <Command className="border rounded-md" shouldFilter={false}>
                    <CommandInput
                      placeholder={t('worklogs.searchStaff')}
                      value={staffSearchInput}
                      onValueChange={setStaffSearchInput}
                    />
                    <CommandList className="max-h-40">
                      <CommandEmpty>{t('worklogs.noStaffFound')}</CommandEmpty>
                      <CommandGroup>
                        {filteredStaff.map((staff) => (
                          <CommandItem
                            key={staff.id}
                            onSelect={() => handleSelectStaff(staff)}
                            className="cursor-pointer"
                          >
                            <User className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                            <span className="font-medium">{staff.name}</span>
                            {staff.email && !isAutoEmail(staff.email) && (
                              <span className="text-xs text-muted-foreground ml-2">{staff.email}</span>
                            )}
                            {isAutoEmail(staff.email) && (
                              <span className="text-xs text-amber-500 ml-2 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {t('worklogs.noRealEmail')}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                )}
              </div>
            )}

            {/* Email input — context-dependent */}
            {selectedStaff ? (
              <div className="space-y-2">
                <Label htmlFor="staff-email" className="text-sm font-medium">
                  {t('worklogs.emailAddress')}
                </Label>
                {isAutoEmail(selectedStaff.email) && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t('worklogs.autoEmailWarning')}
                  </div>
                )}
                <Input
                  id="staff-email"
                  type="email"
                  placeholder="name@example.com"
                  value={emailOverride}
                  onChange={(e) => setEmailOverride(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canCreate && handleCreateLink()}
                  data-testid="input-staff-email"
                />
              </div>
            ) : (
              <div className="space-y-2">
                {staffUsers.length > 0 && (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        {t('worklogs.orEnterManually')}
                      </span>
                    </div>
                  </div>
                )}
                <Label htmlFor="new-link-email">{t('worklogs.emailAddress')}</Label>
                <Input
                  id="new-link-email"
                  type="email"
                  placeholder="worker@example.com"
                  value={newLinkEmail}
                  onChange={(e) => setNewLinkEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canCreate && handleCreateLink()}
                  data-testid="input-new-link-email"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreateLink}
              disabled={!canCreate}
              data-testid="button-create-link"
            >
              {createLinkMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('worklogs.creating')}
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  {t('worklogs.createAndSendLink')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
