import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/components/SupabaseProvider";
import {
  queueActivityEvent,
  startActivityHeartbeat,
  recordLoginActivity,
} from "@/lib/telemetryClient";

/** Wires page views, session heartbeats, and login events to server telemetry. */
export function ActivityTelemetry() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    startActivityHeartbeat();
    recordLoginActivity();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    queueActivityEvent({ eventType: "page_view", path: location });
  }, [location, isAuthenticated]);

  return null;
}
