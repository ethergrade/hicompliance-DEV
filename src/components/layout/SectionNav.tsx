import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface SectionNavItem { id: string; label: string }

/** Menu superiore fisso: al clic scorre fino alla sezione, evidenzia quella visibile. */
export function SectionNav({ items }: { items: SectionNavItem[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    items.forEach((i) => { const el = document.getElementById(i.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [items]);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };

  return (
    <nav className="sticky top-0 z-30 -mx-1 mb-2 rounded-lg border border-border bg-background/95 p-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-wrap gap-1">
        {items.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => go(i.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active === i.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {i.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
