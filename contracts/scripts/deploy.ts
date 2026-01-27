import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const serverSignerAddress = process.env.SERVER_SIGNER_ADDRESS;
  if (!serverSignerAddress) {
    throw new Error("SERVER_SIGNER_ADDRESS not set in environment");
  }

  console.log("Server signer address:", serverSignerAddress);

  // Deploy upgradeable contract
  const AbyssalVault = await ethers.getContractFactory("AbyssalVault");

  console.log("Deploying AbyssalVault proxy...");
  const vault = await upgrades.deployProxy(
    AbyssalVault,
    [deployer.address, serverSignerAddress],
    {
      initializer: "initialize",
      kind: "uups"
    }
  );

  await vault.waitForDeployment();
  const proxyAddress = await vault.getAddress();

  console.log("AbyssalVault proxy deployed to:", proxyAddress);

  // Get implementation address
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("Implementation address:", implAddress);

  // Log contract info
  console.log("\n--- Deployment Summary ---");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Proxy address:", proxyAddress);
  console.log("Implementation address:", implAddress);
  console.log("Owner:", deployer.address);
  console.log("Trusted signer:", serverSignerAddress);
  console.log("\nAdd to your .env files:");
  console.log(`VITE_VAULT_ADDRESS=${proxyAddress}`);
  console.log(`VAULT_ADDRESS=${proxyAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
