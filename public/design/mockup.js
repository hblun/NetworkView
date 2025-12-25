const { useState } = React;

const QueryTab = {
  BUILDER: "BUILDER",
  TEMPLATES: "TEMPLATES"
};

const Sidebar = ({ query, setQuery, onRun, isLoading }) => {
  const [activeTab, setActiveTab] = useState(QueryTab.BUILDER);

  return (
    <aside className="w-[320px] flex-none flex flex-col border-r border-border bg-surface z-20 shadow-[4px_0_24px_rgba(0,0,0,0.01)] relative">
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-6">
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary mb-3 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">tune</span> Scope
          </h2>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between bg-slate-50 border border-border rounded px-2.5 py-1.5 cursor-pointer hover:bg-slate-100 transition-colors group">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-text-secondary text-[16px]">crop_free</span>
                <div className="flex flex-col">
                  <span className="text-[10px] text-text-tertiary font-semibold uppercase leading-none">Clipped to</span>
                  <span className="text-xs font-bold text-text-main">City of Edinburgh</span>
                </div>
              </div>
              <span className="material-symbols-outlined text-text-tertiary text-[16px]">edit</span>
            </div>
            <div className="flex items-center justify-between bg-slate-50 border border-border rounded px-2.5 py-1.5 cursor-pointer hover:bg-slate-100 transition-colors group">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-text-secondary text-[16px]">directions_bus</span>
                <div className="flex flex-col">
                  <span className="text-[10px] text-text-tertiary font-semibold uppercase leading-none">Mode</span>
                  <span className="text-xs font-bold text-text-main">Bus Services</span>
                </div>
              </div>
              <span className="material-symbols-outlined text-text-tertiary text-[16px]">expand_more</span>
            </div>
          </div>
        </section>

        <section className="relative">
          <div className="absolute -inset-1 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100/50 -z-10"></div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">manage_search</span> Spatial Query Tool
            </h2>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary text-white uppercase tracking-wide">Active</span>
          </div>

          <div className="flex bg-slate-100 rounded-full p-0.5 mb-3">
            <button
              onClick={() => setActiveTab(QueryTab.BUILDER)}
              className={`flex-1 px-3 py-1 text-xs font-semibold rounded-full transition-all ${activeTab === QueryTab.BUILDER ? "bg-surface text-primary shadow-sm" : "text-text-secondary hover:bg-slate-200"}`}
            >
              Builder
            </button>
            <button
              onClick={() => setActiveTab(QueryTab.TEMPLATES)}
              className={`flex-1 px-3 py-1 text-xs font-semibold rounded-full transition-all ${activeTab === QueryTab.TEMPLATES ? "bg-surface text-primary shadow-sm" : "text-text-secondary hover:bg-slate-200"}`}
            >
              Templates
            </button>
          </div>

          {activeTab === QueryTab.BUILDER ? (
            <div className="bg-white border border-blue-200 rounded-lg shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="p-3 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-secondary uppercase tracking-wide w-8">Find</span>
                    <button className="flex-1 flex items-center justify-between text-left text-xs font-bold text-primary bg-blue-50 px-2 py-1.5 rounded border border-blue-200">
                      <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">directions_bus</span> Bus Stops</span>
                      <span className="material-symbols-outlined text-[14px]">expand_more</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-secondary uppercase tracking-wide w-8">That</span>
                    <div className="flex-1 flex gap-2">
                      <button
                        onClick={() => setQuery({ ...query, condition: "Intersect" })}
                        className={`flex-1 text-xs font-bold px-2 py-1.5 rounded border transition-all ${query.condition === "Intersect" ? "bg-primary text-white border-primary shadow-sm" : "bg-slate-50 text-text-main border-slate-200 hover:bg-slate-100"}`}
                      >
                        Intersect
                      </button>
                      <button
                        onClick={() => setQuery({ ...query, condition: "Within" })}
                        className={`flex-1 text-xs font-bold px-2 py-1.5 rounded border transition-all ${query.condition === "Within" ? "bg-primary text-white border-primary shadow-sm" : "bg-slate-50 text-text-main border-slate-200 hover:bg-slate-100"}`}
                      >
                        Are within
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-secondary uppercase tracking-wide w-8">Dist</span>
                    <div className="flex-1 relative">
                      <input
                        type="number"
                        className="w-full text-xs font-bold text-text-main bg-white px-2 py-1.5 rounded border border-border focus:border-primary focus:ring-1 focus:ring-primary"
                        value={query.distance}
                        onChange={(e) => setQuery({ ...query, distance: Number(e.target.value) })}
                      />
                      <span className="absolute right-2 top-1.5 text-[10px] font-bold text-text-tertiary">RADIUS (m)</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-secondary uppercase tracking-wide w-8">Of</span>
                    <button className="flex-1 flex items-center justify-between text-left text-xs font-bold text-text-main bg-slate-50 px-2 py-1.5 rounded border border-slate-200">
                      <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">train</span> Rail Stations</span>
                      <span className="material-symbols-outlined text-[14px]">expand_more</span>
                    </button>
                  </div>
                </div>
                <div className="bg-blue-50/50 p-2 rounded border border-blue-100">
                  <p className="text-[10px] text-text-secondary leading-normal">
                    <span className="material-symbols-outlined text-[10px] mr-0.5 align-middle text-primary">info</span>
                    Query: <strong className="text-primary">{query.find}</strong> {query.condition.toLowerCase()} <strong className="text-primary">{query.distance}m</strong> of <strong className="text-primary">{query.target}</strong>
                  </p>
                </div>
              </div>
              <div className="bg-slate-50 px-3 py-2 border-t border-border flex justify-end gap-2">
                <button className="text-xs text-text-secondary hover:text-text-main font-medium px-2 py-1">Clear</button>
                <button
                  disabled={isLoading}
                  onClick={onRun}
                  className="bg-primary hover:bg-primary-hover text-white text-xs font-bold px-3 py-1 rounded shadow-sm transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {isLoading ? "Running..." : "Run Query"}
                  {!isLoading && <span className="material-symbols-outlined text-[14px]">play_arrow</span>}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
              <TemplateCard title="Proximity" icon="radio_button_checked" description="Find within radius" active onClick={() => setActiveTab(QueryTab.BUILDER)} />
              <TemplateCard title="Overlap" icon="layers" description="Find intersections" onClick={() => setActiveTab(QueryTab.BUILDER)} />
              <TemplateCard title="Catchment" icon="location_on" description="Walking distance" onClick={() => setActiveTab(QueryTab.BUILDER)} />
              <TemplateCard title="Route Link" icon="route" description="Distance along line" onClick={() => setActiveTab(QueryTab.BUILDER)} />
            </div>
          )}
        </section>

        <hr className="border-border/50" />

        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary mb-3 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">layers</span> Layers
          </h2>
          <div className="space-y-1">
            <LayerToggle name="Bus Routes" checked />
            <LayerToggle name="Rail Network" checked />
          </div>
        </section>
      </div>

      <div className="p-3 border-t border-border bg-slate-50 text-[10px] text-text-secondary space-y-1.5">
        <div className="flex items-start gap-1.5">
          <span className="material-symbols-outlined text-[14px] shrink-0 text-primary">manage_search</span>
          <div>
            <span className="font-bold text-text-main">Spatial Logic:</span> {query.find} {query.condition.toLowerCase()} {query.distance}m of {query.target}
          </div>
        </div>
        <div className="flex items-start gap-1.5">
          <span className="material-symbols-outlined text-[14px] shrink-0">info</span>
          <div>
            <span className="font-bold text-text-main">Source:</span> Public Transport Scotland (Oct 2023)
          </div>
        </div>
      </div>
    </aside>
  );
};

