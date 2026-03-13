# Lightbox 图片缩放功能

## 背景

当前 ImageLightbox 组件仅支持查看图片和 HD 升级，不支持缩放。用户需要在 lightbox 中放大/缩小图片以查看细节。

## 改动范围

仅修改 `apps/web/src/components/chat/ImageLightbox.tsx`，纯前端 UI 增强，无后端变更。

## 实现方案

使用 `yet-another-react-lightbox` 自带的 Zoom 插件。该插件已包含在项目依赖中（v3.29.1），无需额外安装。

## 插件配置

```typescript
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
```

Lightbox 组件添加 `plugins={[Zoom]}` 和 `zoom` 配置：

```typescript
zoom={{
  maxZoomPixelRatio: 2,       // 最大缩放到图片原始像素的 2 倍
  scrollToZoom: true,          // 启用滚轮缩放
  zoomInMultiplier: 1.5,       // 每次缩放操作的倍率
  doubleClickMaxStops: 2,      // 双击最大缩放档位
  keyboardMoveDistance: 50,     // 键盘平移距离
}}
```

## 交互方式

Zoom 插件原生支持以下交互，无需自定义代码：

| 交互 | 行为 |
|------|------|
| 滚轮 | 以鼠标位置为中心缩放 |
| 双击 | 在 1x 和最大缩放之间切换 |
| 拖拽 | 缩放后拖拽平移图片 |
| 键盘 | 方向键平移，+/- 缩放 |
| 工具栏按钮 | 插件自动在工具栏添加放大/缩小按钮 |

## 自定义 slide 渲染的调整

当前组件使用 `render.slide` 自定义渲染图片和 HD 升级按钮。Zoom 插件需要控制图片的渲染才能实现缩放，因此需要调整：

- 移除自定义 `render.slide`，让 Zoom 插件接管图片渲染
- HD 升级按钮移到 toolbar 区域，通过 `toolbar.buttons` 配置添加自定义按钮

```typescript
toolbar={{
  buttons: [<HdUpgradeButton />, "zoom", "close"],
}}
```

其中 `"zoom"` 是 Zoom 插件注册的单个 toolbar key，内部包含放大和缩小两个按钮。

`HdUpgradeButton` 是从 `render.slide` 中提取出的独立组件，通过 props 接收 `hasHd`、`onUpgradeToHd`、`isUpgrading` 状态。仅在 `hasHd && onUpgradeToHd` 时渲染，否则返回 null。

## 按钮布局

```
[HD升级] [Zoom -/+] [Close]
```

- `"zoom"` key 渲染为一个包含放大/缩小的组合按钮
- HD 升级按钮仅在 hasHd 时显示（现有逻辑不变）
- 工具栏位于 lightbox 顶部

## 重置行为

- Zoom 插件在 lightbox 关闭时自动重置缩放状态
- 图片 URL 变化（HD 升级）时：由于是单 slide lightbox 且仅 `src` 属性变化，缩放级别可能不会自动重置。实现时需验证此行为，如果缩放不重置，则通过 `ZoomRef` 手动调用 `changeZoom(1)` 将缩放重置为 1x

## 测试

前端无组件测试框架（项目现状），通过手动验证：

- 滚轮缩放：鼠标位置为中心，放大/缩小
- 工具栏按钮：点击放大/缩小按钮
- 双击缩放：双击图片放大，再双击还原
- 拖拽平移：缩放后拖拽图片
- 长图：高度超出屏幕的图片在缩放后可拖拽查看
- 重置：关闭 lightbox 后重新打开，缩放回到默认
- HD 升级：toolbar 中的 HD 按钮正常工作
