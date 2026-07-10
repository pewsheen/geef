const DEFAULT_OPTIONS = {
  fps: 8,
  maxSeconds: 6,
  maxWidth: 360,
  maxHeight: 280,
  paletteSize: 256,
  dither: true,
};

export async function convertVideoToGif(
  file,
  options = {},
  onProgress = () => {},
) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await waitFor(video, 'loadedmetadata');
    await waitFor(video, 'loadeddata').catch(() => {});

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('Video duration could not be read.');
    }

    const size = fitSize(
      video.videoWidth,
      video.videoHeight,
      settings.maxWidth,
      settings.maxHeight,
    );
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    const frameCount = Math.max(
      1,
      Math.ceil(Math.min(video.duration, settings.maxSeconds) * settings.fps),
    );
    const frames = [];

    for (let index = 0; index < frameCount; index += 1) {
      const time = Math.min(
        index / settings.fps,
        Math.max(0, video.duration - 0.05),
      );
      await seekVideo(video, time);
      context.drawImage(video, 0, 0, size.width, size.height);

      const imageData = context.getImageData(0, 0, size.width, size.height);
      frames.push({
        rgba: new Uint8ClampedArray(imageData.data),
        delay: Math.max(2, Math.round(100 / settings.fps)),
      });

      onProgress(((index + 1) / frameCount) * 0.75);
    }

    const palette = buildAdaptivePalette(
      frames.map((frame) => frame.rgba),
      settings.paletteSize,
    );
    const indexedFrames = frames.map((frame, index) => {
      const pixels = mapPixelsToPalette(
        frame.rgba,
        size.width,
        size.height,
        palette,
        settings.dither,
      );
      onProgress(0.8 + ((index + 1) / frames.length) * 0.2);
      return { pixels, delay: frame.delay };
    });

    const bytes = encodeGif(size.width, size.height, indexedFrames, palette);
    return new Blob([bytes], { type: 'image/gif' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fitSize(width, height, maxWidth, maxHeight) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function waitFor(target, eventName) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeout);
      target.removeEventListener(eventName, handleEvent);
      target.removeEventListener('error', handleError);
    };

    const handleEvent = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Video could not be loaded.'));
    };

    target.addEventListener(eventName, handleEvent, { once: true });
    target.addEventListener('error', handleError, { once: true });
  });
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) {
      requestAnimationFrame(resolve);
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out seeking video frame.'));
    }, 8000);

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
    };

    const handleSeeked = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Video seek failed.'));
    };

    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.currentTime = time;
  });
}

function buildAdaptivePalette(frameRgbaList, maxColors) {
  const safeMaxColors = Math.max(2, Math.min(256, maxColors || 256));
  const counts = new Uint32Array(32768);
  const redSums = new Float64Array(32768);
  const greenSums = new Float64Array(32768);
  const blueSums = new Float64Array(32768);

  for (const rgba of frameRgbaList) {
    for (let source = 0; source < rgba.length; source += 4) {
      const alpha = rgba[source + 3];
      const red = alpha ? rgba[source] : 255;
      const green = alpha ? rgba[source + 1] : 255;
      const blue = alpha ? rgba[source + 2] : 255;
      const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);

      counts[key] += 1;
      redSums[key] += red;
      greenSums[key] += green;
      blueSums[key] += blue;
    }
  }

  const points = [];
  for (let key = 0; key < counts.length; key += 1) {
    const count = counts[key];
    if (!count) continue;

    points.push({
      r: (key >> 10) & 31,
      g: (key >> 5) & 31,
      b: key & 31,
      count,
      redSum: redSums[key],
      greenSum: greenSums[key],
      blueSum: blueSums[key],
    });
  }

  if (!points.length) return [[255, 255, 255]];

  const boxes = [makeColorBox(points)];

  while (boxes.length < safeMaxColors) {
    boxes.sort((a, b) => boxPriority(b) - boxPriority(a));
    const box = boxes.shift();

    if (!box || box.points.length < 2) {
      if (box) boxes.push(box);
      break;
    }

    const [left, right] = splitColorBox(box);
    if (!left || !right) {
      boxes.push(box);
      break;
    }

    boxes.push(left, right);
  }

  return boxes.map(colorFromBox);
}

