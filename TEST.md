# 换形象测试说明

## 零、先解决「装了但看不到宠物」

KuroCat 会把窗口坐标写进 `%APPDATA%\kuro-cat-pet\settings.json`。如果这台机器有虚拟显示器（如 ToDesk 虚拟屏），`x` 可能被写成负数，窗口就落在主屏左侧外面，进程在跑但屏幕上什么都没有。

已实测踩过一次：`x = -645`。修法：

1. 完全退出 KuroCat（托盘右键退出，或任务管理器结束）
2. 用记事本打开 `%APPDATA%\kuro-cat-pet\settings.json`
3. 把 `"x"` / `"y"` 改成正数，主屏 3200×2000 时可用 `"x": 2300, "y": 1250`
4. 重新启动

## 一、装

**用 `out/KuroCat-portable.exe`（5.0 MB，绿色版，覆盖即用），或 `out/KuroCat-custom-skin-setup.exe`（NSIS 安装包）。**

不要装 `vendor/kurocat/installer/` 里那个官方包。

- 官方 5.1.3 与自编译版版本号相同（没改 version），靠体积和 SHA-256 区分
- 只有自编译版开了 `devtools`，按 `F12` 能打开控制台
- 绿色版替换方法：先托盘退出，再把文件改名成 `KuroCat.exe` 覆盖安装目录里的同名文件
- 数据目录共用 `%APPDATA%\kuro-cat-pet`，已有配置不丢

## 二、让程序生成数据目录

装完启动一次，然后**完全退出**：

> 托盘图标右键 → 退出

只在任务管理器结束进程不算，托盘菜单退出才会写盘。

## 三、放形象

双击仓库根目录的 `install-skin.bat`。

它会把 4 帧 + 配置复制到 `kuro-cat-pet` 和 `com.kurocat.pet` 两处（两个路径都可能被读），并生成角色清单 `characters.json`：

```
%APPDATA%\kuro-cat-pet\skins\
  characters.json     <- 自动生成
  idle.png blink.png shy.png happy.png skin.json   <- 角色 A（根目录）
  mychar\
    idle.png blink.png shy.png happy.png skin.json <- 角色 B（子目录）
```

**要加第二个角色**：在 `skins\` 下建一个**英文名**子目录，放 4 帧进去，重跑 `install-skin.bat`，清单会自动更新。

## 四、重启看结果

打开菜单 →「外观」→「角色外观」，会看到原来的 7 个内置条目**之外**多出 `🐾 你的形象`。点它切换，点「大肥鱼」可以切回原版。

| 现象 | 含义 |
|---|---|
| 菜单多出 `🐾 测试形象`，点了变成橙发 Q 版角色 | ✅ 通道生效 |
| 菜单没有新条目 | ❌ 清单没生成或目录不对 |
| 有条目但点了没反应 / 白屏 | ❌ 资源协议被拦，见第五节 |
| 进程在跑但屏幕全空 | 窗口坐标问题，见第零节 |

首次升级时程序会自动把「大肥鱼」选中的状态迁移到你的形象上（一次性），之后就完全按你点的来，并且记住。

## 五、失败怎么排查

这版开了 devtools。窗口上按 `F12` 打开控制台，看三类输出：

1. `[KuroCat] sprite roots = ...` → 列出了尝试过的目录
2. `[KuroCat] sprite characters = sprite-root(测试形象)` → 清单解析成功
3. `[KuroCat] sprite probe failed { dir, idle, status }` → 哪个文件读不到、HTTP 状态码是多少

`status: 403` 表示资源协议 scope 没覆盖该目录（`tauri.conf.json` 的 `assetProtocol.scope`）；
`status: 404` 表示路径不对或文件名大小写不符。

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

## 七、当前实现说明

1. **导入角色是独立条目**，不再劫持大肥鱼。引擎里只有 `dafeiyu` 分支走精灵渲染器，所以切换原理仍是「借用该分支 + 运行时换图」，但菜单里是各自独立的项，点大肥鱼会恢复原版 4 张图。
2. **Rust 端会校验 breed**：`update_settings` 里未知 id 会被重置为 `black`。已加 `is_sprite_breed()` 放行 `sprite-` 前缀，所以 id 必须是 `sprite-` 开头、全部小写字母数字与连字符（`sanitize_cat_id` 规则）。
3. **4 帧之间没有补间**，动作是硬切。要更顺需要加帧或插值。
4. **数据目录双轨**：Rust 端是 `%APPDATA%\kuro-cat-pet`（`config.rs` 硬编码），Tauri 的 `$APPDATA` / `appDataDir()` 是 `%APPDATA%\com.kurocat.pet`。资源 scope 必须同时覆盖 `$DATA/kuro-cat-pet/**` 与 `$APPDATA/**`，否则 403。
5. **3D 渲染会强制关闭**：精灵角色在 2D 引擎，`wants3DNow()` 已排除 `sprite-` 前缀。
