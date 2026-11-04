# Build the site models (site/models/*.glb) in Blender 5.2.3. Run through the Blender Lab MCP server:
#   ~/opt/blender-mcp/server/.venv/bin/python scripts/blender/mcp_call.py scripts/blender/build-site-models.py
# or directly:  blender -b --python scripts/blender/build-site-models.py
import bpy, bmesh, math, os
OUT = os.environ.get("MIDGE_MODELS_OUT", "/home/ubuntu/near/site/models")  # the MCP runs this through exec(), so there is no __file__
def reset():
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
def mat(name, color, metal=0.2, rough=0.5, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    if emit: b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = 1.0
    return m
def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
def export(name, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    p = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=p, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=False, export_materials='EXPORT', export_draco_mesh_compression_enable=False, export_animations=False, export_cameras=False, export_lights=False)
    tris = sum(len(o.data.loop_triangles) if (o.data.calc_loop_triangles() or True) else 0 for o in objs)
    print(f"{name}.glb {os.path.getsize(p)} bytes, {tris} triangles, objects {[o.name for o in objs]}")

# ---------- the room: a faceted cage (the TEE boundary) around a core (the deliberation) ----------
reset()
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0)
cage = bpy.context.object; cage.name = "room_cage"
w = cage.modifiers.new("wire", 'WIREFRAME'); w.thickness = 0.045; w.use_even_offset = True; w.use_relative_offset = False
apply_all(cage); cage.data.materials.append(mat("cage", (0.49, 0.77, 0.72), 0.6, 0.35))
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0)
shell = bpy.context.object; shell.name = "room_shell"
bpy.ops.object.shade_flat(); shell.data.materials.append(mat("shell", (0.07, 0.1, 0.11), 0.1, 0.25))
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=0.34)
core = bpy.context.object; core.name = "room_core"
bpy.ops.object.shade_smooth(); core.data.materials.append(mat("core", (0.49, 0.77, 0.72), 0.0, 0.3, emit=(0.49, 0.77, 0.72)))
export("room", [cage, shell, core])

# ---------- the Nest: the contract that holds every member's share ----------
reset()
bpy.ops.mesh.primitive_cube_add(size=1)
slab = bpy.context.object; slab.name = "nest_slab"; slab.scale = (4.0, 0.36, 1.5)
bpy.ops.object.transform_apply(scale=True)
bv = slab.modifiers.new("bevel", 'BEVEL'); bv.width = 0.06; bv.segments = 3; bv.limit_method = 'ANGLE'
apply_all(slab); slab.data.materials.append(mat("slab", (0.09, 0.12, 0.13), 0.3, 0.45))
shares = []
x = -1.78
for i, wdt in enumerate([0.9, 0.6, 1.05, 0.45]):
    bpy.ops.mesh.primitive_cube_add(size=1)
    s = bpy.context.object; s.name = f"nest_share_{i}"; s.scale = (wdt - 0.08, 0.12, 1.1)
    s.location = (x + wdt / 2, 0.2, 0); x += wdt
    bpy.ops.object.transform_apply(scale=True)
    b2 = s.modifiers.new("bevel", 'BEVEL'); b2.width = 0.03; b2.segments = 2; apply_all(s)
    s.data.materials.append(mat(f"share{i}", [(0.29, 0.5, 0.61), (0.44, 0.56, 0.49), (0.85, 0.51, 0.29), (0.54, 0.5, 0.66)][i], 0.2, 0.4))
    shares.append(s)
export("nest", [slab] + shares)

# ---------- the secure enclosure: a TEE as a sealed chip housing ----------
reset()
bpy.ops.mesh.primitive_cube_add(size=1)
body = bpy.context.object; body.name = "tee_body"; body.scale = (2.4, 0.42, 1.5)
bpy.ops.object.transform_apply(scale=True)
bv = body.modifiers.new("bevel", 'BEVEL'); bv.width = 0.1; bv.segments = 4; apply_all(body)
body.data.materials.append(mat("body", (0.08, 0.11, 0.12), 0.4, 0.4))
bpy.ops.mesh.primitive_cube_add(size=1)
lid = bpy.context.object; lid.name = "tee_lid"; lid.scale = (1.7, 0.06, 0.95); lid.location = (0, 0.24, 0)
bpy.ops.object.transform_apply(scale=True)
bv = lid.modifiers.new("bevel", 'BEVEL'); bv.width = 0.04; bv.segments = 2; apply_all(lid)
lid.data.materials.append(mat("lid", (0.49, 0.77, 0.72), 0.7, 0.3))
pins = []
for side in (-1, 1):
    for k in range(7):
        bpy.ops.mesh.primitive_cube_add(size=1)
        p = bpy.context.object; p.scale = (0.08, 0.06, 0.22); p.location = (-0.9 + k * 0.3, -0.05, side * 0.86)
        bpy.ops.object.transform_apply(scale=True); pins.append(p)
bpy.ops.object.select_all(action='DESELECT')
for p in pins: p.select_set(True)
bpy.context.view_layer.objects.active = pins[0]; bpy.ops.object.join(); pins = bpy.context.object; pins.name = "tee_pins"
pins.data.materials.append(mat("pins", (0.6, 0.64, 0.62), 0.9, 0.3))
export("tee", [body, lid, pins])