function makeColorBox(points) {
  let rMin = 31;
  let rMax = 0;
  let gMin = 31;
  let gMax = 0;
  let bMin = 31;
  let bMax = 0;
  let count = 0;

  for (const point of points) {
    rMin = Math.min(rMin, point.r);
    rMax = Math.max(rMax, point.r);
    gMin = Math.min(gMin, point.g);
    gMax = Math.max(gMax, point.g);
    bMin = Math.min(bMin, point.b);
    bMax = Math.max(bMax, point.b);
    count += point.count;
  }

  return {
    points,
    count,
    rRange: rMax - rMin,
    gRange: gMax - gMin,
    bRange: bMax - bMin,
  };
}

function boxPriority(box) {
  return Math.max(box.rRange, box.gRange, box.bRange) * Math.max(1, box.count);
}

function splitColorBox(box) {
  const channel = largestChannel(box);
  const sorted = [...box.points].sort((a, b) => a[channel] - b[channel]);
  const half = box.count / 2;
  let running = 0;
  let splitIndex = 0;

  while (splitIndex < sorted.length - 1 && running < half) {
    running += sorted[splitIndex].count;
    splitIndex += 1;
  }

  if (splitIndex <= 0 || splitIndex >= sorted.length) {
    splitIndex = Math.floor(sorted.length / 2);
  }

  if (splitIndex <= 0 || splitIndex >= sorted.length) return [null, null];

  return [
    makeColorBox(sorted.slice(0, splitIndex)),
    makeColorBox(sorted.slice(splitIndex)),
  ];
}

function largestChannel(box) {
  if (box.rRange >= box.gRange && box.rRange >= box.bRange) return 'r';
  if (box.gRange >= box.rRange && box.gRange >= box.bRange) return 'g';
  return 'b';
}

function colorFromBox(box) {
  let count = 0;
  let red = 0;
  let green = 0;
  let blue = 0;

  for (const point of box.points) {
    count += point.count;
    red += point.redSum;
    green += point.greenSum;
    blue += point.blueSum;
  }

  return [
    clampByte(red / count),
    clampByte(green / count),
    clampByte(blue / count),
  ];
}

function mapPixelsToPalette(rgba, width, height, palette, useDither) {
  return useDither
    ? mapPixelsToPaletteWithDither(rgba, width, height, palette)
    : mapPixelsToPaletteFlat(rgba, palette);
}

function mapPixelsToPaletteFlat(rgba, palette) {
  const indices = new Uint8Array(rgba.length / 4);
  const cache = new Int16Array(32768);
  cache.fill(-1);

  for (
    let source = 0, target = 0;
    source < rgba.length;
    source += 4, target += 1
  ) {
    const alpha = rgba[source + 3];
    const red = alpha ? rgba[source] : 255;
    const green = alpha ? rgba[source + 1] : 255;
    const blue = alpha ? rgba[source + 2] : 255;
    indices[target] = nearestPaletteIndex(palette, cache, red, green, blue);
  }

  return indices;
}

function mapPixelsToPaletteWithDither(rgba, width, height, palette) {
  const indices = new Uint8Array(width * height);
  const cache = new Int16Array(32768);
  let currentError = new Float32Array((width + 2) * 3);
  let nextError = new Float32Array((width + 2) * 3);
  cache.fill(-1);

  for (let y = 0; y < height; y += 1) {
    nextError.fill(0);

    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const source = pixel * 4;
      const errorIndex = (x + 1) * 3;
      const alpha = rgba[source + 3];
      const red = clampByte(
        (alpha ? rgba[source] : 255) + currentError[errorIndex],
      );
      const green = clampByte(
        (alpha ? rgba[source + 1] : 255) + currentError[errorIndex + 1],
      );
      const blue = clampByte(
        (alpha ? rgba[source + 2] : 255) + currentError[errorIndex + 2],
      );
      const paletteIndex = nearestPaletteIndex(
        palette,
        cache,
        red,
        green,
        blue,
      );
      const color = palette[paletteIndex];

      indices[pixel] = paletteIndex;
      distributeError(
        currentError,
        nextError,
        x,
        red - color[0],
        green - color[1],
        blue - color[2],
      );
    }

    const previous = currentError;
    currentError = nextError;
    nextError = previous;
  }

  return indices;
}

