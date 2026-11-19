import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MindARThree } from 'mindar-image-three';
import { createPlaceholder } from './placeholder.js';

// ===== 설정 =====
const CONFIG = {
  MODEL_URL: 'model/character.glb',   // 이 파일이 있으면 실제 캐릭터, 없으면 임시 캐릭터
  MARKER_IMAGE: 'assets/marker.png',
  MARKER_MIND: 'assets/targets.mind', // tools/compile-marker.html 로 만든 파일 (없으면 실행 시 자동 생성)
  MARKER_WIDTH_M: 0.148,              // 인쇄한 마커의 실제 가로 길이(미터). A6 가로 = 14.8cm
  IDLE_NAME: 'idle',                  // 대기 애니메이션 이름
  ANIM_ORDER: null,                   // 탭 순서 지정 예: ['jump','wave','spin'] / null 이면 GLB에 들어있는 순서
  FADE: 0.2,                          // 애니메이션 전환 시간(초)
};

const $ = (id) => document.getElementById(id);
const setStatus = (t) => ($('status').textContent = t);

// ===== 인앱 브라우저(카카오톡 등) 처리 =====
const ua = navigator.userAgent;
const isAndroid = /Android/i.test(ua);
const inApp = /KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|DaumApps|everytimeApp/i.test(ua);
if (inApp) {
  if (/KAKAOTALK/i.test(ua)) {
    location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
  } else if (isAndroid) {
    location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
  }
  $('inapp').hidden = false;
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); $('copy').textContent = '복사됨!'; } catch { prompt('링크를 복사하세요', location.href); }
  };
}

$('start').onclick = () => start().catch((e) => { console.error(e); setStatus('오류: ' + (e.message || e)); $('start').disabled = false; });

async function getTargetSrc() {
  const r = await fetch(CONFIG.MARKER_MIND, { method: 'HEAD' }).catch(() => null);
  if (r && r.ok) return CONFIG.MARKER_MIND;
  // .mind 파일이 없으면 마커 이미지를 즉석에서 변환 (수 초 소요)
  setStatus('마커 준비 중... 0%');
  const mod = await import('mindar-image');
  const Compiler = mod.Compiler || window.MINDAR.IMAGE.Compiler;
  const img = new Image();
  img.src = CONFIG.MARKER_IMAGE;
  await img.decode();
  const compiler = new Compiler();
  await compiler.compileImageTargets([img], (p) => setStatus(`마커 준비 중... ${Math.round(p)}%`));
  const data = await compiler.exportData();
  return URL.createObjectURL(new Blob([data]));
}

async function loadCharacter() {
  try {
    const gltf = await new GLTFLoader().loadAsync(CONFIG.MODEL_URL);
    return { root: gltf.scene, clips: gltf.animations };
  } catch {
    console.info('GLB 없음 → 임시 캐릭터 사용');
    return createPlaceholder();
  }
}

async function start() {
  $('start').disabled = true;
  const [targetSrc, character] = await Promise.all([getTargetSrc(), loadCharacter()]);
  setStatus('카메라 켜는 중...');

  const mindar = new MindARThree({
    container: $('ar'),
    imageTargetSrc: targetSrc,
    uiLoading: 'no',
    uiScanning: 'no',
    filterMinCF: 0.0001, // 떨림 줄이기
    filterBeta: 0.001,
  });
  const { renderer, scene, camera } = mindar;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x777788, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(0.5, 1, 2);
  scene.add(sun);

  const anchor = mindar.addAnchor(0);

  // 마커 좌표계: 가로 = 1 단위, 이미지 면 = XY, 위쪽 = +Z
  const stage = new THREE.Group();
  stage.rotation.x = Math.PI / 2;            // 캐릭터를 카드 위에 세우기
  stage.scale.setScalar(1 / CONFIG.MARKER_WIDTH_M); // 미터 → 마커 단위
  anchor.group.add(stage);
  stage.add(character.root);

  // 바닥 그림자
  const box = new THREE.Box3().setFromObject(character.root);
  const size = box.getSize(new THREE.Vector3());
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(size.x, size.z) * 0.55, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.0005;
  stage.add(shadow);

  // 탭 판정용 투명 구 (캐릭터보다 살짝 크게)
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(size.x, size.y, size.z) * 0.65, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hit.position.y = size.y / 2;
  stage.add(hit);

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
    setStatus(`▶ ${action.getClip().name}`);
  }
  mixer.addEventListener('finished', (e) => {
    if (e.action !== playing) return;
    if (idle) { idle.reset().play(); playing.crossFadeTo(idle, CONFIG.FADE, false); }
    playing = null;
  });

  // ===== 탭 =====
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let visible = false;
  window.addEventListener('pointerdown', (e) => {
    if (!visible) return;
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    if (ray.intersectObject(hit, false).length) playNext();
  });

  anchor.onTargetFound = () => { visible = true; setStatus('캐릭터를 탭해 보세요'); };
  anchor.onTargetLost = () => { visible = false; setStatus('마커 카드를 비춰 주세요'); };

  await mindar.start();
  $('intro').hidden = true;
  setStatus('마커 카드를 비춰 주세요');

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    mixer.update(clock.getDelta());
    renderer.render(scene, camera);
  });
}
