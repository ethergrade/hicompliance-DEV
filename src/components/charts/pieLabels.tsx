import React from "react";

/**
 * Etichette e legenda delle torte.
 *
 * Le etichette esterne di Recharts escono dal riquadro (il contenitore non
 * riserva spazio), si sovrappongono sugli spicchi piccoli e finiscono sopra la
 * legenda. Qui la percentuale sta dentro lo spicchio, solo quando c'è posto, e
 * nome, valore e percentuale stanno in una legenda HTML sotto il grafico, che
 * va a capo invece di essere tagliata.
 */

const RAD = Math.PI / 180;

/** «67,6%»: una cifra decimale, separatore italiano. */
export const formatPercentIt = (fraction: number): string =>
	`${(fraction * 100).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

interface InsideLabelProps {
	cx?: number;
	cy?: number;
	midAngle?: number;
	innerRadius?: number;
	outerRadius?: number;
	percent?: number;
}

/**
 * Renderer per la prop `label` di <Pie>: percentuale dentro lo spicchio,
 * nascosta sotto `minPercent` (lo spicchio è troppo stretto: il valore resta
 * in legenda e nel tooltip). Da usare con `labelLine={false}`.
 */
export const insidePercentLabel =
	(minPercent = 0.07) =>
	({ cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 }: InsideLabelProps) => {
		if (percent < minPercent) return null;
		const r = innerRadius > 0 ? innerRadius + (outerRadius - innerRadius) / 2 : outerRadius * 0.62;
		const x = cx + r * Math.cos(-midAngle * RAD);
		const y = cy + r * Math.sin(-midAngle * RAD);
		return (
			<text
				x={x}
				y={y}
				fill="#fff"
				textAnchor="middle"
				dominantBaseline="central"
				fontSize={10}
				fontWeight={600}
				style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.45)", strokeWidth: 2.5, pointerEvents: "none" }}
			>
				{formatPercentIt(percent)}
			</text>
		);
	};

export interface PieLegendItem {
	name: string;
	value: number;
	color: string;
}

/** Legenda sotto la torta: colore, nome, valore e percentuale; va a capo, mai tagliata. */
export function PieLegend({ items, className = "" }: { items: PieLegendItem[]; className?: string }) {
	const total = items.reduce((s, i) => s + i.value, 0);
	if (total <= 0) return null;
	return (
		<ul className={`mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground ${className}`}>
			{items.map((i) => (
				<li key={i.name} className="flex items-center gap-1.5">
					<span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i.color }} aria-hidden />
					<span>
						{i.name}{" "}
						<span className="tabular-nums text-foreground/80">
							{i.value.toLocaleString("it-IT")} · {formatPercentIt(i.value / total)}
						</span>
					</span>
				</li>
			))}
		</ul>
	);
}
