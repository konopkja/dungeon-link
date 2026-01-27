// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title AbyssalVault
 * @notice Handles crypto payments for potions and reward distribution for Abyssal Descent
 * @dev Upgradeable contract using UUPS pattern
 */
contract AbyssalVault is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Token addresses on Base mainnet
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address public constant USDT = 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2;

    // Pricing (fixed amounts)
    uint256 public constant POTION_PRICE_ETH = 0.000033 ether;  // ~$0.10 at ~$3000/ETH
    uint256 public constant POTION_PRICE_USDC = 100000;         // $0.10 (6 decimals)
    uint256 public constant POTION_PRICE_USDT = 100000;         // $0.10 (6 decimals)

    // Revenue split: 25% owner, 75% reward pool
    uint256 public constant OWNER_SHARE_BPS = 2500;  // 25%
    uint256 public constant POOL_SHARE_BPS = 7500;   // 75%
    uint256 public constant BPS_DENOMINATOR = 10000;

    // Server signer for attestations
    address public trustedSigner;

    // Reward pool balance (in ETH)
    uint256 public rewardPool;

    // Owner withdrawable balances
    uint256 public ownerEthBalance;
    mapping(address => uint256) public ownerTokenBalances;

    // Track claimed accounts (accountId hash => claimed)
    mapping(bytes32 => bool) public hasClaimed;

    // Events
    event PotionPurchased(
        address indexed buyer,
        address indexed token,  // address(0) for ETH
        uint256 amount,
        string potionType
    );
    event RewardsClaimed(
        address indexed player,
        string accountId,
        uint256 bossEth,
        uint256 poolShare,
        uint256 totalPaid
    );
    event OwnerWithdrawal(address indexed token, uint256 amount);
    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event RewardPoolFunded(uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param _owner Contract owner address
     * @param _trustedSigner Server signer address for attestations
     */
    function initialize(address _owner, address _trustedSigner) public initializer {
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        require(_trustedSigner != address(0), "Invalid signer");
        trustedSigner = _trustedSigner;
    }

    /**
     * @notice Purchase a potion with ETH
     * @param potionType "health" or "mana"
     */
    function purchasePotionWithEth(string calldata potionType) external payable whenNotPaused nonReentrant {
        require(msg.value == POTION_PRICE_ETH, "Incorrect ETH amount");
        require(_validPotionType(potionType), "Invalid potion type");

        uint256 ownerShare = (msg.value * OWNER_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 poolShare = msg.value - ownerShare;

        ownerEthBalance += ownerShare;
        rewardPool += poolShare;

        emit PotionPurchased(msg.sender, address(0), msg.value, potionType);
    }

    /**
     * @notice Purchase a potion with USDC
     * @param potionType "health" or "mana"
     */
    function purchasePotionWithUsdc(string calldata potionType) external whenNotPaused nonReentrant {
        _purchaseWithToken(USDC, POTION_PRICE_USDC, potionType);
    }

    /**
     * @notice Purchase a potion with USDT
     * @param potionType "health" or "mana"
     */
    function purchasePotionWithUsdt(string calldata potionType) external whenNotPaused nonReentrant {
        _purchaseWithToken(USDT, POTION_PRICE_USDT, potionType);
    }

    /**
     * @notice Internal function to handle token purchases
     */
    function _purchaseWithToken(address token, uint256 price, string calldata potionType) internal {
        require(_validPotionType(potionType), "Invalid potion type");

        IERC20(token).safeTransferFrom(msg.sender, address(this), price);

        uint256 ownerShare = (price * OWNER_SHARE_BPS) / BPS_DENOMINATOR;
        ownerTokenBalances[token] += ownerShare;

        // Pool share stays in contract but we track it separately
        // Note: Pool is paid out in ETH, token purchases just fund the owner
        // The pool is funded by ETH purchases and direct funding

        emit PotionPurchased(msg.sender, token, price, potionType);
    }

    /**
     * @notice Claim rewards after defeating floor 15 boss
     * @param accountId Game account ID
     * @param bossEthAmount Accumulated ETH from boss drops (in wei)
     * @param signature Server-signed attestation
     */
    function claimRewards(
        string calldata accountId,
        uint256 bossEthAmount,
        bytes calldata signature
    ) external whenNotPaused nonReentrant {
        bytes32 accountHash = keccak256(abi.encodePacked(accountId));
        require(!hasClaimed[accountHash], "Already claimed");

        // Verify server signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            accountId,
            bossEthAmount,
            msg.sender,
            block.chainid,
            address(this)
        ));
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address recoveredSigner = ethSignedHash.recover(signature);
        require(recoveredSigner == trustedSigner, "Invalid signature");

        // Mark as claimed
        hasClaimed[accountHash] = true;

        // Calculate payout: boss ETH + entire reward pool
        uint256 poolPayout = rewardPool;
        uint256 totalPayout = bossEthAmount + poolPayout;

        require(address(this).balance >= totalPayout, "Insufficient contract balance");

        // Reset reward pool
        rewardPool = 0;

        // Transfer rewards
        (bool success, ) = payable(msg.sender).call{value: totalPayout}("");
        require(success, "ETH transfer failed");

        emit RewardsClaimed(msg.sender, accountId, bossEthAmount, poolPayout, totalPayout);
    }

    /**
     * @notice Check if an account has already claimed
     * @param accountId Game account ID
     */
    function hasAccountClaimed(string calldata accountId) external view returns (bool) {
        return hasClaimed[keccak256(abi.encodePacked(accountId))];
    }

    /**
     * @notice Get current reward pool balance
     */
    function getRewardPool() external view returns (uint256) {
        return rewardPool;
    }

    /**
     * @notice Check if reward pool has ETH (for boss drop logic)
     */
    function hasPoolFunds() external view returns (bool) {
        return rewardPool > 0;
    }

    /**
     * @notice Fund the reward pool directly (owner only)
     */
    function fundRewardPool() external payable onlyOwner {
        require(msg.value > 0, "Must send ETH");
        rewardPool += msg.value;
        emit RewardPoolFunded(msg.value);
    }

    /**
     * @notice Withdraw owner's ETH balance
     */
    function withdrawEth() external onlyOwner nonReentrant {
        uint256 amount = ownerEthBalance;
        require(amount > 0, "No ETH to withdraw");

        ownerEthBalance = 0;

        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "ETH transfer failed");

        emit OwnerWithdrawal(address(0), amount);
    }

    /**
     * @notice Withdraw owner's token balance
     * @param token Token address (USDC or USDT)
     */
    function withdrawToken(address token) external onlyOwner nonReentrant {
        require(token == USDC || token == USDT, "Invalid token");

        uint256 amount = ownerTokenBalances[token];
        require(amount > 0, "No tokens to withdraw");

        ownerTokenBalances[token] = 0;

        IERC20(token).safeTransfer(owner(), amount);

        emit OwnerWithdrawal(token, amount);
    }

    /**
     * @notice Update trusted signer address
     * @param newSigner New signer address
     */
    function setTrustedSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Invalid signer");
        address oldSigner = trustedSigner;
        trustedSigner = newSigner;
        emit TrustedSignerUpdated(oldSigner, newSigner);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Validate potion type
     */
    function _validPotionType(string calldata potionType) internal pure returns (bool) {
        bytes32 typeHash = keccak256(abi.encodePacked(potionType));
        return typeHash == keccak256("health") || typeHash == keccak256("mana");
    }

    /**
     * @notice Authorize upgrade (owner only)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @notice Receive ETH (for funding reward pool)
     */
    receive() external payable {
        rewardPool += msg.value;
        emit RewardPoolFunded(msg.value);
    }
}
