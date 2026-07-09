#!/usr/bin/env python3
"""
Convert textured OBJ mesh to dense colored point cloud (PLY).
Samples points on triangle surfaces and reads color from diffuse textures.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

SUPPORTED_EXTENSIONS = {".obj"}


def parse_mtl(mtl_path):
    """Return dict: material_name -> {texture, kd}"""
    mats = {}
    current = None
    with open(mtl_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if line.startswith("newmtl "):
                current = line.split(None, 1)[1]
                mats[current] = {"texture": None, "kd": np.array([200, 200, 200], dtype=np.uint8)}
            elif current and line.startswith("map_Kd "):
                mats[current]["texture"] = line.split(None, 1)[1].strip()
            elif current and line.startswith("Kd "):
                parts = line.split()
                mats[current]["kd"] = np.array(
                    [int(float(parts[1]) * 255), int(float(parts[2]) * 255), int(float(parts[3]) * 255)],
                    dtype=np.uint8,
                )
    return mats


def parse_mtllib(obj_path):
    """Return the first mtllib path referenced by an OBJ file, if any."""
    with open(obj_path, "r", encoding="utf-8", errors="ignore") as f:
        for raw in f:
            line = raw.strip()
            if line.startswith("mtllib "):
                return line.split(None, 1)[1].strip()
    return None


def load_materials(mtl_path, base_dir):
    mats = parse_mtl(mtl_path)
    textures = {}
    fallback_colors = {}
    for name, props in mats.items():
        fallback_colors[name] = props["kd"]
        tex_rel = props["texture"]
        if not tex_rel:
            continue
        tex_path = Path(base_dir) / tex_rel
        img = Image.open(tex_path).convert("RGB")
        textures[name] = np.asarray(img, dtype=np.uint8)
    return textures, fallback_colors


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


def resolve_mesh_path(args, root):
    mesh_arg = args.input or args.obj
    if mesh_arg is None:
        mesh_arg = root / "assets" / "mesh.obj"
    mesh_path = resolve_path(mesh_arg, root)
    if not mesh_path.is_file():
        raise FileNotFoundError(f"Mesh file not found: {mesh_path}")
    if mesh_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise ValueError(
            f"Unsupported mesh format '{mesh_path.suffix}'. Supported formats: {supported}"
        )
    return mesh_path


def resolve_mtl_path(mesh_path, mtl_arg, root):
    if mtl_arg:
        mtl_path = resolve_path(mtl_arg, root)
        if not mtl_path.is_file():
            raise FileNotFoundError(f"Material file not found: {mtl_path}")
        return mtl_path

    mtllib = parse_mtllib(mesh_path)
    if not mtllib:
        raise FileNotFoundError(
            f"No mtllib reference found in {mesh_path}. Pass --mtl explicitly."
        )

    mtl_path = mesh_path.parent / mtllib
    if not mtl_path.is_file():
        raise FileNotFoundError(
            f"Referenced material file not found: {mtl_path}. Pass --mtl explicitly."
        )
    return mtl_path


def default_output_path(mesh_path, suffix):
    default_mesh = (Path(__file__).parent / "assets" / "mesh.obj").resolve()
    if mesh_path.resolve() == default_mesh:
        name = "cloud_web" if suffix == "_web" else "cloud"
        return mesh_path.parent / f"{name}.ply"
    return mesh_path.with_name(f"{mesh_path.stem}{suffix}.ply")


def main():
    root = Path(__file__).parent

    parser = argparse.ArgumentParser(
        description="Convert a textured OBJ mesh to a dense colored PLY point cloud."
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="Input mesh file path (.obj). Defaults to assets/mesh.obj when omitted.",
    )
    parser.add_argument(
        "--input", "-i",
        dest="input_flag",
        help="Input mesh file path (.obj). Alternative to the positional argument.",
    )
    parser.add_argument(
        "--obj",
        help="Deprecated alias for --input. Kept for backward compatibility.",
    )
    parser.add_argument(
        "--mtl",
        help="Material file path. Defaults to the mtllib referenced by the OBJ.",
    )
    parser.add_argument(
        "--out",
        help="Full-resolution PLY output path. Defaults to <mesh-stem>.ply beside the input mesh.",
    )
    parser.add_argument(
        "--samples-per-face", type=int, default=10,
        help="Points per triangle (10 => ~8.9M points for large meshes)",
    )
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument(
        "--web-out",
        help="Subsampled PLY for web viewing. Defaults to <mesh-stem>_web.ply beside the input mesh.",
    )
    parser.add_argument(
        "--no-web",
        action="store_true",
        help="Skip writing the subsampled web PLY.",
    )
    parser.add_argument(
        "--web-step", type=int, default=4,
        help="Keep every Nth point for web PLY (default: 4)",
    )
    args = parser.parse_args()

    args.input = args.input_flag or args.input or args.obj
    mesh_path = resolve_mesh_path(args, root)
    mtl_path = resolve_mtl_path(mesh_path, args.mtl, root)
    out_path = resolve_path(args.out, root) if args.out else default_output_path(mesh_path, "")
    base = mesh_path.parent

    print(f"Input mesh: {mesh_path}")
    print(f"Material file: {mtl_path}")
    print(f"Output PLY: {out_path}")

    print("Loading materials...")
    textures, fallback_colors = load_materials(mtl_path, base)
    print(f"  {len(textures)} textures loaded, {len(fallback_colors)} materials parsed")

    print("Parsing OBJ...")
    verts, uvs, faces = parse_obj(mesh_path)
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
        fallback = fallback_colors.get(mat, np.array([200, 200, 200], dtype=np.uint8))
        if tex is None:
            print(
                f"  Material '{mat}' has no texture; using diffuse color "
                f"RGB({fallback[0]}, {fallback[1]}, {fallback[2]})"
            )

        for face in mat_faces:
            i0, i1, i2, uv0, uv1, uv2, _ = face
            pts, tuv = sample_triangle_batch(
                verts, uvs, i0, i1, i2, uv0, uv1, uv2, n_per, rng
            )
            if tex is None:
                cols = np.tile(fallback, (n_per, 1))
            else:
                cols = sample_texture_batch(tex, tuv[:, 0], tuv[:, 1])
            all_pts.append(pts)
            all_cols.append(cols)

            processed += 1
            if processed % 100000 == 0:
                print(f"  {processed}/{len(faces)} faces")

    if not all_pts:
        raise RuntimeError("No points were sampled. Check mesh faces and material assignments.")

    points = np.vstack(all_pts)
    colors = np.vstack(all_cols)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Writing {len(points):,} points -> {out_path}")
    write_ply_binary(out_path, points, colors)
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"Done. Output size: {size_mb:.1f} MB")

    if not args.no_web:
        web_path = resolve_path(args.web_out, root) if args.web_out else default_output_path(mesh_path, "_web")
        if args.web_step < 1:
            raise ValueError("--web-step must be >= 1")
        web_path.parent.mkdir(parents=True, exist_ok=True)
        write_web_ply(out_path, web_path, args.web_step)


if __name__ == "__main__":
    main()
