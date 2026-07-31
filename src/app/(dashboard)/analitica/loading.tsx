export default function AnalyticsLoading() {
  return (
    <div className="h-full overflow-y-auto bg-[#0f0f0f] p-4 md:p-7 animate-pulse">
      <div className="h-9 w-64 rounded-lg bg-white/10 mb-3" />
      <div className="h-4 w-96 max-w-full rounded bg-white/5 mb-8" />
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3 mb-6">
        {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-28 rounded-xl bg-white/5 border border-white/10" />)}
      </div>
      <div className="grid xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 h-80 rounded-xl bg-white/5 border border-white/10" />
        <div className="h-80 rounded-xl bg-white/5 border border-white/10" />
      </div>
    </div>
  );
}
