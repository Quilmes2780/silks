import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, RadarChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([
  LineChart,
  RadarChart,
  HeatmapChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  RadarComponent,
  MarkLineComponent,
  TitleComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export const CHART_COLORS = ['#1d3b2a', '#b08d3c', '#8e2b22', '#23466b', '#6b4f2a', '#5e3b72', '#3c6a4c', '#a8701c', '#2b7a78', '#7a1f1f', '#4a6fa5', '#9a8c3b', '#7d5a50', '#3f5e5a'];

export interface ChartClick {
  seriesIndex?: number;
  dataIndex: number;
  data: unknown;
  name?: string;
}

/** Schlanker ECharts-Wrapper (Daten bleiben exakt und interaktiv). */
export function Chart({ option, height = 280, onClick }: { option: EChartsCoreOption; height?: number; onClick?: (p: ChartClick) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' });
    inst.current = c;
    c.on('click', (p) => clickRef.current?.(p as unknown as ChartClick));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    inst.current?.setOption({ color: CHART_COLORS, textStyle: { fontFamily: 'Segoe UI, system-ui, sans-serif' }, ...option }, true);
  }, [option]);

  return <div ref={el} style={{ width: '100%', height }} />;
}
