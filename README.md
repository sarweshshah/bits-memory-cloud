# Bits Memory Cloud

Interactive 3D point cloud viewer built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). A textured OBJ mesh is converted offline into a dense colored PLY point cloud, then rendered in the browser with orbit controls and a live settings panel.

## Features

- Convert textured OBJ/MTL meshes to colored PLY point clouds
- Web-optimized subsampled output for faster loading
- Orbit controls with adjustable point size, opacity, fog, and roll
- Debug helpers (axes, grid, bounding box)
- Loading progress UI for large point cloud files

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
├── assets/                 # Source mesh, textures, and generated PLY files
│   ├── mesh.obj
│   ├── mesh.mtl
│   ├── tex_*.jpg
│   ├── cloud.ply           # Generated (gitignored)
│   └── cloud_web.ply       # Generated web-optimized file (gitignored)
├── src/
│   ├── main.js             # Three.js viewer
│   └── style.css
├── mesh_to_pointcloud.py   # Mesh → PLY conversion script
├── index.html
├── vite.config.js
└── package.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run generate` | Run Python script to build point clouds |
| `npm run build` | Regenerate point clouds |
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

- **Drag** — orbit
- **Scroll** — zoom
- **Right-drag** — pan
- **GUI panel** — point size, opacity, auto-rotate, fog, debug helpers

## License

MIT — see [LICENSE](LICENSE).
