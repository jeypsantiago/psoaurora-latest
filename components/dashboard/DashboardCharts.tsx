import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MeasuredChartContainer } from "../MeasuredChartContainer";

interface TrendPoint {
  label: string;
  registry: number;
  supply: number;
  property: number;
  employment: number;
}

interface WorkloadItem {
  name: string;
  value: number;
  color: string;
}

export const DashboardTrendChart: React.FC<{
  trendData: TrendPoint[];
  hasTrendData: boolean;
}> = ({ trendData, hasTrendData }) => (
  <MeasuredChartContainer className="h-64">
    {({ width, height }) =>
      hasTrendData ? (
        <AreaChart
          width={Math.max(1, width)}
          height={Math.max(1, height)}
          data={trendData}
          margin={{ top: 10, right: 8, left: -12, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.15} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            width={34}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e4e4e7",
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                registry: "Registry",
                supply: "Supply",
                property: "Property",
                employment: "Employment",
              };
              return [value.toLocaleString(), labels[name] || name];
            }}
          />
          <Area
            type="monotone"
            dataKey="registry"
            stroke="#2563eb"
            fill="#2563eb"
            fillOpacity={0.12}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="supply"
            stroke="#0ea5e9"
            fill="#0ea5e9"
            fillOpacity={0.1}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="property"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.09}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="employment"
            stroke="#f59e0b"
            fill="#f59e0b"
            fillOpacity={0.08}
            strokeWidth={2}
          />
        </AreaChart>
      ) : (
        <div className="h-full rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-500 dark:text-zinc-400">
          No trend history yet. Create records to populate the chart.
        </div>
      )
    }
  </MeasuredChartContainer>
);

export const DashboardWorkloadChart: React.FC<{
  workloadItems: WorkloadItem[];
}> = ({ workloadItems }) => {
  const [activeSliceIndex, setActiveSliceIndex] = useState(0);

  useEffect(() => {
    if (activeSliceIndex >= workloadItems.length) {
      setActiveSliceIndex(0);
    }
  }, [activeSliceIndex, workloadItems.length]);

  const chartItems = useMemo(() => workloadItems, [workloadItems]);

  return (
    <MeasuredChartContainer className="h-56">
      {({ width, height }) =>
        chartItems.length > 0 ? (
          <PieChart width={Math.max(1, width)} height={Math.max(1, height)}>
            <Tooltip formatter={(value: number) => value.toLocaleString()} />
            <Pie
              data={chartItems}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={82}
              paddingAngle={3}
              onMouseEnter={(_, index) => setActiveSliceIndex(index)}
              animationDuration={700}
            >
              {chartItems.map((item, index) => (
                <Cell
                  key={item.name}
                  fill={item.color}
                  style={{
                    opacity: activeSliceIndex === index ? 1 : 0.72,
                    transition: "opacity 200ms ease",
                  }}
                />
              ))}
            </Pie>
          </PieChart>
        ) : (
          <div className="h-full rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-500 dark:text-zinc-400">
            No open workload.
          </div>
        )
      }
    </MeasuredChartContainer>
  );
};
