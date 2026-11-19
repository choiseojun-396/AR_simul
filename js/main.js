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
  FADE: 0.2,                        // 애니메이션 전환 시간(초)
  SMOOTH: 0.35,                     // 자이로 떨림 보정 (0~1, 작을수록 부드럽고 느림)
  FOLLOW: true,                     // 화면 밖으로 나가면 캐릭터가 다시 화면 안으로 따라옴
  FOLLOW_EDGE: 0.7,                 // 화면 가장자리 몇 % 지점에서 따라오기 시작할지 (0~1)
  FOLLOW_SPEED: 0.06,               // 따라오는 속도 (0~1)
};

const $ = (id) => document.getElementById(id);
const setStatus = (t) => ($('status').textContent = t);

// ===== 인앱 브라우저(카카오톡 등) 처리 =====
const ua = navigator.userAgent;
const inApp = /KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|DaumApps|everytimeApp/i.test(ua);
if (inApp) {
  if (/KAKAOTALK/i.test(ua)) {
    location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
  } else if (/Android/i.test(ua)) {
    location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
  }
  $('inapp').hidden = false;
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); $('copy').textContent = '복사됨!'; } catch { prompt('링크를 복사하세요', location.href); }
  };
}

$('start').onclick = () => {
  // iOS: 자이로 권한 요청은 반드시 탭 직후 동기적으로 호출해야 함
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

async function start(gyroPerm, camPromise) {
  $('start').disabled = true;
  setStatus('카메라 켜는 중...');
  const [perm, stream, character] = await Promise.all([gyroPerm, camPromise, loadCharacter()]);

  const video = $('video');
  video.srcObject = stream;
  await video.play();

  // ===== 3D =====
  const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.FOV, 1, 0.01, 20);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777788, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(0.5, 2, 1);
  scene.add(sun);

  const stage = new THREE.Group();
  scene.add(stage);
  stage.add(character.root);

  const box = new THREE.Box3().setFromObject(character.root);
  const size = box.getSize(new THREE.Vector3());
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(size.x, size.z) * 0.55, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.0005;
  stage.add(shadow);
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(size.x, size.y, size.z) * 0.7, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hit.position.y = size.y / 2;
  stage.add(hit);

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ===== 자이로 → 카메라 방향 =====
  const target = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const zee = new THREE.Vector3(0, 0, 1);
  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // 폰 화면이 아닌 뒷면 카메라 방향
  let gotGyro = false;
  addEventListener('deviceorientation', (e) => {
    if (e.alpha == null) return;
    const d = THREE.MathUtils.DEG2RAD;
    const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * d;
    euler.set(e.beta * d, e.alpha * d, -e.gamma * d, 'YXZ');
    target.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
    if (!gotGyro) { gotGyro = true; camera.quaternion.copy(target); placeInFront(); }
  });

  // 캐릭터를 지금 보고 있는 방향 앞에 놓기
  function placeInFront() {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    stage.position.copy(fwd.multiplyScalar(CONFIG.DISTANCE)).setY(CONFIG.HEIGHT);
    stage.lookAt(0, CONFIG.HEIGHT, 0); // 캐릭터가 나를 보도록
  }
  placeInFront();
  $('recenter').onclick = placeInFront;

  // 화면 밖으로 벗어나면 지금 보는 방향 쪽으로 부드럽게 따라오기
  const center = new THREE.Vector3(), goal = new THREE.Vector3();
  let following = false;
  function follow() {
    center.copy(stage.position).setY(stage.position.y + size.y / 2).project(camera);
    const out = center.z > 1 || Math.abs(center.x) > CONFIG.FOLLOW_EDGE || Math.abs(center.y) > CONFIG.FOLLOW_EDGE;
    if (out) following = true;
    if (!following) return;
    // 목표: 화면 중앙 방향으로 DISTANCE 만큼 앞 (캐릭터 중심이 화면 중앙에 오도록)
    goal.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(CONFIG.DISTANCE);
    goal.y -= size.y / 2;
    stage.position.lerp(goal, CONFIG.FOLLOW_SPEED);
    stage.lookAt(0, stage.position.y, 0);
    if (stage.position.distanceTo(goal) < 0.01) following = false;
  }

  // ===== 애니메이션 =====
  const mixer = new THREE.AnimationMixer(character.root);
  const clips = character.clips || [];
  const idleClip = clips.find((c) => c.name.toLowerCase().includes(CONFIG.IDLE_NAME)) || clips[0];
  let order = clips.filter((c) => c !== idleClip);
  if (CONFIG.ANIM_ORDER) order = CONFIG.ANIM_ORDER.map((n) => clips.find((c) => c.name === n)).filter(Boolean);
  const idle = idleClip ? mixer.clipAction(idleClip).play() : null;
  let idx = 0, playing = null;

  function playNext() {
    if (playing || !order.length) return;
    const action = mixer.clipAction(order[idx]);
    idx = (idx + 1) % order.length;
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    if (idle) idle.crossFadeTo(action, CONFIG.FADE, false);
    playing = action;
  }
  mixer.addEventListener('finished', (e) => {
    if (e.action !== playing) return;
    if (idle) { idle.reset().play(); playing.crossFadeTo(idle, CONFIG.FADE, false); }
    playing = null;
  });

  // ===== 탭 =====
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  $('gl').addEventListener('pointerdown', (e) => {
    ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    if (ray.intersectObject(hit, false).length) playNext();
  });

  $('intro').hidden = true;
  $('recenter').hidden = false;
  setStatus(perm === 'granted' ? '캐릭터를 탭해 보세요' : '자이로 권한이 없어 고정 화면으로 보여요');
  setTimeout(() => setStatus(''), 4000);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (gotGyro) camera.quaternion.slerp(target, CONFIG.SMOOTH);
    if (CONFIG.FOLLOW) follow();
    mixer.update(clock.getDelta());
    renderer.render(scene, camera);
  });
}
