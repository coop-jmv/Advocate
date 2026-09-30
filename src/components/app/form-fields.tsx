import { mobileDigits } from "@/lib/validation";
import { cn } from "@/lib/utils";

// Shared look for app form controls: 40px-tall fields with crisp corners.
export const INPUT_CLASS =
  "mt-1.5 h-10 w-full rounded border border-input bg-background px-3 text-sm";
export const TEXTAREA_CLASS =
  "mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm";

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

/** A field's hint, replaced by its error when there is one — never both. */
export function FieldHint({ hint, error }: { hint: string; error?: string | undefined }) {
  if (error) return <FieldError message={error} />;
  return <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>;
}

/**
 * Banner above a form once a submit has failed validation, so on a long form
 * the person knows to look for the highlighted fields.
 */
export function FormErrorSummary({
  show,
  message = "Some details need attention. Review the highlighted fields.",
  className,
}: {
  show: boolean;
  message?: string;
  className?: string;
}) {
  if (!show) return null;
  return (
    <p
      role="alert"
      className={cn(
        "rounded border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive",
        className,
      )}
    >
      {message}
    </p>
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
    <span className={cn("flex h-10 items-stretch", className)}>
      <span
        className={cn(
          "flex items-center rounded-l border border-r-0 border-input bg-secondary px-3 text-sm font-semibold",
          error && "border-destructive",
        )}
      >
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
        placeholder="98765 43210"
        className={cn(
          "w-full min-w-0 rounded-r border border-input bg-background px-3 text-sm",
          invalidClass(error),
        )}
      />
    </span>
  );
}
