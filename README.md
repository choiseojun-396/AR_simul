# AR 캐릭터 프로토타입 (마커 방식)

인쇄한 마커 카드를 책상에 놓고, 휴대폰 Chrome으로 링크를 열어 비추면 카드 위에 캐릭터가 나타납니다.
탭할 때마다 애니메이션이 **순서대로** 재생되고, 끝나면 대기(idle) 동작으로 돌아옵니다.
iOS와 Android 모두 앱 설치 없이 동작합니다.

## 폴더 구성
```
index.html                 AR 페이지
js/main.js                 AR·애니메이션·탭 로직 (맨 위 CONFIG에서 설정 변경)
js/placeholder.js          임시 캐릭터 (GLB가 없을 때 사용)
assets/marker.png          마커 카드 이미지 (인쇄용)
model/                     여기에 character.glb 를 넣으면 실제 캐릭터로 교체됨
tools/compile-marker.html  마커 이미지 → targets.mind 변환기 (선택)
```

## 1. 마커 카드 인쇄
- `assets/marker.png` 를 **가로 14.8cm (A6 가로)** 크기로 인쇄합니다.
- 다른 크기로 인쇄했다면 `js/main.js` 의 `MARKER_WIDTH_M` 값을 실제 가로 길이(미터)로 바꿔 주세요. 예: 20cm → `0.2`
- 광택지보다 무광 종이가 인식이 잘 됩니다. 휴대폰이나 모니터 화면에 띄워 테스트해도 됩니다.

## 2. GitHub Pages 배포
1. GitHub에서 새 저장소(Public)를 만듭니다.
2. **Add file → Upload files** 로 이 폴더 안의 파일을 모두 올립니다 (폴더 구조 그대로).
3. **Settings → Pages → Branch: main / (root) → Save**
4. 1~2분 뒤 `https://<아이디>.github.io/<저장소이름>/` 주소가 생깁니다.
5. 휴대폰 **Chrome(또는 Safari)**으로 열고 **AR 시작** → 카메라 허용 → 마커 카드를 비춥니다.

> 카카오톡에서 링크를 열면 자동으로 외부 브라우저로 넘어갑니다. 다른 앱 안의 브라우저에서는 안내 화면이 뜹니다.

## 3. (선택) 시작 속도 높이기
처음 실행할 때 마커 이미지를 변환하느라 수 초가 걸립니다. 미리 변환해 두면 이 시간이 없어집니다.
1. 배포된 주소 뒤에 `/tools/compile-marker.html` 을 붙여 PC 브라우저로 엽니다.
2. `marker.png` 를 선택하면 `targets.mind` 가 다운로드됩니다.
3. 그 파일을 `assets/` 폴더에 올립니다.

마커 이미지를 바꿀 때는 `assets/marker.png` 를 교체하고 `targets.mind` 를 지우거나 다시 만드세요.

## 4. Blender 캐릭터로 교체
`model/character.glb` 로 저장하면 자동으로 임시 캐릭터 대신 쓰입니다.

**모델링 규칙**
- 단위: 미터, 실제 크기 (키 0.10~0.15m)
- 원점: 발바닥 중앙 / 정면: Blender의 -Y 방향 (glTF 내보내기 시 +Z 정면으로 변환됨)
- 재질: Principled BSDF + 이미지 텍스처만 (절차적 노드·툰 셰이더는 텍스처로 베이크)
- 용량: 5MB 이하 권장 (폴리곤 ~10만, 텍스처 1K~2K)

**애니메이션**
- 동작마다 액션을 따로 만들고 이름을 붙입니다: `idle`, `jump`, `wave` …
- `idle` 은 반복 재생되는 대기 동작이고, 나머지는 탭 순서대로 1회씩 재생됩니다.
- 순서는 GLB에 들어간 순서를 따릅니다. 바꾸려면 `main.js` 의 `ANIM_ORDER: ['jump','wave']` 처럼 지정하세요.
- 각 액션을 NLA 트랙으로 푸시다운(Push Down)해 두면 모두 함께 내보내집니다.

**내보내기**: File → Export → glTF 2.0
- Format: **glTF Binary (.glb)**
- Include: Limit to Selected Objects (캐릭터와 아마추어 선택)
- Animation: ✔ Animation, Mode: **Actions** (또는 NLA Tracks)
- Mesh: ✔ Apply Modifiers

## 동작 조건
- HTTPS 필수 (GitHub Pages는 자동 HTTPS)
- iOS 15 이상 Safari/Chrome, Android Chrome (카메라 있는 기기)
