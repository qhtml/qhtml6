/*
  <q-vid-player> delta RGBA player

  Usage:
    <script src="./q-vid-player.js"></script>
    <q-vid-player src="./output.qvid" frameDuration="30" reverse="true" startFrame="0" endFrame="50" running="true"></q-vid-player>

  Supported generated asset formats:
    - q-vid-delta-binary-v1          compressed binary delta stream, recommended
    - q-vid-rgba-tile-v1            raw base64 tile stream
    - legacy sprite-delta formats   accepted for old .js outputs

  v4 notes:
    - Deltas are decoded lazily instead of all at once.
    - The first frame can render as soon as the keyframe is decoded.
    - QVidAssetRegistry.registerTextAsset(text, src) supports viewer/file-input loading.
*/
;(function installQVidPlayer(global) {
  "use strict";

  const FORMAT_V1 = "q-vid-rgba-tile-v1";
  const FORMAT_V2 = "q-vid-delta-binary-v1";
  const LEGACY_FORMAT_V1 = "sprite-delta-rgba-tile-v1";
  const LEGACY_FORMAT_V2 = "sprite-delta-binary-v2";

  function normalizeUrl(src) {
    try {
      return new URL(src, document.baseURI).href;
    } catch {
      return String(src || "");
    }
  }

  function parseBoolean(value, fallback = false) {
    if (value == null) return fallback;
    if (typeof value === "boolean") return value;
    return /^(1|true|yes|on|)$/i.test(String(value).trim());
  }

  function parseInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function parseNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function wrapInclusive(value, min, max) {
    if (max < min) return min;
    const span = max - min + 1;
    return ((((value - min) % span) + span) % span) + min;
  }

  function getAttrCaseInsensitive(element, name) {
    return element.getAttribute(name) ?? element.getAttribute(name.toLowerCase());
  }

  function decodeBase64ToUint8(base64) {
    const binary = atob(String(base64 || ""));
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  async function decodePayload(base64, codec) {
    const bytes = decodeBase64ToUint8(base64);

    if (!codec || codec === "raw") {
      return bytes;
    }

    if (codec !== "gzip") {
      throw new Error(`Unsupported q-vid payload codec: ${codec}`);
    }

    if (typeof DecompressionStream === "undefined") {
      throw new Error(
        "This q-vid asset uses gzip-compressed payloads, but this browser does not expose DecompressionStream. " +
        "Regenerate with --codec raw or use a modern Chromium/Firefox/Safari build."
      );
    }

    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }

  function assertSupportedAsset(rawAsset) {
    const supported = rawAsset &&
      (rawAsset.format === FORMAT_V1 ||
        rawAsset.format === FORMAT_V2 ||
        rawAsset.format === LEGACY_FORMAT_V1 ||
        rawAsset.format === LEGACY_FORMAT_V2);

    if (!supported) {
      throw new Error(`Unsupported q-vid asset format: ${rawAsset?.format || "unknown"}`);
    }

    if (!Number.isInteger(rawAsset.width) || !Number.isInteger(rawAsset.height) || rawAsset.width < 1 || rawAsset.height < 1) {
      throw new Error("Invalid q-vid asset dimensions.");
    }

    if (!Number.isInteger(rawAsset.frameCount) || rawAsset.frameCount < 1) {
      throw new Error("Invalid q-vid asset frameCount.");
    }
  }

  async function normalizeAsset(rawAsset) {
    assertSupportedAsset(rawAsset);

    if (rawAsset.__normalizedAsset) {
      return rawAsset.__normalizedAsset;
    }

    const normalized = rawAsset.format === FORMAT_V2 || rawAsset.format === LEGACY_FORMAT_V2
      ? await normalizeV2Asset(rawAsset)
      : await normalizeV1Asset(rawAsset);

    rawAsset.__normalizedAsset = normalized;
    return normalized;
  }

  async function normalizeV1Asset(rawAsset) {
    const deltaCache = new Map();
    const keyFrameBytes = decodeBase64ToUint8(rawAsset.keyFrame);

    return buildNormalizedAsset(rawAsset, {
      keyFrameBytes,
      async getDelta(deltaIndex) {
        const index = clamp(Math.trunc(deltaIndex), 0, Math.max(0, rawAsset.deltas.length - 1));
        if (deltaCache.has(index)) return deltaCache.get(index);

        const tiles = (rawAsset.deltas[index] || []).map((tile) => ({
          x: tile.x,
          y: tile.y,
          w: tile.w,
          h: tile.h,
          bytes: decodeBase64ToUint8(tile.bytes)
        }));

        deltaCache.set(index, tiles);
        return tiles;
      }
    });
  }

  async function normalizeV2Asset(rawAsset) {
    const codec = rawAsset.codec || "raw";
    const deltaCache = new Map();
    const keyFrameBytes = new Uint8ClampedArray(await decodePayload(rawAsset.keyFrame, codec));

    return buildNormalizedAsset(rawAsset, {
      keyFrameBytes,
      async getDelta(deltaIndex) {
        const index = clamp(Math.trunc(deltaIndex), 0, Math.max(0, rawAsset.deltas.length - 1));
        if (deltaCache.has(index)) return deltaCache.get(index);

        const packed = await decodePayload(rawAsset.deltas[index] || "", codec);
        const tiles = unpackTiles(packed, rawAsset.width, rawAsset.height);
        deltaCache.set(index, tiles);
        return tiles;
      }
    });
  }

  function buildNormalizedAsset(rawAsset, { keyFrameBytes, getDelta }) {
    const expectedBytes = rawAsset.width * rawAsset.height * 4;
    if (keyFrameBytes.byteLength !== expectedBytes) {
      throw new Error(
        `Invalid q-vid keyframe byte length. Expected ${expectedBytes}, got ${keyFrameBytes.byteLength}.`
      );
    }

    return {
      format: rawAsset.format,
      name: rawAsset.name || "q_vid_asset",
      src: rawAsset.src || rawAsset.name || "q_vid_asset",
      width: rawAsset.width,
      height: rawAsset.height,
      sourceWidth: rawAsset.sourceWidth || rawAsset.width,
      sourceHeight: rawAsset.sourceHeight || rawAsset.height,
      resize: rawAsset.resize || null,
      frameCount: rawAsset.frameCount,
      tileSize: rawAsset.tileSize || 32,
      tolerance: rawAsset.tolerance || 0,
      codec: rawAsset.codec || "raw",
      deltaMode: rawAsset.deltaMode || "tile",
      pack: rawAsset.pack || "legacy",
      defaultFrameDuration: rawAsset.defaultFrameDuration || 30,
      sourceFrames: rawAsset.sourceFrames || [],
      stats: rawAsset.stats || {},
      keyFrameBytes: new Uint8ClampedArray(keyFrameBytes),
      getDelta
    };
  }

  function unpackTiles(bytes, canvasWidth, canvasHeight) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;

    if (bytes.byteLength < 4) {
      throw new Error("Invalid q-vid delta stream: missing tile count.");
    }

    const tileCount = view.getUint32(offset, true);
    offset += 4;

    const tiles = [];

    for (let i = 0; i < tileCount; i++) {
      if (offset + 16 > bytes.byteLength) {
        throw new Error("Invalid q-vid delta stream: truncated tile header.");
      }

      const x = view.getUint32(offset, true); offset += 4;
      const y = view.getUint32(offset, true); offset += 4;
      const w = view.getUint32(offset, true); offset += 4;
      const h = view.getUint32(offset, true); offset += 4;
      const length = w * h * 4;

      if (x + w > canvasWidth || y + h > canvasHeight) {
        throw new Error(`Invalid q-vid tile bounds: ${x},${y},${w},${h}`);
      }

      if (offset + length > bytes.byteLength) {
        throw new Error("Invalid q-vid delta stream: truncated tile payload.");
      }

      tiles.push({
        x,
        y,
        w,
        h,
        bytes: bytes.subarray(offset, offset + length)
      });

      offset += length;
    }

    if (offset !== bytes.byteLength) {
      console.warn(`q-vid delta stream has ${bytes.byteLength - offset} trailing byte(s).`);
    }

    return tiles;
  }

  function executeGeneratedAssetText(text, src) {
    const registered = [];
    const registryShim = {
        register(asset) {
          if (asset && src) asset.src = src;
          registered.push(asset);
          return asset;
        }
    };
    const fakeGlobal = {
      QVidAssetRegistry: registryShim,
      SpriteSheetAssetRegistry: registryShim,
      __pendingQVidAssets: [],
      __pendingSpriteSheetAssets: []
    };

    const run = new Function("globalThis", String(text));
    run(fakeGlobal);

    const pending = [
      ...(Array.isArray(fakeGlobal.__pendingQVidAssets) ? fakeGlobal.__pendingQVidAssets : []),
      ...(Array.isArray(fakeGlobal.__pendingSpriteSheetAssets) ? fakeGlobal.__pendingSpriteSheetAssets : [])
    ];

    const asset = registered[0] || pending[0];
    if (!asset) {
      throw new Error("The selected file did not register a q-vid delta asset.");
    }

    if (src) asset.src = src;
    return asset;
  }

  class QVidAssetRegistryImpl {
    constructor() {
      this.assets = new Map();
      this.waiters = new Map();
      this.loadingScripts = new Map();
    }

    register(rawAsset, aliases = []) {
      const src = rawAsset && rawAsset.src ? rawAsset.src : rawAsset?.name;
      const keys = new Set([
        rawAsset?.name,
        src,
        src ? normalizeUrl(src) : null,
        ...aliases,
        ...aliases.map((alias) => normalizeUrl(alias))
      ].filter(Boolean));

      const assetPromise = normalizeAsset(rawAsset);

      for (const key of keys) {
        this.assets.set(key, assetPromise);
      }

      assetPromise
        .then((asset) => {
          const finalKeys = new Set([
            ...keys,
            asset.name,
            asset.src,
            normalizeUrl(asset.src)
          ].filter(Boolean));

          for (const key of finalKeys) {
            this.assets.set(key, Promise.resolve(asset));
            this.resolveWaiters(key, asset);
          }
        })
        .catch((error) => {
          for (const key of keys) {
            this.rejectWaiters(key, error);
          }
        });

      return assetPromise;
    }

    async registerTextAsset(text, src = `inline-qvid-${Date.now()}`) {
      const normalizedSrc = normalizeUrl(src);
      const rawAsset = executeGeneratedAssetText(text, normalizedSrc);
      rawAsset.src = normalizedSrc;
      return this.register(rawAsset, [src, normalizedSrc]);
    }

    load(src) {
      const normalizedSrc = normalizeUrl(src);
      const direct = this.assets.get(src) || this.assets.get(normalizedSrc);

      if (direct) {
        return direct;
      }

      const waiter = new Promise((resolve, reject) => {
        const list = this.waiters.get(normalizedSrc) || [];
        list.push({ resolve, reject });
        this.waiters.set(normalizedSrc, list);
      });

      if (/\.qvid(?:$|[?#])/i.test(normalizedSrc)) {
        this.fetchTextAssetOnce(normalizedSrc);
      } else {
        this.injectScriptOnce(normalizedSrc);
      }
      return waiter;
    }

    fetchTextAssetOnce(src) {
      if (this.loadingScripts.has(src)) return;

      const promise = fetch(src)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to load q-vid asset: ${src}`);
          }
          return response.text();
        })
        .then((text) => this.registerTextAsset(text, src))
        .catch((error) => {
          this.rejectWaiters(src, error);
          throw error;
        });

      this.loadingScripts.set(src, promise);
    }

    injectScriptOnce(src) {
      if (this.loadingScripts.has(src)) return;

      const script = document.createElement("script");
      script.async = true;
      script.src = src;

      const promise = new Promise((resolve, reject) => {
        script.addEventListener("load", resolve, { once: true });
        script.addEventListener("error", () => {
          const waiters = this.waiters.get(src) || [];
          this.waiters.delete(src);

          const error = new Error(`Failed to load q-vid asset script: ${src}`);
          for (const waiter of waiters) waiter.reject(error);
          reject(error);
        }, { once: true });
      });

      this.loadingScripts.set(src, promise);
      document.head.appendChild(script);
    }

    resolveWaiters(key, asset) {
      const normalizedKey = normalizeUrl(key);
      const waiters = [
        ...(this.waiters.get(key) || []),
        ...(this.waiters.get(normalizedKey) || [])
      ];

      this.waiters.delete(key);
      this.waiters.delete(normalizedKey);

      for (const waiter of waiters) {
        waiter.resolve(asset);
      }
    }

    rejectWaiters(key, error) {
      const normalizedKey = normalizeUrl(key);
      const waiters = [
        ...(this.waiters.get(key) || []),
        ...(this.waiters.get(normalizedKey) || [])
      ];

      this.waiters.delete(key);
      this.waiters.delete(normalizedKey);

      for (const waiter of waiters) {
        waiter.reject(error);
      }
    }
  }

  const existingRegistry = global.QVidAssetRegistry;
  const registry = existingRegistry && typeof existingRegistry.register === "function"
    ? existingRegistry
    : new QVidAssetRegistryImpl();

  global.QVidAssetRegistry = registry;
  global.SpriteSheetAssetRegistry = registry;

  if (Array.isArray(global.__pendingQVidAssets)) {
    for (const asset of global.__pendingQVidAssets) {
      registry.register(asset);
    }
    global.__pendingQVidAssets.length = 0;
  }

  if (Array.isArray(global.__pendingSpriteSheetAssets)) {
    for (const asset of global.__pendingSpriteSheetAssets) {
      registry.register(asset);
    }
    global.__pendingSpriteSheetAssets.length = 0;
  }

  class DeltaFrameDecoder {
    constructor(asset) {
      this.asset = asset;
      this.cache = new Map();
      this.cache.set(0, new Uint8ClampedArray(asset.keyFrameBytes));
    }

    async getFrameBytes(frameIndex) {
      const target = clamp(Math.trunc(frameIndex), 0, this.asset.frameCount - 1);

      if (this.cache.has(target)) {
        return this.cache.get(target);
      }

      const start = this.findNearestCachedFrameBefore(target);
      const working = new Uint8ClampedArray(this.cache.get(start));

      for (let frame = start + 1; frame <= target; frame++) {
        const delta = await this.asset.getDelta(frame - 1);
        applyTilesToBuffer(working, delta, this.asset.width);
        this.cache.set(frame, new Uint8ClampedArray(working));
      }

      return this.cache.get(target);
    }

    findNearestCachedFrameBefore(target) {
      let nearest = 0;

      for (const key of this.cache.keys()) {
        if (key < target && key > nearest) {
          nearest = key;
        }
      }

      return nearest;
    }
  }

  function applyTilesToBuffer(target, tiles, canvasWidth) {
    for (const tile of tiles) {
      const { x, y, w, h, bytes } = tile;

      for (let row = 0; row < h; row++) {
        const srcStart = row * w * 4;
        const srcEnd = srcStart + w * 4;
        const dstStart = ((y + row) * canvasWidth + x) * 4;
        target.set(bytes.subarray(srcStart, srcEnd), dstStart);
      }
    }
  }

  class QVidElement extends HTMLElement {
    static get observedAttributes() {
      return [
        "src",
        "frameduration",
        "reverse",
        "startframe",
        "endframe",
        "scale",
        "running"
      ];
    }

    constructor() {
      super();

      this.attachShadow({ mode: "open" });
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });

      const style = document.createElement("style");
      style.textContent = `
        :host {
          display: inline-block;
          contain: content;
        }

        canvas {
          display: block;
          width: 100%;
          height: auto;
          image-rendering: auto;
        }
      `;

      this.shadowRoot.append(style, this.canvas);

      this._asset = null;
      this._decoder = null;
      this._imageData = null;
      this._raf = 0;
      this._lastTick = 0;
      this._loadedSrc = "";
      this._connected = false;
      this._renderedFrame = -1;
      this._explicitCurrentFrame = false;
      this._renderToken = 0;
      this._loadToken = 0;
      this._renderBusy = false;
      this._queuedTick = false;

      this._frameDuration = 30;
      this._reverse = false;
      this._running = false;
      this._startFrame = 0;
      this._endFrame = 0;
      this._currentFrame = 0;
      this._scale = 1;
      this._dirtyRedrawTileThreshold = 0.65;
    }

    connectedCallback() {
      this._connected = true;
      this._syncAttributes();
      this._loadFromAttribute();
    }

    disconnectedCallback() {
      this._connected = false;
      this._cancelLoop();
    }

    attributeChangedCallback() {
      this._syncAttributes();
      this._applyScale();

      if (this._connected) {
        this._loadFromAttribute();
      }
    }

    get currentFrame() {
      return this._currentFrame;
    }

    set currentFrame(frame) {
      this.setCurrentFrame(frame);
    }

    get frameDuration() {
      return this._frameDuration;
    }

    set frameDuration(duration) {
      this.setFrameDuration(duration);
    }

    get reverse() {
      return this._reverse;
    }

    set reverse(value) {
      this.setReverse(value);
    }

    get running() {
      return this._running;
    }

    set running(value) {
      if (parseBoolean(value)) this.start();
      else this.stop();
    }

    get scale() {
      return this._scale;
    }

    set scale(value) {
      this.setScale(value);
    }

    step(count = 1) {
      if (!this._asset) return this;

      const direction = this._reverse ? -1 : 1;
      const min = Math.min(this._startFrame, this._endFrame);
      const max = Math.max(this._startFrame, this._endFrame);
      const next = wrapInclusive(this._currentFrame + direction * Math.trunc(count), min, max);

      this.setCurrentFrame(next);
      return this;
    }

    setCurrentFrame(frame) {
      this._explicitCurrentFrame = true;

      if (!this._asset) {
        this._currentFrame = Math.max(0, Math.trunc(Number(frame) || 0));
        return this;
      }

      const min = Math.min(this._startFrame, this._endFrame);
      const max = Math.max(this._startFrame, this._endFrame);
      const target = clamp(Math.trunc(Number(frame) || 0), min, max);

      this._currentFrame = target;
      this._renderFrame(target);
      return this;
    }

    setEndFrame(frame) {
      const value = Math.trunc(Number(frame) || 0);
      this.setAttribute("endFrame", String(value));
      return this;
    }

    setStartFrame(frame) {
      const value = Math.trunc(Number(frame) || 0);
      this.setAttribute("startFrame", String(value));
      return this;
    }

    start() {
      this._running = true;
      if (this.getAttribute("running") !== "true") this.setAttribute("running", "true");

      if (!this._asset) return this;

      this._lastTick = performance.now();
      this._cancelLoop();
      this._raf = requestAnimationFrame(this._tick);
      return this;
    }

    stop() {
      this._running = false;
      if (this.getAttribute("running") !== "false") this.setAttribute("running", "false");
      this._cancelLoop();
      return this;
    }

    restart() {
      if (this._asset) {
        this._explicitCurrentFrame = true;
        this.setCurrentFrame(this._reverse ? this._endFrame : this._startFrame);
      }

      this.start();
      return this;
    }

    setReverse(value) {
      this._reverse = parseBoolean(value);
      if (this.getAttribute("reverse") !== String(this._reverse)) this.setAttribute("reverse", String(this._reverse));
      return this;
    }

    setFrameDuration(duration) {
      const ms = Math.max(1, parseNumber(duration, this._frameDuration));
      this._frameDuration = ms;
      if (this.getAttribute("frameDuration") !== String(ms)) this.setAttribute("frameDuration", String(ms));
      return this;
    }

    setScale(scale) {
      const value = Math.max(0.01, parseNumber(scale, this._scale || 1));
      this._scale = value;
      if (this.getAttribute("scale") !== String(value)) this.setAttribute("scale", String(value));
      this._applyScale();
      return this;
    }

    _syncAttributes() {
      this._frameDuration = Math.max(
        1,
        parseNumber(getAttrCaseInsensitive(this, "frameDuration"), this._frameDuration)
      );

      this._reverse = parseBoolean(getAttrCaseInsensitive(this, "reverse"), this._reverse);
      this._running = parseBoolean(getAttrCaseInsensitive(this, "running"), this._running);
      this._scale = Math.max(0.01, parseNumber(getAttrCaseInsensitive(this, "scale"), this._scale || 1));

      const requestedStart = parseInteger(getAttrCaseInsensitive(this, "startFrame"), this._startFrame);
      const requestedEnd = parseInteger(getAttrCaseInsensitive(this, "endFrame"), this._endFrame);

      if (this._asset) {
        this._startFrame = clamp(requestedStart, 0, this._asset.frameCount - 1);
        this._endFrame = clamp(requestedEnd, 0, this._asset.frameCount - 1);
        this._currentFrame = clamp(
          this._currentFrame,
          Math.min(this._startFrame, this._endFrame),
          Math.max(this._startFrame, this._endFrame)
        );
      } else {
        this._startFrame = Math.max(0, requestedStart);
        this._endFrame = Math.max(0, requestedEnd);
      }
    }

    async _loadFromAttribute() {
      const src = getAttrCaseInsensitive(this, "src");
      if (!src) return;

      const normalizedSrc = normalizeUrl(src);
      if (normalizedSrc === this._loadedSrc && this._asset) {
        if (this._running) this.start();
        return;
      }

      if (normalizedSrc === this._loadedSrc && !this._asset) {
        return;
      }

      this._loadedSrc = normalizedSrc;
      const loadToken = ++this._loadToken;

      try {
        const asset = await registry.load(normalizedSrc);
        if (loadToken !== this._loadToken || this._loadedSrc !== normalizedSrc) return;

        await this._installAsset(asset);

        if (this._running) {
          this.start();
        }
      } catch (error) {
        console.error(error);
        this._loadedSrc = "";
        this.dispatchEvent(new CustomEvent("q-vid-error", {
          detail: { error },
          bubbles: true,
          composed: true
        }));
      }
    }

    async _installAsset(asset) {
      this._cancelLoop();
      this._asset = asset;
      this._decoder = new DeltaFrameDecoder(asset);
      this._imageData = this.ctx.createImageData(asset.width, asset.height);

      this.canvas.width = asset.width;
      this.canvas.height = asset.height;
      this._applyScale();

      const requestedStart = parseInteger(getAttrCaseInsensitive(this, "startFrame"), 0);
      const requestedEnd = parseInteger(getAttrCaseInsensitive(this, "endFrame"), asset.frameCount - 1);

      this._startFrame = clamp(requestedStart, 0, asset.frameCount - 1);
      this._endFrame = clamp(requestedEnd, 0, asset.frameCount - 1);

      if (!this._explicitCurrentFrame) {
        this._currentFrame = this._reverse ? this._endFrame : this._startFrame;
      } else {
        this._currentFrame = clamp(
          this._currentFrame,
          Math.min(this._startFrame, this._endFrame),
          Math.max(this._startFrame, this._endFrame)
        );
      }

      this._renderedFrame = -1;
      this._imageData.data.set(asset.keyFrameBytes);
      this.ctx.putImageData(this._imageData, 0, 0);
      this._renderedFrame = 0;
      this._emitFrameRender(0);

      if (this._currentFrame !== 0) {
        await this._renderFrame(this._currentFrame);
      } else {
        this._emitFrameRender(this._currentFrame);
      }

      this.dispatchEvent(new CustomEvent("q-vid-load", {
        detail: {
          asset,
          width: asset.width,
          height: asset.height,
          frameCount: asset.frameCount,
          startFrame: this._startFrame,
          endFrame: this._endFrame,
          currentFrame: this._currentFrame
        },
        bubbles: true,
        composed: true
      }));
    }

    _tick = (time) => {
      if (!this._running || !this._connected) return;

      if (time - this._lastTick >= this._frameDuration) {
        const missedFrames = Math.max(1, Math.floor((time - this._lastTick) / this._frameDuration));
        this._lastTick += missedFrames * this._frameDuration;

        if (!this._renderBusy) {
          this.step(missedFrames);
        } else {
          this._queuedTick = true;
        }
      }

      this._raf = requestAnimationFrame(this._tick);
    };

    async _renderFrame(frameIndex) {
      if (!this._asset || !this._imageData) return;

      const token = ++this._renderToken;
      const target = clamp(Math.trunc(frameIndex), 0, this._asset.frameCount - 1);

      if (target === this._renderedFrame) {
        this._emitFrameRender(target);
        return;
      }

      this._renderBusy = true;

      try {
        if (target === this._renderedFrame + 1) {
          const delta = await this._asset.getDelta(target - 1);
          if (token !== this._renderToken) return;

          applyTilesToBuffer(this._imageData.data, delta, this._asset.width);
          this._decoder.cache.set(target, new Uint8ClampedArray(this._imageData.data));
          this._drawDelta(delta);
          this._renderedFrame = target;
          this._emitFrameRender(target);
          return;
        }

        const bytes = await this._decoder.getFrameBytes(target);
        if (token !== this._renderToken) return;

        this._imageData.data.set(bytes);
        this.ctx.putImageData(this._imageData, 0, 0);
        this._renderedFrame = target;
        this._emitFrameRender(target);
      } catch (error) {
        console.error(error);
        this.dispatchEvent(new CustomEvent("q-vid-error", {
          detail: { error },
          bubbles: true,
          composed: true
        }));
      } finally {
        if (token === this._renderToken) {
          this._renderBusy = false;
          if (this._queuedTick && this._running) {
            this._queuedTick = false;
            this.step(1);
          }
        }
      }
    }

    _emitFrameRender(frameIndex) {
      this.dispatchEvent(new CustomEvent("q-vid-frame", {
        detail: {
          currentFrame: frameIndex,
          frameDuration: this._frameDuration,
          reverse: this._reverse,
          running: this._running
        },
        bubbles: true,
        composed: true
      }));
    }

    _drawDelta(tiles) {
      if (!tiles.length) return;

      const totalTiles = Math.ceil(this._asset.width / this._asset.tileSize) *
        Math.ceil(this._asset.height / this._asset.tileSize);
      const ratio = totalTiles > 0 ? tiles.length / totalTiles : 1;

      if (ratio >= this._dirtyRedrawTileThreshold) {
        this.ctx.putImageData(this._imageData, 0, 0);
        return;
      }

      for (const tile of tiles) {
        this.ctx.putImageData(this._imageData, 0, 0, tile.x, tile.y, tile.w, tile.h);
      }
    }

    _applyScale() {
      if (!this.canvas) return;
      const scale = Math.max(0.01, Number(this._scale) || 1);
      const width = this._asset && Number.isFinite(Number(this._asset.width))
        ? Number(this._asset.width)
        : Number(this.canvas.width || 0);
      const height = this._asset && Number.isFinite(Number(this._asset.height))
        ? Number(this._asset.height)
        : Number(this.canvas.height || 0);
      if (width > 0) {
        this.canvas.style.width = `${Math.max(1, Math.round(width * scale))}px`;
      }
      if (height > 0) {
        this.canvas.style.height = `${Math.max(1, Math.round(height * scale))}px`;
      }
    }

    _cancelLoop() {
      if (this._raf) {
        cancelAnimationFrame(this._raf);
        this._raf = 0;
      }
    }
  }

  if (!customElements.get("q-vid-player")) {
    customElements.define("q-vid-player", QVidElement);
  }
})(globalThis);
