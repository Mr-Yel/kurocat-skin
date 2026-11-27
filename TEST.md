# 换形象测试说明

## 一、装

下载 `dist/KuroCat-custom-skin-setup.exe`（2.42 MB，未签名）。

- SmartScreen 会拦一次 → 「更多信息」→「仍要运行」
- 如果之前装过官方 KuroCat，会**覆盖安装**，但数据目录共用（`%APPDATA%\com.kurocat.pet`），已有的猫配置不会丢

## 二、让程序生成数据目录

装完启动一次，等它出现在桌面上，然后**完全退出**：

> 托盘图标右键 → 退出

只在任务管理器结束进程不算，托盘菜单退出才会写盘。

## 三、放形象

双击仓库根目录的 `install-skin.bat`。

它会把这 4 帧 + 配置复制到：

```
%APPDATA%\com.kurocat.pet\skins\
  idle.png
  blink.png
  shy.png
  happy.png
  skin.json
```

脚本会列目录确认，按任意键关闭。

## 四、重启看结果

重新打开 KuroCat。

| 现象 | 含义 |
|---|---|
| 出来橙发灰卫衣的 Q 版角色 | ✅ 通道生效 |
| 还是原来的黑猫 | ❌ 没命中，见下方排查 |
| 白屏 / 报错 | ❌ 资源协议被拦 |

## 五、失败怎么排查

这版开了 devtools。窗口上按 `F12`（或右键 → 检查）打开控制台，看三类输出：

1. `[KuroCat] custom skin loaded: ...` → 已加载，问题在渲染
2. `[KuroCat] custom skin skipped ...` → 加载失败，看后面跟的报错
3. 完全没日志 → 说明 `isTauriRuntime()` 判定失败或程序目录不对

同时手动确认文件在位：

```cmd
dir "%APPDATA%\com.kurocat.pet\skins"
```

## 六、换自己的形象

按同样规格放 4 张 PNG 覆盖即可，**不需要重新编译**：

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

1. **检测到 `skins\idle.png` 就强制用 2D 精灵**，菜单里切换猫会被覆盖。当前是刻意如此，验证完再补正规开关。
2. 原版默认 3D 渲染，你的形象在 2D 引擎上，代码里已做强制切换。
3. 4 帧之间没有补间，动作是硬切。要更顺需要加帧或插值。
