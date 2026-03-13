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
