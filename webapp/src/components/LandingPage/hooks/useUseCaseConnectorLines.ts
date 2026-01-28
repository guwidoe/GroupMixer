import { useEffect } from 'react';

export function useUseCaseConnectorLines(lineSvgRef: React.RefObject<SVGSVGElement>) {
  useEffect(() => {
    const drawLines = () => {
      const svg = lineSvgRef.current;
      const mainCircle = document.querySelector('.main-usecase-circle');
      const usecaseCircles = Array.from(document.querySelectorAll('.usecase-circle'));
      if (!svg || !mainCircle || usecaseCircles.length !== 4) return;

      svg.innerHTML = '';

      const svgRect = svg.getBoundingClientRect();
      const mainRect = mainCircle.getBoundingClientRect();
      const mainCx = mainRect.left + mainRect.width / 2 - svgRect.left;
      const mainCy = mainRect.top + mainRect.height / 2 - svgRect.top;
      const mainR = mainRect.width / 2;

      usecaseCircles.forEach((circle) => {
        const rect = circle.getBoundingClientRect();
        const cx = rect.left + rect.width / 2 - svgRect.left;
        const cy = rect.top + rect.height / 2 - svgRect.top;
        const r = rect.width / 2;
        const dx = cx - mainCx;
        const dy = cy - mainCy;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;
        const startX = mainCx + (dx / dist) * mainR;
        const startY = mainCy + (dy / dist) * mainR;
        const endX = cx - (dx / dist) * r;
        const endY = cy - (dy / dist) * r;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', startX.toString());
        line.setAttribute('y1', startY.toString());
        line.setAttribute('x2', endX.toString());
        line.setAttribute('y2', endY.toString());
        line.setAttribute('stroke', 'white');
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
      });
    };

    drawLines();
    window.addEventListener('resize', drawLines);
    return () => window.removeEventListener('resize', drawLines);
  }, [lineSvgRef]);
}
