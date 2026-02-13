import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { QrCode, ClipboardCheck, UserPlus, LogOut as LogOutIcon, ArrowRight, BookOpen, ChevronRight } from "lucide-react";
import { Link, useLocation } from "wouter";

const STORAGE_KEY = "staff_guide_dismissed";

const steps = [
  {
    number: 1,
    title: "Check In",
    icon: QrCode,
    color: "bg-emerald-500",
    summary: "Scan the QR code or start your session from the Dashboard to begin your day.",
    href: "/educator/my-classes",
  },
  {
    number: 2,
    title: "Take Attendance",
    icon: ClipboardCheck,
    color: "bg-blue-500",
    summary: "Mark students as present, absent, or tardy from your active session.",
    href: "/educator/my-classes",
  },
  {
    number: 3,
    title: "Add Aide / Volunteer",
    icon: UserPlus,
    color: "bg-purple-500",
    summary: "Log any helpers assisting in your classroom during the session.",
    href: "/educator/my-classes",
  },
  {
    number: 4,
    title: "Check Out",
    icon: LogOutIcon,
    color: "bg-amber-500",
    summary: "End your session when class is over to log your hours automatically.",
    href: "/educator/my-hours",
  },
];

export default function StaffGuideModal() {
  const [open, setOpen] = useState(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed !== "true") {
      const timer = setTimeout(() => setOpen(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    if (doNotShowAgain) {
      localStorage.setItem(STORAGE_KEY, "true");
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="staff-guide-modal">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-emerald-600" />
            <DialogTitle className="text-xl">Welcome! Here's Your Daily Workflow</DialogTitle>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Follow these 4 steps each day to stay on track.
          </p>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <button
                key={step.number}
                type="button"
                className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border w-full text-left cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-colors group"
                onClick={() => {
                  handleClose();
                  setLocation(step.href);
                }}
                data-testid={`staff-guide-step-${step.number}`}
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-full ${step.color} text-white shrink-0`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      Step {step.number}
                    </Badge>
                    <span className="font-semibold text-sm text-gray-900">{step.title}</span>
                  </div>
                  <p className="text-sm text-gray-600">{step.summary}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 mt-2 shrink-0 transition-colors" />
              </button>
            );
          })}
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-col">
          <div className="flex items-center gap-2 w-full" data-testid="do-not-show-checkbox">
            <Checkbox
              id="do-not-show"
              checked={doNotShowAgain}
              onCheckedChange={(checked) => setDoNotShowAgain(checked === true)}
            />
            <label htmlFor="do-not-show" className="text-sm text-gray-600 cursor-pointer select-none">
              Do not show this again
            </label>
          </div>
          <div className="flex items-center gap-2 w-full">
            <Button variant="outline" onClick={handleClose} className="flex-1" data-testid="staff-guide-close">
              Got it
            </Button>
            <Link href="/educator/staff-guide" className="flex-1">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleClose} data-testid="staff-guide-view-full">
                View Full Guide
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
