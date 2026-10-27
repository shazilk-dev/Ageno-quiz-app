"use client";

import { ImageUp, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { adminImages } from "@/lib/admin-api";
import { ApiRequestError } from "@/lib/api-client";
import { IMAGE_TYPES, checkImageFile } from "@/lib/quiz-images";
import { cn } from "@/lib/utils";

interface ImageFieldProps {
  id: string;
  value: string;
  onChange: (url: string) => void;
  className?: string;
}

/**
 * Uploading needs Firebase Storage, which the free plan doesn't include, so the button only shows when
 * `NEXT_PUBLIC_IMAGE_UPLOAD=1` is set. Read on each render (Next inlines it at build time).
 */
const uploadEnabled = () => process.env.NEXT_PUBLIC_IMAGE_UPLOAD === "1";

/** A question's picture: the address of one that is online, or (when switched on) an upload stored by the server. */
export function ImageField({ id, value, onChange, className }: ImageFieldProps) {
  const canUpload = uploadEnabled();
  const picker = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const address = value.trim();

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const refused = checkImageFile(file);
    if (refused) {
      setProblem(refused);
      return;
    }
    setProblem(null);
    setUploading(true);
    try {
      onChange((await adminImages.upload(file)).url);
    } catch (error) {
      setProblem(error instanceof ApiRequestError ? error.message : "We couldn't upload the picture. Try again.");
    } finally {
      setUploading(false);
      // Choosing the same file again should still count as a choice.
      if (picker.current) picker.current.value = "";
    }
  };

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        Image
        <span className="ml-2 font-normal text-text-muted">
          {canUpload ? "Upload a picture, or paste a full https:// address." : "A full https:// address."}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          type="url"
          inputMode="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-md border border-control-border bg-surface px-3 text-text transition-fast placeholder:text-text-faint hover:border-text-muted focus-visible:border-accent",
            className
          )}
        />
        {canUpload && (
          <>
            <input
              ref={picker}
              type="file"
              accept={IMAGE_TYPES.join(",")}
              onChange={(event) => void upload(event.target.files?.[0])}
              aria-label="Choose a picture to upload"
              className="sr-only"
              tabIndex={-1}
            />
            <Button variant="secondary" size="sm" loading={uploading} onClick={() => picker.current?.click()}>
              <ImageUp className="size-4" aria-hidden="true" />
              Upload
            </Button>
          </>
        )}
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-sm text-error">
          {problem}
        </p>
      )}
      {address && /^https:\/\//i.test(address) && (
        <div className="mt-3 flex items-start gap-2">
          {/* The admin's own picture, of any size; next/image would need fixed dimensions. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={address} alt="The picture as players will see it" className="max-h-32 w-auto max-w-full rounded-md border border-border" />
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Remove the picture"
            title="Remove the picture"
            className="grid size-9 shrink-0 place-items-center rounded-md text-text-muted transition-fast hover:bg-bg-alt hover:text-error"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
