import { Download } from 'lucide-react';

// Placeholder. FTP service health + recent-arrivals feed arrive in Phase 4.
export function TransfersPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-gray-400">
      <Download className="h-10 w-10 text-gray-600" />
      <p className="text-sm">Transfer activity will appear here.</p>
      <p className="text-xs text-gray-500">The receive monitor arrives in Phase 4.</p>
    </div>
  );
}
