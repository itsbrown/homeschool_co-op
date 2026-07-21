import { createContext, useContext } from "react";

/**
 * Stable context module for interactive tutorials.
 *
 * Keep createContext here (not in InteractiveTutorial.tsx) so Vite HMR of
 * overlay/spotlight styling does not recreate the context object and break
 * App's InteractiveTutorialProvider for consumers like useScheduleBuilderTour.
 */

export interface TutorialStep {
  target: string;
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  route?: string;
  waitForNavigation?: boolean;
  actionText?: string;
}

export interface InteractiveTutorialDefinition {
  id: string;
  title: string;
  description: string;
  steps: TutorialStep[];
}

export interface InteractiveTutorialContextType {
  activeTutorial: InteractiveTutorialDefinition | null;
  currentStep: number;
  startTutorial: (tutorial: InteractiveTutorialDefinition) => void;
  endTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  isActive: boolean;
}

export const InteractiveTutorialContext = createContext<InteractiveTutorialContextType | null>(null);

const NOOP_TUTORIAL_CONTEXT: InteractiveTutorialContextType = {
  activeTutorial: null,
  currentStep: 0,
  startTutorial: () => {},
  endTutorial: () => {},
  nextStep: () => {},
  previousStep: () => {},
  isActive: false,
};

/**
 * Soft-fail like RoleSwitcher: Vite HMR can briefly leave consumers on a
 * different context instance than InteractiveTutorialProvider. Prefer a no-op
 * over a white-screen crash on Week Planner / Schedule Builder.
 */
export function useInteractiveTutorial(): InteractiveTutorialContextType {
  const context = useContext(InteractiveTutorialContext);
  if (!context) {
    console.warn(
      "useInteractiveTutorial: InteractiveTutorialProvider not available yet (hard refresh if tours stay broken)",
    );
    return NOOP_TUTORIAL_CONTEXT;
  }
  return context;
}
