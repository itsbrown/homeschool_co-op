import type { ReactNode } from "react";
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
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  Package,
  Target,
  Users,
} from "lucide-react";
import { asTrimmedStrings, formatGroupLabels } from "@/lib/week-plan-lesson-content";

export type WeekPlanBlockDetail = {
  title: string;
  description?: string | null;
  blockType?: string;
  isCompleted?: boolean;
  objectives?: unknown;
  groups?: unknown;
  notes?: string | null;
  lessonLink?: string | null;
  materials?: unknown;
  homework?: string | null;
  resources?: unknown;
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

function DetailSection({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </p>
      </div>
      {children}
    </section>
  );
}

/** Read-only lesson body, shared by the side sheet and the family day sheet. */
export function WeekPlanBlockDetailBody({ block }: { block: WeekPlanBlockDetail }) {
  const description = block.description || "";
  const objectives = asTrimmedStrings(block.objectives);
  const groups = formatGroupLabels(block.groups);
  const materials = asTrimmedStrings(block.materials);
  const resources = asTrimmedStrings(block.resources);
  const lessonLink = block.lessonLink || "";
  const notes = block.notes || "";
  const homework = block.homework || "";
  const extraLinks = resources.filter((url) => url !== lessonLink);

  return (
        <div className="space-y-6">
          {description && (
            <DetailSection label="What we are teaching">
              <p
                className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap"
                data-testid="schedule-block-description"
              >
                {description}
              </p>
            </DetailSection>
          )}

          {objectives.length > 0 && (
            <DetailSection
              label="Learning Objectives"
              icon={<Target className="h-3.5 w-3.5 text-purple-500" />}
            >
              <ul className="space-y-2" data-testid="schedule-block-objectives">
                {objectives.map((obj, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="text-purple-400 font-bold flex-shrink-0 mt-0.5">•</span>
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}

          {materials.length > 0 && (
            <DetailSection
              label="Materials"
              icon={<Package className="h-3.5 w-3.5 text-emerald-500" />}
            >
              <ul className="space-y-1.5" data-testid="schedule-block-materials">
                {materials.map((item, i) => (
                  <li key={i} className="text-sm text-slate-700">
                    {item}
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}

          {groups.length > 0 && (
            <DetailSection
              label="Groups"
              icon={<Users className="h-3.5 w-3.5 text-amber-500" />}
            >
              <div className="flex flex-wrap gap-2">
                {groups.map((g, i) => (
                  <Badge
                    key={i}
                    className="px-2.5 py-1 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50 text-sm"
                  >
                    {g}
                  </Badge>
                ))}
              </div>
            </DetailSection>
          )}

          {homework && (
            <DetailSection
              label="Homework"
              icon={<BookOpen className="h-3.5 w-3.5 text-blue-500" />}
            >
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {homework}
              </p>
            </DetailSection>
          )}

          {notes && (
            <DetailSection label="Teaching notes">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-amber-50 border border-amber-100 rounded-md p-3">
                {notes}
              </p>
            </DetailSection>
          )}

          {(lessonLink || extraLinks.length > 0) && (
            <DetailSection label="Resources">
              <div className="space-y-2">
                {lessonLink && (
                  <Button asChild variant="outline" className="w-full justify-between">
                    <a href={lessonLink} target="_blank" rel="noopener noreferrer">
                      <span>Open Lesson</span>
                      <ExternalLink className="h-4 w-4 text-slate-400" />
                    </a>
                  </Button>
                )}
                {extraLinks.map((url) => (
                  <Button key={url} asChild variant="outline" className="w-full justify-between">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <span className="truncate text-left">{url}</span>
                      <ExternalLink className="h-4 w-4 text-slate-400 shrink-0" />
                    </a>
                  </Button>
                ))}
              </div>
            </DetailSection>
          )}

          {!description &&
            !objectives.length &&
            !materials.length &&
            !groups.length &&
            !homework &&
            !notes &&
            !lessonLink &&
            extraLinks.length === 0 && (
              <p className="text-sm text-slate-400 italic text-center py-4">
                No additional details for this block.
              </p>
            )}
        </div>
  );
}

/**
 * Shared read-only week-plan block detail sheet (educator Lesson Plans + Schedule + Week Planner).
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
  const blockType = block.blockType || "flexible";
  const isCompleted = block.isCompleted || false;

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
        <WeekPlanBlockDetailBody block={block} />
      </SheetContent>
    </Sheet>
  );
}
