import { Search, X } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  /** Overrides for the field itself, e.g. `h-11 rounded-md` for a denser toolbar. */
  inputClassName?: string;
}

/** Search box with a visible clear button. Filtering happens as you type; there is no submit. */
export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
  className,
  inputClassName,
}: SearchInputProps) {
  const id = useId();
  return (
    <search className={cn("relative block", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        // The native clear control is inconsistent across browsers; ours is always 44px.
        className={cn(
          "h-12 w-full rounded-full border border-control-border bg-surface pr-12 pl-11 text-base text-text transition-fast [appearance:none] placeholder:text-text-faint hover:border-text-muted focus-visible:border-accent [&::-webkit-search-cancel-button]:hidden",
          inputClassName
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center text-text-muted transition-fast hover:text-text"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </search>
  );
}
