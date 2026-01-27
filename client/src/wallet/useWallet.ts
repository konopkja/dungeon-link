import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { useSendCalls, useCallsStatus } from 'wagmi/experimental';
import { parseEther, formatEther, encodeFunctionData } from 'viem';
import {
  VAULT_ADDRESS,
  VAULT_ABI,
  ERC20_ABI,
  USDC_ADDRESS,
  USDT_ADDRESS,
  POTION_PRICE_ETH,
  POTION_PRICE_USDC,
  POTION_PRICE_USDT
} from './config';
import { PaymentToken, PotionType } from '@dungeon-link/shared';

// Hook to get wallet connection status
export function useWalletStatus() {
  const { address, isConnected, isConnecting } = useAccount();
  return { address, isConnected, isConnecting };
}

// Hook to get reward pool balance
export function useRewardPool() {
  const { data: poolBalance, refetch } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'getRewardPool',
  });

  const { data: hasPoolFunds } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'hasPoolFunds',
  });

  return {
    poolBalanceWei: poolBalance?.toString() || '0',
    poolBalanceEth: poolBalance ? formatEther(poolBalance) : '0',
    hasPoolFunds: hasPoolFunds || false,
    refetch,
  };
}

// Hook to check if account has claimed
export function useHasClaimed(accountId: string | undefined) {
  const { data: hasClaimed } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'hasAccountClaimed',
    args: accountId ? [accountId] : undefined,
    query: {
      enabled: !!accountId,
    },
  });

  return hasClaimed || false;
}

// Hook for purchasing potions
export function usePurchasePotion() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const purchaseWithEth = async (potionType: PotionType) => {
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'purchasePotionWithEth',
      args: [potionType],
      value: POTION_PRICE_ETH,
    });
  };

  const purchaseWithUsdc = async (potionType: PotionType) => {
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'purchasePotionWithUsdc',
      args: [potionType],
    });
  };

  const purchaseWithUsdt = async (potionType: PotionType) => {
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'purchasePotionWithUsdt',
      args: [potionType],
    });
  };

  const purchase = async (potionType: PotionType, paymentToken: PaymentToken) => {
    switch (paymentToken) {
      case PaymentToken.ETH:
        return purchaseWithEth(potionType);
      case PaymentToken.USDC:
        return purchaseWithUsdc(potionType);
      case PaymentToken.USDT:
        return purchaseWithUsdt(potionType);
    }
  };

  return {
    purchase,
    txHash: hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

// Hook for approving token spending
export function useTokenApproval(token: PaymentToken) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { address } = useAccount();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const tokenAddress = token === PaymentToken.USDC ? USDC_ADDRESS : USDT_ADDRESS;
  const amount = token === PaymentToken.USDC ? POTION_PRICE_USDC : POTION_PRICE_USDT;

  // Check current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, VAULT_ADDRESS] : undefined,
    query: {
      enabled: !!address && token !== PaymentToken.ETH,
    },
  });

  const needsApproval = allowance !== undefined && allowance < amount;

  const approve = async () => {
    // Approve max uint256 for convenience
    writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [VAULT_ADDRESS, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
    });
  };

  return {
    approve,
    needsApproval,
    isPending,
    isConfirming,
    isSuccess,
    refetchAllowance,
  };
}

