(function installParticleEmitter(global) {
  if (!global || !global.customElements) {
    return;
  }

  const existingParticleEmitter = global.customElements.get("particle-emitter");

  if (existingParticleEmitter) {
    installParticleEmitterControls(existingParticleEmitter.prototype);
    global.ParticleEmitterElement = existingParticleEmitter;
    defineParticleEmitterAlias(existingParticleEmitter);
    return;
  }

  const ATTRS = [
    "emitrate",
    "lifetime",
    "lifetimevariation",
    "x",
    "y",
    "width",
    "height",
    "xvariation",
    "yvariation",
    "xvelocity",
    "yvelocity",
    "xvelocityvariation",
    "yvelocityvariation",
    "xacceleration",
    "yacceleration",
    "xaccelerationvariation",
    "yaccelerationvariation",
    "startsize",
    "endsize",
    "startsizevariation",
    "endsizevariation",
    "startopacity",
    "endopacity",
    "startopacityvariation",
    "endopacityvariation",
    "maxactiveparticles",
    "maxactiveparticlesvariation",
    "maxparticles",
    "stopafter",
    "running",
    "interval",
    "color",
    "color-opacity",
    "coloropacity",
    "src",
    "mask",
    "emitter-mask",
    "emittermask",
    "seed",
    "zindex",
  ];

  class ParticleEmitterElement extends HTMLElement {
    static get observedAttributes() {
      return ATTRS;
    }

    constructor() {
      super();

      this._canvas = document.createElement("canvas");
      this._ctx = this._canvas.getContext("2d", { alpha: true });
      this._particles = [];
      this._sprite = new ParticleSprite();
      this._emitterMask = new ParticleEmitterMask();
      this._particleSnapshot = new Float32Array(0);
      this._snapshotActive = false;
      this._worker = null;
      this._workerUrl = "";
      this._workerReady = false;
      this._paintTimer = 0;
      this._paintInterval = 16.666;
      this._drawStride = 1;
      this._drawPhase = 0;
      this._paintPollCountdown = 1;
      this._lastPaintDuration = 0;
      this._resizeObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver(() => this._resize())
        : null;
      this._boundResize = this._resize.bind(this);
      this._boundWorkerMessage = this._onWorkerMessage.bind(this);
    }

    connectedCallback() {
      this._installCanvas();
      this._reloadConfig();

      if (this._resizeObserver) {
        this._resizeObserver.observe(this.parentElement);
      } else {
        global.addEventListener("resize", this._boundResize);
      }

      this._resize();
      this._sprite.configure({
        src: this._config.src,
        mask: this._config.mask,
        color: this._config.color,
        colorOpacity: this._config.colorOpacity,
      });
      this._emitterMask.configure(this._config.emitterMask);
      this._ensureWorker();
      this._postWorkerConfig();
      this._render();

      if (this._config.running) {
        this._postWorker({ type: "start" });
        this._startPainter();
      }
    }

    disconnectedCallback() {
      this._stopPainter();
      this._destroyWorker();

      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
      } else {
        global.removeEventListener("resize", this._boundResize);
      }

      this._canvas.remove();
    }

    attributeChangedCallback() {
      if (!this.isConnected) {
        return;
      }

      const oldRunning = this._config ? this._config.running : false;
      this._reloadConfig();
      this._sprite.configure({
        src: this._config.src,
        mask: this._config.mask,
        color: this._config.color,
        colorOpacity: this._config.colorOpacity,
      });
      this._emitterMask.configure(this._config.emitterMask);

      this._postWorkerConfig();

      if (!oldRunning && this._config.running) {
        this._postWorker({ type: "start" });
        this._startPainter();
      } else if (oldRunning && !this._config.running) {
        this._postWorker({ type: "stop" });
      }

      this._applyLayerStyle();
    }

    get running() {
      return readBool(this, "running", false);
    }

    set running(value) {
      this.setAttribute("running", value ? "true" : "false");
    }

    start() {
      this.running = true;
    }

    stop() {
      this.running = false;
    }

    clear() {
      this._particles.length = 0;
      this._particleSnapshot = new Float32Array(0);
      this._snapshotActive = false;
      this._postWorker({ type: "clear" });
      this._render();

      if (!this._config || !this._config.running) {
        this._stopPainter();
      }
    }

    burst(x, y, num) {
      const centerX = readFiniteNumber(x, this._config ? this._config.x : 0);
      const centerY = readFiniteNumber(y, this._config ? this._config.y : 0);
      const count = Math.max(0, Math.floor(Number(num)));

      if (!count) {
        return 0;
      }

      this._ensureWorker();
      this._postWorker({ type: "burst", x: centerX, y: centerY, count });
      this._startPainter();
      return count;
    }

    _installCanvas() {
      const parent = this.parentElement;

      if (!parent) {
        throw new Error("<particle-emitter> must be placed inside a parent element.");
      }

      const parentStyle = getComputedStyle(parent);

      if (parentStyle.position === "static") {
        parent.style.position = "relative";
      }

      this.style.position = "absolute";
      this.style.inset = "0";
      this.style.display = "block";
      this.style.pointerEvents = "none";
      this.style.overflow = "hidden";
      this.style.zIndex = String(readNumber(this, "zIndex", 1));

      this._canvas.style.position = "absolute";
      this._canvas.style.inset = "0";
      this._canvas.style.width = "100%";
      this._canvas.style.height = "100%";
      this._canvas.style.pointerEvents = "none";
      this._canvas.style.background = "transparent";
      this._canvas.style.display = "block";

      if (!this._canvas.parentNode) {
        this.appendChild(this._canvas);
      }
    }

    _applyLayerStyle() {
      this.style.zIndex = String(this._config.zIndex);
    }

    _reloadConfig() {
      const cfg = ParticleConfig.fromElement(this);

      this._config = cfg;
      this._paintInterval = Math.max(1, cfg.interval);
      this._applyLayerStyle();
    }

    _resize() {
      const parent = this.parentElement;

      if (!parent) {
        return;
      }

      const rect = parent.getBoundingClientRect();
      const dpr = global.devicePixelRatio || 1;
      const cssWidth = Math.max(1, rect.width);
      const cssHeight = Math.max(1, rect.height);
      const pixelWidth = Math.floor(cssWidth * dpr);
      const pixelHeight = Math.floor(cssHeight * dpr);

      if (this._canvas.width !== pixelWidth || this._canvas.height !== pixelHeight) {
        this._canvas.width = pixelWidth;
        this._canvas.height = pixelHeight;
        this._canvas.style.width = `${cssWidth}px`;
        this._canvas.style.height = `${cssHeight}px`;
        this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    _ensureWorker() {
      if (this._worker || typeof Worker !== "function" || typeof Blob !== "function" || typeof URL === "undefined") {
        return;
      }

      try {
        const blob = new Blob([createParticleWorkerSource()], { type: "application/javascript" });
        this._workerUrl = URL.createObjectURL(blob);
        this._worker = new Worker(this._workerUrl);
        this._worker.addEventListener("message", this._boundWorkerMessage);
        this._workerReady = true;
      } catch (error) {
        this._worker = null;
        this._workerReady = false;
        if (this._workerUrl) {
          URL.revokeObjectURL(this._workerUrl);
          this._workerUrl = "";
        }
      }
    }

    _destroyWorker() {
      if (this._worker) {
        this._worker.removeEventListener("message", this._boundWorkerMessage);
        this._worker.terminate();
        this._worker = null;
      }
      if (this._workerUrl) {
        URL.revokeObjectURL(this._workerUrl);
        this._workerUrl = "";
      }
      this._workerReady = false;
    }

    _postWorker(message, transfer) {
      this._ensureWorker();
      if (!this._workerReady || !this._worker) {
        return;
      }

      this._worker.postMessage(message, transfer || []);
    }

    _postWorkerConfig() {
      if (!this._config) {
        return;
      }

      this._postWorker({ type: "config", config: serializeParticleConfig(this._config) });
    }

    _onWorkerMessage(event) {
      const data = event && event.data ? event.data : null;
      if (!data) {
        return;
      }

      if (data.type === "snapshot") {
        this._particleSnapshot = data.buffer ? new Float32Array(data.buffer) : new Float32Array(0);
        this._snapshotActive = Boolean(data.active);
        this._particles = snapshotToParticleViews(this._particleSnapshot);
        if (this._snapshotActive || this._particleSnapshot.length > 0 || (this._config && this._config.running)) {
          this._startPainter();
        }
        return;
      }

      if (data.type === "stopped") {
        this._snapshotActive = false;
        if (!this._config || !this._config.running) {
          this._render();
          this._stopPainter();
        }
        return;
      }

      if (data.type === "limitReached") {
        if (this._config && this._config.running) {
          this.setAttribute("running", "false");
        }
      }
    }

    _startPainter() {
      if (this._paintTimer) {
        return;
      }

      const delay = Math.max(1, Math.floor(this._paintInterval || (this._config ? this._config.interval : 16.666)));
      this._paintTimer = global.setTimeout(() => this._paintTick(), delay);
    }

    _stopPainter() {
      if (!this._paintTimer) {
        return;
      }

      global.clearTimeout(this._paintTimer);
      this._paintTimer = 0;
    }

    _paintTick() {
      this._paintTimer = 0;

      const shouldMeasure = this._paintPollCountdown <= 0;
      const start = shouldMeasure && global.performance ? performance.now() : 0;

      this._render(shouldMeasure);

      if (shouldMeasure && global.performance) {
        this._lastPaintDuration = performance.now() - start;
        this._adaptPainter();
        this._paintPollCountdown = 6 + Math.floor(Math.random() * 10);
      } else {
        this._paintPollCountdown -= 1;
      }

      if ((this._config && this._config.running) || this._snapshotActive || this._particleSnapshot.length > 0) {
        this._startPainter();
      }
    }

    _adaptPainter() {
      const targetInterval = Math.max(1, this._config ? this._config.interval : 16.666);
      const drawDuration = Number(this._lastPaintDuration) || 0;

      if (drawDuration > targetInterval) {
        if (this._drawStride < 2) {
          this._drawStride = 2;
          this._paintInterval = targetInterval;
        } else {
          this._paintInterval = Math.max(targetInterval, drawDuration + 20);
        }
        return;
      }

      if (drawDuration < targetInterval * 0.55) {
        if (this._paintInterval > targetInterval) {
          this._paintInterval = Math.max(targetInterval, this._paintInterval * 0.85);
        } else if (this._drawStride > 1) {
          this._drawStride = 1;
        }
      }
    }

    _render(forceAll) {
      const ctx = this._ctx;
      const width = this._canvas.clientWidth;
      const height = this._canvas.clientHeight;
      const snapshot = this._particleSnapshot;

      ctx.clearRect(0, 0, width, height);

      if (!snapshot || snapshot.length <= 0) {
        return;
      }

      const stride = forceAll ? 1 : Math.max(1, Math.floor(this._drawStride || 1));
      const phase = forceAll ? 0 : this._drawPhase % stride;

      if (!forceAll) {
        this._drawPhase = (this._drawPhase + 1) % stride;
      }

      for (let i = phase * 4; i < snapshot.length; i += stride * 4) {
        ParticleRenderer.drawSnapshot(ctx, snapshot, i, this._sprite, this._emitterMask, width, height);
      }
    }
  }

  class ParticleConfig {
    static fromElement(el) {
      const number = (name, fallback) => readNumber(el, name, fallback);
      const text = (name, fallback = "") => readAttr(el, name) ?? fallback;

      return {
        emitRate: number("emitRate", 10),
        lifetime: Math.max(1, number("lifetime", 1000)),
        lifetimeVariation: Math.max(0, number("lifetimeVariation", 0)),
        x: number("x", 0),
        y: number("y", 0),
        width: Math.max(0, number("width", 0)),
        height: Math.max(0, number("height", 0)),
        xVariation: number("xVariation", 0),
        yVariation: number("yVariation", 0),
        xVelocity: number("xVelocity", 0),
        yVelocity: number("yVelocity", 0),
        xVelocityVariation: number("xVelocityVariation", 0),
        yVelocityVariation: number("yVelocityVariation", 0),
        xAcceleration: number("xAcceleration", 0),
        yAcceleration: number("yAcceleration", 0),
        xAccelerationVariation: number("xAccelerationVariation", 0),
        yAccelerationVariation: number("yAccelerationVariation", 0),
        startSize: Math.max(0, number("startSize", 8)),
        endSize: Math.max(0, number("endSize", 8)),
        startSizeVariation: Math.max(0, number("startSizeVariation", 0)),
        endSizeVariation: Math.max(0, number("endSizeVariation", 0)),
        startOpacity: clamp(number("startOpacity", 1), 0, 1),
        endOpacity: clamp(number("endOpacity", 0), 0, 1),
        startOpacityVariation: Math.max(0, number("startOpacityVariation", 0)),
        endOpacityVariation: Math.max(0, number("endOpacityVariation", 0)),
        maxActiveParticles: Math.max(0, Math.floor(number("maxActiveParticles", 256))),
        maxActiveParticlesVariation: Math.max(0, number("maxActiveParticlesVariation", 0)),
        totalParticleLimit: Math.max(0, Math.floor(number("maxParticles", number("stopAfter", 0)))),
        running: readBool(el, "running", false),
        interval: Math.max(1, number("interval", 16.666)),
        color: text("color", ""),
        colorOpacity: readAttr(el, "colorOpacity") == null ? null : clamp(number("colorOpacity", 1), 0, 1),
        src: text("src", ""),
        mask: text("mask", ""),
        emitterMask: text("emitterMask", ""),
        seed: Math.floor(number("seed", 0xc0ffee)),
        zIndex: Math.floor(number("zIndex", 1)),
      };
    }
  }

  class ParticleFactory {
    static create(cfg, rng, origin) {
      const lifetime = vary(cfg.lifetime, cfg.lifetimeVariation, rng);
      const hasOrigin = origin && typeof origin === "object";
      const originX = hasOrigin && Number.isFinite(Number(origin.x)) ? Number(origin.x) : cfg.x;
      const originY = hasOrigin && Number.isFinite(Number(origin.y)) ? Number(origin.y) : cfg.y;
      const emitterOrigin = sampleEmitterOrigin(cfg, rng, originX, originY);

      return new Particle({
        x: vary(emitterOrigin.x, cfg.xVariation, rng),
        y: vary(emitterOrigin.y, cfg.yVariation, rng),
        vx: vary(cfg.xVelocity, cfg.xVelocityVariation, rng),
        vy: vary(cfg.yVelocity, cfg.yVelocityVariation, rng),
        ax: vary(cfg.xAcceleration, cfg.xAccelerationVariation, rng),
        ay: vary(cfg.yAcceleration, cfg.yAccelerationVariation, rng),
        startSize: Math.max(0, vary(cfg.startSize, cfg.startSizeVariation, rng)),
        endSize: Math.max(0, vary(cfg.endSize, cfg.endSizeVariation, rng)),
        startOpacity: clamp(vary(cfg.startOpacity, cfg.startOpacityVariation, rng), 0, 1),
        endOpacity: clamp(vary(cfg.endOpacity, cfg.endOpacityVariation, rng), 0, 1),
        lifetime,
      });
    }
  }

  class Particle {
    constructor(opts) {
      Object.assign(this, opts);
      this.age = 0;
      this.alive = true;
    }

    update(elapsedMs, tickScale) {
      this.age += elapsedMs;

      if (this.age >= this.lifetime) {
        this.alive = false;
        return;
      }

      this.vx += this.ax * tickScale;
      this.vy += this.ay * tickScale;
      this.x += this.vx * tickScale;
      this.y += this.vy * tickScale;
    }

    get progress() {
      return clamp(this.age / this.lifetime, 0, 1);
    }

    get size() {
      return lerp(this.startSize, this.endSize, this.progress);
    }

    get opacity() {
      return lerp(this.startOpacity, this.endOpacity, this.progress);
    }
  }

  class ParticleRenderer {
    static drawSnapshot(ctx, snapshot, offset, sprite, emitterMask, emitterWidth, emitterHeight) {
      const particle = {
        x: snapshot[offset],
        y: snapshot[offset + 1],
        size: snapshot[offset + 2],
        opacity: snapshot[offset + 3],
      };

      ParticleRenderer.draw(ctx, particle, sprite, emitterMask, emitterWidth, emitterHeight);
    }

    static draw(ctx, particle, sprite, emitterMask, emitterWidth, emitterHeight) {
      const size = particle.size;

      if (size <= 0) {
        return;
      }

      if (emitterMask && !emitterMask.allows(particle.x, particle.y, emitterWidth, emitterHeight)) {
        return;
      }

      const half = size / 2;

      ctx.save();
      ctx.globalAlpha = particle.opacity;

      if (sprite.ready) {
        ctx.drawImage(sprite.canvas, particle.x - half, particle.y - half, size, size);
      } else {
        ctx.fillStyle = sprite.color || "rgba(255,255,255,1)";
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, half, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  class ParticleEmitterMask {
    constructor() {
      this.src = "";
      this.image = null;
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d", { alpha: true, willReadFrequently: true });
      this.imageData = null;
      this.ready = false;
      this.failed = false;
    }

    configure(src) {
      const nextSrc = src || "";

      if (nextSrc === this.src) {
        return;
      }

      this.src = nextSrc;
      this.image = null;
      this.imageData = null;
      this.ready = false;
      this.failed = false;

      if (!this.src) {
        return;
      }

      const requestedSrc = this.src;

      loadImage(requestedSrc)
        .then((image) => {
          if (requestedSrc === this.src) {
            this._compose(image);
          }
        })
        .catch(() => {
          if (requestedSrc === this.src) {
            this.failed = true;
          }
        });
    }

    allows(x, y, width, height) {
      if (!this.src) {
        return true;
      }

      if (this.failed) {
        return true;
      }

      if (!this.ready || !this.imageData || width <= 0 || height <= 0) {
        return false;
      }

      if (x < 0 || y < 0 || x > width || y > height) {
        return false;
      }

      const sampleX = Math.max(
        0,
        Math.min(this.canvas.width - 1, Math.floor((x / width) * this.canvas.width))
      );
      const sampleY = Math.max(
        0,
        Math.min(this.canvas.height - 1, Math.floor((y / height) * this.canvas.height))
      );
      const alphaIndex = ((sampleY * this.canvas.width) + sampleX) * 4 + 3;

      return this.imageData.data[alphaIndex] > 0;
    }

    _compose(image) {
      const width = Math.max(1, image.naturalWidth || image.width || 1);
      const height = Math.max(1, image.naturalHeight || image.height || 1);

      this.image = image;
      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx.clearRect(0, 0, width, height);
      this.ctx.drawImage(image, 0, 0, width, height);

      try {
        this.imageData = this.ctx.getImageData(0, 0, width, height);
        this.ready = true;
      } catch (error) {
        this.imageData = null;
        this.ready = false;
        this.failed = true;
      }
    }
  }

  class ParticleSprite {
    constructor() {
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d", { alpha: true });
      this.src = "";
      this.mask = "";
      this.color = "";
      this.colorOpacity = null;
      this.srcImage = null;
      this.maskImage = null;
      this.ready = false;
    }

    configure({ src, mask, color, colorOpacity }) {
      const normalizedColorOpacity = colorOpacity == null ? null : clamp(Number(colorOpacity), 0, 1);
      const changed =
        src !== this.src ||
        mask !== this.mask ||
        color !== this.color ||
        normalizedColorOpacity !== this.colorOpacity;

      if (!changed) {
        return;
      }

      this.src = src;
      this.mask = mask;
      this.color = color;
      this.colorOpacity = normalizedColorOpacity;
      this.ready = false;
      this.srcImage = null;
      this.maskImage = null;
      this._loadAssets().then(() => this._compose());
    }

    async _loadAssets() {
      const [srcImage, maskImage] = await Promise.all([
        this.src ? loadImage(this.src).catch(() => null) : Promise.resolve(null),
        this.mask ? loadImage(this.mask).catch(() => null) : Promise.resolve(null),
      ]);

      this.srcImage = srcImage;
      this.maskImage = maskImage;
    }

    _compose() {
      const baseSize = Math.max(
        1,
        this.srcImage?.naturalWidth ?? this.maskImage?.naturalWidth ?? 64,
        this.srcImage?.naturalHeight ?? this.maskImage?.naturalHeight ?? 64
      );

      this.canvas.width = baseSize;
      this.canvas.height = baseSize;

      const ctx = this.ctx;
      ctx.clearRect(0, 0, baseSize, baseSize);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      const hasSrc = Boolean(this.srcImage);
      const hasMask = Boolean(this.maskImage);
      const hasColor = Boolean(this.color);
      const colorOpacity = this.colorOpacity == null
        ? hasSrc && !hasMask ? 0.28 : 1
        : clamp(this.colorOpacity, 0, 1);

      if (hasSrc && hasMask && hasColor && colorOpacity > 0) {
        ctx.globalAlpha = colorOpacity;
        ctx.fillStyle = this.color;
        ctx.fillRect(0, 0, baseSize, baseSize);
        ctx.globalAlpha = 1;
        ctx.drawImage(this.srcImage, 0, 0, baseSize, baseSize);
      } else if (hasSrc) {
        ctx.drawImage(this.srcImage, 0, 0, baseSize, baseSize);
      } else if (hasMask) {
        ctx.drawImage(this.maskImage, 0, 0, baseSize, baseSize);
      } else {
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(baseSize / 2, baseSize / 2, baseSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (hasMask && hasSrc) {
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(this.maskImage, 0, 0, baseSize, baseSize);
        ctx.globalCompositeOperation = "source-over";
      }

      if (hasSrc && !hasMask && hasColor && colorOpacity > 0) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha = colorOpacity;
        ctx.fillStyle = this.color;
        ctx.fillRect(0, 0, baseSize, baseSize);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      } else if (hasColor && !hasSrc && colorOpacity > 0) {
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = this.color;
        ctx.fillRect(0, 0, baseSize, baseSize);
        ctx.globalCompositeOperation = "source-over";
      }

      this.ready = true;
    }
  }

  class SeededRandom {
    constructor(seed) {
      this.state = seed >>> 0;
    }

    next() {
      let t = this.state += 0x6d2b79f5;

      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    range(min, max) {
      return min + (max - min) * this.next();
    }
  }

  function readAttr(el, name) {
    if (el.hasAttribute(name)) {
      return el.getAttribute(name);
    }

    const lower = name.toLowerCase();

    if (el.hasAttribute(lower)) {
      return el.getAttribute(lower);
    }

    const kebab = name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

    if (el.hasAttribute(kebab)) {
      return el.getAttribute(kebab);
    }

    return null;
  }

  function readNumber(el, name, fallback) {
    const raw = readAttr(el, name);

    if (raw == null || raw === "") {
      return fallback;
    }

    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  function readFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function readBool(el, name, fallback) {
    const raw = readAttr(el, name);

    if (raw == null) {
      return fallback;
    }

    return !["false", "0", "no", "off"].includes(raw.trim().toLowerCase());
  }

  function vary(value, variation, rng) {
    if (!variation) {
      return value;
    }

    return value + rng.range(-variation, variation);
  }

  function sampleEmitterOrigin(cfg, rng, centerX, centerY) {
    const width = Math.max(0, Number(cfg && cfg.width) || 0);
    const height = Math.max(0, Number(cfg && cfg.height) || 0);

    return {
      x: width ? centerX + rng.range(-width, width) : centerX,
      y: height ? centerY + rng.range(-height, height) : centerY,
    };
  }

  function serializeParticleConfig(cfg) {
    return {
      emitRate: cfg.emitRate,
      lifetime: cfg.lifetime,
      lifetimeVariation: cfg.lifetimeVariation,
      x: cfg.x,
      y: cfg.y,
      width: cfg.width,
      height: cfg.height,
      xVariation: cfg.xVariation,
      yVariation: cfg.yVariation,
      xVelocity: cfg.xVelocity,
      yVelocity: cfg.yVelocity,
      xVelocityVariation: cfg.xVelocityVariation,
      yVelocityVariation: cfg.yVelocityVariation,
      xAcceleration: cfg.xAcceleration,
      yAcceleration: cfg.yAcceleration,
      xAccelerationVariation: cfg.xAccelerationVariation,
      yAccelerationVariation: cfg.yAccelerationVariation,
      startSize: cfg.startSize,
      endSize: cfg.endSize,
      startSizeVariation: cfg.startSizeVariation,
      endSizeVariation: cfg.endSizeVariation,
      startOpacity: cfg.startOpacity,
      endOpacity: cfg.endOpacity,
      startOpacityVariation: cfg.startOpacityVariation,
      endOpacityVariation: cfg.endOpacityVariation,
      maxActiveParticles: cfg.maxActiveParticles,
      maxActiveParticlesVariation: cfg.maxActiveParticlesVariation,
      totalParticleLimit: cfg.totalParticleLimit,
      running: cfg.running,
      interval: cfg.interval,
      seed: cfg.seed,
    };
  }

  function snapshotToParticleViews(snapshot) {
    const particles = [];

    for (let i = 0; i < snapshot.length; i += 4) {
      particles.push({
        x: snapshot[i],
        y: snapshot[i + 1],
        size: snapshot[i + 2],
        opacity: snapshot[i + 3],
      });
    }

    return particles;
  }

  function createParticleWorkerSource() {
    return `
      var cfg = defaultConfig();
      var particles = [];
      var rng = new SeededRandom(cfg.seed);
      var activeLimit = cfg.maxActiveParticles;
      var createdTotal = 0;
      var emitCarry = 0;
      var timer = 0;
      var lastTime = 0;

      self.onmessage = function(event) {
        var data = event && event.data ? event.data : {};

        if (data.type === "config") {
          var oldSeed = cfg.seed;
          cfg = normalizeConfig(data.config || cfg);
          if (oldSeed !== cfg.seed) {
            rng = new SeededRandom(cfg.seed);
          }
          activeLimit = rollActiveLimit();
          if (cfg.running) {
            startTimer();
          }
          return;
        }

        if (data.type === "start") {
          cfg.running = true;
          startTimer();
          return;
        }

        if (data.type === "stop") {
          cfg.running = false;
          return;
        }

        if (data.type === "clear") {
          particles = [];
          createdTotal = 0;
          emitCarry = 0;
          postSnapshot(false);
          if (!cfg.running) {
            stopTimer();
            self.postMessage({ type: "stopped" });
          }
          return;
        }

        if (data.type === "burst") {
          var created = burst(Number(data.x), Number(data.y), Number(data.count));
          postSnapshot(cfg.running || particles.length > 0);
          if (created > 0 || cfg.running) {
            startTimer();
          }
        }
      };

      function defaultConfig() {
        return {
          emitRate: 10,
          lifetime: 1000,
          lifetimeVariation: 0,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          xVariation: 0,
          yVariation: 0,
          xVelocity: 0,
          yVelocity: 0,
          xVelocityVariation: 0,
          yVelocityVariation: 0,
          xAcceleration: 0,
          yAcceleration: 0,
          xAccelerationVariation: 0,
          yAccelerationVariation: 0,
          startSize: 8,
          endSize: 8,
          startSizeVariation: 0,
          endSizeVariation: 0,
          startOpacity: 1,
          endOpacity: 0,
          startOpacityVariation: 0,
          endOpacityVariation: 0,
          maxActiveParticles: 256,
          maxActiveParticlesVariation: 0,
          totalParticleLimit: 0,
          running: false,
          interval: 16.666,
          seed: 0xc0ffee
        };
      }

      function normalizeConfig(input) {
        var next = defaultConfig();
        var key;

        for (key in input) {
          if (Object.prototype.hasOwnProperty.call(input, key)) {
            next[key] = input[key];
          }
        }

        next.emitRate = finite(next.emitRate, 10);
        next.lifetime = Math.max(1, finite(next.lifetime, 1000));
        next.lifetimeVariation = Math.max(0, finite(next.lifetimeVariation, 0));
        next.x = finite(next.x, 0);
        next.y = finite(next.y, 0);
        next.width = Math.max(0, finite(next.width, 0));
        next.height = Math.max(0, finite(next.height, 0));
        next.xVariation = finite(next.xVariation, 0);
        next.yVariation = finite(next.yVariation, 0);
        next.xVelocity = finite(next.xVelocity, 0);
        next.yVelocity = finite(next.yVelocity, 0);
        next.xVelocityVariation = finite(next.xVelocityVariation, 0);
        next.yVelocityVariation = finite(next.yVelocityVariation, 0);
        next.xAcceleration = finite(next.xAcceleration, 0);
        next.yAcceleration = finite(next.yAcceleration, 0);
        next.xAccelerationVariation = finite(next.xAccelerationVariation, 0);
        next.yAccelerationVariation = finite(next.yAccelerationVariation, 0);
        next.startSize = Math.max(0, finite(next.startSize, 8));
        next.endSize = Math.max(0, finite(next.endSize, 8));
        next.startSizeVariation = Math.max(0, finite(next.startSizeVariation, 0));
        next.endSizeVariation = Math.max(0, finite(next.endSizeVariation, 0));
        next.startOpacity = clamp(finite(next.startOpacity, 1), 0, 1);
        next.endOpacity = clamp(finite(next.endOpacity, 0), 0, 1);
        next.startOpacityVariation = Math.max(0, finite(next.startOpacityVariation, 0));
        next.endOpacityVariation = Math.max(0, finite(next.endOpacityVariation, 0));
        next.maxActiveParticles = Math.max(0, Math.floor(finite(next.maxActiveParticles, 256)));
        next.maxActiveParticlesVariation = Math.max(0, finite(next.maxActiveParticlesVariation, 0));
        next.totalParticleLimit = Math.max(0, Math.floor(finite(next.totalParticleLimit, 0)));
        next.running = Boolean(next.running);
        next.interval = Math.max(1, finite(next.interval, 16.666));
        next.seed = Math.floor(finite(next.seed, 0xc0ffee));

        return next;
      }

      function startTimer() {
        if (timer) {
          return;
        }

        lastTime = now();
        timer = setTimeout(tick, Math.max(1, Math.floor(cfg.interval)));
      }

      function stopTimer() {
        if (!timer) {
          return;
        }

        clearTimeout(timer);
        timer = 0;
      }

      function tick() {
        timer = 0;

        var current = now();
        var elapsedMs = Math.min(Math.max(0, current - lastTime), 100);
        var tickScale = elapsedMs / cfg.interval;

        lastTime = current;

        if (cfg.running) {
          emit(elapsedMs);
        }

        updateParticles(elapsedMs, tickScale);
        postSnapshot(cfg.running || particles.length > 0);

        if (cfg.running || particles.length > 0) {
          timer = setTimeout(tick, Math.max(1, Math.floor(cfg.interval)));
        } else {
          self.postMessage({ type: "stopped" });
        }
      }

      function emit(elapsedMs) {
        if (!canCreateParticle()) {
          return;
        }

        emitCarry += cfg.emitRate * (elapsedMs / 1000);

        while (emitCarry >= 1) {
          if (!createParticle(null)) {
            break;
          }

          emitCarry -= 1;
        }
      }

      function burst(x, y, count) {
        var total = Math.max(0, Math.floor(finite(count, 0)));
        var created = 0;
        var origin = {
          x: finite(x, cfg.x),
          y: finite(y, cfg.y)
        };

        while (created < total && createParticle(origin)) {
          created += 1;
        }

        return created;
      }

      function canCreateParticle() {
        if (cfg.totalParticleLimit > 0 && createdTotal >= cfg.totalParticleLimit) {
          if (cfg.running) {
            cfg.running = false;
            self.postMessage({ type: "limitReached" });
          }
          return false;
        }

        return particles.length < activeLimit;
      }

      function createParticle(origin) {
        if (!canCreateParticle()) {
          return false;
        }

        particles.push(makeParticle(origin));
        createdTotal += 1;
        return true;
      }

      function makeParticle(origin) {
        var hasOrigin = origin && typeof origin === "object";
        var originX = hasOrigin && Number.isFinite(Number(origin.x)) ? Number(origin.x) : cfg.x;
        var originY = hasOrigin && Number.isFinite(Number(origin.y)) ? Number(origin.y) : cfg.y;
        var emitterOrigin = sampleEmitterOrigin(originX, originY);

        return {
          x: vary(emitterOrigin.x, cfg.xVariation),
          y: vary(emitterOrigin.y, cfg.yVariation),
          vx: vary(cfg.xVelocity, cfg.xVelocityVariation),
          vy: vary(cfg.yVelocity, cfg.yVelocityVariation),
          ax: vary(cfg.xAcceleration, cfg.xAccelerationVariation),
          ay: vary(cfg.yAcceleration, cfg.yAccelerationVariation),
          startSize: Math.max(0, vary(cfg.startSize, cfg.startSizeVariation)),
          endSize: Math.max(0, vary(cfg.endSize, cfg.endSizeVariation)),
          startOpacity: clamp(vary(cfg.startOpacity, cfg.startOpacityVariation), 0, 1),
          endOpacity: clamp(vary(cfg.endOpacity, cfg.endOpacityVariation), 0, 1),
          lifetime: vary(cfg.lifetime, cfg.lifetimeVariation),
          age: 0
        };
      }

      function updateParticles(elapsedMs, tickScale) {
        var alive = [];
        var i;
        var particle;

        for (i = 0; i < particles.length; i += 1) {
          particle = particles[i];
          particle.age += elapsedMs;

          if (particle.age >= particle.lifetime) {
            continue;
          }

          particle.vx += particle.ax * tickScale;
          particle.vy += particle.ay * tickScale;
          particle.x += particle.vx * tickScale;
          particle.y += particle.vy * tickScale;
          alive.push(particle);
        }

        particles = alive;
      }

      function postSnapshot(active) {
        var snapshot = new Float32Array(particles.length * 4);
        var i;
        var p;
        var progress;
        var offset;

        for (i = 0; i < particles.length; i += 1) {
          p = particles[i];
          progress = clamp(p.age / p.lifetime, 0, 1);
          offset = i * 4;
          snapshot[offset] = p.x;
          snapshot[offset + 1] = p.y;
          snapshot[offset + 2] = lerp(p.startSize, p.endSize, progress);
          snapshot[offset + 3] = lerp(p.startOpacity, p.endOpacity, progress);
        }

        self.postMessage({
          type: "snapshot",
          buffer: snapshot.buffer,
          active: Boolean(active),
          count: particles.length
        }, [snapshot.buffer]);
      }

      function rollActiveLimit() {
        var varied = cfg.maxActiveParticles + rng.range(
          -cfg.maxActiveParticlesVariation,
          cfg.maxActiveParticlesVariation
        );

        return Math.max(0, Math.floor(varied));
      }

      function sampleEmitterOrigin(centerX, centerY) {
        return {
          x: cfg.width ? centerX + rng.range(-cfg.width, cfg.width) : centerX,
          y: cfg.height ? centerY + rng.range(-cfg.height, cfg.height) : centerY
        };
      }

      function vary(value, variation) {
        if (!variation) {
          return value;
        }

        return value + rng.range(-variation, variation);
      }

      function finite(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      }

      function lerp(a, b, t) {
        return a + (b - a) * t;
      }

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }

      function now() {
        return (self.performance && typeof self.performance.now === "function")
          ? self.performance.now()
          : Date.now();
      }

      function SeededRandom(seed) {
        this.state = seed >>> 0;
      }

      SeededRandom.prototype.next = function next() {
        var t = this.state += 0x6d2b79f5;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };

      SeededRandom.prototype.range = function range(min, max) {
        return min + (max - min) * this.next();
      };
    `;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  function installParticleEmitterControls(proto) {
    if (!proto || typeof proto !== "object") {
      return;
    }
    if (typeof proto.start !== "function") {
      proto.start = function startParticleEmitter() {
        this.running = true;
      };
    }
    if (typeof proto.stop !== "function") {
      proto.stop = function stopParticleEmitter() {
        this.running = false;
      };
    }
    if (!Object.getOwnPropertyDescriptor(proto, "running")) {
      Object.defineProperty(proto, "running", {
        configurable: true,
        enumerable: true,
        get() {
          return readBool(this, "running", false);
        },
        set(value) {
          this.setAttribute("running", value ? "true" : "false");
        },
      });
    }
    if (typeof proto.clear !== "function") {
      proto.clear = function clearParticleEmitter() {
        if (Array.isArray(this._particles)) {
          this._particles.length = 0;
        }
        if (this._particleSnapshot) {
          this._particleSnapshot = new Float32Array(0);
        }
        if (typeof this._postWorker === "function") {
          this._postWorker({ type: "clear" });
        }
        if (typeof this._render === "function") {
          this._render();
        }
      };
    }
    if (typeof proto.burst !== "function") {
      proto.burst = function burstParticleEmitter(x, y, num) {
        if (typeof this._burstImmediate === "function") {
          return this._burstImmediate(x, y, num);
        }
        return 0;
      };
    }
  }

  function defineParticleEmitterAlias(BaseElement) {
    const existingAlias = global.customElements.get("q-particle-emitter");

    if (existingAlias) {
      installParticleEmitterControls(existingAlias.prototype);
      global.QParticleEmitterElement = existingAlias;
      return;
    }

    if (!BaseElement) {
      return;
    }

    class QParticleEmitterElement extends BaseElement {}

    installParticleEmitterControls(QParticleEmitterElement.prototype);
    global.QParticleEmitterElement = QParticleEmitterElement;
    global.customElements.define("q-particle-emitter", QParticleEmitterElement);
  }

  installParticleEmitterControls(ParticleEmitterElement.prototype);
  global.ParticleEmitterElement = ParticleEmitterElement;
  global.customElements.define("particle-emitter", ParticleEmitterElement);
  defineParticleEmitterAlias(ParticleEmitterElement);
})(typeof globalThis !== "undefined" ? globalThis : window);
