import { useCallback, useEffect, useState } from "react";
import { useInteractiveTutorial } from "./InteractiveTutorial";
import { scheduleBuilderTutorial } from "./tutorialDefinitions";

export const SCHEDULE_BUILDER_TOUR_KEY = "schedule_builder_tour_seen";
const SCHEDULE_BUILDER_TOUR_SESSION_KEY = "schedule_builder_tour_prompt_session";

/**
 * School-admin Schedule Builder / Week Planner tour helpers.
 * First-visit soft prompt + explicit "How to use" launch.
 */
export function useScheduleBuilderTour(options?: { offerFirstVisitPrompt?: boolean }) {
  const { startTutorial } = useInteractiveTutorial();
  const [showTourPrompt, setShowTourPrompt] = useState(false);

  const markTourSeen = useCallback(() => {
    try {
      localStorage.setItem(SCHEDULE_BUILDER_TOUR_KEY, "true");
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const markPromptShownThisSession = useCallback(() => {
    try {
      sessionStorage.setItem(SCHEDULE_BUILDER_TOUR_SESSION_KEY, "true");
    } catch {
      /* ignore */
    }
  }, []);

  const launchTour = useCallback(() => {
    markTourSeen();
    markPromptShownThisSession();
    setShowTourPrompt(false);
    startTutorial(scheduleBuilderTutorial);
  }, [markTourSeen, markPromptShownThisSession, startTutorial]);

  const dismissTourPrompt = useCallback(
    (permanent: boolean) => {
      markPromptShownThisSession();
      if (permanent) markTourSeen();
      setShowTourPrompt(false);
    },
    [markTourSeen, markPromptShownThisSession],
  );

  useEffect(() => {
    if (!options?.offerFirstVisitPrompt) return;
    try {
      if (localStorage.getItem(SCHEDULE_BUILDER_TOUR_KEY) === "true") return;
      if (sessionStorage.getItem(SCHEDULE_BUILDER_TOUR_SESSION_KEY) === "true") return;
    } catch {
      return;
    }
    const timer = setTimeout(() => setShowTourPrompt(true), 600);
    return () => clearTimeout(timer);
  }, [options?.offerFirstVisitPrompt]);

  return {
    showTourPrompt,
    launchTour,
    dismissTourPrompt,
  };
}
