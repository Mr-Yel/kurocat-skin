# KuroCat 外部角色包 v2

这份格式只用于本地自定义构建。角色素材放在：

```text
%APPDATA%\kuro-cat-pet\skins\
```

`character.json` 是入口，角色目录不能引用 `..`、绝对路径或盘符路径。旧的
`idle.png` / `blink.png` / `shy.png` / `happy.png` 目录仍然兼容。

## 为什么手会被鼠标挡住

KuroCat 原来的绘制顺序是：

1. 绘制整张角色图，图中的手也一起画完。
2. 绘制迷你鼠标和键盘。
3. 绘制程序化前景手臂。

第三方角色通常把身体和手烘焙在同一张 PNG 中，所以第 2 步一定会盖住第 1
步中的手。解决办法不是再抬高整张身体图，而是把素材拆成：

- `body.png`：不包含需要覆盖到鼠标前面的手；
- `hand-left.png` / `hand-right.png`：只包含手及其透明背景；
- 在 `character.json` 中把手层标成 `foreground`。

v2 渲染器会在鼠标和键盘绘制完成后再画手层，因此手可以压在鼠标上。

只把整只手拆出来还不够。手向鼠标移动时，身体上的袖口不会跟着动；如果手图层又只有
手套、没有前臂，移动后就会露出断层。新格式要求给手指定一个身体上的 `joint`（肩点）
以及 `maxReach`（从肩点到手腕的最大物理距离）。渲染器会：

- 先把鼠标目标限制在以 `joint` 为圆心的 `maxReach` 范围内；
- 再把手的自由位移限制在 `maxDistance` 内；
- 从肩点到实际手腕绘制一条与袖口同色的连接臂；
- 最后绘制手套，因此手套始终盖在迷你鼠标上方。

旧包不写连接配置时仍按原来的自由平移方式工作。新素材建议始终配置 `joint`、
`maxReach` 和 `connector`。

## 眼睛怎样跟随鼠标

不要打开旧版 `skin.json` 里的 `eyeGaze`。那个开关使用大肥鱼专用的瞳孔坐标、
刘海裁切和颜色，套到其他角色上会错位。

v2 的做法是：

- 身体帧和 `eye-details` 图层保留眼眶、睫毛、眉毛和眼皮线；
- 左右瞳孔分别做成透明图层；
- 每个瞳孔层单独设置 `role: "pupil-left"` / `"pupil-right"`、`anchor`
  和 `gaze.maxX/maxY`；
- `eye-details`、眉毛、眼影、腮红等不能移动的像素不要放进瞳孔图。

渲染器会根据系统真实鼠标位置，在锚点附近平移瞳孔层。`maxX` / `maxY` 是屏幕像素，
不是瞳孔图层的原始尺寸比例。默认值为 `2.5 / 1.8`；通常建议从 `1.5-3` 开始，
不要再用旧版的 `5 / 4`。`motion.gazeSmoothing` 控制追随速度，范围 `2-36`，
默认 `13`；数值越小越柔和，越大越灵敏。

如果两只眼睛画在同一张图里，它们会作为整体移动，无法只移动瞳孔。眼睛图层包含
眉毛、眼皮、高光或其他静态线稿时，也会一起抖动，这是素材分层问题，不是渲染器
可以在不破坏原画的前提下可靠推断的。

## 拖拽与“被拎起来”

外部角色默认通过整体上提、速度后仰和轻微侧摆来模拟被拎起：

- `motion.dragLift`：拖拽时身体上提的像素，默认 `20`；
- `motion.dragSway`：拖拽速度造成的侧向摆动幅度，默认 `7`；
- `motion.dragTiltDeg`：拖拽速度造成的最大倾角，默认 `4.5`；
- `motion.dragAnimation`：可选动画名，拖拽时播放该动画帧；不设置时保持当前动作。

需要更明显的“后颈皮被拎住”素材时，可以提供 `dragged-0.png`、
`dragged-1.png` 等帧，并在 `animations` 下命名为 `dragged`，然后设置：

```json
"motion": {
  "dragAnimation": "dragged",
  "dragLift": 24,
  "dragSway": 9,
  "dragTiltDeg": 6
}
```

## 角色声音

