import React, { useEffect, useState } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { MeasuredChartContainer } from "../MeasuredChartContainer";

interface CensusStatusSlice {
  name: string;
  value: number;
  color: string;
}

export const CensusStatusDistributionChart: React.FC<{
  pieData: CensusStatusSlice[];
}> = ({ pieData }) => {
  const [activeSlice, setActiveSlice] = useState(0);

  useEffect(() => {
    if (activeSlice >= pieData.length) {
      setActiveSlice(0);
    }
  }, [activeSlice, pieData.length]);

  return (
    <MeasuredChartContainer className="h-52">
      {({ width, height }) =>
        pieData.length > 0 ? (
          <PieChart width={Math.max(1, width)} height={Math.max(1, height)}>
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value} activities`,
                name,
              ]}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e4e4e7",
                fontSize: 12,
              }}
            />
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={76}
              paddingAngle={3}
              onMouseEnter={(_, index) => setActiveSlice(index)}
              animationDuration={700}
            >
              {pieData.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={entry.color}
                  style={{
                    opacity: activeSlice === index ? 1 : 0.72,
                    transition: "opacity 200ms ease",
                  }}
                />
              ))}
            </Pie>
          </PieChart>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-zinc-500">
            No data
          </div>
        )
      }
    </MeasuredChartContainer>
  );
};
