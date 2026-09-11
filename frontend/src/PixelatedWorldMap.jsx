import { useEffect, useRef, useState } from "react";

function PixelatedWorldMap({ blipCount, hotspots = [] }) {
  const canvasRef = useRef(null);
  const [selectedPixel, setSelectedPixel] = useState(null);
  const pixelDataRef = useRef([]);
  const [nearestHotspot, setNearestHotspot] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let width = 0;
    let height = 0;
    let t = 0;
    const img = new Image();
    img.src = '/pixelated_map.jpg';
    let imageLoaded = false;
    
    img.onload = () => {
      imageLoaded = true;
    };

    // Generate pixel grid data
    const pixelSize = 8; // Size of each pixel block
    const generatePixelData = () => {
      const pixels = [];
      const cols = Math.floor(width / pixelSize);
      const rows = Math.floor(height / pixelSize);
      
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // Create land-like pattern with some randomness
          const x = col / cols;
          const y = row / rows;
          const isLand = Math.sin(x * 12 + y * 8) * Math.cos(y * 10) > -0.3;
          
          if (isLand) {
            pixels.push({
              x: col * pixelSize,
              y: row * pixelSize,
              col,
              row,
              brightness: Math.random() * 0.3 + 0.7,
              pulseOffset: Math.random() * Math.PI * 2,
              hasHotspot: false,
            });
          }
        }
      }
      return pixels;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pixelDataRef.current = generatePixelData();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Handle click on pixels
    const handleCanvasClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const clickedPixel = pixelDataRef.current.find(p => 
        x >= p.x && x < p.x + 8 && y >= p.y && y < p.y + 8
      );
      
      if (clickedPixel) {
        setSelectedPixel(clickedPixel);
      }
    };
    
    canvas.addEventListener('click', handleCanvasClick);

    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, width, height);

      // Draw pixelated world map with glowing neon effect
      if (imageLoaded) {
        // Draw the background image slightly dimmed
        ctx.globalAlpha = 0.15;
        ctx.drawImage(img, 0, 0, width, height);
        ctx.globalAlpha = 1;
      }
      
      // Draw pixelated map with glowing effect
      pixelDataRef.current.forEach((pixel) => {
        const pulse = Math.sin(t * 2 + pixel.pulseOffset) * 0.5 + 0.5;
        const brightness = pixel.brightness * (0.7 + pulse * 0.3);
        
        // Neon cyan/blue glow effect
        const baseColor = `rgba(70, 217, 255, ${brightness * 0.6})`;
        const glowColor = `rgba(70, 217, 255, ${pulse * 0.4})`;
        
        // Draw glow
        ctx.shadowBlur = 12;
        ctx.shadowColor = glowColor;
        ctx.fillStyle = baseColor;
        ctx.fillRect(pixel.x, pixel.y, 7, 7);
        
        // Add moving scan line effect
        const scanLine = (t * 50) % height;
        if (Math.abs(pixel.y - scanLine) < 20) {
          const dist = Math.abs(pixel.y - scanLine);
          const intensity = 1 - (dist / 20);
          ctx.fillStyle = `rgba(155, 124, 255, ${intensity * 0.5})`;
          ctx.fillRect(pixel.x, pixel.y, 7, 7);
        }
      });
      
      // Reset shadow
      ctx.shadowBlur = 0;
      
      // Draw hotspot indicators
      const activeHotspots = hotspots.slice(0, Math.min(20, hotspots.length));
      activeHotspots.forEach((hotspot, idx) => {
        // Map lat/lon to canvas position (simplified)
        const x = ((hotspot.lon + 180) / 360) * width;
        const y = ((90 - hotspot.lat) / 180) * height;
        
        const pulse = Math.sin(t * 4 + idx * 0.5) * 0.5 + 0.5;
        
        // Red glowing dot for hotspot
        ctx.shadowBlur = 15;
        ctx.shadowColor = `rgba(255, 100, 124, ${pulse})`;
        ctx.fillStyle = `rgba(255, 100, 124, ${0.8 + pulse * 0.2})`;
        ctx.beginPath();
        ctx.arc(x, y, 3 + pulse * 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Outer ring
        ctx.strokeStyle = `rgba(255, 100, 124, ${pulse * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 8 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
      });
      
      ctx.shadowBlur = 0;
      
      // Add grid lines
      ctx.strokeStyle = 'rgba(70, 217, 255, 0.1)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const y = (i / 10) * height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        
        const x = (i / 10) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [blipCount, hotspots]);

  return (
    <>
      <canvas ref={canvasRef} className="od-orbit-canvas" style={{ cursor: 'pointer' }} />
      {selectedPixel && (
        <div className="od-pixel-info">
          <div className="od-pixel-label">Selected Pixel</div>
          <div className="od-pixel-coords">
            Grid: [{selectedPixel.col}, {selectedPixel.row}]
          </div>
          <div className="od-pixel-status">
            Status: {selectedPixel.hasHotspot ? 'Active Hotspot' : 'Monitoring'}
          </div>
        </div>
      )}
    </>
  );
}

export default PixelatedWorldMap;