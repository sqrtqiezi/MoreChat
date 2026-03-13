# Lightbox 图片缩放 实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ImageLightbox 组件添加图片缩放功能（滚轮缩放 + 工具栏按钮）

**Architecture:** 使用 `yet-another-react-lightbox` 自带的 Zoom 插件替代当前的自定义 `render.slide` 渲染。HD 升级按钮从 slide 内部移到 toolbar 区域。

**Tech Stack:** React, yet-another-react-lightbox (v3.29.1) Zoom plugin

---

## Chunk 1: 实现缩放功能

**Spec:** `docs/superpowers/specs/2026-03-13-lightbox-zoom-design.md`

### Task 1: 添加 Zoom 插件并移除自定义 slide 渲染

**Files:**
- Modify: `apps/web/src/components/chat/ImageLightbox.tsx`

- [ ] **Step 1: 添加 Zoom 插件 import 和配置**

在 `ImageLightbox.tsx` 中添加 Zoom 插件导入：

```typescript
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
```

在 `<Lightbox>` 组件上添加 `plugins` 和 `zoom` 配置：

```typescript
plugins={[Zoom]}
zoom={{
  maxZoomPixelRatio: 2,
  scrollToZoom: true,
  zoomInMultiplier: 1.5,
  doubleClickMaxStops: 2,
  keyboardMoveDistance: 50,
}}
```

- [ ] **Step 2: 将 HD 升级按钮从 render.slide 移到 toolbar**

移除整个 `render.slide` 自定义渲染。保留 `render.buttonPrev` 和 `render.buttonNext` 为 null（单图不需要导航按钮）。

将 HD 升级按钮作为自定义 toolbar 按钮。在组件内定义 `HdUpgradeButton`：

```typescript
function HdUpgradeButton({ hasHd, onUpgradeToHd, isUpgrading, onUpgrade }: {
  hasHd?: boolean;
  onUpgradeToHd?: () => void;
  isUpgrading: boolean;
  onUpgrade: () => void;
}) {
  if (!hasHd || !onUpgradeToHd) return null;
  return (
    <button
      type="button"
      onClick={onUpgrade}
      disabled={isUpgrading}
      className="yarl__button"
      style={{ color: 'white' }}
    >
      {isUpgrading ? '加载中...' : '升级到高清'}
    </button>
  );
}
```

使用 `yarl__button` CSS 类以匹配 lightbox 工具栏按钮的原生样式。

在 `<Lightbox>` 上配置 toolbar：

```typescript
toolbar={{
  buttons: [
    <HdUpgradeButton
      key="hd-upgrade"
      hasHd={hasHd}
      onUpgradeToHd={onUpgradeToHd}
      isUpgrading={isUpgrading}
      onUpgrade={handleUpgrade}
    />,
    "zoom",
    "close",
  ],
}}
```

- [ ] **Step 3: 完整的修改后组件代码**

最终 `ImageLightbox.tsx` 应为：

```typescript
// ABOUTME: Lightbox component for viewing images with zoom and optional HD upgrade
// ABOUTME: Uses yet-another-react-lightbox library with Zoom plugin

import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  hasHd?: boolean;
  onUpgradeToHd?: () => void;
}

function HdUpgradeButton({ hasHd, onUpgradeToHd, isUpgrading, onUpgrade }: {
  hasHd?: boolean;
  onUpgradeToHd?: () => void;
  isUpgrading: boolean;
  onUpgrade: () => void;
}) {
  if (!hasHd || !onUpgradeToHd) return null;
  return (
    <button
      type="button"
      onClick={onUpgrade}
      disabled={isUpgrading}
      className="yarl__button"
      style={{ color: 'white' }}
    >
      {isUpgrading ? '加载中...' : '升级到高清'}
    </button>
  );
}

export function ImageLightbox({ isOpen, onClose, imageUrl, hasHd, onUpgradeToHd }: ImageLightboxProps) {
  const [isUpgrading, setIsUpgrading] = useState(false);

  const handleUpgrade = async () => {
    if (!onUpgradeToHd || isUpgrading) return;
    setIsUpgrading(true);
    try {
      await onUpgradeToHd();
    } finally {
      setIsUpgrading(false);
    }
  };

  return (
    <Lightbox
      open={isOpen}
      close={onClose}
      slides={[{ src: imageUrl }]}
      plugins={[Zoom]}
      zoom={{
        maxZoomPixelRatio: 2,
        scrollToZoom: true,
        zoomInMultiplier: 1.5,
        doubleClickMaxStops: 2,
        keyboardMoveDistance: 50,
      }}
      toolbar={{
        buttons: [
          <HdUpgradeButton
            key="hd-upgrade"
            hasHd={hasHd}
            onUpgradeToHd={onUpgradeToHd}
            isUpgrading={isUpgrading}
            onUpgrade={handleUpgrade}
          />,
          "zoom",
          "close",
        ],
      }}
      render={{
        buttonPrev: () => null,
        buttonNext: () => null,
      }}
    />
  );
}
```

- [ ] **Step 4: 类型检查**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: 构建验证**

Run: `pnpm build`
Expected: 构建成功

- [ ] **Step 6: 手动验证**

启动开发服务器（`pnpm dev`），验证以下场景：

1. 打开 lightbox，工具栏显示 [HD升级] [Zoom -/+] [Close] 按钮
2. 滚轮缩放：鼠标在图片上滚动，图片以鼠标位置为中心放大/缩小
3. 工具栏按钮：点击放大/缩小按钮
4. 双击缩放：双击图片放大，再双击还原
5. 拖拽平移：缩放后拖拽图片
6. 长图：高度超出屏幕的图片在缩放后可拖拽查看
7. 重置：关闭 lightbox 后重新打开，缩放回到默认
8. HD 升级：toolbar 中的 HD 按钮正常工作
9. 无 HD 的图片：HD 按钮不显示

如果发现 HD 升级后缩放级别未重置，需要通过 `ZoomRef` 手动调用 `changeZoom(1)` 重置。

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/components/chat/ImageLightbox.tsx
git commit -m "feat: add zoom support to ImageLightbox using Zoom plugin"
```
