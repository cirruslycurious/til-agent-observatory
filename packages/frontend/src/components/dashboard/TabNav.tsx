interface Tab {
  id: string;
  label: string;
}

interface TabNavProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function TabNav({ tabs, activeTab, onTabChange }: TabNavProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-sm border border-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            px-4 py-2 text-sm font-medium rounded-sm transition-all duration-200
            ${activeTab === tab.id
              ? "bg-primary/20 text-primary border border-primary/30"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
