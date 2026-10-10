/**
 * CivicProof Integration Smoke Test
 * Runs against the local Hardhat node.  Start the node first:
 *   npx hardhat node
 *   npx hardhat run scripts/deploy.js --network localhost
 * Then run this script:
 *   node integration/smokeTest.js
 */

"use strict";

const { ethers } = require("ethers");
const client = require("./civicProofClient");

async function run() {
  const RPC = "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(RPC);
  const [deployerSigner, adminSigner, citizenSigner] = await Promise.all(
    [0, 1, 2].map((i) => provider.getSigner(i))
  );

  // ---- Connect as deployer (also the admin) ----
  const meta = await client.connect(deployerSigner, "localhost");
  console.log("\n=== Connected to CivicProof ===");
  console.log("  address  :", meta.address);
  console.log("  admin    :", meta.admin);
  console.log("  network  :", meta.network, "| chainId:", meta.chainId);

  // ---- Unique complaint ID for this run ----
  const rawId = "SMOKE-TEST-" + Date.now();
  const complaintId = client.makeComplaintId(rawId);
  const detailsHash = client.makeDetailsHash("Fictional pothole at Elm Street, Ward 7");
  const remarks = "Road surface issue";

  // ---- 1. Register complaint ----
  console.log("\n[1] Registering complaint ...");
  const reg = await client.registerComplaintWithDetails(complaintId, detailsHash, remarks);
  console.log("    tx hash    :", reg.tx.hash);
  console.log("    recordHash :", reg.recordHash);

  // ---- 2. Get complaint details ----
  console.log("\n[2] Retrieving complaint ...");
  const complaint = await client.getComplaint(complaintId);
  console.log("    status     :", complaint.currentStatusLabel);
  console.log("    recordHash :", complaint.latestRecordHash);

  // ---- 3. Advance: Submitted → Acknowledged ----
  console.log("\n[3] Updating status to Acknowledged ...");
  const ackHash = client.makeDetailsHash("Field inspection report #001");
  const upd1 = await client.updateComplaintStatusWithDetails(
    complaintId, client.STATUS.ACKNOWLEDGED, ackHash, "Ward inspector assigned"
  );
  console.log("    tx hash    :", upd1.tx.hash);
  console.log("    newHash    :", upd1.newRecordHash);

  // ---- 4. Advance: Acknowledged → InProgress ----
  console.log("\n[4] Updating status to InProgress ...");
  const progHash = client.makeDetailsHash("Repair crew dispatched, ETA 2h");
  const upd2 = await client.updateComplaintStatusWithDetails(
    complaintId, client.STATUS.IN_PROGRESS, progHash, "Crew en route"
  );
  console.log("    tx hash    :", upd2.tx.hash);

  // ---- 5. Advance: InProgress → Resolved ----
  console.log("\n[5] Updating status to Resolved ...");
  const resHash = client.makeDetailsHash("Pothole filled and compacted; photo evidence ID: IMG-4521");
  const upd3 = await client.updateComplaintStatusWithDetails(
    complaintId, client.STATUS.RESOLVED, resHash, "Supervisor sign-off obtained"
  );
  console.log("    tx hash    :", upd3.tx.hash);

  // ---- 6. Full status history ----
  console.log("\n[6] Status history:");
  const history = await client.getStatusHistory(complaintId);
  history.forEach((e, i) => {
    console.log(`    [${i}] ${e.statusLabel.padEnd(14)} by ${e.updatedBy} | ${e.remarks}`);
  });

  // ---- 7. Verify latest record (should match) ----
  console.log("\n[7] Verifying latest record hash ...");
  const latestHash = await client.computeRecordHash(
    complaintId, client.STATUS.RESOLVED, resHash, "Supervisor sign-off obtained"
  );
  const verLatest = await client.verifyLatestRecord(complaintId, latestHash);
  console.log("    isValid    :", verLatest.isValid, "(expected: true)");
  console.log("    status     :", verLatest.currentStatusLabel);

  // ---- 8. Verify latest record (tampered – should fail) ----
  console.log("\n[8] Verifying with tampered hash ...");
  const fakeHash = client.makeDetailsHash("TAMPERED-DATA");
  const verFake = await client.verifyLatestRecord(complaintId, fakeHash);
  console.log("    isValid    :", verFake.isValid, "(expected: false)");

  // ---- 9. Verify historical checkpoint 0 (Submitted) ----
  console.log("\n[9] Verifying historical checkpoint 0 (Submitted) ...");
  const submittedHash = await client.computeRecordHash(
    complaintId, client.STATUS.SUBMITTED, detailsHash, remarks
  );
  const verHist = await client.verifyHistoricalRecord(complaintId, 0, submittedHash);
  console.log("    isValid    :", verHist.isValid, "(expected: true)");
  console.log("    status     :", verHist.recordStatusLabel);
  console.log("    updatedBy  :", verHist.updatedBy);

  // ---- 10. Verify by target status ----
  console.log("\n[10] Verifying by target status (Acknowledged) ...");
  const ackRecordHash = await client.computeRecordHash(
    complaintId, client.STATUS.ACKNOWLEDGED, ackHash, "Ward inspector assigned"
  );
  const verByStatus = await client.verifyRecordByStatus(
    complaintId, client.STATUS.ACKNOWLEDGED, ackRecordHash
  );
  console.log("    isValid    :", verByStatus.isValid, "(expected: true)");
  console.log("    historyIdx :", verByStatus.historyIndex);

  // ---- Summary ----
  const allPassed = verLatest.isValid && !verFake.isValid && verHist.isValid && verByStatus.isValid;
  console.log("\n========================================");
  console.log("  Smoke test result:", allPassed ? "ALL CHECKS PASSED" : "ONE OR MORE FAILURES");
  console.log("========================================\n");
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("\nSmoke test error:", err.message);
  process.exit(1);
});
