import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/cn";

const ACCEPT = ".csv,.xlsx";

/** Drag-and-drop or click-to-browse for one cashflow file. */
export function Dropzone({
  onFile,
  busy,
  fileName,
}: {
  onFile: (file: File) => void;
  busy: boolean;
  fileName?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
      className={cn(
        "rounded-xl border border-dashed p-8 text-center transition-colors",
        dragging ? "border-accent bg-accent-soft" : "border-hairline bg-subtle",
      )}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-surface text-ink-2 ring-1 ring-hairline">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
      </div>
      <p className="mt-3 text-sm font-medium text-ink">
        {busy ? `Validating ${fileName ?? "file"}…` : "Drop a cashflow file here"}
      </p>
      <p className="mt-1 text-sm text-ink-3">CSV or Excel projected cashflow schedule</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-1.5",
          "text-sm font-medium text-ink transition-colors hover:bg-plane disabled:opacity-50",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
      >
        <FileSpreadsheet size={14} />
        Browse files
      </button>
    </div>
  );
}
