import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  STORE_ATTENDEE_LABELS,
  STORE_MEAL_LABELS,
  type StoreEventRsvp,
} from "@shared/store-event-rsvp";

export function StoreEventRsvpEditor({
  value,
  onChange,
}: {
  value: StoreEventRsvp;
  onChange: (next: StoreEventRsvp) => void;
}) {
  return (
    <div className="space-y-4" data-testid="store-event-rsvp-editor">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="event-starts-on">Date</Label>
          <Input
            id="event-starts-on"
            type="date"
            value={value.startsOn}
            onChange={(e) => onChange({ ...value, startsOn: e.target.value })}
            data-testid="input-event-date"
          />
        </div>
        <div>
          <Label htmlFor="event-location">Place</Label>
          <Input
            id="event-location"
            value={value.location}
            onChange={(e) => onChange({ ...value, location: e.target.value })}
            data-testid="input-event-location"
          />
        </div>
        <div>
          <Label htmlFor="event-start-time">Start</Label>
          <Input
            id="event-start-time"
            type="time"
            value={value.startTime}
            onChange={(e) => onChange({ ...value, startTime: e.target.value })}
            data-testid="input-event-start"
          />
        </div>
        <div>
          <Label htmlFor="event-end-time">End</Label>
          <Input
            id="event-end-time"
            type="time"
            value={value.endTime}
            onChange={(e) => onChange({ ...value, endTime: e.target.value })}
            data-testid="input-event-end"
          />
        </div>
        <div>
          <Label htmlFor="event-close-on">RSVP closes</Label>
          <Input
            id="event-close-on"
            type="date"
            value={value.closeOn ?? ""}
            onChange={(e) => onChange({ ...value, closeOn: e.target.value || null })}
            data-testid="input-event-close"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Attendees</p>
        {value.attendees.map((row) => (
          <div key={row.type} className="grid grid-cols-[auto_1fr_7rem_6rem] items-center gap-2">
            <Switch
              checked={row.enabled}
              onCheckedChange={(enabled) =>
                onChange({
                  ...value,
                  attendees: value.attendees.map((item) => (item.type === row.type ? { ...item, enabled } : item)),
                })
              }
              data-testid={`switch-attendee-${row.type}`}
            />
            <span className="text-sm">{STORE_ATTENDEE_LABELS[row.type]}</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              disabled={!row.enabled}
              value={(row.priceCents / 100).toFixed(2)}
              onChange={(e) => {
                const dollars = parseFloat(e.target.value);
                const priceCents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
                onChange({
                  ...value,
                  attendees: value.attendees.map((item) => (item.type === row.type ? { ...item, priceCents } : item)),
                });
              }}
              aria-label={`${STORE_ATTENDEE_LABELS[row.type]} price`}
              data-testid={`input-attendee-price-${row.type}`}
            />
            <Input
              type="number"
              min={1}
              placeholder="Cap"
              disabled={!row.enabled}
              value={row.capacity ?? ""}
              onChange={(e) => {
                const capacity = e.target.value.trim() === "" ? null : Math.max(1, parseInt(e.target.value, 10) || 1);
                onChange({
                  ...value,
                  attendees: value.attendees.map((item) => (item.type === row.type ? { ...item, capacity } : item)),
                });
              }}
              aria-label={`${STORE_ATTENDEE_LABELS[row.type]} cap`}
              data-testid={`input-attendee-cap-${row.type}`}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Meal counts</p>
        {value.meals.map((row) => (
          <div key={row.type} className="flex items-center gap-2">
            <Switch
              checked={row.enabled}
              onCheckedChange={(enabled) =>
                onChange({
                  ...value,
                  meals: value.meals.map((item) => (item.type === row.type ? { ...item, enabled } : item)),
                })
              }
              data-testid={`switch-meal-${row.type}`}
            />
            <span className="text-sm">{STORE_MEAL_LABELS[row.type]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
