# ─────────────────────────────────────────────────────────────
#  하찮은 오리너구리 캐릭터 생성 스크립트 (Blender 3.6 / 4.x)
#  사용법: 새 파일 → Scripting 탭 → New → 이 코드 붙여넣기 → ▶ Run Script
#  ※ 현재 장면의 모든 오브젝트를 지우고 새로 만듭니다.
#  결과: 키 약 12cm 오리너구리 + 리그 + 애니메이션 5개(idle, jump, wave, spin, flop)
#        + character.glb 자동 내보내기 (.blend 저장 위치, 없으면 바탕화면)
# ─────────────────────────────────────────────────────────────
import bpy, math, os

# ===== 0. 장면 초기화 =====
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
    for b in list(coll):
        if b.users == 0 or getattr(b, 'use_fake_user', False):
            coll.remove(b)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0
scene.render.fps = 24


# ===== 1. 재질 =====
def lin(h):  # sRGB hex → Blender 선형 색
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def mat(name, hexcol, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*lin(hexcol), 1)
    b.inputs['Roughness'].default_value = rough
    return m

M = {
    'fur':   mat('Fur',   '9a6a48'),
    'belly': mat('Belly', 'e8c9a0'),
    'bill':  mat('Bill',  '4f5563', 0.6),
    'eye':   mat('Eye',   '141418', 0.15),
    'shine': mat('Shine', 'ffffff', 0.3),
    'cheek': mat('Cheek', 'ff9db0'),
}


# ===== 2. 몸 파츠 (단위: 미터, 정면 = -Y) =====
def part(name, loc, scale, m, rot=(0, 0, 0), prim='sphere', seg=32):
    if prim == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=1, radius2=0, depth=2, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    o.data.materials.append(m)
    return o

P = {}  # 이름: (오브젝트, 붙일 뼈)
def add(bone, *a, **k):
    o = part(*a, **k)
    P[o.name] = (o, bone)

# 몸통: 서양배 모양 통통한 덩어리
add('body',  'Body',  (0, 0, 0.058),        (0.040, 0.036, 0.050), M['fur'])
add('body',  'Belly', (0, -0.027, 0.050),   (0.028, 0.012, 0.034), M['belly'])
# 납작하고 넓적한 부리 (살짝 아래로 처짐)
add('body',  'Bill',  (0, -0.050, 0.073),   (0.028, 0.024, 0.0075), M['bill'], rot=(0.15, 0, 0))
for s, n in ((-1, 'L'), (1, 'R')):
    add('body', 'Nostril' + n, (s * 0.006, -0.062, 0.0785), (0.0018, 0.0018, 0.0008), M['eye'], seg=12)
    # 멀리 떨어진 작은 점눈 = 하찮음 포인트
    add('body', 'Eye' + n,   (s * 0.021, -0.0225, 0.088), (0.0042, 0.0042, 0.0046), M['eye'], seg=16)
    add('body', 'Shine' + n, (s * 0.0225, -0.0262, 0.0895), (0.0013, 0.0013, 0.0013), M['shine'], seg=8)
    add('body', 'Cheek' + n, (s * 0.030, -0.0215, 0.072), (0.006, 0.0018, 0.004), M['cheek'], rot=(0, 0, s * 0.7), seg=16)
    # 짧은 지느러미 팔
    add('arm' + n, 'Arm' + n, (s * 0.041, -0.006, 0.050), (0.008, 0.012, 0.018), M['fur'], rot=(0, -s * 0.35, 0))
    # 물갈퀴 발
    add('root', 'Foot' + n, (s * 0.017, -0.016, 0.0055), (0.012, 0.017, 0.0055), M['bill'])
# 넓적한 비버 꼬리
add('tail', 'Tail', (0, 0.046, 0.016), (0.020, 0.032, 0.006), M['bill'], rot=(0.25, 0, 0))
# 정수리 삐침 머리 한 가닥
add('body', 'Tuft', (0.002, 0, 0.113), (0.0035, 0.0035, 0.006), M['fur'], rot=(0, 0.35, 0), prim='cone', seg=12)


# ===== 3. 리그 (모든 뼈는 위(+Z)를 향함 → 로컬 Y=위, X=앞뒤 기울기, Z=좌우 기울기) =====
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
rig = bpy.context.active_object
rig.name = rig.data.name = 'Rig'
eb = rig.data.edit_bones
r = eb[0]
r.name, r.head, r.tail, r.roll = 'root', (0, 0, 0), (0, 0, 0.01), 0

def bone(name, head, length, parent):
    b = eb.new(name)
    b.head, b.tail, b.roll = head, (head[0], head[1], head[2] + length), 0
    b.parent = eb[parent]

bone('body', (0, 0, 0.01), 0.08, 'root')
bone('armL', (-0.036, -0.006, 0.064), 0.012, 'body')
bone('armR', (0.036, -0.006, 0.064), 0.012, 'body')
bone('tail', (0, 0.030, 0.016), 0.012, 'body')
bpy.ops.object.mode_set(mode='OBJECT')

# 파츠를 뼈에 붙이기 (위치 유지)
bpy.context.view_layer.update()
for o, b in P.values():
    mw = o.matrix_world.copy()
    o.parent = rig
    o.parent_type = 'BONE'
    o.parent_bone = b
    bpy.context.view_layer.update()
    o.matrix_world = mw


