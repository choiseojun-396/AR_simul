# AR 캐릭터 프로토타입 (자이로 방식)

휴대폰 Chrome/Safari로 링크를 열면 카메라 화면 위에 캐릭터가 나타납니다. 마커 카드는 필요 없습니다.
폰을 돌리면 캐릭터가 그 자리에 있는 것처럼 보이고, 탭할 때마다 애니메이션이 **순서대로** 재생된 뒤 대기(idle)로 돌아옵니다.
iOS와 Android 모두 앱 설치 없이 동작합니다.

> 한계: 폰의 **회전**만 반영되고 **이동**은 반영되지 않습니다. 걸어가면 캐릭터가 따라옵니다.
> 캐릭터가 시야에서 벗어나면 오른쪽 위 **캐릭터 앞으로** 버튼을 누르세요.

## 폴더 구성
```
index.html          AR 페이지
js/main.js          카메라·자이로·애니메이션·탭 로직 (맨 위 CONFIG에서 설정 변경)
js/placeholder.js   임시 캐릭터 (GLB가 없을 때 사용)
model/              여기에 character.glb 를 넣으면 실제 캐릭터로 교체됨
```

## 배포 (GitHub Pages)
1. 저장소에 위 파일을 폴더 구조 그대로 업로드 → Commit changes
2. Settings → Pages → Branch: main / (root) → Save
3. `https://<아이디>.github.io/<저장소이름>/` 을 휴대폰에서 열고 **AR 시작** → 카메라·동작(모션) 권한 허용

## 설정 (js/main.js 의 CONFIG)
- `DISTANCE`: 캐릭터까지 거리 (기본 0.4m)
- `HEIGHT`: 눈높이 기준 캐릭터 높이 (기본 -0.2m = 20cm 아래, 책상 높이 느낌)
- `SMOOTH`: 떨림 보정 (작을수록 부드럽지만 반응이 느림)
- `ANIM_ORDER`: 탭 순서 지정, 예: `['jump','wave','spin']`

## Blender 캐릭터로 교체
`model/character.glb` 로 저장하면 자동으로 임시 캐릭터 대신 쓰입니다.

**모델링 규칙**
- 단위: 미터, 실제 크기 (키 0.10~0.15m)
- 원점: 발바닥 중앙 / 정면: Blender의 -Y 방향
- 재질: Principled BSDF + 이미지 텍스처만 (절차적 노드·툰 셰이더는 텍스처로 베이크)
- 용량: 5MB 이하 권장 (폴리곤 ~10만, 텍스처 1K~2K)

**애니메이션**
- 동작마다 액션을 만들고 이름을 붙입니다: `idle`, `jump`, `wave` …
- `idle` 은 반복, 나머지는 탭 순서대로 1회씩 재생됩니다.
- 각 액션을 NLA 트랙으로 푸시다운(Push Down)해 두면 모두 함께 내보내집니다.

**내보내기**: File → Export → glTF 2.0
- Format: **glTF Binary (.glb)** / Limit to Selected Objects
- Animation: ✔ Animation, Mode: **Actions** / Mesh: ✔ Apply Modifiers

## 동작 조건
- HTTPS 필수 (GitHub Pages는 자동)
- iOS: 시작 시 "동작 및 방향" 권한 팝업에서 **허용** 필요
- Android Chrome: 별도 권한 없이 자이로 동작
