# Render the chapter plates (site/img/plate-*.png) in Cycles from the site models.
#   blender -b --python scripts/blender/render-site-plates.py
# Transparent background with a shadow catcher, so each object sits on the light page with its own soft shadow.
# Three plates, one per chapter of "How it works":
#   room  - the sealed room: a glass cage around the deliberation core
#   rules - the Nest under a glass cover: the rules are visible to all and cannot be touched
#   exit  - the Nest with one member's share lifted out
import bpy, math, os, time
from mathutils import Matrix
ROOT = os.environ.get("MIDGE_ROOT", "/home/ubuntu/near")
MODELS = os.path.join(ROOT, "site/models"); OUT = os.path.join(ROOT, "site/img")
os.makedirs(OUT, exist_ok=True)
W, H, SPP = int(os.environ.get("PLATE_W", 960)), int(os.environ.get("PLATE_H", 720)), int(os.environ.get("PLATE_SPP", 64))
LAKE = (0.486, 0.769, 0.722); GLOW = (0.851, 0.510, 0.290)

def fresh():
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SPP; sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 8; sc.cycles.transmission_bounces = 8; sc.cycles.glossy_bounces = 4
    sc.render.resolution_x, sc.render.resolution_y = W, H; sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.85, 0.83, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.35
    return sc

def imp(name):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + ".glb"))
    return [o for o in bpy.data.objects if o not in before and o.type == 'MESH']

def lay_flat(objs):
    # the Nest was modelled with its thin side on Y; turn it so it lies on the floor
    R = Matrix.Rotation(math.radians(90), 4, 'X')
    for o in objs: o.matrix_world = R @ o.matrix_world

def principled(o):
    m = o.active_material.copy(); o.active_material = m; return m.node_tree.nodes["Principled BSDF"]

def glass(o, tint=(0.85, 0.95, 0.93), rough=0.04):
    b = principled(o); b.inputs["Base Color"].default_value = (*tint, 1); b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["Roughness"].default_value = rough; b.inputs["IOR"].default_value = 1.45; b.inputs["Metallic"].default_value = 0.0

def metal(o, color, rough=0.25, metallic=0.9):
    b = principled(o); b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Metallic"].default_value = metallic; b.inputs["Roughness"].default_value = rough

def emit(o, color, strength=6.0):
    b = principled(o); b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Emission Color"].default_value = (*color, 1); b.inputs["Emission Strength"].default_value = strength

def catcher(z=0.0, size=30):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z)); p = bpy.context.object; p.is_shadow_catcher = True; return p

def light(loc, energy, size=4, color=(1, 1, 1), target=(0, 0, 0)):
    l = bpy.data.objects.new("L", bpy.data.lights.new("L", 'AREA')); l.data.energy = energy; l.data.size = size; l.data.color = color; l.location = loc
    bpy.context.scene.collection.objects.link(l)
    e = bpy.data.objects.new("T", None); e.location = target; bpy.context.scene.collection.objects.link(e)
    c = l.constraints.new('TRACK_TO'); c.target = e; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'

def camera(loc, target, lens=50):
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.lens = lens; cam.location = loc
    bpy.context.scene.collection.objects.link(cam); bpy.context.scene.camera = cam
    e = bpy.data.objects.new("CT", None); e.location = target; bpy.context.scene.collection.objects.link(e)
    c = cam.constraints.new('TRACK_TO'); c.target = e; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'

def render(name):
    sc = bpy.context.scene; sc.render.filepath = os.path.join(OUT, f"plate-{name}.png")
    t = time.time(); bpy.ops.render.render(write_still=True); print(f"plate-{name}.png {W}x{H} {SPP}spp {time.time() - t:.0f}s")

def by(objs, prefix): return next(o for o in objs if o.name.startswith(prefix))

# ---- room: the sealed room ----
fresh(); objs = imp("room")
for o in objs: o.location.z += 1.05
cage, shell, core = by(objs, "room_cage"), by(objs, "room_shell"), by(objs, "room_core")
metal(cage, (0.16, 0.36, 0.34), 0.2); glass(shell, (0.8, 0.92, 0.9)); emit(core, LAKE, 2.2)
cage.rotation_euler[2] = 0.5; shell.rotation_euler[2] = 0.5
catcher(0.0)
light((3.5, -3.0, 5.0), 900, 4); light((-4, 2.5, 2.5), 350, 5, LAKE); light((0.5, 4, 3), 250, 3)
camera((3.6, -4.6, 2.7), (0, 0, 0.95), 56)
render("room")

# ---- rules: the Nest under a glass cover ----
fresh(); objs = imp("nest"); lay_flat(objs)
slab = by(objs, "nest_slab"); metal(slab, (0.12, 0.15, 0.16), 0.38, 0.55)
cols = [(0.29, 0.5, 0.61), (0.44, 0.56, 0.49), GLOW, (0.54, 0.5, 0.66)]
for i in range(4): metal(by(objs, f"nest_share_{i}"), cols[i], 0.35, 0.3)
for o in objs: o.location.z += 0.2
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.62)); cover = bpy.context.object; cover.scale = (4.05, 1.56, 0.36)
bv = cover.modifiers.new("b", 'BEVEL'); bv.width = 0.05; bv.segments = 4
cover.data.materials.append(bpy.data.materials.new("cover")); cover.active_material.use_nodes = True; glass(cover, (0.9, 0.97, 0.95), 0.02)
catcher(0.0)
light((3, -3.5, 5), 1000, 5); light((-4.5, 2, 3), 400, 5, LAKE); light((0, 4.5, 2.5), 250, 3)
camera((5.2, -6.4, 4.6), (0, 0, 0.35), 58)
render("rules")

# ---- exit: one member's share lifted out of the Nest ----
fresh(); objs = imp("nest"); lay_flat(objs)
slab = by(objs, "nest_slab"); metal(slab, (0.12, 0.15, 0.16), 0.38, 0.55)
for i in range(4): metal(by(objs, f"nest_share_{i}"), cols[i], 0.35, 0.3)
for o in objs: o.location.z += 0.2
mine = by(objs, "nest_share_2"); mine.location.z += 1.25; mine.location.y -= 0.35; mine.rotation_euler = (math.radians(-8), math.radians(6), math.radians(4))
emit(mine, GLOW, 0.6)
catcher(0.0)
light((3, -3.5, 5), 1000, 5); light((-4.5, 2, 3), 380, 5, LAKE); light((2.5, -1.5, 3.2), 220, 1.5, GLOW, (0.9, -0.3, 1.4))
camera((5.0, -6.6, 4.2), (0.2, 0, 0.7), 56)
render("exit")
print("done")
