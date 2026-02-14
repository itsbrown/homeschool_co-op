import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QrCode, ClipboardCheck, UserPlus, LogOut as LogOutIcon, ArrowRight, BookOpen, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { useStaffGuide } from "@/contexts/StaffGuideContext";

const steps = [
  {
    number: 1,
    title: "Check In",
    icon: QrCode,
    color: "bg-emerald-500",
    badgeColor: "bg-emerald-100 text-emerald-700",
    borderColor: "#10b981",
    description: "Start your day by checking in at your assigned school location.",
    href: "/educator/my-classes",
    actionLabel: "Go to My Classes",
    details: [
      "Open your Dashboard and tap \"Start Session\" for your scheduled class.",
      "If your school uses QR check-in, scan the QR code displayed at the front desk or classroom.",
      "Your device may ask for location permission — allow it so your check-in location can be verified.",
      "Once verified, your session status will show as \"Active\" and the session timer begins.",
    ],
  },
  {
    number: 2,
    title: "Take Attendance",
    icon: ClipboardCheck,
    color: "bg-blue-500",
    badgeColor: "bg-blue-100 text-blue-700",
    borderColor: "#3b82f6",
    description: "Mark each student as present, absent, or tardy for the active session.",
    href: "/educator/my-classes",
    actionLabel: "Go to My Classes",
    details: [
      "From your active session, tap the \"Attendance\" tab to see the student roster.",
      "Tap each student's name to toggle their status: Present, Absent, or Tardy.",
      "For tardy students, you can optionally record how many minutes late they arrived.",
      "Attendance is saved automatically — you can update it at any time during the session.",
    ],
  },
  {
    number: 3,
    title: "Add Aide / Volunteer",
    icon: UserPlus,
    color: "bg-purple-500",
    badgeColor: "bg-purple-100 text-purple-700",
    borderColor: "#a855f7",
    description: "Log any aides or volunteers assisting in your classroom for the session.",
    href: "/educator/my-classes",
    actionLabel: "Go to My Classes",
    details: [
      "In your active session, look for the \"Aides & Volunteers\" section.",
      "Tap \"Add Aide\" or \"Add Volunteer\" and enter their name and role.",
      "This record is attached to the session for administrative reporting.",
      "You can remove an aide or volunteer if they leave early.",
    ],
  },
  {
    number: 4,
    title: "Check Out",
    icon: LogOutIcon,
    color: "bg-amber-500",
    badgeColor: "bg-amber-100 text-amber-700",
    borderColor: "#f59e0b",
    description: "End your session when class is over to log your hours.",
    href: "/educator/my-hours",
    actionLabel: "Go to My Hours",
    details: [
      "When class ends, return to your active session and tap \"End Session.\"",
      "Confirm the end time — it defaults to now, but you can adjust if needed.",
      "Your total hours for this session are calculated automatically.",
      "The session moves to your \"My Hours\" log for review and admin approval.",
    ],
  },
];

export default function StaffGuidePage() {
  const [, setLocation] = useLocation();
  const { setActiveStep } = useStaffGuide();

  const handleStepClick = (step: typeof steps[0]) => {
    setActiveStep({ number: step.number, title: step.title, summary: step.description });
    setLocation(step.href);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="h-8 w-8 text-emerald-600" />
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Staff Guide</h1>
        </div>
        <p className="text-gray-600 text-base md:text-lg">
          A quick walkthrough of your daily workflow — from check-in to check-out.
        </p>
      </div>

      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200 hidden md:block" />

        <div className="space-y-6">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.number} onClick={() => handleStepClick(step)} className="cursor-pointer">
                <Card className="relative overflow-hidden border-l-4 hover:shadow-md transition-shadow group" style={{ borderLeftColor: step.borderColor }}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${step.color} text-white shrink-0`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap flex-1">
                        <Badge variant="outline" className={step.badgeColor}>
                          Step {step.number}
                        </Badge>
                        <CardTitle className="text-lg md:text-xl">{step.title}</CardTitle>
                      </div>
                      <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-gray-600 shrink-0 transition-colors" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 mb-4 text-sm md:text-base">{step.description}</p>
                    <ul className="space-y-2">
                      {step.details.map((detail, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm md:text-base text-gray-700">
                          <ArrowRight className="h-4 w-4 mt-0.5 text-gray-400 shrink-0" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex justify-end">
                      <Button variant="outline" size="sm" className="gap-1 group-hover:bg-gray-50">
                        {step.actionLabel}
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
        <p className="text-sm text-emerald-800">
          <strong>Need help?</strong> If you run into any issues, reach out to your school administrator or check the Notifications tab for updates.
        </p>
      </div>
    </div>
  );
}
