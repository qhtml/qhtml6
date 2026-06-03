# Source Layout

`src/` contains the framework source modules and release-build entrypoint.

After changing files under `src/modules/`, run:

```bash
./src/build-release.sh
```

The root `./build-release.sh` command is kept as a compatibility wrapper and calls the same script.

The release build also refreshes `dist/w3.qhtml` from `dist/w3.css` when Node is available, using:

```bash
node tools/w3-css-to-qhtml.js
```
