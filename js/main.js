import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPlaceholder } from './placeholder.js';

// ===== 설정 =====
const CONFIG = {
  MODEL_URL: 'model/character.glb', // 이 파일이 있으면 실제 캐릭터, 없으면 임시 캐릭터
  DISTANCE: 0.4,                    // 캐릭터까지 거리(미터)
  HEIGHT: -0.2,                     // 눈높이 기준 캐릭터 바닥 높이(미터, 음수 = 아래)
  FOV: 60,                          // 카메라 세로 화각
  IDLE_NAME: 'idle',                // 대기 애니메이션 이름
  ANIM_ORDER: null,                 // 탭 순서 지정 예: ['jump','wave','spin'] / null 이면 GLB 순서
  ANIM_LABELS: { jump: '점프', wave: '손 흔들기', spin: '회전' }, // 버튼 이름
  FADE: 0.2,                        // 애니메이션 전환 시간(초)
  SMOOTH: 0.35,                     // 자이로 떨림 보정 (0~1)
  FOLLOW_EDGE: 0.7,                 // 화면 가장자리 몇 % 지점에서 따라오기 시작할지
  FOLLOW_SPEED: 0.06,               // 따라오는 속도
  ROTATE_SPEED: 0.012,              // 스와이프 회전 감도
  LONG_PRESS: 0.45,                 // 길게 누르기(쓰다듬기) 인식 시간(초)
  BORED_TIME: 12,                   // 이 시간(초) 동안 아무것도 안 하면 캐릭터가 혼자 움직임
  SCALE_MIN: 0.5, SCALE_MAX: 3,     // 두 손가락 크기 조절 범위
  LOVE: { tap: 2, pet: 1, snack: 10 }, // 친밀도 증가량 (100마다 레벨 업)
};

const $ = (id) => document.getElementById(id);
let statusTimer;
const setStatus = (t, sec = 0) => {
  $('status').textContent = t;
  clearTimeout(statusTimer);
  if (sec) statusTimer = setTimeout(() => ($('status').textContent = ''), sec * 1000);
};

// ===== 인앱 브라우저(카카오톡 등) 처리 =====
const ua = navigator.userAgent;
if (/KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|DaumApps|everytimeApp/i.test(ua)) {
  if (/KAKAOTALK/i.test(ua)) location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
  else if (/Android/i.test(ua)) location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
  $('inapp').hidden = false;
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); $('copy').textContent = '복사됨!'; } catch { prompt('링크를 복사하세요', location.href); }
  };
}

$('start').onclick = () => {
  // iOS: 자이로 권한 요청은 탭 직후 동기적으로 호출해야 함
  const gyroPerm = typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission
    ? DeviceOrientationEvent.requestPermission().catch(() => 'denied')
    : Promise.resolve('granted');
  const cam = navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  start(gyroPerm, cam).catch((e) => { console.error(e); setStatus('오류: ' + (e.message || e)); });
};

async function loadCharacter() {
  try {
    const gltf = await new GLTFLoader().loadAsync(CONFIG.MODEL_URL);
    return { root: gltf.scene, clips: gltf.animations };
  } catch {
    return createPlaceholder();
  }
}

// 이모지 → 텍스처 (파티클용)
const texCache = {};
function emojiTex(e) {
  if (texCache[e]) return texCache[e];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(e, 64, 72);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (texCache[e] = t);
}

