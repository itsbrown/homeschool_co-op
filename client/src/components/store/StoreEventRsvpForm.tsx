import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StoreCatalogItem } from "@/lib/store-catalog";
import {
  STORE_ATTENDEE_LABELS,
  STORE_ATTENDEE_TYPES,
  STORE_MEAL_LABELS,
  STORE_MEAL_TYPES,
  formatEventWhen,
  priceEventRsvp,
  type StoreAttendeeType,
  type StoreEventRsvp,
  type StoreEventRsvpAnswer,
  type StoreMealType,
} from "@shared/store-event-rsvp";
import { formatStoreMoney } from "@/lib/store-catalog-display";

function configFromCatalog(item: StoreCatalogItem): StoreEventRsvp | null {
  const rsvp = item.rsvp;
  if (!rsvp) return null;
  return {
    startsOn: rsvp.startsOn,
    startTime: rsvp.startTime,
    endTime: rsvp.endTime,
    location: rsvp.location,
    closeOn: rsvp.closeOn,
    attendees: STORE_ATTENDEE_TYPES.map((type) => {
      const row = rsvp.attendees.find((attendee) => attendee.type === type);
      return {
        type,
        enabled: row?.enabled ?? false,
        priceCents: row?.priceCents ?? 0,
        capacity: null,
      };
    }),
    meals: STORE_MEAL_TYPES.map((type) => ({
      type,
      enabled: rsvp.meals.some((meal) => meal.type === type && meal.enabled),
    })),
  };
}

export function StoreEventRsvpForm({
  item,
  onSubmit,
}: {
  item: StoreCatalogItem;
  onSubmit: (answer: StoreEventRsvpAnswer, lineTotalCents: number, headcount: number) => void;
}) {
  const config = configFromCatalog(item);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [otherNote, setOtherNote] = useState("");

  const answer: StoreEventRsvpAnswer = useMemo(
    () => ({
      attendees: STORE_ATTENDEE_TYPES.map((type) => ({ type, quantity: counts[type] ?? 0 })),
      meals: STORE_MEAL_TYPES.map((type) => ({ type, quantity: counts[type] ?? 0 })),
      otherNote: otherNote.trim() ? otherNote.trim() : null,
    }),
    [counts, otherNote],
  );

  if (!config) {
    return <p className="text-sm text-muted-foreground">This event is not open for RSVP.</p>;
  }

  const priced = priceEventRsvp({ config, answer });
  const setCount = (key: string, value: number) => {
    setCounts((prev) => ({ ...prev, [key]: Number.isFinite(value) && value > 0 ? Math.floor(value) : 0 }));
  };

  return (
    <div className="space-y-4" data-testid="store-event-rsvp-form">
      <p className="text-sm text-muted-foreground" data-testid="store-event-when">
        {formatEventWhen(config)}
        <br />
        {config.location}
      </p>
      {config.attendees
        .filter((row) => row.enabled)
        .map((row) => (
          <CountField
            key={row.type}
            id={`attendee-${row.type}`}
            label={`${STORE_ATTENDEE_LABELS[row.type as StoreAttendeeType]} · ${
              row.priceCents === 0 ? "Free" : formatStoreMoney(row.priceCents)
            }`}
            value={counts[row.type] ?? 0}
            onChange={(value) => setCount(row.type, value)}
          />
        ))}
      {config.meals
        .filter((row) => row.enabled)
        .map((row) => (
          <CountField
            key={row.type}
            id={`meal-${row.type}`}
            label={STORE_MEAL_LABELS[row.type as StoreMealType]}
            value={counts[row.type] ?? 0}
            onChange={(value) => setCount(row.type, value)}
          />
        ))}
      {config.meals.some((row) => row.type === "other" && row.enabled) && (counts.other ?? 0) > 0 && (
        <div className="space-y-1">
          <Label htmlFor="event-other-note">Describe the other allergy</Label>
          <Input
            id="event-other-note"
            value={otherNote}
            onChange={(e) => setOtherNote(e.target.value)}
            data-testid="input-event-other-note"
          />
        </div>
      )}
      <p className="text-sm font-medium" data-testid="store-event-total">
        {priced.ok ? formatStoreMoney(priced.lineTotalCents) : priced.unavailableReason}
      </p>
      <Button
        className="w-full min-h-11"
        disabled={!priced.ok}
        data-testid={`store-add-event-${item.listingId}`}
        onClick={() => {
          if (!priced.ok) return;
          onSubmit(answer, priced.lineTotalCents, priced.headcount);
        }}
      >
        {priced.ok ? `RSVP · ${formatStoreMoney(priced.lineTotalCents)}` : "RSVP"}
      </Button>
    </div>
  );
}

function CountField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        className="w-20"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        data-testid={`input-${id}`}
      />
    </div>
  );
}
