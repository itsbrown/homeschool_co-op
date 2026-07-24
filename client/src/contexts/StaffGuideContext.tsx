import { createContext, useContext, useState, useCallback } from "react";

interface StaffGuideStep {
  number: number;
  title: string;
  summary: string;
}

interface StaffGuideContextType {
  activeStep: StaffGuideStep | null;
  setActiveStep: (step: StaffGuideStep | null) => void;
  clearStep: () => void;
}

const StaffGuideContext = createContext<StaffGuideContextType | undefined>(undefined);

export function useStaffGuide() {
  const context = useContext(StaffGuideContext);
  if (context === undefined) {
    throw new Error("useStaffGuide must be used within a StaffGuideProvider");
  }
  return context;
}

/** Soft read for highlights that may render outside the educator staff-guide shell. */
export function useStaffGuideOptional() {
  return useContext(StaffGuideContext);
}

interface StaffGuideProviderProps {
  children: React.ReactNode;
}

export function StaffGuideProvider({ children }: StaffGuideProviderProps) {
  const [activeStep, setActiveStep] = useState<StaffGuideStep | null>(null);

  const clearStep = useCallback(() => {
    setActiveStep(null);
  }, []);

  return (
    <StaffGuideContext.Provider value={{ activeStep, setActiveStep, clearStep }}>
      {children}
    </StaffGuideContext.Provider>
  );
}
