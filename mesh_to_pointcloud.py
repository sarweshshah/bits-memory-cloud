#!/usr/bin/env python3
"""
Convert textured OBJ mesh to dense colored point cloud (PLY).
Samples points on triangle surfaces and reads color from diffuse textures.
"""

import argparse
import struct
from pathlib import Path

import numpy as np
from PIL import Image


def parse_mtl(mtl_path):
    """Return dict: material_name -> texture_path"""
    mats = {}
    current = None
    with open(mtl_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if line.startswith("newmtl "):
                current = line.split(None, 1)[1]
                mats[current] = None
            elif line.startswith("map_Kd ") and current:
                mats[current] = line.split(None, 1)[1].strip()
    return mats


def load_textures(mtl_path, base_dir):
    mats = parse_mtl(mtl_path)
    textures = {}
    for name, tex_rel in mats.items():
        if not tex_rel:
            continue
        tex_path = Path(base_dir) / tex_rel
        img = Image.open(tex_path).convert("RGB")
        textures[name] = np.asarray(img, dtype=np.uint8)
    return textures


def parse_obj(obj_path):
    """
    Parse OBJ with interleaved vt/f blocks (MeshLab style).
    Returns vertices (N,3), uvs (M,2), faces list of
    (i0, i1, i2, uv0, uv1, uv2, material).
    """
    vertices = []
    uvs = []
    faces = []
    current_mat = None

    with open(obj_path, "r", encoding="utf-8", errors="ignore") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("mtllib "):
                continue
            if line.startswith("usemtl "):
                current_mat = line.split(None, 1)[1]
                continue
            if line.startswith("v "):
                parts = line.split()
                vertices.append([float(parts[1]), float(parts[2]), float(parts[3])])
                continue
            if line.startswith("vt "):
                parts = line.split()
                uvs.append([float(parts[1]), float(parts[2])])
                continue
            if line.startswith("f "):
                corners = []
                for tok in line.split()[1:]:
                    parts = tok.split("/")
                    v_idx = int(parts[0]) - 1
                    vt_idx = int(parts[1]) - 1 if len(parts) > 1 and parts[1] else 0
                    corners.append((v_idx, vt_idx))
                if len(corners) == 3:
                    faces.append((
                        corners[0][0], corners[1][0], corners[2][0],
                        corners[0][1], corners[1][1], corners[2][1],
                        current_mat,
                    ))
                elif len(corners) == 4:
                    a, b, c, d = corners
                    faces.append((a[0], b[0], c[0], a[1], b[1], c[1], current_mat))
                    faces.append((a[0], c[0], d[0], a[1], c[1], d[1], current_mat))

    return np.asarray(vertices, dtype=np.float64), np.asarray(uvs, dtype=np.float64), faces


def sample_texture_batch(tex, u, v):
    """Vectorized bilinear texture sampling. OBJ v=0 is bottom; image row 0 is top."""
    h, w = tex.shape[:2]
    u = np.clip(u, 0.0, 1.0)
    v = np.clip(v, 0.0, 1.0)
    x = u * (w - 1)
    y = (1.0 - v) * (h - 1)

    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    tx = (x - x0).astype(np.float32)
    ty = (y - y0).astype(np.float32)

    c00 = tex[y0, x0].astype(np.float32)
    c10 = tex[y0, x1].astype(np.float32)
    c01 = tex[y1, x0].astype(np.float32)
    c11 = tex[y1, x1].astype(np.float32)

    c0 = c00 * (1 - tx)[:, None] + c10 * tx[:, None]
    c1 = c01 * (1 - tx)[:, None] + c11 * tx[:, None]
    return (c0 * (1 - ty)[:, None] + c1 * ty[:, None]).astype(np.uint8)


def sample_triangle_batch(verts, uvs, i0, i1, i2, uv0, uv1, uv2, n_samples, rng):
    """Random barycentric samples on one triangle, batched."""
    v0, v1, v2 = verts[i0], verts[i1], verts[i2]
    t0, t1, t2 = uvs[uv0], uvs[uv1], uvs[uv2]

    r1 = rng.random(n_samples)
    r2 = rng.random(n_samples)
    mask = r1 + r2 > 1.0
    r1[mask] = 1.0 - r1[mask]
    r2[mask] = 1.0 - r2[mask]
    a = 1.0 - r1 - r2
    b, c = r1, r2

    pts = (a[:, None] * v0) + (b[:, None] * v1) + (c[:, None] * v2)
    tuv = (a[:, None] * t0) + (b[:, None] * t1) + (c[:, None] * t2)
    return pts, tuv


def write_ply_binary(path, points, colors):
    n = len(points)
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {n}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property uchar red\n"
        "property uchar green\n"
        "property uchar blue\n"
        "end_header\n"
    )
    with open(path, "wb") as f:
        f.write(header.encode("ascii"))
        data = np.empty(n, dtype=[
            ("x", "<f4"), ("y", "<f4"), ("z", "<f4"),
            ("r", "u1"), ("g", "u1"), ("b", "u1"),
        ])
        data["x"] = points[:, 0]
        data["y"] = points[:, 1]
        data["z"] = points[:, 2]
        data["r"] = colors[:, 0]
        data["g"] = colors[:, 1]
        data["b"] = colors[:, 2]
        f.write(data.tobytes())


