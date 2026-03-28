export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function detectSprites(
  imageData: ImageData,
  bgColor: number[],
  tolerance: number,
  mergeDist: number,
  minSize: number
): Rect[] {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const visited = new Uint8Array(width * height);
  const rects: Rect[] = [];

  const isBg = (r: number, g: number, b: number, a: number) => {
    // Always treat transparent as background
    if (a < 10) return true;
    
    // If the background color itself is transparent, then only transparency counts as background
    if (bgColor[3] < 10) return false;

    const dr = r - bgColor[0];
    const dg = g - bgColor[1];
    const db = b - bgColor[2];
    const da = a - bgColor[3];
    
    // Use a slightly more lenient distance for background matching
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da) <= tolerance;
  };

  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx]) continue;

      const pIdx = idx * 4;
      if (isBg(data[pIdx], data[pIdx + 1], data[pIdx + 2], data[pIdx + 3])) {
        visited[idx] = 1;
        continue;
      }

      let minX = x, maxX = x, minY = y, maxY = y;
      let head = 0, tail = 0;
      
      queueX[tail] = x;
      queueY[tail] = y;
      tail++;
      visited[idx] = 1;

      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < 0 || ny >= height) continue;
          
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            if (nx < 0 || nx >= width) continue;
            
            const nIdx = ny * width + nx;
            if (!visited[nIdx]) {
              visited[nIdx] = 1;
              const npIdx = nIdx * 4;
              if (!isBg(data[npIdx], data[npIdx + 1], data[npIdx + 2], data[npIdx + 3])) {
                queueX[tail] = nx;
                queueY[tail] = ny;
                tail++;
              }
            }
          }
        }
      }

      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      // Push all rects first, we will filter by minSize AFTER merging
      // This allows small disconnected parts (like floating hands) to merge into the main body
      rects.push({ x: minX, y: minY, w, h });
    }
  }

  // Fast merge using Spatial Hash Grid
  let merged = true;
  const cellSize = Math.max(64, mergeDist * 2);
  
  while (merged) {
    merged = false;
    const grid = new Map<string, number[]>();
    const toRemove = new Uint8Array(rects.length);

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const minCol = Math.floor((r.x - mergeDist) / cellSize);
      const maxCol = Math.floor((r.x + r.w + mergeDist) / cellSize);
      const minRow = Math.floor((r.y - mergeDist) / cellSize);
      const maxRow = Math.floor((r.y + r.h + mergeDist) / cellSize);
      
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const key = `${col},${row}`;
          let list = grid.get(key);
          if (!list) {
            list = [];
            grid.set(key, list);
          }
          list.push(i);
        }
      }
    }

    for (let i = 0; i < rects.length; i++) {
      if (toRemove[i]) continue;
      
      const r1 = rects[i];
      const minCol = Math.floor((r1.x - mergeDist) / cellSize);
      const maxCol = Math.floor((r1.x + r1.w + mergeDist) / cellSize);
      const minRow = Math.floor((r1.y - mergeDist) / cellSize);
      const maxRow = Math.floor((r1.y + r1.h + mergeDist) / cellSize);
      
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const neighbors = grid.get(`${col},${row}`);
          if (!neighbors) continue;
          
          for (const j of neighbors) {
            if (i >= j || toRemove[j]) continue;
            
            const r2 = rects[j];
            const dx = Math.max(0, Math.max(r1.x - (r2.x + r2.w), r2.x - (r1.x + r1.w)));
            const dy = Math.max(0, Math.max(r1.y - (r2.y + r2.h), r2.y - (r1.y + r1.h)));

            if (dx <= mergeDist && dy <= mergeDist) {
              const minX = Math.min(r1.x, r2.x);
              const minY = Math.min(r1.y, r2.y);
              const maxX = Math.max(r1.x + r1.w, r2.x + r2.w);
              const maxY = Math.max(r1.y + r1.h, r2.y + r2.h);
              
              r1.x = minX;
              r1.y = minY;
              r1.w = maxX - minX;
              r1.h = maxY - minY;
              
              toRemove[j] = 1;
              merged = true;
            }
          }
        }
      }
    }

    if (merged) {
      const newRects = [];
      for (let i = 0; i < rects.length; i++) {
        if (!toRemove[i]) newRects.push(rects[i]);
      }
      rects.length = 0;
      rects.push(...newRects);
    }
  }

  // Filter by minSize AFTER merging
  const finalRects = rects.filter(r => r.w >= minSize && r.h >= minSize);

  // Sort by Y, then X
  finalRects.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  return finalRects;
}

export function smartSplit(
  imageData: ImageData,
  baseRect: Rect,
  bgColor: number[],
  tolerance: number
): Rect[] {
  const { x: bx, y: by, w: bw, h: bh } = baseRect;
  const data = imageData.data;
  const width = imageData.width;

  const isBg = (r: number, g: number, b: number, a: number) => {
    if (a < 10) return true;
    if (bgColor[3] < 10) return false;
    const dr = r - bgColor[0];
    const dg = g - bgColor[1];
    const db = b - bgColor[2];
    const da = a - bgColor[3];
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da) <= tolerance;
  };

  // Find vertical gutters (columns of background)
  const vGutters: boolean[] = new Array(bw).fill(true);
  for (let x = 0; x < bw; x++) {
    for (let y = 0; y < bh; y++) {
      const idx = ((by + y) * width + (bx + x)) * 4;
      if (!isBg(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) {
        vGutters[x] = false;
        break;
      }
    }
  }

  // Find horizontal gutters (rows of background)
  const hGutters: boolean[] = new Array(bh).fill(true);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const idx = ((by + y) * width + (bx + x)) * 4;
      if (!isBg(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) {
        hGutters[y] = false;
        break;
      }
    }
  }

  // Split into columns
  const colBounds: { start: number; end: number }[] = [];
  let inCol = false;
  let colStart = 0;
  for (let x = 0; x < bw; x++) {
    if (!vGutters[x] && !inCol) {
      inCol = true;
      colStart = x;
    } else if (vGutters[x] && inCol) {
      inCol = false;
      colBounds.push({ start: colStart, end: x - 1 });
    }
  }
  if (inCol) colBounds.push({ start: colStart, end: bw - 1 });

  // Split into rows
  const rowBounds: { start: number; end: number }[] = [];
  let inRow = false;
  let rowStart = 0;
  for (let y = 0; y < bh; y++) {
    if (!hGutters[y] && !inRow) {
      inRow = true;
      rowStart = y;
    } else if (hGutters[y] && inRow) {
      inRow = false;
      rowBounds.push({ start: rowStart, end: y - 1 });
    }
  }
  if (inRow) rowBounds.push({ start: rowStart, end: bh - 1 });

  // Combine to create sub-rects
  const subRects: Rect[] = [];
  for (const row of rowBounds) {
    for (const col of colBounds) {
      // For each cell, we can further refine it by finding the actual content bounds
      let minX = col.end, maxX = col.start, minY = row.end, maxY = row.start;
      let hasContent = false;

      for (let y = row.start; y <= row.end; y++) {
        for (let x = col.start; x <= col.end; x++) {
          const idx = ((by + y) * width + (bx + x)) * 4;
          if (!isBg(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            hasContent = true;
          }
        }
      }

      if (hasContent) {
        subRects.push({
          x: bx + minX,
          y: by + minY,
          w: maxX - minX + 1,
          h: maxY - minY + 1
        });
      }
    }
  }

  return subRects;
}
