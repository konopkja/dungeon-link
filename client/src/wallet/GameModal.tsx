import React, { useEffect, ReactNode } from 'react';

interface GameModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  titleIcon?: string;
  children: ReactNode;
  width?: number;
}

export function GameModal({ isOpen, onClose, title, titleIcon, children, width = 420 }: GameModalProps) {
  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="game-modal-backdrop" onClick={onClose} />
      <div className="game-modal" style={{ width }}>
        {/* Close button */}
        <button className="game-modal-close" onClick={onClose}>
          &times;
        </button>

        {/* Title */}
        <h2 className="game-modal-title">
          {titleIcon && <span className="game-modal-title-icon">{titleIcon}</span>}
          {title}
        </h2>

        {/* Decorative underline */}
        <div className="game-modal-underline">
          <span className="game-modal-underline-accent" />
        </div>

        {/* Content */}
        <div className="game-modal-content">
          {children}
        </div>

        {/* Footer hint */}
        <div className="game-modal-hint">
          Press ESC or click &times; to close
        </div>
      </div>
    </>
  );
}

// Button component for consistent styling across modals
interface GameButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'buy' | 'sell' | 'danger';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  children: ReactNode;
}

export function GameButton({
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  children
}: GameButtonProps) {
  return (
    <button
      className={`game-btn game-btn-${variant} game-btn-${size} ${fullWidth ? 'game-btn-full' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// Inject shared modal styles
export function injectGameModalStyles() {
  const styleId = 'game-modal-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* ==================== GAME MODAL BASE ==================== */
    .game-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      z-index: 1999;
    }

    .game-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(180deg, rgba(30, 30, 50, 0.98) 0%, rgba(20, 20, 35, 0.99) 100%);
      border: 2px solid #4a4a6a;
      border-radius: 10px;
      padding: 20px 24px;
      color: #fff;
      font-family: 'Crimson Text', Georgia, serif;
      z-index: 2000;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    /* Gold corner accents */
    .game-modal::before,
    .game-modal::after {
      content: '';
      position: absolute;
      width: 20px;
      height: 20px;
      border-color: #c9a227;
      border-style: solid;
    }

    .game-modal::before {
      top: -1px;
      left: -1px;
      border-width: 2px 0 0 2px;
      border-radius: 8px 0 0 0;
    }

    .game-modal::after {
      bottom: -1px;
      right: -1px;
      border-width: 0 2px 2px 0;
      border-radius: 0 0 8px 0;
    }

    /* Close button */
    .game-modal-close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 30px;
      height: 30px;
      border: 1px solid #5a5a7a;
      background: #3d3d5c;
      color: #aaa;
      border-radius: 4px;
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .game-modal-close:hover {
      background: #884444;
      border-color: #aa6666;
      color: #fff;
    }

    /* Title */
    .game-modal-title {
      font-family: 'Cinzel', serif;
      font-size: 20px;
      font-weight: 700;
      color: #ffd700;
      text-align: center;
      margin: 0 0 8px 0;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }

    .game-modal-title-icon {
      margin-right: 8px;
    }

    /* Underline decoration */
    .game-modal-underline {
      position: relative;
      height: 1px;
      background: #4a4a6a;
      margin-bottom: 16px;
    }

    .game-modal-underline-accent {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 60px;
      height: 2px;
      background: #c9a227;
      top: 0;
    }

    /* Content area */
    .game-modal-content {
      margin-bottom: 12px;
    }

    /* Footer hint */
    .game-modal-hint {
      text-align: center;
      font-size: 12px;
      color: #666;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #333;
    }

    /* ==================== GAME BUTTONS ==================== */
    .game-btn {
      font-family: 'Cinzel', serif;
      font-weight: 600;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .game-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Sizes */
    .game-btn-small {
      padding: 6px 12px;
      font-size: 12px;
    }

    .game-btn-medium {
      padding: 10px 18px;
      font-size: 14px;
    }

    .game-btn-large {
      padding: 12px 24px;
      font-size: 16px;
    }

    .game-btn-full {
      width: 100%;
    }

    /* Primary - Gold */
    .game-btn-primary {
      background: linear-gradient(180deg, #c9a227 0%, #8b7320 100%);
      border: 2px solid #e0b82a;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    }

    .game-btn-primary:hover:not(:disabled) {
      background: linear-gradient(180deg, #e0b82a 0%, #a08428 100%);
      transform: translateY(-1px);
    }

    /* Secondary - Dark */
    .game-btn-secondary {
      background: #3d3d5c;
      border: 1px solid #5a5a7a;
      color: #ccc;
    }

    .game-btn-secondary:hover:not(:disabled) {
      background: #4d4d6c;
      color: #fff;
    }

    /* Buy - Green */
    .game-btn-buy {
      background: linear-gradient(180deg, #228833 0%, #1a6628 100%);
      border: 2px solid #33aa44;
      color: #fff;
    }

    .game-btn-buy:hover:not(:disabled) {
      background: linear-gradient(180deg, #33aa44 0%, #228833 100%);
      transform: translateY(-1px);
    }

    /* Sell - Gold/Brown */
    .game-btn-sell {
      background: linear-gradient(180deg, #886622 0%, #664411 100%);
      border: 2px solid #aa8833;
      color: #fff;
    }

    .game-btn-sell:hover:not(:disabled) {
      background: linear-gradient(180deg, #aa8833 0%, #886622 100%);
      transform: translateY(-1px);
    }

    /* Danger - Red */
    .game-btn-danger {
      background: linear-gradient(180deg, #883333 0%, #662222 100%);
      border: 2px solid #aa4444;
      color: #fff;
    }

    .game-btn-danger:hover:not(:disabled) {
      background: linear-gradient(180deg, #aa4444 0%, #883333 100%);
      transform: translateY(-1px);
    }

    /* ==================== SHARED FORM ELEMENTS ==================== */
    .game-select-group {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-bottom: 16px;
    }

    .game-select-btn {
      padding: 8px 16px;
      border: 1px solid #4a4a6a;
      background: #2a2a4e;
      color: #ccc;
      border-radius: 4px;
      cursor: pointer;
      font-family: 'Crimson Text', serif;
      font-size: 14px;
      transition: all 0.2s;
    }

    .game-select-btn:hover {
      border-color: #c9a227;
      color: #fff;
    }

    .game-select-btn.active {
      border-color: #c9a227;
      background: #3a3a5e;
      color: #ffd700;
    }

    /* Item cards */
    .game-item-card {
      padding: 16px;
      border: 1px solid #4a4a6a;
      background: linear-gradient(180deg, rgba(40, 40, 60, 0.9) 0%, rgba(30, 30, 45, 0.95) 100%);
      border-radius: 8px;
      text-align: center;
      transition: all 0.2s;
    }

    .game-item-card:hover {
      border-color: #c9a227;
    }

    .game-item-card img {
      width: 48px;
      height: 48px;
      object-fit: contain;
      display: block;
      margin: 0 auto 12px;
      filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5));
      image-rendering: pixelated;
    }

    .game-item-name {
      font-family: 'Cinzel', serif;
      font-weight: bold;
      font-size: 14px;
      color: #fff;
      margin-bottom: 6px;
    }

    .game-item-price {
      font-size: 14px;
      color: #ffd700;
      margin-bottom: 12px;
    }

    .game-item-price.sell {
      color: #4ade80;
    }

    /* Quantity selector */
    .game-qty-selector {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .game-qty-btn {
      width: 28px;
      height: 28px;
      border: 1px solid #c9a227;
      background: rgba(201, 162, 39, 0.2);
      color: #fff;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .game-qty-btn:hover:not(:disabled) {
      background: rgba(201, 162, 39, 0.4);
    }

    .game-qty-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .game-qty-value {
      font-family: 'Cinzel', serif;
      font-size: 18px;
      font-weight: bold;
      min-width: 24px;
      color: #ffd700;
      text-align: center;
    }

    /* Status messages */
    .game-status {
      text-align: center;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 14px;
      margin: 12px 0;
    }

    .game-status-info {
      background: rgba(201, 162, 39, 0.15);
      border: 1px solid rgba(201, 162, 39, 0.3);
      color: #ffd700;
    }

    .game-status-success {
      background: rgba(74, 222, 128, 0.15);
      border: 1px solid rgba(74, 222, 128, 0.3);
      color: #4ade80;
    }

    .game-status-error {
      background: rgba(248, 113, 113, 0.15);
      border: 1px solid rgba(248, 113, 113, 0.3);
      color: #f87171;
    }

    .game-status-warning {
      background: rgba(251, 191, 36, 0.15);
      border: 1px solid rgba(251, 191, 36, 0.3);
      color: #fbbf24;
    }

    /* Gold display */
    .game-gold-display {
      text-align: center;
      font-size: 16px;
      color: #ffd700;
      margin-bottom: 16px;
    }

    .game-gold-display span {
      font-family: 'Cinzel', serif;
      font-weight: bold;
    }

    /* Service/item rows */
    .game-service-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      background: rgba(40, 40, 60, 0.6);
      border: 1px solid #3a3a5a;
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .game-service-row:hover {
      border-color: #4a4a7a;
    }

    .game-service-info {
      flex: 1;
    }

    .game-service-name {
      font-family: 'Cinzel', serif;
      font-size: 14px;
      color: #fff;
      margin-bottom: 4px;
    }

    .game-service-desc {
      font-size: 12px;
      color: #888;
    }

    .game-service-cost {
      font-size: 14px;
      margin-right: 12px;
    }

    .game-service-cost.afford {
      color: #ffd700;
    }

    .game-service-cost.cannot-afford {
      color: #f87171;
    }

    .game-service-cost.gain {
      color: #4ade80;
    }
  `;
  document.head.appendChild(style);
}
