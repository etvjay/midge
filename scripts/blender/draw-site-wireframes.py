# Technical line drawings of the site models (site/img/wire-*.svg), projected through a Blender camera.
# Run through the Blender Lab MCP server:
#   ~/opt/blender-mcp/server/.venv/bin/python scripts/blender/mcp_call.py scripts/blender/draw-site-wireframes.py
# Edges between faces that meet at more than 38 degrees (and open borders) are drawn strong; the rest faint.
# Each drawing also gets named anchor points (in SVG coordinates) for the page's callouts.
import bpy, bmesh, math, os, json
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view
OUT = os.environ.get("MIDGE_IMG_OUT", "/home/ubuntu/near/site/img")
MODELS = "/home/ubuntu/near/site/models"
VW, VH = 480, 320

def fresh():
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    sc = bpy.context.scene; sc.render.resolution_x, sc.render.resolution_y = VW * 2, VH * 2; return sc

def imp(name, flat=False):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + ".glb"))
    objs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    if flat:
        R = Matrix.Rotation(math.radians(90), 4, 'X')
        for o in objs: o.matrix_world = R @ o.matrix_world
    bpy.context.view_layer.update(); return objs

def camera(loc, target, lens=50):
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.lens = lens; cam.location = loc
    bpy.context.scene.collection.objects.link(cam); bpy.context.scene.camera = cam
    d = Vector(target) - Vector(loc); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update(); return cam

def proj(sc, cam, p):
    v = world_to_camera_view(sc, cam, p); return (round(v.x * VW, 1), round((1 - v.y) * VH, 1))

def edges_of(o, strong_angle=38):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
    # glTF splits vertices along every hard edge; weld them so a shared edge is one edge between two faces
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4); bm.normal_update(); out = []
    for e in bm.edges:
        lf = e.link_faces
        strong = len(lf) != 2 or math.degrees(lf[0].normal.angle(lf[1].normal, 0)) > strong_angle
        out.append((e.verts[0].co.copy(), e.verts[1].co.copy(), strong))
    bm.free(); return out

def svg(name, sc, cam, groups, anchors):
    paths = {"strong": [], "faint": []}
    for objs, mode in groups:
        for o in objs:
            for a, b, strong in edges_of(o):
                k = "faint" if mode == "faint-all" else ("strong" if (strong or mode == "all-strong") else "faint")
                if mode == "strong-only" and k == "faint": continue
                (x1, y1), (x2, y2) = proj(sc, cam, a), proj(sc, cam, b)
                paths[k].append(f"M{x1} {y1}L{x2} {y2}")
    an = {k: proj(sc, cam, Vector(v)) for k, v in anchors.items()}
    body = "".join(f'<path class="w-{k}" d="{"".join(v)}"/>' for k, v in paths.items() if v)
    doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW} {VH}" fill="none" stroke-linecap="round">{body}</svg>'
    open(os.path.join(OUT, f"wire-{name}.svg"), "w").write(doc)
    print(name, "strong", len(paths["strong"]), "faint", len(paths["faint"]), "bytes", len(doc), "anchors", json.dumps(an))
    return an

result = {}
# the room: the cage is strong, the glass shell faint, the core as its outline
sc = fresh(); objs = imp("room")
cage = [o for o in objs if o.name.startswith("room_cage")]; shell = [o for o in objs if o.name.startswith("room_shell")]
cam = camera((3.2, -3.9, 1.6), (0, 0, 0), 50)
result["room"] = svg("room", sc, cam, [(cage, "strong-only"), (shell, "faint-all")], {"core": (0, 0, 0), "cage": (0.62, -0.62, 0.42), "shell": (-0.55, -0.72, -0.35)})

# the enclosure: our program on Phala, or the model on NEAR AI Cloud
sc = fresh(); objs = imp("tee", flat=True)
cam = camera((3.4, -4.6, 3.6), (0, 0, 0.05), 50)
result["tee"] = svg("tee", sc, cam, [(objs, "mixed")], {"lid": (0.0, 0.0, 0.27), "pins": (-0.9, -0.86, -0.05), "body": (1.2, -0.6, 0.0)})

# the Nest: the contract that holds each member's share
sc = fresh(); objs = imp("nest", flat=True)
cam = camera((4.6, -6.2, 4.4), (0, 0, 0), 50)
result["nest"] = svg("nest", sc, cam, [(objs, "mixed")], {"slab": (-2.0, -0.75, -0.18), "share": (0.7, 0.0, 0.26), "shares": (-1.3, 0.0, 0.26)})
open(os.path.join(OUT, "wire-anchors.json"), "w").write(json.dumps(result, indent=1))