// Hook for batched token approval + purchase using EIP-5792
// With fallback to regular flow for wallets that don't support it
export function useBatchedPurchase() {
  const { address } = useAccount();
  const { sendCalls, data: callsData, isPending: isBatchPending, error: batchError } = useSendCalls();

  // Regular transaction hooks for fallback
  const { writeContract, data: regularTxHash, isPending: isRegularPending, error: regularError } = useWriteContract();

  // Track regular tx receipt
  const { isLoading: isRegularConfirming, isSuccess: isRegularSuccess } = useWaitForTransactionReceipt({
    hash: regularTxHash,
  });

  // Extract the ID from the calls data
  const callsId = callsData?.id;

  // Track the calls status
  const { data: callsStatus } = useCallsStatus({
    id: callsId as string,
    query: {
      enabled: !!callsId,
      refetchInterval: (data) =>
        data.state.data?.status === 'success' ? false : 1000,
    },
  });

  const isBatchConfirming = callsStatus?.status === 'pending';
  const isBatchSuccess = callsStatus?.status === 'success';

  // Get allowances for both tokens
  const { data: usdcAllowance, refetch: refetchUsdcAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, VAULT_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdtAllowance, refetch: refetchUsdtAllowance } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, VAULT_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  // Check if allowance is sufficient for token purchase
  const hasAllowance = (paymentToken: PaymentToken, quantity: number): boolean => {
    if (paymentToken === PaymentToken.ETH) return true;
    const pricePerPotion = paymentToken === PaymentToken.USDC ? POTION_PRICE_USDC : POTION_PRICE_USDT;
    const totalPrice = pricePerPotion * BigInt(quantity);
    const currentAllowance = paymentToken === PaymentToken.USDC ? usdcAllowance : usdtAllowance;
    return currentAllowance !== undefined && currentAllowance >= totalPrice;
  };

  // Regular approve function (fallback)
  const approveToken = async (paymentToken: PaymentToken, quantity: number) => {
    const tokenAddress = paymentToken === PaymentToken.USDC ? USDC_ADDRESS : USDT_ADDRESS;
    const pricePerPotion = paymentToken === PaymentToken.USDC ? POTION_PRICE_USDC : POTION_PRICE_USDT;
    const totalPrice = pricePerPotion * BigInt(quantity);

    writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [VAULT_ADDRESS, totalPrice],
    });
  };

  // Regular purchase function (fallback)
  const purchaseRegular = async (potionType: PotionType, paymentToken: PaymentToken) => {
    if (paymentToken === PaymentToken.ETH) {
      writeContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'purchasePotionWithEth',
        args: [potionType],
        value: POTION_PRICE_ETH,
      });
    } else {
      const purchaseFunction = paymentToken === PaymentToken.USDC ? 'purchasePotionWithUsdc' : 'purchasePotionWithUsdt';
      writeContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: purchaseFunction,
        args: [potionType],
      });
    }
  };

  const purchaseBatched = async (potionType: PotionType, paymentToken: PaymentToken, quantity: number = 1) => {
    const calls: { to: `0x${string}`; data: `0x${string}`; value?: bigint }[] = [];

    if (paymentToken === PaymentToken.ETH) {
      // ETH purchase - no approval needed, just the purchase call(s)
      for (let i = 0; i < quantity; i++) {
        calls.push({
          to: VAULT_ADDRESS,
          data: encodeFunctionData({
            abi: VAULT_ABI,
            functionName: 'purchasePotionWithEth',
            args: [potionType],
          }),
          value: POTION_PRICE_ETH,
        });
      }
    } else {
      // Token purchase - may need approval first
      const tokenAddress = paymentToken === PaymentToken.USDC ? USDC_ADDRESS : USDT_ADDRESS;
      const pricePerPotion = paymentToken === PaymentToken.USDC ? POTION_PRICE_USDC : POTION_PRICE_USDT;
      const totalPrice = pricePerPotion * BigInt(quantity);
      const currentAllowance = paymentToken === PaymentToken.USDC ? usdcAllowance : usdtAllowance;
      const purchaseFunction = paymentToken === PaymentToken.USDC ? 'purchasePotionWithUsdc' : 'purchasePotionWithUsdt';

      // Add approval call if needed (approve exact amount for security)
      if (currentAllowance === undefined || currentAllowance < totalPrice) {
        calls.push({
          to: tokenAddress,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [VAULT_ADDRESS, totalPrice],
          }),
        });
      }

      // Add purchase call(s)
      for (let i = 0; i < quantity; i++) {
        calls.push({
          to: VAULT_ADDRESS,
          data: encodeFunctionData({
            abi: VAULT_ABI,
            functionName: purchaseFunction,
            args: [potionType],
          }),
        });
      }
    }

    // Send batched calls using EIP-5792
    await sendCalls({
      calls,
    });
  };

  const refetchAllowances = () => {
    refetchUsdcAllowance();
    refetchUsdtAllowance();
  };

  // Combined state - check both batch and regular
  const isPending = isBatchPending || isRegularPending;
  const isConfirming = isBatchConfirming || isRegularConfirming;
  const isSuccess = isBatchSuccess || isRegularSuccess;
  const error = batchError || regularError;

  return {
    purchaseBatched,
    purchaseRegular,
    approveToken,
    hasAllowance,
    callsId: callsId || regularTxHash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    batchError, // Expose batch error separately to detect EIP-5792 failures
    refetchAllowances,
  };
}

// Hook for claiming rewards
export function useClaimRewards() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const claim = async (accountId: string, ethAmountWei: string, signature: `0x${string}`) => {
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'claimRewards',
      args: [accountId, BigInt(ethAmountWei), signature],
    });
  };

  return {
    claim,
    txHash: hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

// Utility to format ETH for display
export function formatEthDisplay(weiString: string): string {
  try {
    const eth = formatEther(BigInt(weiString));
    // Format to 6 decimal places max
    const num = parseFloat(eth);
    if (num === 0) return '0';
    if (num < 0.000001) return '< 0.000001';
    return num.toFixed(6).replace(/\.?0+$/, '');
  } catch {
    return '0';
  }
}
