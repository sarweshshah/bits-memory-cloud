# Bits Memory Cloud

Interactive 3D point cloud viewer built with [Three.js](https://threejs.org/), [GSAP](https://gsap.com/), and [Vite](https://vitejs.dev/). A textured OBJ mesh is converted offline into a dense colored PLY point cloud, then rendered in the browser with orbit controls, point selection, and a live settings panel.

## Features

### Pipeline
- Convert textured OBJ/MTL meshes to colored PLY point clouds
- Web-optimized subsampled output for faster loading
- Loading progress UI for large point cloud files

### Viewer
- Orbit controls with adjustable point size, opacity, fog, and roll
- ACES filmic tone mapping for richer color
- Debug helpers (axes, grid, bounding box)
- Camera panel: distance, yaw, pitch, roll, and reset view

### Point interaction
- Hover a point to see its ID and world coordinates in a tooltip
- Click to enter focus mode — dims the cloud, highlights the point, and animates the camera
- **Go to Point ID** form to jump directly to a point by index
- Shareable deep links via `?point=<id>` URL parameter (browser back/forward supported)
- Press **Escape** or click the tooltip dismiss button to exit focus mode
- Respects `prefers-reduced-motion` for camera and UI animations

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Python](https://www.python.org/) 3.10+

## Quick start

```bash
# Install JavaScript dependencies
npm install

# Create Python virtual environment and install dependencies
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Generate point cloud from mesh (requires assets/mesh.obj + textures)
npm run generate

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The dev server opens automatically.

## Project structure

```
bits-memory-cloud/
├── assets/                     # Served as public dir; mesh, textures, generated PLY
│   ├── mesh.obj
│   ├── mesh.mtl
│   ├── tex_*.jpg
│   ├── cloud.ply               # Generated (gitignored)
│   └── cloud_web.ply           # Generated web-optimized file (gitignored)
├── src/
│   ├── main.js                 # Entry point
│   ├── App.js                  # Application orchestration
│   ├── constants.js            # Tunable defaults (camera, selection, scene)
│   ├── style.css
│   ├── controls/
│   │   └── ControlPanel.js     # lil-gui settings panel
│   ├── interaction/
│   │   └── PointInteraction.js # Hover, click, focus mode
│   ├── navigation/
│   │   └── PointUrl.js         # ?point= URL state
│   ├── pointcloud/
│   │   ├── PointCloud.js       # PLY loading and raycasting
│   │   └── PointSelection.js   # Highlight and dim effects
│   ├── scene/
│   │   ├── SceneManager.js     # Renderer, fog, tone mapping
│   │   ├── CameraController.js # Orbit sync, snap, GSAP animations
│   │   └── HelpersManager.js   # Axes, grid, bounding box
│   └── ui/
│       ├── LoadingOverlay.js
│       ├── Tooltip.js
│       └── GoToForm.js
├── mesh_to_pointcloud.py       # Mesh → PLY conversion script
├── index.html
├── vite.config.js
└── package.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run generate` | Run Python script to build point clouds |
| `npm run build` | Alias for `generate` |
| `npm run preview` | Preview production build |

## Point cloud generation

The Python script samples points on triangle surfaces and reads color from diffuse textures:

```bash
.venv/bin/python mesh_to_pointcloud.py --help
```

Common options:

| Flag | Default | Description |
|------|---------|-------------|
| `--obj` | `assets/mesh.obj` | Input OBJ file |
| `--mtl` | `assets/mesh.mtl` | Material file |
| `--out` | `assets/cloud.ply` | Full-resolution output |
| `--web-out` | `assets/cloud_web.ply` | Subsampled web output |
| `--web-step` | `4` | Keep every Nth point for web PLY |
| `--samples-per-face` | `10` | Points sampled per triangle |

Place your mesh (`mesh.obj`, `mesh.mtl`) and texture images in `assets/`, then run `npm run generate`.

## Viewer controls

### Navigation
- **Drag** — orbit
- **Scroll** — zoom
- **Right-drag** — pan
- **GUI panel** — point size, opacity, auto-rotate, fog, debug helpers, camera settings

### Point selection
- **Hover** — show point ID and coordinates
- **Click** — focus on a point (camera snaps in, cloud dims)
- **Escape** or tooltip **×** — dismiss focus and restore camera
- **Go to Point ID** — enter an index and press Go (or Enter)
- **URL** — append `?point=123` to link directly to a point

## Configuration

Defaults live in `src/constants.js`:

| Group | Key settings |
|-------|--------------|
| `POINT_CLOUD` | PLY URL, color brightness |
| `DEFAULT_CAMERA` | FOV, position, zoom distance, snap distance |
| `DEFAULT_SCENE` | Background presets, tone mapping exposure |
| `SELECTION` | Dim factor, highlight size, accent color |
| `CONTROLS` | Auto-rotate speed |
| `INTERACTION` | Click-vs-drag threshold |

## License

MIT — see [LICENSE](LICENSE).
