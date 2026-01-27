import React, { useState, useEffect } from 'react';
import { GameModal, GameButton } from './GameModal';
import { VendorService } from '@dungeon-link/shared';
import { wsClient } from '../network/WebSocketClient';
import { onWalletEvent, emitWalletEvent } from './WalletUI';

interface VendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string | null;
  vendorType: 'trainer' | 'shop';
  services: VendorService[];
  playerGold: number;
}

export function VendorModal({
  isOpen,
  onClose,
  vendorId,
  vendorType,
  services,
  playerGold
}: VendorModalProps) {
  const isShop = vendorType === 'shop';
  const title = isShop ? 'Shop - Sell Items' : 'Trainer';
  const titleIcon = isShop ? '🛒' : '⚔️';

  const handlePurchase = (service: VendorService) => {
    if (!vendorId) return;

    wsClient.send({
      type: 'PURCHASE_SERVICE',
      vendorId,
      serviceType: service.type,
      abilityId: service.abilityId,
      itemId: service.itemId
    });
  };

  // Sort services - sell_all first
  const sortedServices = [...services].sort((a, b) => {
    if (a.type === 'sell_all') return -1;
    if (b.type === 'sell_all') return 1;
    return 0;
  });

  const sellAllService = sortedServices.find(s => s.type === 'sell_all');
  const regularServices = sortedServices.filter(s => s.type !== 'sell_all');

  return (
    <GameModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      titleIcon={titleIcon}
      width={480}
    >
      {/* Gold display */}
      <div className="game-gold-display">
        Your Gold: <span>{playerGold}</span>
      </div>

      {/* Empty shop message */}
      {isShop && services.length === 0 && (
        <div className="game-status game-status-info" style={{ textAlign: 'center' }}>
          No items to sell.<br />
          Pick up items from enemies and come back!
        </div>
      )}

      {/* Sell All section (for shop) */}
      {sellAllService && (
        <div style={{
          background: 'linear-gradient(180deg, rgba(68, 51, 17, 0.9) 0%, rgba(51, 34, 0, 0.95) 100%)',
          border: '2px solid #ffaa00',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px',
          textAlign: 'center'
        }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '16px', color: '#ffdd00', marginBottom: '8px' }}>
            SELL ALL ITEMS
          </div>
          <div style={{ fontSize: '20px', color: '#4ade80', fontFamily: "'Cinzel', serif", fontWeight: 'bold', marginBottom: '12px' }}>
            +{sellAllService.cost} GOLD
          </div>
          <GameButton
            onClick={() => handlePurchase(sellAllService)}
            variant="sell"
            size="medium"
          >
            Sell All
          </GameButton>
        </div>
      )}

      {/* Regular services */}
      {regularServices.map((service, index) => {
        const isSellService = service.type === 'sell_item';
        const canAfford = isSellService || playerGold >= service.cost;

        return (
          <div key={index} className="game-service-row">
            <div className="game-service-info">
              <div className="game-service-name">{service.description}</div>
              <div className={`game-service-cost ${isSellService ? 'gain' : (canAfford ? 'afford' : 'cannot-afford')}`}>
                {isSellService ? `Value: +${service.cost} gold` : `Cost: ${service.cost} gold`}
              </div>
            </div>
            <GameButton
              onClick={() => handlePurchase(service)}
              disabled={!canAfford}
              variant={isSellService ? 'sell' : 'buy'}
              size="small"
            >
              {isSellService ? 'Sell' : 'Buy'}
            </GameButton>
          </div>
        );
      })}
    </GameModal>
  );
}

// Standalone state manager for the modal (can be controlled from Phaser)
export function VendorModalManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorType, setVendorType] = useState<'trainer' | 'shop'>('trainer');
  const [services, setServices] = useState<VendorService[]>([]);
  const [playerGold, setPlayerGold] = useState(0);

  // Listen for events from Phaser
  useEffect(() => {
    const unsubOpen = onWalletEvent('open-vendor', (detail) => {
      setVendorId(detail?.vendorId ?? null);
      setVendorType(detail?.vendorType ?? 'trainer');
      setServices(detail?.services ?? []);
      setPlayerGold(detail?.playerGold ?? 0);
      setIsOpen(true);
    });

    const unsubClose = onWalletEvent('close-vendor', () => {
      setIsOpen(false);
    });

    const unsubUpdate = onWalletEvent('update-vendor', (detail) => {
      if (detail?.services) setServices(detail.services);
      if (detail?.playerGold !== undefined) setPlayerGold(detail.playerGold);
    });

    return () => {
      unsubOpen();
      unsubClose();
      unsubUpdate();
    };
  }, []);

  return (
    <VendorModal
      isOpen={isOpen}
      onClose={() => {
        setIsOpen(false);
        emitWalletEvent('vendor-closed', {});
      }}
      vendorId={vendorId}
      vendorType={vendorType}
      services={services}
      playerGold={playerGold}
    />
  );
}

// Export functions to control modal from Phaser
export function openVendor(vendorId: string, vendorType: 'trainer' | 'shop', services: VendorService[], playerGold: number) {
  emitWalletEvent('open-vendor', { vendorId, vendorType, services, playerGold });
}

export function closeVendor() {
  emitWalletEvent('close-vendor', {});
}

export function updateVendor(services?: VendorService[], playerGold?: number) {
  emitWalletEvent('update-vendor', { services, playerGold });
}
