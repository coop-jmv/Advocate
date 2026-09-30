import { mobileDigits } from "@/lib/validation";
import { cn } from "@/lib/utils";

/** Red asterisk after a label; screen readers get "required" from the input's own attribute. */
export function Req() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string | undefined }) {
  if (!message) return null;
  return (
    <span id={id} role="alert" className="mt-1 block text-xs text-destructive">
      {message}
    </span>
  );
}

/** Border colour for an input that failed validation. */
export function invalidClass(message: string | undefined): string {
  return message ? "border-destructive focus-visible:ring-destructive" : "";
}

/**
 * Indian mobile number: a fixed +91 prefix and exactly 10 digits. Pasting
 * "+91 98765 43210" or "098765 43210" keeps just the 10 digits.
 */
export function MobileInput({
  id,
  value,
  onChange,
  error,
  className,
  required = true,
}: {
  id?: string;
  value: string;
  onChange: (digits: string) => void;
  error?: string | undefined;
  className?: string;
  required?: boolean;
}) {
  return (
    <span className={cn("flex items-stretch", className)}>
      <span className="flex items-center rounded-l border border-r-0 border-input bg-secondary px-2 text-sm text-muted-foreground">
        +91
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={value}
        onChange={(event) => onChange(mobileDigits(event.target.value))}
        required={required}
        aria-invalid={error ? true : undefined}
        placeholder="10-digit mobile number"
        className={cn(
          "w-full min-w-0 rounded-r border border-input bg-background px-3 py-1.5 text-sm",
          invalidClass(error),
        )}
      />
    </span>
  );
}
