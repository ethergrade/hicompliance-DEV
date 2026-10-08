// Paginazione 10/30/50/100 per le tabelle delle dashboard dei servizi, con i
// comandi da mettere sopra e sotto l'elenco.
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const PAGE_SIZES = [10, 30, 50, 100];

export function usePager<T>(rows: T[], resetKey?: unknown) {
	const [size, setSize] = useState(10);
	const [page, setPage] = useState(1);
	useEffect(() => setPage(1), [resetKey, size]);
	const last = Math.max(1, Math.ceil(rows.length / size));
	const current = Math.min(page, last);
	return { size, setSize, current, last, setPage, visible: rows.slice((current - 1) * size, current * size), total: rows.length };
}

export type PagerState = Omit<ReturnType<typeof usePager<unknown>>, "visible">;

export function TablePager({ p }: { p: PagerState }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
			<div className="flex items-center gap-2">
				<span>Mostra</span>
				{PAGE_SIZES.map((s) => (
					<Button key={s} size="sm" variant={p.size === s ? "default" : "outline"} className="h-7 px-2" onClick={() => p.setSize(s)}>
						{s}
					</Button>
				))}
			</div>
			<div className="flex items-center gap-2">
				<span>
					{p.total} righe · pagina {p.current} di {p.last}
				</span>
				<Button size="sm" variant="outline" className="h-7" disabled={p.current <= 1} onClick={() => p.setPage(p.current - 1)}>
					Precedenti
				</Button>
				<Button size="sm" variant="outline" className="h-7" disabled={p.current >= p.last} onClick={() => p.setPage(p.current + 1)}>
					Successivi
				</Button>
			</div>
		</div>
	);
}
