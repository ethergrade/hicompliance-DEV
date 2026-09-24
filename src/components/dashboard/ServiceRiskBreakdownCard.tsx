import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	Bar,
	BarChart,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

export interface ServiceRiskItem {
	/** Etichetta del servizio (es. HiTrack) */
	label: string;
	/** Health score 0-100 del servizio */
	health: number;
}

interface ServiceRiskBreakdownCardProps {
	items: ServiceRiskItem[];
}

type RiskLevel = {
	label: string;
	color: string;
	badgeClass: string;
};

const getRiskLevel = (risk: number): RiskLevel => {
	if (risk >= 60)
		return {
			label: "Alto",
			color: "hsl(var(--cyber-red))",
			badgeClass: "bg-cyber-red/20 text-cyber-red",
		};
	if (risk >= 30)
		return {
			label: "Medio",
			color: "hsl(var(--cyber-orange))",
			badgeClass: "bg-cyber-orange/20 text-cyber-orange",
		};
	return {
		label: "Basso",
		color: "hsl(var(--cyber-green))",
		badgeClass: "bg-cyber-green/20 text-cyber-green",
	};
};

const LEGEND: { label: string; range: string; className: string }[] = [
	{ label: "Basso", range: "0 – 29", className: "bg-cyber-green" },
	{ label: "Medio", range: "30 – 59", className: "bg-cyber-orange" },
	{ label: "Alto", range: "60 – 100", className: "bg-cyber-red" },
];

export const ServiceRiskBreakdownCard: React.FC<
	ServiceRiskBreakdownCardProps
> = ({ items }) => {
	const data = items.map((item) => {
		const risk = Math.max(0, Math.min(100, 100 - Math.round(item.health)));
		return { ...item, risk, level: getRiskLevel(risk) };
	});

	const average = data.length
		? Math.round(data.reduce((sum, d) => sum + d.risk, 0) / data.length)
		: 0;
	const averageLevel = getRiskLevel(average);

	return (
		<Card className="border-border shadow-cyber animate-fade-in">
			<CardHeader className="pb-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="min-w-0">
						<CardTitle className="text-xl mb-1">
							Rischio per servizio
						</CardTitle>
						<p className="text-sm text-muted-foreground">
							Contributo dei singoli servizi al True Risk Score
						</p>
					</div>
					<div className="text-right">
						<div className="text-2xl font-bold text-foreground">
							{average}%
						</div>
						<Badge
							variant="secondary"
							className={averageLevel.badgeClass}
						>
							Media {averageLevel.label}
						</Badge>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					{data.map((item) => (
						<div
							key={item.label}
							className="rounded-xl border border-border bg-muted/20 p-4 min-w-0"
						>
							<div className="flex items-center justify-between gap-2 mb-2">
								<span className="text-sm font-medium text-foreground truncate">
									{item.label}
								</span>
								<Badge
									variant="secondary"
									className={item.level.badgeClass}
								>
									{item.level.label}
								</Badge>
							</div>
							<div className="text-3xl font-bold text-foreground">
								{item.risk}%
							</div>
							<p className="text-xs text-muted-foreground mt-1">
								Health score {Math.round(item.health)}%
							</p>
						</div>
					))}
				</div>

				<div className="h-56 w-full min-w-0">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart
							data={data}
							margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
						>
							<XAxis
								dataKey="label"
								stroke="hsl(var(--muted-foreground))"
								tickLine={false}
								axisLine={false}
								fontSize={12}
							/>
							<YAxis
								domain={[0, 100]}
								stroke="hsl(var(--muted-foreground))"
								tickLine={false}
								axisLine={false}
								fontSize={12}
								width={36}
							/>
							<Tooltip
								cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
								contentStyle={{
									background: "hsl(var(--card))",
									border: "1px solid hsl(var(--border))",
									borderRadius: "0.5rem",
									color: "hsl(var(--foreground))",
								}}
								formatter={(value: number) => [`${value}%`, "Rischio"]}
							/>
							<Bar dataKey="risk" radius={[6, 6, 0, 0]} barSize={56}>
								{data.map((item) => (
									<Cell key={item.label} fill={item.level.color} />
								))}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
				</div>

				<div className="flex flex-wrap items-center gap-4 pt-1 border-t border-border">
					<span className="text-xs font-medium text-muted-foreground pt-3">
						Legenda livelli di rischio
					</span>
					{LEGEND.map((entry) => (
						<div
							key={entry.label}
							className="flex items-center gap-2 pt-3"
						>
							<span
								className={`h-3 w-3 rounded-sm ${entry.className}`}
							/>
							<span className="text-xs text-muted-foreground">
								{entry.label} ({entry.range})
							</span>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
};
