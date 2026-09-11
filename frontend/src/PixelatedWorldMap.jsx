import { useEffect, useRef, useState } from "react";

function PixelatedWorldMap({ blipCount, hotspots = [] }) {
  const canvasRef = useRef(null);
  const [selectedPixel, setSelectedPixel] = useState(null);
  const [worldData, setWorldData] = useState(null);
  const pixelDataRef = useRef([]);

  // Load world GeoJSON data
  useEffect(() => {
    fetch('/assets/world_land.json')
      .then(res => res.json())
      .then(data => setWorldData(data))
      .catch(err => console.error('Failed to load world data:', err));
  }, []);

  useEffect(() => {
    if (!worldData) return;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let width = 0;
    let height = 0;
    let t = 0;

    const pixelSize = 10; // Bigger pixel blocks
    
    // Convert GeoJSON coordinates to canvas coordinates
    const mercatorProject = (lon, lat) => {
      const x = ((lon + 180) / 360) * width;
      const y = ((90 - lat) / 180) * height;
      return { x, y };
    };

    // Fill polygon using scanline algorithm for solid continents
    const fillPolygon = (coordinates, pixelGrid, pixelSize) => {
      // Get bounding box
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      
      coordinates.forEach(([lon, lat]) => {
        const { x, y } = mercatorProject(lon, lat);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });
      
      // Snap to pixel grid
      minX = Math.floor(minX / pixelSize) * pixelSize;
      maxX = Math.ceil(maxX / pixelSize) * pixelSize;
      minY = Math.floor(minY / pixelSize) * pixelSize;
      maxY = Math.ceil(maxY / pixelSize) * pixelSize;
      
      // Fill pixels inside the polygon
      for (let py = minY; py <= maxY; py += pixelSize) {
        for (let px = minX; px <= maxX; px += pixelSize) {
          // Ray casting to check if pixel is inside polygon
          const testX = px + pixelSize / 2;
          const testY = py + pixelSize / 2;
          
          let inside = false;
          let j = coordinates.length - 1;
          
          for (let i = 0; i < coordinates.length; i++) {
            const xi = ((coordinates[i][0] + 180) / 360) * width;
            const yi = ((90 - coordinates[i][1]) / 180) * height;
            const xj = ((coordinates[j][0] + 180) / 360) * width;
            const yj = ((90 - coordinates[j][1]) / 180) * height;
            
            if (((yi > testY) !== (yj > testY)) &&
                (testX < (xj - xi) * (testY - yi) / (yj - yi) + xi)) {
              inside = !inside;
            }
            j = i;
          }
          
          if (inside) {
            const key = px + ',' + py;
            if (!pixelGrid.has(key)) {
              pixelGrid.set(key, {
                x: px,
                y: py,
                col: Math.floor(px / pixelSize),
                row: Math.floor(py / pixelSize),
                brightness: 0.6 + Math.random() * 0.4,
                pulseOffset: Math.random() * Math.PI * 2,
                pulseSpeed: 1 + Math.random() * 2,
              });
            }
          }
        }
      }
    };

    const generatePixelatedMap = () => {
      const pixels = new Map();
      
      if (worldData && worldData.features) {
        worldData.features.forEach(feature => {
          const geometry = feature.geometry;
          
          if (geometry.type === 'Polygon') {
            geometry.coordinates.forEach(ring => {
              fillPolygon(ring, pixels, pixelSize);
            });
          } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach(polygon => {
              polygon.forEach(ring => {
                fillPolygon(ring, pixels, pixelSize);
              });
            });
          }
        });
      }
      
      return Array.from(pixels.values());
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pixelDataRef.current = generatePixelatedMap();
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
        x >= p.x && x < p.x + pixelSize && y >= p.y && y < p.y + pixelSize
      );
      
      if (clickedPixel) {
        const activeHotspots = hotspots.slice(0, Math.min(20, hotspots.length));
        let nearest = null;
        let minDist = Infinity;
        
        activeHotspots.forEach((hotspot) => {
          const hx = ((hotspot.lon + 180) / 360) * width;
          const hy = ((90 - hotspot.lat) / 180) * height;
          const dist = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
          if (dist < minDist && dist < 80) {
            minDist = dist;
            nearest = hotspot;
          }
        });
        
        setSelectedPixel({ ...clickedPixel, hotspot: nearest });
      } else {
        setSelectedPixel(null);
      }
    };
    
    canvas.addEventListener('click', handleCanvasClick);

    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, width, height);

      // Draw ocean background with subtle gradient
      const oceanGrad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width);
      oceanGrad.addColorStop(0, 'rgba(20, 50, 90, 0.25)');
      oceanGrad.addColorStop(1, 'rgba(10, 25, 50, 0.35)');
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, width, height);
      
      // Draw pixelated world map with pulsating glow
      pixelDataRef.current.forEach((pixel) => {
        const pulse = Math.sin(t * pixel.pulseSpeed + pixel.pulseOffset) * 0.5 + 0.5;
        const brightness = pixel.brightness * (0.6 + pulse * 0.4);
        
        // Neon cyan glow with pulsating effect
        ctx.shadowBlur = 12 + pulse * 8;
        ctx.shadowColor = 'rgba(70, 217, 255, ' + (0.5 + pulse * 0.5) + ')';
        
        ctx.fillStyle = 'rgba(70, 217, 255, ' + (brightness * 0.8) + ')';
        ctx.fillRect(pixel.x, pixel.y, pixelSize - 1, pixelSize - 1);
        
        // Add highlight edge
        ctx.fillStyle = 'rgba(200, 250, 255, ' + (pulse * 0.3) + ')';
        ctx.fillRect(pixel.x, pixel.y, pixelSize - 1, 1);
        ctx.fillRect(pixel.x, pixel.y, 1, pixelSize - 1);
      });
      
      ctx.shadowBlur = 0;
      
      // Moving scan line effect
      const scanLine = (t * 60) % height;
      const scanGrad = ctx.createLinearGradient(0, scanLine - 20, 0, scanLine + 20);
      scanGrad.addColorStop(0, 'rgba(155, 124, 255, 0)');
      scanGrad.addColorStop(0.5, 'rgba(155, 124, 255, 0.15)');
      scanGrad.addColorStop(1, 'rgba(155, 124, 255, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanLine - 20, width, 40);
      
      // Draw hotspot indicators with glowing effect
      const activeHotspots = hotspots.slice(0, Math.min(20, hotspots.length));
      activeHotspots.forEach((hotspot, idx) => {
        const x = ((hotspot.lon + 180) / 360) * width;
        const y = ((90 - hotspot.lat) / 180) * height;
        const pulse = Math.sin(t * 5 + idx * 0.7) * 0.5 + 0.5;
        
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgba(255, 80, 100, ' + pulse + ')';
        ctx.strokeStyle = 'rgba(255, 80, 100, ' + (0.6 + pulse * 0.4) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 12 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255, 100, 120, ' + (0.9 + pulse * 0.1) + ')';
        ctx.beginPath();
        ctx.arc(x, y, 5 + pulse * 2, 0, Math.PI * 2);
        ctx.fill();
      });
      
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [blipCount, hotspots, worldData]);

  return (
    <>
      <canvas ref={canvasRef} className="od-orbit-canvas" style={{ cursor: 'pointer' }} />
      {selectedPixel && (
        <div className="od-pixel-info">
          <div className="od-pixel-label">Selected Pixel</div>
          <div className="od-pixel-coords">Grid: [{selectedPixel.col}, {selectedPixel.row}]</div>
          {selectedPixel.hotspot ? (
            <>
              <div className="od-pixel-hotspot">
                <span className="od-hotspot-type">{selectedPixel.hotspot.classification || 'Thermal Anomaly'}</span>
              </div>
              <div className="od-pixel-data">
                <div>FRP: {selectedPixel.hotspot.frp?.toFixed(1) || '—'} MW</div>
                <div>Risk: {selectedPixel.hotspot.risk_score || '—'}</div>
              </div>
            </>
          ) : (
            <div className="od-pixel-status">Status: Monitoring</div>
          )}
        </div>
      )}
    </>
  );
}

export default PixelatedWorldMap;