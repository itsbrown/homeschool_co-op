import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { US_STATES, normalizeUsState } from "@shared/us-states";

type Props = {
  value?: string;
  onChange: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  "data-testid"?: string;
};

/** Controlled select for US states + DC (stores ISO-2 codes). */
export function UsStateSelect({
  value,
  onChange,
  placeholder = "Select state",
  disabled,
  id,
  "data-testid": testId = "select-us-state",
}: Props) {
  const normalized = value ? normalizeUsState(value) ?? undefined : undefined;

  return (
    <Select
      value={normalized}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger id={id} data-testid={testId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {US_STATES.map((s) => (
          <SelectItem key={s.code} value={s.code}>
            {s.name} ({s.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
