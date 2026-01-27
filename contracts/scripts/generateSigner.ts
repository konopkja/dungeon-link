import { ethers } from "hardhat";

/**
 * Generate a new wallet for server signing
 * Run with: npx hardhat run scripts/generateSigner.ts
 */
async function main() {
  const wallet = ethers.Wallet.createRandom();

  console.log("\n=== New Server Signer Wallet ===\n");
  console.log("PUBLIC ADDRESS (safe to share, add to contract):");
  console.log(wallet.address);
  console.log("\nPRIVATE KEY (KEEP SECRET, add to server .env):");
  console.log(wallet.privateKey);
  console.log("\n=== Environment Variables ===\n");
  console.log("For contracts/.env:");
  console.log(`SERVER_SIGNER_ADDRESS=${wallet.address}`);
  console.log("\nFor server/.env:");
  console.log(`SERVER_SIGNER_PRIVATE_KEY=${wallet.privateKey}`);
  console.log("\n⚠️  IMPORTANT: Never commit the private key to git!");
  console.log("Add the address to .env.example, but NOT the private key.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
