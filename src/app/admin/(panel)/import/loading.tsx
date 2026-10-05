import { Loader2 } from "lucide-react";

export default function LoadingImport() {
  return (
    <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-mist-400">
      <Loader2 size={22} className="animate-spin text-gold-400" />
      <p className="text-sm">Downloading the partner catalog (up to ~15s)…</p>
    </div>
  );
}