const TemplateCard = ({ title, icon, description, active = false, onClick }) => (
  <button
    onClick={onClick}
    className={`p-2 rounded-lg border text-left transition-all hover:border-primary group ${active ? "bg-blue-50 border-primary" : "bg-white border-slate-200 hover:bg-slate-50"}`}
  >
    <div className={`size-8 rounded flex items-center justify-center mb-1.5 ${active ? "bg-primary text-white" : "bg-slate-100 text-text-secondary group-hover:bg-blue-100 group-hover:text-primary"}`}>
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </div>
    <div className="text-[10px] font-bold text-text-main leading-tight mb-0.5">{title}</div>
    <div className="text-[9px] text-text-tertiary leading-tight">{description}</div>
  </button>
);

const LayerToggle = ({ name, checked }) => (
  <label className="flex items-center justify-between p-2 rounded hover:bg-slate-50 border border-transparent hover:border-border transition-all cursor-pointer select-none">
    <span className="text-sm font-medium text-text-main">{name}</span>
    <div className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only peer" defaultChecked={checked} />
      <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
    </div>
  </label>
);

const App = () => {
  const [query, setQuery] = useState({
    find: "Bus Stops",
    condition: "Intersect",
    distance: 300,
    target: "Rail Stations"
  });
  const [isLoading, setIsLoading] = useState(false);

  const onRun = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 900);
  };

  return (
    <div className="min-h-screen flex">
      <Sidebar query={query} setQuery={setQuery} onRun={onRun} isLoading={isLoading} />
      <main className="flex-1 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center text-sm text-text-tertiary">
        Map canvas placeholder
      </main>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
