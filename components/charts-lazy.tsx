"use client";

import dynamic from "next/dynamic";

const skeleton = (height: string) => function ChartSkeleton() {
  return <div role="status" aria-label="Loading chart" className={`${height} animate-pulse rounded-md bg-muted`} />;
};

// Recharts is large, so charts load after the page's numbers and tables have painted.
export const TrendChart = dynamic(() => import("@/components/charts").then((m) => m.TrendChart), { ssr: false, loading: skeleton("h-64") });
export const CategoryChart = dynamic(() => import("@/components/charts").then((m) => m.CategoryChart), { ssr: false, loading: skeleton("h-72") });
export const AutoChart = dynamic(() => import("@/components/charts").then((m) => m.AutoChart), { ssr: false, loading: skeleton("h-72") });
export const IndiaTileMap = dynamic(() => import("@/components/charts").then((m) => m.IndiaTileMap), { ssr: false, loading: skeleton("h-96 max-w-xl") });
