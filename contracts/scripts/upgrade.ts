import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // The existing proxy address
  const PROXY_ADDRESS = "0x92ACa14fb8bef6448792E92B069EFe1D4a92153F";

  console.log("Upgrading AbyssalVault at proxy:", PROXY_ADDRESS);

  // Get the new implementation contract factory
  const AbyssalVault = await ethers.getContractFactory("AbyssalVault");

  // Upgrade the proxy to the new implementation
  console.log("Deploying new implementation and upgrading proxy...");
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, AbyssalVault);

  await upgraded.waitForDeployment();

  // Get new implementation address
  const newImplAddress = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);

  console.log("\n--- Upgrade Summary ---");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Proxy address (unchanged):", PROXY_ADDRESS);
  console.log("New implementation address:", newImplAddress);
  console.log("\nThe contract now uses:");
  console.log("  - 25% owner share");
  console.log("  - 75% reward pool share");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
