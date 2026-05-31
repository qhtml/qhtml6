# q-vid

Delta-based canvas animation tooling for image frame sequences.

## Files

- `q-vid-encoder.html` - Browser encoder. Select frame images, configure resize/delta settings, and download a `.qvid` asset.
- `q-vid-player.js` - Browser runtime. Defines `<q-vid-player>`.
- `q-vid-player.qhtml` - QHTML component runtime. Defines `q-vid-player` with declarative properties/signals and canvas painting functions.
- `q-vid-player.html` - Local preview/debug UI for generated `.qvid` files and legacy `.js` assets.

## Encode Frames

Open `q-vid-encoder.html` in a modern browser. Select PNG/WebP/JPEG frames, set options like `scale`, `tile`, `tolerance`, `codec`, and `deltaMode`, then click **Encode frames**.

The encoder diffs decoded RGBA pixels, not source image file bytes. The generated `.qvid` file is text that registers a q-vid asset through `QVidAssetRegistry`.

`codec=gzip` requires browser `CompressionStream` support. If unavailable, choose `codec=raw`.

## Use In HTML

```html
<script src="./q-vid-player.js"></script>

<q-vid-player
  src="./output.qvid"
  frameDuration="30"
  scale="2"
  reverse="true"
  startFrame="0"
  endFrame="50"
  running="true">
</q-vid-player>
```

For a 50-frame sequence numbered `0..49`, `endFrame="50"` is clamped to `49`.

The runtime treats `.qvid` URLs as text assets and registers them directly. Legacy generated `.js` assets are still supported through script loading.

## Use As QHTML Component

```qhtml
q-import { ./q-vid-player.qhtml }

q-vid-player player {
  src: "./output.qvid"
  frameDuration: 30
  scale: 2
  reverse: false
  repeat: true
  startFrame: 0
  endFrame: 50
}

button {
  text { Start }
  onclick { player.start(); }
}
```

The component exposes:

- q-properties: `currentFrame`, `reverse`, `repeat`, `frameDuration`, `scale`, `startFrame`, `endFrame`, `src`
- q-signals: `started()`, `stopped()`, `stepped()`
- functions: `start()`, `stop()`, `step()`

## Runtime API

```js
const qvid = document.querySelector("q-vid-player");

qvid.step();
qvid.setCurrentFrame(10);
qvid.setEndFrame(49);
qvid.setStartFrame(0);
qvid.start();
qvid.stop();
qvid.setReverse(true);
qvid.restart();
qvid.setFrameDuration(16.67);
qvid.setScale(2);

console.log(qvid.currentFrame);
qvid.currentFrame = 25;
```

Use `scale` to change display size without changing encoded asset dimensions. For example, if frames were encoded with `scale=0.5`, render them at normal visual size with `scale="2"`.

## Viewer

Open `q-vid-player.html` next to `q-vid-player.js`.

The viewer can load generated `.qvid` files and legacy q-vid `.js` files through the file picker. That path reads the file text and registers the asset directly, avoiding blob-script quirks and giving better errors.

The URL field works for normal page usage, for example:

```text
./output.qvid
```

For URL loading, the generated asset must be reachable by the browser from the viewer page. If relative URL loading fails from `file://`, serve the folder:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://127.0.0.1:8080/q-vid-player.html
```

## Events

`<q-vid-player>` emits:

```js
"q-vid-load"
"q-vid-frame"
"q-vid-error"
```
