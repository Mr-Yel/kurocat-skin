# 换形象测试说明

## 零、先解决「装了但看不到宠物」

KuroCat 会把窗口坐标写进 `%APPDATA%\kuro-cat-pet\settings.json`。如果这台机器有虚拟显示器（如 ToDesk 虚拟屏），`x` 可能被写成负数，窗口就落在主屏左侧外面，进程在跑但屏幕上什么都没有。

已实测踩过一次：`x = -645`。修法：

1. 完全退出 KuroCat（托盘右键退出，或任务管理器结束）
2. 用记事本打开 `%APPDATA%\kuro-cat-pet\settings.json`
3. 把 `"x"` / `"y"` 改成正数，主屏 3200×2000 时可用 `"x": 2300, "y": 1250`
4. 重新启动

## 一、装

**装 `dist/KuroCat-custom-skin-setup.exe`（2.42 MB），不要装 `vendor/kurocat/installer/` 里的那个官方包。**

判断方法：官方 5.1.3 的 exe 文件属性里 `FileVersion = 5.1.3`；自编译版同样显示 5.1.3（没改版本号），但安装包体积、SHA-256 不同。最可靠的区分是运行后按 `F12` 能否打开控制台 —— 只有自编译版开了 `devtools`。

- SmartScreen 会拦一次 → 「更多信息」→「仍要运行」
- 会覆盖官方版安装，数据目录共用 `%APPDATA%\kuro-cat-pet`，已有配置不丢

## 二、让程序生成数据目录

装完启动一次，然后**完全退出**：

> 托盘图标右键 → 退出

只在任务管理器结束进程不算，托盘菜单退出才会写盘。

## 三、放形象

双击仓库根目录的 `install-skin.bat`。

它会把 4 帧 + 配置复制到：

```
%APPDATA%\kuro-cat-pet\skins\
  idle.png
  blink.png
  shy.png
  happy.png
  skin.json
```

脚本会自动识别 `kuro-cat-pet` 或旧的 `com.kurocat.pet`，并列出目录确认。

## 四、重启看结果

| 现象 | 含义 |
|---|---|
| 出来橙发灰卫衣的 Q 版角色 | ✅ 通道生效 |
| 还是原来的黑猫 | ❌ 没命中，见下方排查 |
| 白屏 / 报错 | ❌ 资源协议被拦 |
| 进程在跑但屏幕全空 | 窗口坐标问题，见第零节 |

## 五、失败怎么排查

这版开了 devtools。窗口上按 `F12`（或右键 → 检查）打开控制台，看三类输出：

1. `[KuroCat] custom skin loaded: ...` → 已加载，问题在渲染
2. `[KuroCat] custom skin skipped ...` → 加载失败，看后面跟的报错
3. 完全没日志 → `isTauriRuntime()` 判定失败或目录不对

手动确认文件在位：

```cmd
dir "%APPDATA%\kuro-cat-pet\skins"
```

## 六、换自己的形象

按规格放 4 张 PNG 覆盖即可，**不需要重新编译**：

| 文件 | 必需 | 内容 |
|---|---|---|
| `idle.png` | ✅ 必需 | 待机 |
| `blink.png` | 可选 | 眨眼，缺失则用 idle |
| `shy.png` | 可选 | 害羞/被摸 |
| `happy.png` | 可选 | 开心 |

规格：透明底 PNG，比例约 4:5（推荐 224×278），角色居中、脚底贴底、全身留一点边距。

`skin.json` 四个开关，默认全 `false`：

```json
{
  "name": "我的形象",
  "hands": false,
  "tail": false,
  "eyeGaze": false,
  "blush": false
}
```

- `hands` —— 程序化圆手搭在键盘上（原角色专用锚点，换形象会手长错位置）
- `tail` —— 鲸尾摆动（同上）
- `eyeGaze` —— Canvas 画的视线跟随（坐标按原角色眼睛位置）
- `blush` —— 运行时叠加腮红

除非你把这个形象的锚点标定好，否则全关才是正确观感。

## 七、已知限制

1. **检测到 `skins\idle.png` 就强制用 2D 精灵**，菜单里切换猫会被覆盖。当前刻意如此，验证完再补正规开关。
2. 原版默认 3D 渲染，自定义形象在 2D 引擎上，代码已做强制切换。
3. 4 帧之间没有补间，动作是硬切。要更顺需要加帧或插值。
4. Rust 端数据目录是 `%APPDATA%\kuro-cat-pet`（`src-tauri/src/config.rs` 硬编码），Tauri 的 `appDataDir()` 给的是 `%APPDATA%\com.kurocat.pet`，两者不一致。加载器已同时探测两个位置。