# ===== 4. 애니메이션 =====
rig.animation_data_create()
pb = rig.pose.bones
for p in pb:
    p.rotation_mode = 'XYZ'

def reset_pose():
    for p in pb:
        p.location, p.rotation_euler, p.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)

def k(bn, f, loc=None, rot=None, scl=None):
    p = pb[bn]
    if loc is not None:
        p.location = loc;        p.keyframe_insert('location', frame=f)
    if rot is not None:
        p.rotation_euler = rot;  p.keyframe_insert('rotation_euler', frame=f)
    if scl is not None:
        p.scale = scl;           p.keyframe_insert('scale', frame=f)

def sq(a):  # 출렁임: 위아래로 눌리고 옆으로 퍼짐
    return (1 + a, 1 - a, 1 + a)

actions = []
def action(name, end):
    reset_pose()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    actions.append((act, end))
    return act

# idle: 숨쉬기 + 꼬리 살랑 + 팔 까딱 (2초 반복)
action('idle', 49)
for f, a in ((1, 0), (25, 0.035), (49, 0)):
    k('body', f, scl=sq(a))
for f, t in ((1, 0), (13, 0.35), (25, 0), (37, -0.35), (49, 0)):
    k('tail', f, rot=(0, t, 0))
for f, t in ((1, 0), (25, 0.15), (49, 0)):
    k('armR', f, rot=(0, 0, t)); k('armL', f, rot=(0, 0, -t))

# jump: 웅크렸다 퐁! 착지하며 찌그러짐
action('jump', 25)
for f, y in ((1, 0), (5, 0), (13, 0.035), (21, 0), (25, 0)):
    k('root', f, loc=(0, y, 0))
for f, a in ((1, 0), (5, 0.2), (9, -0.13), (17, 0), (20, 0.16), (25, 0)):
    k('body', f, scl=sq(a))
for f, t in ((1, 0), (13, 1.6), (25, 0)):
    k('armR', f, rot=(0, 0, t)); k('armL', f, rot=(0, 0, -t))
for f, t in ((1, 0), (13, 0.5), (25, 0)):
    k('tail', f, rot=(t, 0, 0))

# wave: 짧은 팔로 열심히 흔들기
action('wave', 37)
for f, t in ((1, 0), (8, 2.2), (12, 1.7), (16, 2.2), (20, 1.7), (24, 2.2), (37, 0)):
    k('armR', f, rot=(0, 0, t))
for f, t in ((1, 0), (18, 0.12), (37, 0)):
    k('body', f, rot=(0, 0, t))

# spin: 제자리 한 바퀴 + 살짝 뜀
action('spin', 31)
for i in range(11):
    f = 1 + i * 3
    k('root', f, rot=(0, 2 * math.pi * i / 10, 0), loc=(0, 0.02 * math.sin(math.pi * i / 10), 0))
for f, t in ((1, 0), (16, 1.0), (31, 0)):
    k('armR', f, rot=(0, 0, t)); k('armL', f, rot=(0, 0, -t))

# flop: 앞으로 꽈당 → 꼬리 파닥 → 일어나서 부르르
action('flop', 49)
for f, t in ((1, 0), (9, 1.45), (11, 1.33), (13, 1.45), (28, 1.45), (40, 0), (49, 0)):
    k('root', f, rot=(t, 0, 0))
for f, t in ((1, 0), (5, 1.3), (9, 1.6), (13, 0.4), (28, 0.4), (40, 0), (49, 0)):
    k('armR', f, rot=(0, 0, t)); k('armL', f, rot=(0, 0, -t))
for f, t in ((1, 0), (14, 0), (16, 0.6), (18, 0), (20, 0.6), (22, 0), (24, 0.6), (26, 0), (49, 0)):
    k('tail', f, rot=(t, 0, 0))
for f, t in ((1, 0), (40, 0), (42, 0.25), (44, -0.25), (46, 0.2), (48, -0.1), (49, 0)):
    k('body', f, rot=(0, t, 0))

# 각 액션을 NLA 트랙으로 보관 (glTF 내보내기 시 각각 별도 애니메이션이 됨)
for act, end in actions:
    tr = rig.animation_data.nla_tracks.new()
    tr.name = act.name
    st = tr.strips.new(act.name, 1, act)
    if hasattr(st, 'action_slot') and getattr(act, 'slots', None):
        st.action_slot = act.slots[0]
    tr.mute = True
rig.animation_data.action = None
reset_pose()
scene.frame_start, scene.frame_end = 1, 49
scene.frame_set(1)


# ===== 5. GLB 내보내기 =====
out_dir = bpy.path.abspath('//') if bpy.data.filepath else os.path.join(os.path.expanduser('~'), 'Desktop')
if not os.path.isdir(out_dir):
    out_dir = os.path.expanduser('~')
path = os.path.join(out_dir, 'character.glb')
kw = dict(filepath=path, export_format='GLB', export_apply=True, export_animations=True)
try:
    bpy.ops.export_scene.gltf(export_animation_mode='ACTIONS', **kw)
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
print('✅ 오리너구리 완성! 내보낸 파일:', path)