def write_web_ply(full_path, web_path, step):
    """Subsample a binary PLY for web viewing."""
    with open(full_path, "rb") as f:
        while f.readline().strip() != b"end_header":
            pass
        data = np.frombuffer(f.read(), dtype=[
            ("x", "<f4"), ("y", "<f4"), ("z", "<f4"),
            ("r", "u1"), ("g", "u1"), ("b", "u1"),
        ])

    sub = data[::step]
    with open(web_path, "wb") as f:
        f.write((
            "ply\nformat binary_little_endian 1.0\n"
            f"element vertex {len(sub)}\n"
            "property float x\nproperty float y\nproperty float z\n"
            "property uchar red\nproperty uchar green\nproperty uchar blue\n"
            "end_header\n"
        ).encode("ascii"))
        f.write(sub.tobytes())

    size_mb = web_path.stat().st_size / (1024 * 1024)
    print(f"Web PLY: {len(sub):,} points -> {web_path} ({size_mb:.1f} MB)")


def resolve_path(path_str, root):
    path = Path(path_str)
    return path if path.is_absolute() else root / path


def main():
    root = Path(__file__).parent
    assets = root / "assets"

    parser = argparse.ArgumentParser()
    parser.add_argument("--obj", default=str(assets / "mesh.obj"))
    parser.add_argument("--mtl", default=str(assets / "mesh.mtl"))
    parser.add_argument("--out", default=str(assets / "cloud.ply"))
    parser.add_argument("--samples-per-face", type=int, default=10,
                        help="Points per triangle (10 => ~8.9M points)")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--web-out", default=str(assets / "cloud_web.ply"),
                        help="Optional subsampled PLY for web viewing")
    parser.add_argument("--web-step", type=int, default=4,
                        help="Keep every Nth point for web PLY (default: 4)")
    args = parser.parse_args()

    obj_path = resolve_path(args.obj, root)
    mtl_path = resolve_path(args.mtl, root)
    out_path = resolve_path(args.out, root)
    base = obj_path.parent

    print("Loading textures...")
    textures = load_textures(mtl_path, base)
    print(f"  {len(textures)} textures loaded")

    print("Parsing OBJ...")
    verts, uvs, faces = parse_obj(obj_path)
    print(f"  {len(verts)} vertices, {len(uvs)} UVs, {len(faces)} faces")

    rng = np.random.default_rng(args.seed)
    n_per = args.samples_per_face

    # Group faces by material for slightly better cache locality
    by_mat = {}
    for face in faces:
        mat = face[6]
        by_mat.setdefault(mat, []).append(face)

    all_pts = []
    all_cols = []
    processed = 0

    print(f"Sampling {n_per} points/face...")
    for mat, mat_faces in by_mat.items():
        tex = textures.get(mat)
        if tex is None:
            print(f"  Warning: no texture for material '{mat}', skipping {len(mat_faces)} faces")
            continue

        for face in mat_faces:
            i0, i1, i2, uv0, uv1, uv2, _ = face
            pts, tuv = sample_triangle_batch(
                verts, uvs, i0, i1, i2, uv0, uv1, uv2, n_per, rng
            )
            cols = sample_texture_batch(tex, tuv[:, 0], tuv[:, 1])
            all_pts.append(pts)
            all_cols.append(cols)

            processed += 1
            if processed % 100000 == 0:
                print(f"  {processed}/{len(faces)} faces")

    points = np.vstack(all_pts)
    colors = np.vstack(all_cols)

    print(f"Writing {len(points):,} points -> {out_path}")
    write_ply_binary(out_path, points, colors)
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"Done. Output size: {size_mb:.1f} MB")

    if args.web_out:
        web_path = resolve_path(args.web_out, root)
        if args.web_step < 1:
            raise ValueError("--web-step must be >= 1")
        write_web_ply(out_path, web_path, args.web_step)


if __name__ == "__main__":
    main()
