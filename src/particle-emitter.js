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
    "src",
    "mask",
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
      this._rng = new SeededRandom(0xc0ffee);
      this._sprite = new ParticleSprite();
      this._createdTotal = 0;
      this._emitCarry = 0;
      this._lastTime = 0;
      this._rafId = 0;
      this._activeLimit = 0;
      this._resizeObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver(() => this._resize())
        : null;
      this._boundFrame = this._frame.bind(this);
      this._boundResize = this._resize.bind(this);
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
      });
      this._startLoop();
    }

    disconnectedCallback() {
      this._stopLoop();

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
      });

      if (!oldRunning && this._config.running) {
        this._lastTime = performance.now();
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
      this._createdTotal = 0;
      this._emitCarry = 0;
      this._render();
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
      const seedChanged = !this._config || this._config.seed !== cfg.seed;

      this._config = cfg;

      if (seedChanged) {
        this._rng = new SeededRandom(cfg.seed);
      }

      this._activeLimit = this._rollActiveLimit();
      this._applyLayerStyle();
    }

    _rollActiveLimit() {
      const cfg = this._config;
      const varied = cfg.maxActiveParticles + this._rng.range(
        -cfg.maxActiveParticlesVariation,
        cfg.maxActiveParticlesVariation
      );

      return Math.max(0, Math.floor(varied));
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

    _startLoop() {
      if (this._rafId) {
        return;
      }

      this._lastTime = performance.now();
      this._rafId = requestAnimationFrame(this._boundFrame);
    }

    _stopLoop() {
      if (!this._rafId) {
        return;
      }

      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }

    _frame(now) {
      const elapsedMs = now - this._lastTime;

      this._lastTime = now;
      this._update(Math.min(elapsedMs, 100));
      this._render();
      this._rafId = requestAnimationFrame(this._boundFrame);
    }

    _update(elapsedMs) {
      const cfg = this._config;
      const tickScale = elapsedMs / cfg.interval;

      if (cfg.running) {
        this._emit(elapsedMs);
      }

      for (const particle of this._particles) {
        particle.update(elapsedMs, tickScale);
      }

      this._particles = this._particles.filter((particle) => particle.alive);
    }

    _emit(elapsedMs) {
      const cfg = this._config;

      if (cfg.totalParticleLimit > 0 && this._createdTotal >= cfg.totalParticleLimit) {
        this.setAttribute("running", "false");
        return;
      }

      if (this._particles.length >= this._activeLimit) {
        return;
      }

      this._emitCarry += cfg.emitRate * (elapsedMs / 1000);

      while (this._emitCarry >= 1) {
        if (this._particles.length >= this._activeLimit) {
          break;
        }

        if (cfg.totalParticleLimit > 0 && this._createdTotal >= cfg.totalParticleLimit) {
          this.setAttribute("running", "false");
          break;
        }

        this._emitCarry -= 1;
        this._particles.push(ParticleFactory.create(cfg, this._rng));
        this._createdTotal += 1;
      }
    }

    _render() {
      const ctx = this._ctx;
      const width = this._canvas.clientWidth;
      const height = this._canvas.clientHeight;

      ctx.clearRect(0, 0, width, height);

      for (const particle of this._particles) {
        ParticleRenderer.draw(ctx, particle, this._sprite);
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
        src: text("src", ""),
        mask: text("mask", ""),
        seed: Math.floor(number("seed", 0xc0ffee)),
        zIndex: Math.floor(number("zIndex", 1)),
      };
    }
  }

  class ParticleFactory {
    static create(cfg, rng) {
      const lifetime = vary(cfg.lifetime, cfg.lifetimeVariation, rng);

      return new Particle({
        x: vary(cfg.x, cfg.xVariation, rng),
        y: vary(cfg.y, cfg.yVariation, rng),
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
    static draw(ctx, particle, sprite) {
      const size = particle.size;

      if (size <= 0) {
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

  class ParticleSprite {
    constructor() {
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d", { alpha: true });
      this.src = "";
      this.mask = "";
      this.color = "";
      this.srcImage = null;
      this.maskImage = null;
      this.ready = false;
    }

    configure({ src, mask, color }) {
      const changed = src !== this.src || mask !== this.mask || color !== this.color;

      if (!changed) {
        return;
      }

      this.src = src;
      this.mask = mask;
      this.color = color;
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

      if (hasSrc) {
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

      if (hasColor) {
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
        this._createdTotal = 0;
        this._emitCarry = 0;
        if (typeof this._render === "function") {
          this._render();
        }
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
