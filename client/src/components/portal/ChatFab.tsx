import { useState } from "react";
import { MessageSquare } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import PatientMessages from "./PatientMessages";
import type { PatientMessage } from "./PatientMessages";

interface ChatFabProps {
  token: string;
  hospitalId: string;
  patientId: string;
  isDark: boolean;
  unreadCount: number;
  messages?: PatientMessage[];
  messagesLoading?: boolean;
  translations: {
    messagesTitle: string;
    typeMessage: string;
    send: string;
    noMessages: string;
    noMessagesDesc: string;
    today: string;
    yesterday: string;
  };
  /** External open state for desktop Sheet (controlled by header button) */
  desktopOpen?: boolean;
  onDesktopOpenChange?: (open: boolean) => void;
}

export default function ChatFab({
  token,
  hospitalId,
  patientId,
  isDark,
  unreadCount,
  messages,
  messagesLoading,
  translations,
  desktopOpen,
  onDesktopOpenChange,
}: ChatFabProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const chatContent = (
    <PatientMessages
      token={token}
      hospitalId={hospitalId}
      patientId={patientId}
      isDark={isDark}
      messages={messages}
      messagesLoading={messagesLoading}
      className="h-full border-0"
      translations={translations}
    />
  );

  return (
    <>
      {/* Mobile: FAB + bottom Drawer */}
      <div className="lg:hidden">
        <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
          <DrawerTrigger asChild>
            <button
              className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg flex items-center justify-center transition-colors"
              aria-label={translations.messagesTitle}
            >
              <MessageSquare className="h-6 w-6" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center px-1">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </DrawerTrigger>
          <DrawerContent className="h-[80dvh]">
            <DrawerHeader className="pb-0">
              <DrawerTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {translations.messagesTitle}
              </DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 overflow-hidden px-4 pb-4">
              {chatContent}
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Desktop: right-side Sheet (controlled from parent header button) */}
      <div className="hidden lg:block">
        <Sheet open={desktopOpen} onOpenChange={onDesktopOpenChange}>
          <SheetContent side="right" className="w-[400px] sm:max-w-[400px] p-0 flex flex-col">
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {translations.messagesTitle}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-hidden px-4 pb-4">
              {chatContent}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
