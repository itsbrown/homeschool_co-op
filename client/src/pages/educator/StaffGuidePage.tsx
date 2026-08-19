import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, LogOut as LogOutIcon, ArrowRight, BookOpen, ExternalLink, PlayCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useStaffGuide } from "@/contexts/StaffGuideContext";

const steps = [
  {
    number: 1,
    title: "Start class",
    icon: PlayCircle,
    color: "bg-emerald-500",
    badgeColor: "bg-emerald-100 text-emerald-700",
    borderColor: "#10b981",
    description: "Open Dashboard. Classes listed under Today are the ones that meet this weekday.",
    href: "/educator/dashboard",
    actionLabel: "Go to Dashboard",
    details: [
      "Tap Start on the class that is meeting now. That one tap creates the session and opens the roster.",
      "My Classes still lists every assignment if you need to start a class that does not meet today.",
      "QR clock-in is a separate school-admin path. It is not the default Start button.",
    ],
  },
  {
    number: 2,
    title: "Take attendance",
    icon: ClipboardCheck,
    color: "bg-blue-500",
    badgeColor: "bg-blue-100 text-blue-700",
    borderColor: "#3b82f6",
    description: "Mark who is in the room on the active session screen. There is no Attendance tab.",
    href: "/educator/dashboard",
    actionLabel: "Go to Dashboard",
    details: [
      "The roster is on the session page. Tap Present, Late, or Absent for each child — it saves when you tap.",
      "All present marks the whole room in one tap. Unmarked kids stay highlighted.",
      "Assigned aides are listed when you start. Adding a walk-in volunteer during class is not available yet.",
    ],
  },
  {
    number: 3,
    title: "End session",
    icon: LogOutIcon,
    color: "bg-amber-500",
    badgeColor: "bg-amber-100 text-amber-700",
    borderColor: "#f59e0b",
    description: "End the session when class is over so hours are logged.",
    href: "/educator/my-hours",
    actionLabel: "Go to My Hours",
    details: [
      "Tap End Session. If anyone is unmarked, you can mark the rest absent before you confirm.",
      "Stay on the session to see present / absent counts, then go back to the dashboard.",
      "The session appears on My Hours for review.",
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
          Phone in hand: start class, mark who is here, end when you are done.
        </p>
      </div>

      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200 hidden md:block" />

        <div className="space-y-6">
          {steps.map((step) => {
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
