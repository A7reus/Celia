export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
    </div>
  );
}