外部角色不会自动继承猫的呼噜、鼻尖、尾巴和落地音。导入角色如果没有提供
`audio.purr`，角色相关声音会保持静音；打字音效和系统通知音不受影响。

如果角色有自己的循环呼噜或呼吸声：

```json
"audio": {
  "purr": "purr-loop.ogg"
}
```

声音文件会按角色目录解析，只在鼠标抚摸角色、角色处于放松状态时循环播放。
素材应尽量做成首尾可无缝循环、响度统一的 OGG/WAV/MP3。加载或解码失败时保持
静音，不会回退到猫的呼噜声。

## 完整示例

目录：

```text
skins/my-character/
  character.json
  idle-0.png
  idle-1.png
  blink.png
  happy-0.png
  happy-1.png
  body.png
  eye-details.png
  pupil-left.png
  pupil-right.png
  left-hand.png
  right-hand.png
  purr-loop.ogg
```

`character.json`：

```json
{
  "schemaVersion": 2,
  "id": "my-character",
  "name": "我的角色",
  "renderer": "sprite2d",
  "canvas": {
    "width": 224,
    "height": 278,
    "drawWidth": 262,
    "baseY": 364,
    "pivotOffset": 48
  },
  "animations": {
    "idle": {
      "frames": ["idle-0.png", "idle-1.png"],
      "fps": 4,
      "loop": true
    },
    "blink": {
      "frames": ["blink.png"],
      "fps": 12,
      "loop": false
    },
    "happy": {
      "frames": ["happy-0.png", "happy-1.png"],
      "fps": 8,
      "loop": false
    }
  },
  "layers": [
    {
      "id": "eye-details",
      "file": "eye-details.png",
      "role": "eye-details",
      "actions": ["idle", "happy"],
      "anchor": [0.5, 0.47]
    },
    {
      "id": "pupil-left",
      "file": "pupil-left.png",
      "role": "pupil-left",
      "actions": ["idle", "happy"],
      "anchor": [0.43, 0.47],
      "gaze": { "maxX": 2.2, "maxY": 1.5 }
    },
    {
      "id": "pupil-right",
      "file": "pupil-right.png",
      "role": "pupil-right",
      "actions": ["idle", "happy"],
      "anchor": [0.57, 0.47],
      "gaze": { "maxX": 2.2, "maxY": 1.5 }
    },
    {
      "id": "left-hand",
      "file": "left-hand.png",
      "role": "hand-left",
      "anchor": [0.22, 0.80],
      "followMouse": {
        "offsetX": 0,
        "offsetY": -3,
        "pressOffsetY": 2.5,
        "maxDistance": 24,
        "joint": [0.32, 0.64],
        "maxReach": 90,
        "connector": {
          "width": 14,
          "color": "#b9bcc0",
          "outlineColor": "#202126",
          "outlineWidth": 2.5,
          "bend": 0.12
        }
      }
    },
    {
      "id": "right-hand",
      "file": "right-hand.png",
      "role": "hand-right",
      "anchor": [0.78, 0.80],
      "followMouse": false
    }
  ],
  "motion": {
    "mouseLean": -14,
    "gazeSmoothing": 12,
    "dragLift": 22,
    "dragSway": 8,
    "dragTiltDeg": 5
  },
  "audio": {
    "purr": "purr-loop.ogg"
  }
}
```

## 字段说明

### `canvas`

- `width` / `height`：素材设计画布尺寸。
- `drawWidth`：桌面上实际绘制宽度。默认 262。
- `baseY` / `pivotOffset`：角色与键盘的相对位置。一般不需要改。

### `animations`

- 必须有 `idle`。
- `frames` 可以是文件名，也可以写成
  `{ "file": "idle-1.png", "durationMs": 180 }`。
- `fps` 控制没有逐帧 `durationMs` 时的播放速度。
- 帧数不限于 4 帧。
- 约定动画名：`idle`、`blink`、`happy`、`shy`。缺少某个表情时会回退到 `idle`。
- 所有帧应使用相同画布，只修改局部，避免角色位置跳动。

### `layers`

