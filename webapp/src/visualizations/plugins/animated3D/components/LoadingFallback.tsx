import { Loader2 } from "lucide-react";

export function LoadingFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-white" size={32} />
        <span className="text-white text-sm">Loading 3D scene...</span>
      </div>
    </div>
  );
}
