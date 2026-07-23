import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Target,
  Users,
} from "lucide-react";

export type WeekPlanBlockDetail = {
  title: string;
  description?: string | null;
  blockType?: string;
  isCompleted?: boolean;
  objectives?: string[];
  groups?: string[];
  notes?: string | null;
  lessonLink?: string | null;
  /** e.g. "Monday · 9:00 AM – 10:00 AM" */
  timeLabel?: string;
};

function blockTypeBadgeLg(blockType: string) {
  if (blockType === "anchor") {
    return (
      <Badge className="px-2.5 py-0.5 bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">
        Core
      </Badge>
    );
  }
  if (blockType === "curriculum") {
    return (
      <Badge className="px-2.5 py-0.5 bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100">
        Curriculum
      </Badge>
    );
  }
  return (
    <Badge className="px-2.5 py-0.5 bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100">
      Flexible
    </Badge>
  );
}

/**
 * Shared read-only week-plan block detail sheet (educator Lesson Plans + Schedule).
 */
export function WeekPlanBlockDetailSheet({
  open,
  onClose,
  block,
}: {
  open: boolean;
  onClose: () => void;
  block: WeekPlanBlockDetail | null;
}) {
  if (!block) return null;

  const title = block.title || "";
  const description = block.description || "";
  const blockType = block.blockType || "flexible";
  const isCompleted = block.isCompleted || false;
  const objectives = Array.isArray(block.objectives) ? block.objectives : [];
  const groups = Array.isArray(block.groups) ? block.groups : [];
  const lessonLink = block.lessonLink || "";
  const notes = block.notes || "";

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto no-print"
        aria-label={`Block details for ${title || "this block"}`}
        data-testid="schedule-block-detail"
      >
        <SheetHeader className="mb-6">
          {block.timeLabel && (
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <SheetDescription className="text-slate-500 text-sm">
                {block.timeLabel}
              </SheetDescription>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {blockTypeBadgeLg(blockType)}
            {isCompleted && (
              <Badge className="px-2.5 py-0.5 bg-green-100 text-green-700 border-green-200 hover:bg-green-100 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Completed
              </Badge>
            )}
          </div>
          <SheetTitle className="text-xl font-bold text-slate-900 leading-snug mt-2">
            {title || <span className="text-slate-400 italic">No title set</span>}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {description && (
            <section>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Description
              </p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {description}
              </p>
            </section>
          )}

          {objectives.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="h-3.5 w-3.5 text-purple-500" />
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Learning Objectives
                </p>
              </div>
              <ul className="space-y-2">
                {objectives.map((obj: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="text-purple-400 font-bold flex-shrink-0 mt-0.5">•</span>
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {groups.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="h-3.5 w-3.5 text-amber-500" />
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Groups
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {groups.map((g: string, i: number) => (
                  <Badge
                    key={i}
                    className="px-2.5 py-1 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50 text-sm"
                  >
                    {g}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {notes && (
            <section>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Notes
              </p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-amber-50 border border-amber-100 rounded-md p-3">
                {notes}
              </p>
            </section>
          )}

          {lessonLink && (
            <section>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Resource
              </p>
              <Button asChild variant="outline" className="w-full justify-between">
                <a href={lessonLink} target="_blank" rel="noopener noreferrer">
                  <span>Open Lesson</span>
                  <ExternalLink className="h-4 w-4 text-slate-400" />
                </a>
              </Button>
            </section>
          )}

          {!description &&
            !objectives.length &&
            !groups.length &&
            !notes &&
            !lessonLink && (
              <p className="text-sm text-slate-400 italic text-center py-4">
                No additional details for this block.
              </p>
            )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
