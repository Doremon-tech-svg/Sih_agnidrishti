import { useEffect, useRef, useState } from "react";

function PixelatedWorldMap({ blipCount, hotspots = [] }) {
  const canvasRef = useRef(null);
  const [selectedPixel, setSelectedPixel] = useState(null);
  const [worldData, setWorldData] = useState(null);
  const countriesDataRef = useRef(null);
  const pixelDataRef = useRef([]);

  // Load world land GeoJSON (used to render the continents as pixels)
  useEffect(() => {
    fetch("/assets/world_land.json")
      .then((res) => res.json())
      .then((data) => setWorldData(data))
      .catch((err) => console.error("Failed to load world data:", err));
  }, []);

  // Load world countries GeoJSON (used to resolve the region behind a click)
  useEffect(() => {
    fetch("/assets/world_countries.json")
      .then((res) => res.json())
      .then((data) => {
        countriesDataRef.current = data;
      })
      .catch((err) => console.error("Failed to load country data:", err));
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

    const pixelSize = 10; // Pixel block size

    // Lon/lat -> canvas pixel position (equirectangular projection)
    const mercatorProject = (lon, lat) => {
      return {
        x: ((lon + 180) / 360) * width,
        y: ((90 - lat) / 180) * height,
      };
    };

    // Ray-cast point-in-polygon test (used to fill continents + find regions)
    const pointInRing = (points, testX, testY) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i][0];
        const yi = points[i][1];
        const xj = points[j][0];
        const yj = points[j][1];
        if (
          (yi > testY) !== (yj > testY) &&
          testX < ((xj - xi) * (testY - yi)) / (yj - yi) + xi
        ) {
          inside = !inside;
        }
      }
      return inside;
    };

    // Fill a polygon ring by stamping pixel blocks inside it
    const fillPolygon = (coordinates, pixelGrid) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      coordinates.forEach(([lon, lat]) => {
        const { x, y } = mercatorProject(lon, lat);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });

      minX = Math.floor(minX / pixelSize) * pixelSize;
      maxX = Math.ceil(maxX / pixelSize) * pixelSize;
      minY = Math.floor(minY / pixelSize) * pixelSize;
      maxY = Math.ceil(maxY / pixelSize) * pixelSize;

      for (let py = minY; py <= maxY; py += pixelSize) {
        for (let px = minX; px <= maxX; px += pixelSize) {
          const testX = px + pixelSize / 2;
          const testY = py + pixelSize / 2;
          const lon = (testX / width) * 360 - 180;
          const lat = 90 - (testY / height) * 180;

          // Convert ring to lon/lat canvas-space for the ray cast
          const ring = coordinates.map(([lo, la]) => {
            const p = mercatorProject(lo, la);
            return [p.x, p.y];
          });

          if (pointInRing(ring, testX, testY)) {
            const key = px + "," + py;
            if (!pixelGrid.has(key)) {
              pixelGrid.set(key, {
                x: px,
                y: py,
                col: Math.floor(px / pixelSize),
                row: Math.floor(py / pixelSize),
                lon,
                lat,
                // Slow, gentle per-pixel shimmer — every pixel vibrates
                // independently in colour brightness without flickering
                phase: Math.random() * Math.PI * 2,
                freq: 0.6 + Math.random() * 0.9,
                base: 0.55 + Math.random() * 0.35,
                tint: Math.random() * 0.25, // slight colour variance
              });
            }
          }
        }
      }
    };

    const generatePixelatedMap = () => {
      const pixels = new Map();

      if (worldData && worldData.features) {
        worldData.features.forEach((feature) => {
          const geometry = feature.geometry;
          if (geometry.type === "Polygon") {
            geometry.coordinates.forEach((ring) => fillPolygon(ring, pixels));
          } else if (geometry.type === "MultiPolygon") {
            geometry.coordinates.forEach((polygon) => {
              polygon.forEach((ring) => fillPolygon(ring, pixels));
            });
          }
        });
      }

      return Array.from(pixels.values());
    };

    // Resolve which country contains a lon/lat point
    const findRegion = (lon, lat) => {
      const data = countriesDataRef.current;
      if (!data || !data.features) return "Terrestrial zone";

      const ringHit = (geometry) => {
        if (!geometry) return false;
        if (geometry.type === "Polygon") {
          return pointInRing(geometry.coordinates[0], lon, lat);
        }
        if (geometry.type === "MultiPolygon") {
          return geometry.coordinates.some(
            (polygon) => polygon[0] && pointInRing(polygon[0], lon, lat)
          );
        }
        return false;
      };

      for (const feature of data.features) {
        const name = feature.properties?.name;
        if (!name) continue;
        if (ringHit(feature.geometry)) return name;
      }
      return "Terrestrial zone";
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

    const handleCanvasClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const clickedPixel = pixelDataRef.current.find(
        (p) => x >= p.x && x < p.x + pixelSize && y >= p.y && y < p.y + pixelSize
      );

      if (clickedPixel) {
        const region = findRegion(clickedPixel.lon, clickedPixel.lat);
        let nearest = null;
        let minDist = Infinity;

        const activeHotspots = hotspots.slice(0, Math.min(20, hotspots.length));
        activeHotspots.forEach((hotspot) => {
          const hx = ((hotspot.lon + 180) / 360) * width;
          const hy = ((90 - hotspot.lat) / 180) * height;
          const dist = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
          if (dist < minDist && dist < 80) {
            minDist = dist;
            nearest = hotspot;
          }
        });

        setSelectedPixel({ ...clickedPixel, region, hotspot: nearest });
      } else {
        setSelectedPixel(null);
      }
    };

    canvas.addEventListener("click", handleCanvasClick);

    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, width, height);

      // Ocean base — calm deep blue
      const oceanGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        0,
        width / 2,
        height / 2,
        width
      );
      oceanGrad.addColorStop(0, "rgba(22, 52, 94, 0.30)");
      oceanGrad.addColorStop(1, "rgba(10, 26, 52, 0.38)");
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, width, height);

      // Pass 1 — stable continent base (avoids any flicker/glitch look)
      pixelDataRef.current.forEach((pixel) => {
        const glow = 0.55 + 0.22 * Math.sin(t * pixel.freq + pixel.phase);
        const alpha = pixel.base * glow;
        ctx.fillStyle = `rgba(70, 214, 255, ${alpha})`;
        ctx.fillRect(pixel.x, pixel.y, pixelSize - 1, pixelSize - 1);
      });

      // Pass 2 — vibrating colour shimmer overlay ("glowing randomly")
      ctx.globalCompositeOperation = "lighter";
      pixelDataRef.current.forEach((pixel) => {
        const wave = Math.sin(t * pixel.freq + pixel.phase); // -1..1
        // Only the "active" half of the cycle adds a highlight, giving a
        // smooth breathing/vibration instead of harsh on/off flicker
        if (wave <= 0) return;
        const intensity = wave * 0.35;
        const hShift = pixel.tint;
        ctx.fillStyle = `rgba(${Math.round(150 + hShift * 200)}, ${Math.round(
          235 + hShift * 20
        )}, 255, ${intensity})`;
        ctx.fillRect(pixel.x, pixel.y, pixelSize - 1, pixelSize - 1);
      });
      ctx.globalCompositeOperation = "source-over";

      // Soft drifting ambient glow (gentle, not a hard scanline)
      const glowY = height * (0.5 + 0.35 * Math.sin(t * 0.25));
      const ambient = ctx.createRadialGradient(
        width * 0.5,
        glowY,
        0,
        width * 0.5,
        glowY,
        width * 0.55
      );
      ambient.addColorStop(0, "rgba(110, 170, 255, 0.10)");
      ambient.addColorStop(1, "rgba(110, 170, 255, 0)");
      ctx.fillStyle = ambient;
      ctx.fillRect(0, 0, width, height);

      // Hotspot indicators — pulsing red markers
      const activeHotspots = hotspots.slice(0, Math.min(20, hotspots.length));
      activeHotspots.forEach((hotspot, idx) => {
        const x = ((hotspot.lon + 180) / 360) * width;
        const y = ((90 - hotspot.lat) / 180) * height;
        const pulse = Math.sin(t * 4 + idx * 0.7) * 0.5 + 0.5;

        ctx.shadowBlur = 18;
        ctx.shadowColor = `rgba(255, 90, 110, ${pulse})`;
        ctx.strokeStyle = `rgba(255, 90, 110, ${0.5 + pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 11 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(255, 100, 120, ${0.85 + pulse * 0.15})`;
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
      canvas.removeEventListener("click", handleCanvasClick);
    };
  }, [blipCount, hotspots, worldData]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="od-orbit-canvas"
        style={{ cursor: "pointer" }}
      />
      {selectedPixel && (
        <div className="od-pixel-info">
          <div className="od-pixel-label">Selected Pixel</div>
          <div className="od-pixel-region">
            <span className="od-pixel-region-icon">⌖</span>
            {selectedPixel.region || "—"}
          </div>
          <div className="od-pixel-coords">
            Grid: [{selectedPixel.col}, {selectedPixel.row}] ·{" "}
            {selectedPixel.lat?.toFixed(2)}°N, {selectedPixel.lon?.toFixed(2)}°E
          </div>
          {selectedPixel.hotspot ? (
            <>
              <div className="od-pixel-hotspot">
                <span className="od-hotspot-type">
                  {selectedPixel.hotspot.classification || "Thermal Anomaly"}
                </span>
              </div>
              <div className="od-pixel-data">
                <div>FRP: {selectedPixel.hotspot.frp?.toFixed(1) || "—"} MW</div>
                <div>Risk: {selectedPixel.hotspot.risk_score || "—"}</div>
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