function distributeError(currentError, nextError, x, red, green, blue) {
  addError(currentError, x + 2, red, green, blue, 7 / 16);
  addError(nextError, x, red, green, blue, 3 / 16);
  addError(nextError, x + 1, red, green, blue, 5 / 16);
  addError(nextError, x + 2, red, green, blue, 1 / 16);
}

function addError(buffer, index, red, green, blue, weight) {
  const offset = index * 3;
  buffer[offset] += red * weight;
  buffer[offset + 1] += green * weight;
  buffer[offset + 2] += blue * weight;
}

function nearestPaletteIndex(palette, cache, red, green, blue) {
  const r = clampByte(red);
  const g = clampByte(green);
  const b = clampByte(blue);
  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  const cached = cache[key];

  if (cached >= 0) return cached;

  let nearest = 0;
  let nearestDistance = Infinity;

  for (let index = 0; index < palette.length; index += 1) {
    const color = palette[index];
    const dr = r - color[0];
    const dg = g - color[1];
    const db = b - color[2];
    const distance = dr * dr + dg * dg + db * db;

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = index;
    }
  }

  cache[key] = nearest;
  return nearest;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function encodeGif(width, height, frames, palette) {
  const out = [];

  writeAscii(out, 'GIF89a');
  writeShort(out, width);
  writeShort(out, height);
  out.push(0xf7, 0x00, 0x00);
  writeGlobalPalette(out, palette);
  writeLoopExtension(out);

  for (const frame of frames) {
    writeGraphicControlExtension(out, frame.delay);
    writeImageDescriptor(out, width, height);
    out.push(8);
    writeSubBlocks(out, lzwLiteralEncode(frame.pixels));
  }

  out.push(0x3b);
  return new Uint8Array(out);
}

function writeGlobalPalette(out, palette) {
  const fallback = palette[palette.length - 1] || [0, 0, 0];

  for (let index = 0; index < 256; index += 1) {
    const color = palette[index] || fallback;
    out.push(color[0], color[1], color[2]);
  }
}

function writeLoopExtension(out) {
  out.push(
    0x21,
    0xff,
    0x0b,
    0x4e,
    0x45,
    0x54,
    0x53,
    0x43,
    0x41,
    0x50,
    0x45,
    0x32,
    0x2e,
    0x30,
    0x03,
    0x01,
    0x00,
    0x00,
    0x00,
  );
}

function writeGraphicControlExtension(out, delay) {
  out.push(0x21, 0xf9, 0x04, 0x04);
  writeShort(out, delay);
  out.push(0x00, 0x00);
}

function writeImageDescriptor(out, width, height) {
  out.push(0x2c);
  writeShort(out, 0);
  writeShort(out, 0);
  writeShort(out, width);
  writeShort(out, height);
  out.push(0x00);
}

function lzwLiteralEncode(indices) {
  const bytes = [];
  const clearCode = 256;
  const endCode = 257;
  const codeSize = 9;
  let bitBuffer = 0;
  let bitCount = 0;
  let emittedSinceClear = 0;

  const writeCode = (code) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;

    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  writeCode(clearCode);

  for (const index of indices) {
    if (emittedSinceClear >= 240) {
      writeCode(clearCode);
      emittedSinceClear = 0;
    }

    writeCode(index);
    emittedSinceClear += 1;
  }

  writeCode(endCode);

  if (bitCount > 0) {
    bytes.push(bitBuffer & 0xff);
  }

  return bytes;
}

function writeSubBlocks(out, bytes) {
  for (let offset = 0; offset < bytes.length; offset += 255) {
    const block = bytes.slice(offset, offset + 255);
    out.push(block.length, ...block);
  }

  out.push(0x00);
}

function writeAscii(out, text) {
  for (let index = 0; index < text.length; index += 1) {
    out.push(text.charCodeAt(index));
  }
}

function writeShort(out, value) {
  out.push(value & 0xff, (value >> 8) & 0xff);
}
