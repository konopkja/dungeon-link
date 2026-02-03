import React from 'react';
import { ClaimError } from './ClaimRewardsModal';

interface ClaimErrorModalProps {
  isOpen: boolean;
  error: ClaimError | null;
  onClose: () => void;
  onRetry?: () => void;
}

export function ClaimErrorModal({ isOpen, error, onClose, onRetry }: ClaimErrorModalProps) {
  if (!isOpen || !error) return null;

  // Determine if this error is retryable
  const isRetryable = error.message.includes('Transaction') ||
                      error.message.includes('gas') ||
                      error.message.includes('network');

  return (
    <>
      <div className="error-modal-backdrop" onClick={onClose} />
      <div className="error-modal">
        <div className="error-icon">&#x26A0;</div>

        <h2 className="error-title">{error.title}</h2>

        <div className="error-content">
          <p className="error-message">{error.message}</p>

          <div className="error-suggestion-box">
            <span className="suggestion-icon">&#x1F4A1;</span>
            <p className="error-suggestion">{error.suggestion}</p>
          </div>
        </div>

        <div className="error-actions">
          {isRetryable && onRetry && (
            <button className="error-retry-btn" onClick={onRetry}>
              Try Again
            </button>
          )}
          <button className="error-close-btn" onClick={onClose}>
            {isRetryable ? 'Cancel' : 'Close'}
          </button>
        </div>

        <div className="error-help">
          <p>
            Still having issues?{' '}
            <a
              href="https://discord.gg/dungeon-link"
              target="_blank"
              rel="noopener noreferrer"
              className="help-link"
            >
              Get help on Discord
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