async function start(gyroPerm, camPromise) {
  $('start').disabled = true;
  setStatus('카메라 켜는 중...');
  const [perm, stream, character] = await Promise.all([gyroPerm, camPromise, loadCharacter()]);

  const video = $('video');
  video.srcObject = stream;
  await video.play();

  // ===== 3D 기본 =====
  const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.FOV, 1, 0.01, 20);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777788, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(0.5, 2, 1);
  scene.add(sun);

  // stage(위치·방향) → pivot(크기) → fx(출렁임 등 효과) → 캐릭터(스와이프 회전)
  const stage = new THREE.Group(), pivot = new THREE.Group(), fx = new THREE.Group();
  scene.add(stage); stage.add(pivot); pivot.add(fx); fx.add(character.root);
  const size = new THREE.Box3().setFromObject(character.root).getSize(new THREE.Vector3());

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(size.x, size.z) * 0.55, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.0005;
  pivot.add(shadow);
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(size.x, size.y, size.z) * 0.7, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hit.position.y = size.y / 2;
  pivot.add(hit);

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ===== 자이로 → 카메라 방향 =====
  const target = new THREE.Quaternion(), euler = new THREE.Euler(), zee = new THREE.Vector3(0, 0, 1);
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  let gotGyro = false;
  addEventListener('deviceorientation', (e) => {
    if (e.alpha == null) return;
    const d = THREE.MathUtils.DEG2RAD;
    const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * d;
    euler.set(e.beta * d, e.alpha * d, -e.gamma * d, 'YXZ');
    target.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
    if (!gotGyro) { gotGyro = true; camera.quaternion.copy(target); placeInFront(); }
  });

  function placeInFront() {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    stage.position.copy(fwd.normalize().multiplyScalar(CONFIG.DISTANCE)).setY(CONFIG.HEIGHT);
    stage.lookAt(0, CONFIG.HEIGHT, 0);
  }
  placeInFront();

  // 화면 밖으로 벗어나면 부드럽게 따라오기
  const tmp = new THREE.Vector3(), goal = new THREE.Vector3();
  let following = false;
  function follow() {
    const h = size.y * pivot.scale.y;
    tmp.copy(stage.position).setY(stage.position.y + h / 2).project(camera);
    if (tmp.z > 1 || Math.abs(tmp.x) > CONFIG.FOLLOW_EDGE || Math.abs(tmp.y) > CONFIG.FOLLOW_EDGE) following = true;
    if (!following) return;
    goal.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(CONFIG.DISTANCE);
    goal.y -= h / 2;
    stage.position.lerp(goal, CONFIG.FOLLOW_SPEED);
    stage.lookAt(0, stage.position.y, 0);
    if (stage.position.distanceTo(goal) < 0.01) following = false;
  }

  // ===== 효과(트윈) 시스템 =====
  // 매 프레임 pose 를 0으로 초기화하고, 진행 중인 효과들이 값을 더한 뒤 fx 그룹에 적용
  const pose = { sq: 0, hop: 0, tilt: 0, lean: 0 };
  const effects = [];
  const addFx = (dur, fn, done) => effects.push({ t: 0, dur, fn, done });
  const wave = (p, n) => Math.sin(p * Math.PI * n) * (1 - p);
  const squash = (amp = 0.15, n = 3, dur = 0.5) => addFx(dur, (p) => (pose.sq += amp * wave(p, n)));
  const hop = (h = 0.03, dur = 0.45) => addFx(dur, (p) => { pose.hop += h * Math.sin(p * Math.PI); pose.sq += -0.1 * Math.sin(p * Math.PI); });

  // ===== 파티클 =====
  const particles = [];
  function spawn(emoji, count, opt = {}) {
    const base = pivot.localToWorld(new THREE.Vector3(0, size.y * (opt.at ?? 0.9), 0));
    const s = (opt.size ?? 0.022) * pivot.scale.x;
    for (let i = 0; i < count; i++) {
      const e = Array.isArray(emoji) ? emoji[(Math.random() * emoji.length) | 0] : emoji;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(e), transparent: true, depthWrite: false }));
      sp.scale.setScalar(s * (0.7 + Math.random() * 0.6));
      sp.position.copy(base);
      const spread = (opt.spread ?? 0.04) * pivot.scale.x;
      const v = new THREE.Vector3((Math.random() - 0.5) * spread, (opt.up ?? 0.05) * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * spread)
        .multiplyScalar(pivot.scale.x);
      scene.add(sp);
      particles.push({ sp, v, age: 0, life: opt.life ?? 1.2, g: (opt.gravity ?? 0) * pivot.scale.x });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.v.y -= p.g * dt;
      p.sp.position.addScaledVector(p.v, dt);
      p.sp.material.opacity = 1 - p.age / p.life;
      if (p.age >= p.life) { scene.remove(p.sp); p.sp.material.dispose(); particles.splice(i, 1); }
    }
  }

  // ===== 애니메이션 =====
  const mixer = new THREE.AnimationMixer(character.root);
  const clips = character.clips || [];
  const idleClip = clips.find((c) => c.name.toLowerCase().includes(CONFIG.IDLE_NAME)) || clips[0];
  let order = clips.filter((c) => c !== idleClip);
  if (CONFIG.ANIM_ORDER) order = CONFIG.ANIM_ORDER.map((n) => clips.find((c) => c.name === n)).filter(Boolean);
  const idle = idleClip ? mixer.clipAction(idleClip).play() : null;
  let idx = 0, playing = null;

  const bar = $('anims');
  const btns = order.map((clip, i) => {
    const b = document.createElement('button');
    b.textContent = CONFIG.ANIM_LABELS[clip.name] || clip.name;
    b.onclick = () => { touch(); idx = (i + 1) % order.length; play(clip); };
    bar.appendChild(b);
    return b;
  });
  const mark = (clip) => btns.forEach((b, i) => b.classList.toggle('on', order[i] === clip));

  function play(clip) {
    if (!clip) return;
    const action = mixer.clipAction(clip);
    const from = playing || idle;
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    if (from && from !== action) from.crossFadeTo(action, CONFIG.FADE, false);
    playing = action;
    mark(clip);
  }
  function playNext() {
    if (!order.length) return;
    const clip = order[idx];
    idx = (idx + 1) % order.length;
    play(clip);
  }
  const findClip = (word) => order.find((c) => c.name.toLowerCase().includes(word));
  mixer.addEventListener('finished', (e) => {
    if (e.action !== playing) return;
    if (idle) { idle.reset().play(); playing.crossFadeTo(idle, CONFIG.FADE, false); }
    playing = null;
    mark(null);
  });

  // ===== 친밀도 =====
  let love = 0, level = 1;
  function addLove(n) {
    love += n;
    if (love >= 100) {
      love -= 100;
      level++;
      celebrate();
    }
    $('lv').textContent = `Lv.${level}`;
    $('fill').style.width = love + '%';
    $('love').classList.remove('pop'); void $('love').offsetWidth; $('love').classList.add('pop');
  }
  function celebrate() {
    spawn(['🎉', '⭐', '💖', '✨'], 30, { up: 0.12, spread: 0.18, gravity: 0.15, life: 1.8, size: 0.02 });
    play(findClip('spin') || findClip('jump'));
    hop(0.05, 0.6);
    setStatus(`친밀도 레벨 업! Lv.${level} 🎉`, 3);
  }

  // ===== 간식 =====
  const cookie = new THREE.Group();
  cookie.add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 24), new THREE.MeshStandardMaterial({ color: 0xd19a5b, roughness: 0.8 })));
  const chip = new THREE.MeshStandardMaterial({ color: 0x3b2314 });
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), chip);
    const a = i * 1.1, r = 0.004 + (i % 3) * 0.004;
    c.position.set(Math.cos(a) * r, 0.003, Math.sin(a) * r);
    cookie.add(c);
  }
  cookie.visible = false;
  pivot.add(cookie);
  let busy = false;
  function giveSnack() {
    if (busy) return;
    busy = true;
    touch();
    const front = size.z * 0.5 + 0.025;
    const startRot = Math.atan2(Math.sin(character.root.rotation.y), Math.cos(character.root.rotation.y));
    addFx(0.3, (p) => (character.root.rotation.y = startRot * (1 - p))); // 정면으로 돌아보기
    cookie.visible = true;
    cookie.scale.setScalar(1);
    addFx(0.6, (p) => { // 떨어지기 + 통통
      const fall = Math.min(p / 0.7, 1);
      const bounce = p > 0.7 ? Math.sin(((p - 0.7) / 0.3) * Math.PI) * 0.01 : 0;
      cookie.position.set(0, 0.003 + (1 - fall * fall) * 0.15 + bounce, front);
      cookie.rotation.z = (1 - p) * 3;
    }, () => {
      hop(0.025, 0.35);
      spawn('❗', 1, { at: 1.1, up: 0.02, life: 0.6, size: 0.025, spread: 0 });
      addFx(1.4, (p) => { // 냠냠
        pose.lean += 0.35 * Math.sin(Math.min(p / 0.2, 1) * Math.PI / 2) * (p > 0.85 ? (1 - p) / 0.15 : 1);
        pose.sq += 0.08 * Math.max(0, Math.sin(p * Math.PI * 8));
        cookie.scale.setScalar(Math.max(0, 1 - Math.floor(p * 4) / 3));
        if (Math.random() < 0.15) spawn('✨', 1, { at: 0.3, up: 0.03, life: 0.5, size: 0.012 });
      }, () => {
        cookie.visible = false;
        spawn('💖', 6, { up: 0.06, life: 1.4 });
        squash(0.12, 4, 0.6);
        addLove(CONFIG.LOVE.snack);
        setStatus('냠냠! 맛있어요', 2);
        busy = false;
      });
    });
  }
  $('snack').onclick = giveSnack;

  // ===== 사진 찍기 =====
  $('photo').onclick = async () => {
    touch();
    const pr = renderer.getPixelRatio();
    const c = document.createElement('canvas');
    c.width = innerWidth * pr; c.height = innerHeight * pr;
    const g = c.getContext('2d');
    const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(c.width / vw, c.height / vh);
    g.drawImage(video, (c.width - vw * s) / 2, (c.height - vh * s) / 2, vw * s, vh * s);
    renderer.render(scene, camera);
    g.drawImage(renderer.domElement, 0, 0, c.width, c.height);
    $('flash').classList.remove('go'); void $('flash').offsetWidth; $('flash').classList.add('go');
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    const url = URL.createObjectURL(blob);
    $('shotimg').src = url;
    $('shot').hidden = false;
    $('save').onclick = async () => {
      const file = new File([blob], `ar-${Date.now()}.jpg`, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return; } catch { /* 취소 */ }
      }
      const a = document.createElement('a');
      a.href = url; a.download = file.name; a.click();
    };
    $('close').onclick = () => { $('shot').hidden = true; URL.revokeObjectURL(url); };
  };

  // ===== 터치: 탭 / 길게 누르기(쓰다듬기) / 스와이프(회전) / 두 손가락(크기) =====
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), gl = $('gl');
  const pts = new Map();
  let drag = null, pinch = null, petting = false, petTime = 0;
  const onChar = (x, y) => {
    ptr.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    return ray.intersectObject(hit, false).length > 0;
  };
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

  gl.addEventListener('pointerdown', (e) => {
    gl.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    touch();
    if (pts.size === 2) { drag = null; petting = false; pinch = { d: dist(), s: pivot.scale.x }; return; }
    drag = { x: e.clientX, last: e.clientX, moved: false, t0: performance.now(), on: onChar(e.clientX, e.clientY) };
  });
  gl.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      pivot.scale.setScalar(THREE.MathUtils.clamp(pinch.s * dist() / pinch.d, CONFIG.SCALE_MIN, CONFIG.SCALE_MAX));
      return;
    }
    if (!drag || petting) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) > 8) drag.moved = true;
    if (drag.moved) character.root.rotation.y += (e.clientX - drag.last) * CONFIG.ROTATE_SPEED;
    drag.last = e.clientX;
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (drag && !drag.moved && !petting && drag.on) {
      playNext();
      spawn('⭐', 5, { up: 0.07, spread: 0.08, life: 0.8, size: 0.018 });
      squash(0.12, 2, 0.35);
      addLove(CONFIG.LOVE.tap);
    }
    if (petting) setStatus('기분 좋아요 ☺', 2);
    drag = null;
    petting = false;
  };
  gl.addEventListener('pointerup', up);
  gl.addEventListener('pointercancel', up);

  // 쓰다듬기 진행 (매 프레임)
  function updatePet(dt) {
    if (drag && drag.on && !drag.moved && !petting && performance.now() - drag.t0 > CONFIG.LONG_PRESS * 1000) {
      petting = true;
      petTime = 0;
      setStatus('쓰다듬는 중...');
    }
    if (!petting) return;
    petTime += dt;
    pose.sq += 0.06 * Math.sin(petTime * 10);
    pose.tilt += 0.12 * Math.sin(petTime * 5);
    if (Math.floor(petTime / 0.3) !== Math.floor((petTime - dt) / 0.3)) {
      spawn('💗', 1, { up: 0.05, life: 1.1 });
      addLove(CONFIG.LOVE.pet);
    }
  }

  // ===== 심심하면 혼자 움직이기 =====
  let lastTouch = performance.now();
  function touch() { lastTouch = performance.now(); }
  function updateBored() {
    if (busy || petting || playing || performance.now() - lastTouch < CONFIG.BORED_TIME * 1000) return;
    touch();
    spawn('💭', 1, { at: 1.15, up: 0.015, life: 1.5, size: 0.03, spread: 0 });
    if (order.length) play(order[(Math.random() * order.length) | 0]);
    else hop();
  }

  $('intro').hidden = true;
  bar.hidden = !order.length;
  $('side').hidden = false;
  $('love').hidden = false;
  setStatus(perm === 'granted'
    ? '탭: 동작 · 길게 누르기: 쓰다듬기 · 밀기: 회전 · 두 손가락: 크기'
    : '자이로 권한이 없어 고정 화면으로 보여요', 5);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (gotGyro) camera.quaternion.slerp(target, CONFIG.SMOOTH);
    follow();

    pose.sq = pose.hop = pose.tilt = pose.lean = 0;
    for (let i = effects.length - 1; i >= 0; i--) {
      const f = effects[i];
      f.t += dt;
      const p = Math.min(f.t / f.dur, 1);
      f.fn(p);
      if (p >= 1) { effects.splice(i, 1); f.done && f.done(); }
    }
    updatePet(dt);
    updateBored();
    fx.scale.set(1 + pose.sq, 1 - pose.sq, 1 + pose.sq);
    fx.position.y = pose.hop;
    fx.rotation.set(pose.lean, 0, pose.tilt);

    updateParticles(dt);
    mixer.update(dt);
    renderer.render(scene, camera);
  });
}
