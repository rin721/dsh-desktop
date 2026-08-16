# DSH Desktop 图标资源

## 设计

应用图标以用户提供的蓝发角色插画为身份参考，保留眨眼、女仆头饰、蓝色蝴蝶结、蓝黑白配色和企鹅玩偶。图标母版改用脸部与企鹅的紧凑近景，并减少长发、腿部和服装碎饰，使 16×16 和 32×32 仍能形成可辨认的蓝色人物与黑白企鹅轮廓。图标内部使用深蓝圆角方形，圆角外保持透明，不包含文字或水印。

## 文件

| 路径 | 用途 |
| --- | --- |
| `source/character-reference.png` | 用户提供的角色参考原图，不直接进入产品界面。 |
| `source/app-icon-chroma.png` | 内置图像生成工具输出的洋红键色中间件，用于追溯。 |
| `app-icon-master.png` | 1024×1024 透明母版。 |
| `png/app-icon-<尺寸>.png` | 16、20、24、32、40、48、64、96、128、192、256、512 和 1024 像素派生资源。 |
| `app-icon.ico` | 包含 16、20、24、32、40、48、64、128 和 256 像素帧的 Windows 图标。 |
| `app-icon-contact-sheet.png` | 按最近邻放大的多尺寸视觉检查表，不进入产品 UI。 |
| `icon-manifest.json` | 母版、尺寸、字节数和 SHA-256 清单。 |

Electron 窗口使用 256 像素 PNG，启动页和错误页使用 192 像素 PNG，Electron Packager 与 Squirrel Setup 共用 `app-icon.ico`。`scripts/copy-assets.ts` 只把 192 和 256 像素 PNG 白名单复制到 renderer 资源；参考原图、键色中间件、母版、其他尺寸、联系表、清单和 ICO 不进入 ASAR。Windows EXE 图标由 Packager 写入。

## 生成规范

母版由内置图像生成工具根据参考图进行编辑生成，要求：以角色脸部和企鹅为中心近景；保留蓝发、眨眼、女仆头饰与蓝黑白配色；使用简化、平滑且高对比的动漫图标风格；把所有重要特征保持在中央安全区；使用深蓝到皇家蓝的圆角方形底板和浅蓝描边；不得出现文字、水印、额外角色或洋红内部元素。生成时圆角方形外使用均匀 `#ff00ff` 键色，随后转换为透明通道。

透明母版确认后，用带 Pillow 的 Python 3 执行确定性派生：

```powershell
python scripts/generate_icon_assets.py --input assets/icons/app-icon-master.png --output assets/icons
corepack pnpm run verify:icons
```

不要单独手工修改 PNG、ICO 或清单。更换母版后必须重新生成全部资源、查看联系表，并运行图标资源门禁。发布前还必须确认参考插画、生成母版及其衍生资源具有适用于应用分发的授权。
