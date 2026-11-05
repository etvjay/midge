# Render the hero image (site/img/hero.png): a field of private rooms over the Nest, one agent glowing orange.
#   blender -b --python scripts/blender/render-hero.py
# The rooms sit on the right so the headline has calm space on the left. The page shows this image at once;
# the live three.js scene fades in over it where the device can run it.
import bpy, math, os, random, time
from mathutils import Matrix, Vector
ROOT = os.environ.get("MIDGE_ROOT", "/home/ubuntu/near")
MODELS = os.path.join(ROOT, "site/models"); OUT = os.path.join(ROOT, "site/img")
W, H, SPP = int(os.environ.get("HERO_W", 1920)), int(os.environ.get("HERO_H", 1080)), int(os.environ.get("HERO_SPP", 48))
LAKE = (0.486, 0.769, 0.722); GLOW = (0.851, 0.510, 0.290); BG = (0.0060, 0.0080, 0.0089)
random.seed(7)

bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SPP; sc.cycles.use_denoising = True
sc.cycles.max_bounces = 6; sc.cycles.transmission_bounces = 6
sc.render.resolution_x, sc.render.resolution_y = W, H; sc.render.film_transparent = False
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Base Contrast'
w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (*BG, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.0

def imp(name):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + ".glb"))
    return [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
def mat(name, color, metal=0.0, rough=0.4, emit=0.0, trans=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    if emit: b.inputs["Emission Color"].default_value = (*color, 1); b.inputs["Emission Strength"].default_value = emit
    if trans: b.inputs["Transmission Weight"].default_value = trans; b.inputs["IOR"].default_value = 1.45
    return m
M = {"cage": mat("cage", (0.55, 0.8, 0.75), 0.9, 0.22), "shell": mat("shell", (0.6, 0.75, 0.72), 0.0, 0.05, trans=1.0),
     "core": mat("core", LAKE, emit=3.0), "member": mat("member", (0.92, 0.93, 0.91), emit=1.2), "agent": mat("agent", GLOW, emit=2.5),
     "slab": mat("slab", (0.09, 0.11, 0.12), 0.5, 0.4)}
share_cols = [(0.29, 0.5, 0.61), (0.44, 0.56, 0.49), GLOW, (0.54, 0.5, 0.66)]

# rooms on the right two-thirds, in depth (the camera looks down -Y, so negative X is screen right)
rooms = []
src = imp("room")
for o in src:
    o.hide_render = True; o.hide_viewport = True
    key = "cage" if o.name.startswith("room_cage") else "shell" if o.name.startswith("room_shell") else "core"
    o.data.materials.clear(); o.data.materials.append(M[key])   # instances share the mesh, so one assignment covers them all
spots = []
for row in range(3):
    for col in range(5):
        if random.random() < 0.15: continue
        spots.append((-(0.9 + col * 1.3 + (random.random() - 0.5) * 0.5), -(1.0 + random.random() * 3.0), 1.9 - row * 1.45 + (random.random() - 0.5) * 0.45, 0.34 + random.random() * 0.26))
for x, y, z, s in spots:
    rot = (random.random() * 0.6, random.random() * 0.6, random.random() * 6.28)
    for o in src:
        c = o.copy(); sc.collection.objects.link(c); c.hide_render = False; c.hide_viewport = False
        c.location = (x, y, z); c.scale = (s, s, s); c.rotation_euler = rot
    rooms.append(((x, y, z), s, None))
# members orbiting each room
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.045); member = bpy.context.object; member.data.materials.append(M["member"]); member.hide_render = True
for (x, y, z), s, _ in rooms:
    n = 3 + random.randint(0, 3); ph = random.random() * 6.28
    for k in range(n):
        a = ph + k * 6.283 / n; r = s * 1.7
        m = member.copy(); sc.collection.objects.link(m); m.hide_render = False; m.location = (x + math.cos(a) * r, y + math.sin(a) * r * 0.9, z + math.sin(a * 2) * s * 0.3)
# the agent: one member of three syndicates
ag = member.copy(); sc.collection.objects.link(ag); ag.hide_render = False; ag.scale = (1.7, 1.7, 1.7); ag.data = member.data.copy(); ag.data.materials.clear(); ag.data.materials.append(M["agent"])
a0, a1 = rooms[1][0], rooms[len(rooms) // 2][0]; ag.location = ((a0[0] + a1[0]) / 2 - 0.2, (a0[1] + a1[1]) / 2, max(a0[2], a1[2]) + 0.55)
pl = bpy.data.objects.new("agentlight", bpy.data.lights.new("agentlight", 'POINT')); pl.data.energy = 25; pl.data.color = GLOW; pl.location = ag.location; sc.collection.objects.link(pl)
# the Nest: the one contract under every syndicate
nest = imp("nest")
R = Matrix.Rotation(math.radians(90), 4, 'X')
for o in nest:
    o.matrix_world = R @ o.matrix_world
    o.matrix_world = Matrix.Translation((-3.9, -2.6, -2.45)) @ Matrix.Diagonal((1.45, 1.2, 0.5, 1.0)) @ o.matrix_world
    if o.name.startswith("nest_slab"): o.active_material = M["slab"]
for i in range(4):
    o = next(o for o in nest if o.name.startswith(f"nest_share_{i}")); o.active_material = mat(f"share{i}", share_cols[i], 0.2, 0.4, emit=0.25)
# light: a cool key from above right, a lake rim from behind, a faint fill
def area(loc, energy, size, color, target):
    l = bpy.data.objects.new("L", bpy.data.lights.new("L", 'AREA')); l.data.energy = energy; l.data.size = size; l.data.color = color; l.location = loc; sc.collection.objects.link(l)
    d = Vector(target) - Vector(loc); l.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
area((-7, 3, 7), 1400, 6, (0.9, 0.95, 1.0), (-3.5, -2, 0)); area((-2, -9, 3), 900, 8, LAKE, (-3.5, -2, 0)); area((3, 4, 2), 250, 5, (1, 1, 1), (-3.5, -2, 0))
# camera
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.lens = 40; sc.collection.objects.link(cam); sc.camera = cam
cam.location = (2.2, 9.8, 0.7); d = Vector((1.2, -2.0, -0.2)) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()  # aim left of the rooms so they sit in the right half
sc.render.filepath = os.path.join(OUT, "hero.png"); sc.render.image_settings.file_format = 'PNG'
t = time.time(); bpy.ops.render.render(write_still=True); print(f"hero.png {W}x{H} {SPP}spp {time.time() - t:.0f}s rooms {len(rooms)}")
