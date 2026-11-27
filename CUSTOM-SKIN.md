# KuroCat 自定义精灵皮肤分支

基于 [qianyiai/KuroCat](https://github.com/qianyiai/KuroCat) **v5.1.3**（commit `1df9f3f`，MIT）的 fork，目的只有一个：**让桌宠形象可以由外部图片替换，不需要重新编译**。

## 与原版的差异

| 文件 | 改动 |
|---|---|
| `src-tauri/tauri.conf.json` | 开启 `assetProtocol`，scope 限定 `$APPDATA/**`，让前端能加载 AppData 下的图片 |
| `src/customSkin.ts` | 新增。探测 `%APPDATA%\com.kurocat.pet\skins\` 并产出 4 帧图片 URL |
| `src/dafeiyuRenderer.ts` | 支持运行时替换 4 帧素材；手/鲸尾/眼动/腮红四类程序化部件改为可开关 |
| `src/catEngine.ts` | 新增 `setCustomSpriteSkin()` 转发 |
| `src/main.ts` | 启动时自动加载外部皮肤，命中则强制走 2D 精灵渲染 |
| `.github/workflows/build-win.yml` | 新增。手动触发，只构建 Windows NSIS 安装包 |

## 换形象怎么用

1. 装一次新版 KuroCat 并启动过一次（让 AppData 目录生成），然后完全退出（托盘图标 → 退出）。
2. 双击本目录的 `install-skin.bat`，它会把 `skins\` 里的 4 张图复制到 `%APPDATA%\com.kurocat.pet\skins\`。
3. 重新打开 KuroCat，形象已替换。

## 素材规格

| 文件 | 必需 | 说明 |
|---|---|---|
| `idle.png` | ✅ | 待机。建议 224×278，透明背景 |
| `blink.png` | 可选 | 眨眼。缺失自动回退到 idle |
| `shy.png` | 可选 | 害羞/被摸。缺失回退 idle |
| `happy.png` | 可选 | 开心。缺失回退 idle |
| `skin.json` | 可选 | 见下 |

图片会被 `drawImage` 拉伸到 224×278 的绘画框，所以**比例应接近 4:5**，否则会变形。

## skin.json

```json
{
  "name": "显示名",
  "hands": false,
  "tail": false,
  "eyeGaze": false,
  "blush": false
}
```

四个开关对应原版为「大肥鱼」定制的程序化部件：

| 开关 | 含义 | 换新形象时 |
|---|---|---|
| `hands` | 圆手 + 喇叭袖，会跟着键盘/鼠标移动 | 建议 `false`，否则手会浮在错误位置 |
| `tail` | 鲸尾，会摆动、拍键盘 | 建议 `false` |
| `eyeGaze` | Live2D 风格眼动（含刘海重新合成） | 建议 `false`，眼部坐标是按原角色标的 |
| `blush` | 程序化腮红 | 建议 `false`，脸颊坐标同样是写死的 |

全部缺省即为 `false`。等以后为某个形象标定了锚点，再单独打开。

## 构建

GitHub Actions → **Build Windows Installer** → Run workflow。

产物在 Artifacts：`kurocat-windows-installer`（NSIS 安装包）。本地不需要装 Rust。

## 已知限制

- 只有 2D 渲染支持自定义精灵；3D 模式仍是原版的参数化猫。
- 一旦检测到 `skins\idle.png`，启动时就会强制切到该形象，菜单里切猫会被覆盖。这是刻意的（当前只服务"换一张图"这一个目标）。
- 4 帧的 `blink/shy/happy` 需要与 `idle` 像素级对齐，否则切帧会抖。生成时应基于同一张图做局部编辑，而不是重新生成。
- 上游仍在高频迭代（6 天 5 个版本），merge 成本会持续累积。
