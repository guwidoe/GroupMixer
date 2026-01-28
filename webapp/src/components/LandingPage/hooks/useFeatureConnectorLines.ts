import { useEffect } from 'react';

export function useFeatureConnectorLines(
  lineSvgRef: React.RefObject<SVGSVGElement>,
  circleRef: React.RefObject<HTMLDivElement>,
) {
  useEffect(() => {
    const drawLines = () => {
      const svg = lineSvgRef.current;
      const circleDiv = circleRef.current;
      if (!svg || !circleDiv) return;

      const iconEls = Array.from(document.querySelectorAll('.feature-icon')) as HTMLElement[];
      if (!iconEls.length) return;

      const circleRect = circleDiv.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();

      const cx = circleRect.left + circleRect.width / 2 - svgRect.left;
      const cy = circleRect.top + circleRect.height / 2 - svgRect.top;
      const r = circleRect.width / 2;

      const lines: string[] = [];

      iconEls.forEach((iconEl) => {
        const iconRect = iconEl.getBoundingClientRect();
        const ix = iconRect.left + iconRect.width / 2 - svgRect.left;
        const iy = iconRect.top + iconRect.height / 2 - svgRect.top;

        const dx = ix - cx;
        const dy = iy - cy;
        const len = Math.hypot(dx, dy) || 1;
        const sx = cx + (dx / len) * r;
        const sy = cy + (dy / len) * r;

        const rs = iconRect.width / 2;
        const ex = ix - (dx / len) * rs;
        const ey = iy - (dy / len) * rs;

        lines.push(
          `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="var(--text-primary)" stroke-width="2.5" stroke-linecap="round" />`,
        );
      });

      svg.innerHTML = lines.join('');
    };

    drawLines();
    window.addEventListener('resize', drawLines);
    return () => window.removeEventListener('resize', drawLines);
  }, [lineSvgRef, circleRef]);
}