- `role: "eye-details"`：绘制在身体上、鼠标和键盘下，只放眉毛、眼皮、睫毛等静态细节。
- `role: "pupil-left"` / `"pupil-right"`：左右瞳孔独立图层，绘制在身体上、鼠标和键盘下，并启用眼动。
- `role: "eyes"` / `"eye-left"` / `"eye-right"`：旧版兼容角色；会把整张眼睛图一起移动，新素材不建议使用。
- `role: "hand-left"` / `"hand-right"`：默认绘制在鼠标和键盘上，可设置鼠标跟随。
- `role: "back"`：画在身体后面。
- `role: "accessory"` / `"front"`：前景装饰层。
- `foreground: true` 可以强制任意图层进入前景。
- `actions` 限定图层只在这些动画中显示；省略表示所有动作都显示。眼睛层通常至少排除
  `blink` / `shy` 这类闭眼动作。
- `anchor` 是图层动作旋转/平移的中心，使用 `[0..1, 0..1]`。瞳孔层最好填瞳孔中心。
- `gaze.maxX` / `gaze.maxY` 是瞳孔相对锚点的最大屏幕像素位移；`false` 关闭眼动。
- `followMouse.joint` 是袖口或肩膀在角色画布中的归一化坐标。
- `followMouse.maxReach` 是从肩点到手腕的最大像素距离，应覆盖袖长和自然伸展范围。
- `followMouse.maxDistance` 是手套相对静止位置的最大自由位移，过大时会明显拉长手臂。
- `followMouse.connector` 是可选的连接臂样式；省略或设为 `false` 时只移动手套，不画连接臂。

图层文件必须是透明 PNG/WebP/JPEG；推荐 PNG 或 WebP。每个图层建议使用与
`canvas.width` / `canvas.height` 相同的尺寸，透明区域留空，这样坐标最容易对齐。

### `motion`

- `mouseLean`：鼠标活跃时身体侧倾的像素偏移。
- `gazeSmoothing`：瞳孔追随平滑度，范围 `2-36`。
- `dragAnimation`：可选的拖拽动画名。
- `dragLift`：拖拽时身体上提的像素。
- `dragSway`：拖拽速度造成的侧向摆动。
- `dragTiltDeg`：拖拽速度造成的最大倾角，单位为度。

### `audio`

- `purr`：角色自己的循环呼噜/呼吸音频文件；省略或设为 `null` 时不播放任何角色声音。
- 角色包不会继承猫的呼噜、鼻尖声、尾巴声和落地声。

## 素材拆分检查表

新角色量产前建议逐项确认：

1. 身体帧不要烘焙会跟随鼠标移动的独立部件。
2. 左右瞳孔分别导出，眉毛、眼皮、睫毛和眼影留在 `eye-details.png`。
3. 手和手套从身体帧中拆出，前景手图层需要覆盖迷你鼠标。
4. 在 `followMouse.joint` 标出袖口/肩点，并用 `maxReach` 限制伸长。
5. 需要跟随时才配置 `connector`，颜色应接近袖口并保留外轮廓。
6. 需要自定义被拎起姿态时提供 `dragged` 动画；不做额外动画时仍会自动上提和摆动。
7. 角色不是猫时不要配置猫叫素材；没有合适的循环声就保持 `audio.purr: null`。

## 3D 预留

`renderer` 已保留以下值：

```text
sprite2d
gltf3d
vrm
```

当前构建实际启用的是 `sprite2d`。`gltf3d` / `vrm` 会被识别但暂不渲染，也不会
破坏其他 2D 角色。后续 3D 渲染器只需要消费同一个角色目录，不需要改角色切换
和右键菜单。

## 添加新角色

1. 在 `skins/` 下新建一个 ASCII 名称目录。
2. 放入 `character.json` 和全部素材。
3. 运行项目根目录的 `install-skin.bat`。它会完整复制角色目录（包括帧图片所在的子目录）。
4. 完全退出 KuroCat，再启动。
5. 在主窗口右键菜单的“角色外观”中选择新角色。

只有一个角色时可以在运行时直接替换图片再重启，不需要改代码。增加多个角色时，
`install-skin.bat` 会根据 `idle.png` 或 `character.json` 自动生成
`characters.json`。

浏览器预览也可以直接加载角色目录：

```text
http://localhost:1420/?skins=/skins/my-character
```

预览模式下鼠标移动、左右键和眼睛跟随走与桌面版相同的外部渲染路径；正式桌面版仍由
Tauri 原生全局输入钩子提供鼠标数据。
