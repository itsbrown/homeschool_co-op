import { useEffect } from "react";
import { useLocation } from "wouter";

// This component simply redirects from /programs/browse to /programs
export default function ProgramsBrowseRedirect() {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    // Redirect to the main programs page
    setLocation("/programs");
  }, [setLocation]);
  
  return (
    <div className="flex justify-center items-center h-screen">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      <p className="ml-4">Redirecting to programs...</p>
    </div>
  );
}