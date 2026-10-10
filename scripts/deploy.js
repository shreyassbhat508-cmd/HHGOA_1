const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  // Optional: set ADMIN_ADDRESS env var to authorise a separate admin at deploy time.
  // If unset, the deployer itself is the sole admin (contract constructor behaviour).
  const extraAdmin = process.env.ADMIN_ADDRESS || null;

  console.log("\n========================================");
  console.log("  CivicProof – Deployment");
  console.log("========================================");
  console.log("Network   :", hre.network.name);
  console.log("Deployer  :", deployer.address);
  if (extraAdmin) {
    console.log("Extra admin:", extraAdmin);
  }

  // Deploy CivicProof
  const CivicProof = await hre.ethers.getContractFactory("CivicProof");
  const civicProof = await CivicProof.deploy();
  await civicProof.waitForDeployment();

  const contractAddress = await civicProof.getAddress();
  const network = await hre.ethers.provider.getNetwork();

  // Grant extra admin if provided via ADMIN_ADDRESS env var
  if (extraAdmin) {
    console.log(`\nAuthorising extra admin: ${extraAdmin} ...`);
    const tx = await civicProof.setAdminAuthorization(extraAdmin, true);
    await tx.wait();
    console.log("Extra admin authorised. Tx:", tx.hash);
  }

  console.log("\n----------------------------------------");
  console.log("  Deployment successful");
  console.log("  Contract address :", contractAddress);
  console.log("  Admin address    :", deployer.address);
  console.log("  Chain ID         :", network.chainId.toString());
  console.log("----------------------------------------\n");

  // Persist deployment manifest and ABI into deployments/
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Load compiled ABI from Hardhat artifact
  const artifact = hre.artifacts.readArtifactSync("CivicProof");

  const deploymentData = {
    network: hre.network.name,
    chainId: network.chainId.toString(),
    contractName: artifact.contractName,
    address: contractAddress,
    deployer: deployer.address,
    admin: deployer.address,
    extraAdmin: extraAdmin || null,
    sourcePath: artifact.sourceName,
    abiFile: `${hre.network.name}.abi.json`,
    timestamp: new Date().toISOString(),
  };

  const manifestPath = path.join(deploymentsDir, `${hre.network.name}.json`);
  const abiPath = path.join(deploymentsDir, `${hre.network.name}.abi.json`);

  fs.writeFileSync(manifestPath, JSON.stringify(deploymentData, null, 2));
  fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));

  console.log("Deployment manifest :", manifestPath);
  console.log("ABI file            :", abiPath);
  console.log("\nTo redeploy:  npx hardhat run scripts/deploy.js --network localhost");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDeployment failed:", error.message);
    process.exit(1);
  });
