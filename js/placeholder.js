// 임시 캐릭터: 키 약 12cm 크기의 둥근 2등신 덩어리 + 코드로 만든 애니메이션 클립
// 실제 캐릭터(GLB)가 준비되면 이 파일은 쓰이지 않습니다.
import * as THREE from 'three';

const H = 0.12; // 키(미터)

export function createPlaceholder() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
  const skin = mat(0x9fd8ff);
  const dark = mat(0x222233);
  const pink = mat(0xff9fb5);

  // 몸통(머리 겸용)
  const torso = new THREE.Mesh(new THREE.SphereGeometry(H * 0.42, 32, 24), skin);
  torso.scale.set(1, 0.9, 0.92);
  torso.position.y = H * 0.42;
  body.add(torso);

  // 귀
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(H * 0.11, 16, 12), skin);
    ear.position.set(s * H * 0.24, H * 0.8, 0);
    body.add(ear);
  }
  // 눈, 볼
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(H * 0.04, 12, 8), dark);
    eye.position.set(s * H * 0.13, H * 0.5, H * 0.36);
    body.add(eye);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(H * 0.05, 16), pink);
    cheek.position.set(s * H * 0.24, H * 0.4, H * 0.335);
    cheek.rotation.y = s * 0.55;
    body.add(cheek);
  }
  // 팔 (어깨 기준 회전)
  for (const [s, name] of [[-1, 'armL'], [1, 'armR']]) {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(s * H * 0.36, H * 0.42, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(H * 0.05, H * 0.12, 6, 12), skin);
    arm.position.y = -H * 0.08;
    pivot.add(arm);
    pivot.rotation.z = s * 0.5;
    body.add(pivot);
  }
  // 발
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(H * 0.08, 16, 12), skin);
    foot.scale.set(1, 0.6, 1.2);
    foot.position.set(s * H * 0.16, H * 0.04, H * 0.04);
    body.add(foot);
  }

  return { root, clips: makeClips() };
}

// ---- 애니메이션 클립 ----
const q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();
function rotTrack(name, times, eulers) {
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, eulers.flatMap((e) => q(...e)));
}
const vec = (name, prop, times, vals) => new THREE.VectorKeyframeTrack(`${name}.${prop}`, times, vals.flat());

function makeClips() {
  const idle = new THREE.AnimationClip('idle', 2, [
    vec('body', 'scale', [0, 1, 2], [[1, 1, 1], [1.03, 0.96, 1.03], [1, 1, 1]]),
    rotTrack('armL', [0, 1, 2], [[0, 0, -0.5], [0, 0, -0.65], [0, 0, -0.5]]),
    rotTrack('armR', [0, 1, 2], [[0, 0, 0.5], [0, 0, 0.65], [0, 0, 0.5]]),
  ]);
  const jump = new THREE.AnimationClip('jump', 1, [
    vec('body', 'position', [0, 0.2, 0.5, 0.8, 1], [[0, 0, 0], [0, 0, 0], [0, H * 0.6, 0], [0, 0, 0], [0, 0, 0]]),
    vec('body', 'scale', [0, 0.2, 0.35, 0.8, 0.9, 1], [[1, 1, 1], [1.2, 0.75, 1.2], [0.9, 1.15, 0.9], [1.2, 0.8, 1.2], [1, 1, 1], [1, 1, 1]]),
    rotTrack('armL', [0, 0.5, 1], [[0, 0, -0.5], [0, 0, -2.5], [0, 0, -0.5]]),
    rotTrack('armR', [0, 0.5, 1], [[0, 0, 0.5], [0, 0, 2.5], [0, 0, 0.5]]),
  ]);
  const wave = new THREE.AnimationClip('wave', 1.6, [
    rotTrack('armR', [0, 0.3, 0.5, 0.7, 0.9, 1.1, 1.6], [[0, 0, 0.5], [0, 0, 2.6], [0, 0, 2.1], [0, 0, 2.6], [0, 0, 2.1], [0, 0, 2.6], [0, 0, 0.5]]),
    rotTrack('body', [0, 0.8, 1.6], [[0, 0, 0], [0, 0, 0.12], [0, 0, 0]]),
  ]);
  const spin = new THREE.AnimationClip('spin', 1.2, [
    rotTrack('body', [0, 0.3, 0.6, 0.9, 1.2], [[0, 0, 0], [0, Math.PI / 2, 0], [0, Math.PI, 0], [0, Math.PI * 1.5, 0], [0, Math.PI * 2, 0]]),
    vec('body', 'position', [0, 0.6, 1.2], [[0, 0, 0], [0, H * 0.25, 0], [0, 0, 0]]),
  ]);
  return [idle, jump, wave, spin];
}
