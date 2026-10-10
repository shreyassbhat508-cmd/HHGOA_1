const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CivicProof Automated Test Suite", function () {
  let civicProof;
  let owner, admin, citizen, attacker, newAdmin;

  // Fictional test data (identifiers and SHA-256 hashes of off-chain documents)
  const complaintId1 = ethers.keccak256(ethers.toUtf8Bytes("FICTIONAL-GRIEVANCE-METRO-001"));
  const complaintId2 = ethers.keccak256(ethers.toUtf8Bytes("FICTIONAL-GRIEVANCE-METRO-002"));
  const unknownComplaintId = ethers.keccak256(ethers.toUtf8Bytes("FICTIONAL-NONEXISTENT-999"));

  const initialRecordHash = ethers.keccak256(
    ethers.toUtf8Bytes("Fictional citizen report: Broken streetlight at Sector 5")
  );
  const ackRecordHash = ethers.keccak256(
    ethers.toUtf8Bytes("Fictional municipal verification: Work order #401 created")
  );
  const progressRecordHash = ethers.keccak256(
    ethers.toUtf8Bytes("Fictional electrical maintenance crew dispatched to pole #42")
  );
  const resolvedRecordHash = ethers.keccak256(
    ethers.toUtf8Bytes("Fictional completion sign-off: Luminaire replaced, illumination verified")
  );

  const initialRemarks = "Reported by resident";
  const ackRemarks = "Assigned to Ward Electrical Division";
  const progressRemarks = "Crew in transit with replacement equipment";
  const resolvedRemarks = "Repairs verified by ward inspector";

  beforeEach(async function () {
    [owner, admin, citizen, attacker, newAdmin] = await ethers.getSigners();
    const CivicProofFactory = await ethers.getContractFactory("CivicProof");
    civicProof = await CivicProofFactory.deploy();
    await civicProof.waitForDeployment();

    // Authorize admin account
    await civicProof.connect(owner).setAdminAuthorization(admin.address, true);
  });

  describe("1. Complaint Registration", function () {
    it("should successfully register a complaint and initialize on-chain state", async function () {
      const tx = await civicProof.connect(citizen).registerComplaint(
        complaintId1,
        initialRecordHash,
        initialRemarks
      );

      await expect(tx)
        .to.emit(civicProof, "ComplaintRegistered")
        .withArgs(complaintId1, citizen.address, initialRecordHash, (ts) => ts > 0, initialRemarks);

      const complaint = await civicProof.getComplaint(complaintId1);
      expect(complaint.complaintId).to.equal(complaintId1);
      expect(complaint.currentStatus).to.equal(0n); // Status.Submitted
      expect(complaint.latestRecordHash).to.equal(initialRecordHash);
      expect(complaint.currentTimestamp).to.be.greaterThan(0);
      expect(complaint.exists).to.be.true;
    });

    it("should reject duplicate registration with the same complaint identifier", async function () {
      await civicProof.connect(citizen).registerComplaint(
        complaintId1,
        initialRecordHash,
        initialRemarks
      );

      await expect(
        civicProof.connect(citizen).registerComplaint(
          complaintId1,
          initialRecordHash,
          "Duplicate attempt"
        )
      ).to.be.revertedWith("CivicProof: Complaint already registered");
    });

    it("should reject registration with empty/zero complaint identifier or record hash", async function () {
      await expect(
        civicProof.connect(citizen).registerComplaint(ethers.ZeroHash, initialRecordHash, initialRemarks)
      ).to.be.revertedWith("CivicProof: Invalid complaint ID");

      await expect(
        civicProof.connect(citizen).registerComplaint(complaintId1, ethers.ZeroHash, initialRemarks)
      ).to.be.revertedWith("CivicProof: Invalid record hash");
    });
  });

  describe("2. Complaint Details Retrieval", function () {
    beforeEach(async function () {
      await civicProof.connect(citizen).registerComplaint(
        complaintId1,
        initialRecordHash,
        initialRemarks
      );
    });

    it("should accurately retrieve complaint details", async function () {
      const details = await civicProof.getComplaint(complaintId1);
      expect(details.complaintId).to.equal(complaintId1);
      expect(details.currentStatus).to.equal(0n);
      expect(details.latestRecordHash).to.equal(initialRecordHash);
      expect(details.exists).to.be.true;
    });
  });

  describe("3. Rejection of Unknown Complaint Identifiers", function () {
    it("should reject getComplaint for unknown identifier", async function () {
      await expect(civicProof.getComplaint(unknownComplaintId)).to.be.revertedWith(
        "CivicProof: Unknown complaint ID"
      );
    });

    it("should reject updateComplaintStatus for unknown identifier", async function () {
      await expect(
        civicProof.connect(admin).updateComplaintStatus(unknownComplaintId, 1, ackRecordHash, ackRemarks)
      ).to.be.revertedWith("CivicProof: Unknown complaint ID");
    });

    it("should reject getStatusHistory for unknown identifier", async function () {
      await expect(civicProof.getStatusHistory(unknownComplaintId)).to.be.revertedWith(
        "CivicProof: Unknown complaint ID"
      );
    });

    it("should reject getStatusHistoryCount for unknown identifier", async function () {
      await expect(civicProof.getStatusHistoryCount(unknownComplaintId)).to.be.revertedWith(
        "CivicProof: Unknown complaint ID"
      );
    });

    it("should reject getStatusHistoryEntry for unknown identifier", async function () {
      await expect(civicProof.getStatusHistoryEntry(unknownComplaintId, 0)).to.be.revertedWith(
        "CivicProof: Unknown complaint ID"
      );
    });

    it("should reject verifyLatestRecord for unknown identifier", async function () {
      await expect(
        civicProof.verifyLatestRecord(unknownComplaintId, initialRecordHash)
      ).to.be.revertedWith("CivicProof: Unknown complaint ID");
    });

    it("should reject verifyHistoricalRecord for unknown identifier", async function () {
      await expect(
        civicProof.verifyHistoricalRecord(unknownComplaintId, 0, initialRecordHash)
      ).to.be.revertedWith("CivicProof: Unknown complaint ID");
    });
  });

  describe("4. Valid Status Transitions", function () {
    beforeEach(async function () {
      await civicProof.connect(citizen).registerComplaint(
        complaintId1,
        initialRecordHash,
        initialRemarks
      );
    });

    it("should follow valid sequential status transitions: Submitted -> Acknowledged -> InProgress -> Resolved", async function () {
      // 1. Submitted (0) -> Acknowledged (1)
      const tx1 = await civicProof.connect(admin).updateComplaintStatus(
        complaintId1,
        1, // Status.Acknowledged
        ackRecordHash,
        ackRemarks
      );

      await expect(tx1)
        .to.emit(civicProof, "StatusUpdated")
        .withArgs(complaintId1, 0, 1, ackRecordHash, admin.address, (ts) => ts > 0, ackRemarks);

      let complaint = await civicProof.getComplaint(complaintId1);
      expect(complaint.currentStatus).to.equal(1n);
      expect(complaint.latestRecordHash).to.equal(ackRecordHash);

      // 2. Acknowledged (1) -> InProgress (2)
      const tx2 = await civicProof.connect(admin).updateComplaintStatus(
        complaintId1,
        2, // Status.InProgress
        progressRecordHash,
        progressRemarks
      );

      await expect(tx2)
        .to.emit(civicProof, "StatusUpdated")
        .withArgs(complaintId1, 1, 2, progressRecordHash, admin.address, (ts) => ts > 0, progressRemarks);

      complaint = await civicProof.getComplaint(complaintId1);
      expect(complaint.currentStatus).to.equal(2n);
      expect(complaint.latestRecordHash).to.equal(progressRecordHash);

      // 3. InProgress (2) -> Resolved (3)
      const tx3 = await civicProof.connect(admin).updateComplaintStatus(
        complaintId1,
        3, // Status.Resolved
        resolvedRecordHash,
        resolvedRemarks
      );

      await expect(tx3)
        .to.emit(civicProof, "StatusUpdated")
        .withArgs(complaintId1, 2, 3, resolvedRecordHash, admin.address, (ts) => ts > 0, resolvedRemarks);

      complaint = await civicProof.getComplaint(complaintId1);
      expect(complaint.currentStatus).to.equal(3n);
      expect(complaint.latestRecordHash).to.equal(resolvedRecordHash);
    });
  });

  describe("5. Rejection of Invalid Status Transitions", function () {
    beforeEach(async function () {
      await civicProof.connect(citizen).registerComplaint(
        complaintId1,
        initialRecordHash,
        initialRemarks
      );
    });

    it("should reject skipping states (Submitted -> InProgress or Resolved)", async function () {
      // Cannot skip to InProgress (2)
      await expect(
        civicProof.connect(admin).updateComplaintStatus(complaintId1, 2, progressRecordHash, "Skip test")
      ).to.be.revertedWith("CivicProof: Invalid status transition");

      // Cannot skip to Resolved (3)
      await expect(
        civicProof.connect(admin).updateComplaintStatus(complaintId1, 3, resolvedRecordHash, "Skip test")
      ).to.be.revertedWith("CivicProof: Invalid status transition");
    });

    it("should reject skipping from Acknowledged directly to Resolved", async function () {
      await civicProof.connect(admin).updateComplaintStatus(complaintId1, 1, ackRecordHash, ackRemarks);

      await expect(
        civicProof.connect(admin).updateComplaintStatus(complaintId1, 3, resolvedRecordHash, "Skip test")
      ).to.be.revertedWith("CivicProof: Invalid status transition");
    });

    it("should reject re-applying the same status", async function () {
      // Current is Submitted (0), trying to re-apply Submitted (0)
      await expect(
        civicProof.connect(admin).updateComplaintStatus(complaintId1, 0, initialRecordHash, "Same state")
      ).to.be.revertedWith("CivicProof: Invalid status transition");

      // Move to Acknowledged (1), then try re-applying Acknowledged (1)
      await civicProof.connect(admin).updateComplaintStatus(complaintId1, 1, ackRecordHash, ackRemarks);
      await expect(
        civicProof.connect(admin).updateComplaintStatus(complaintId1, 1, ackRecordHash, "Same state")
      ).to.be.revertedWith("CivicProof: Invalid status transition");
    });

    it("should reject moving backward in status", async function () {
      // Advance to Acknowledged (1)
      await civicProof.connect(admin).updateComplaintStatus(complaintId1, 1, ackRecordHash, ackRemarks);

      // Attempt to move backward to Submitted (0)
      await expect(
        civicProof.connect(admin).updateComplaintStatus(complaintId1, 0, initialRecordHash, "Back to submitted")
      ).to.be.revertedWith("CivicProof: Invalid status transition");

      // Advance to InProgress (2)
      await civicProof.connect(admin).updateComplaintStatus(complaintId1, 2, progressRecordHash, progressRemarks);

      // Attempt to move backward to Acknowledged (1)
      await expect(
        civicProof.connect(admin).updateComplaintStatus(complaintId1, 1, ackRecordHash, "Back to ack")
      ).to.be.revertedWith("CivicProof: Invalid status transition");
    });

    it("should reject transitions after complaint is Resolved", async function () {
      await civicProof.connect(admin).updateComplaintStatus(complaintId1, 1, ackRecordHash, ackRemarks);
      await civicProof.connect(admin).updateComplaintStatus(complaintId1, 2, progressRecordHash, progressRemarks);
      await civicProof.connect(admin).updateComplaintStatus(complaintId1, 3, resolvedRecordHash, resolvedRemarks);

      // Attempt to transition from Resolved (3)
      await expect(
        civicProof.connect(admin).updateComplaintStatus(complaintId1, 2, progressRecordHash, "Reopen attempt")
      ).to.be.revertedWith("CivicProof: Invalid status transition");

      await expect(
        civicProof.connect(admin).updateComplaintStatus(complaintId1, 1, ackRecordHash, "Reopen attempt")
      ).to.be.revertedWith("CivicProof: Invalid status transition");
    });
  });

  describe("6. Rejection of Unauthorized Status Updates", function () {
    beforeEach(async function () {
      await civicProof.connect(citizen).registerComplaint(
        complaintId1,
        initialRecordHash,
        initialRemarks
      );
    });

    it("should reject status update from unauthorized non-admin account", async function () {
      await expect(
        civicProof.connect(attacker).updateComplaintStatus(complaintId1, 1, ackRecordHash, "Malicious update")
      ).to.be.revertedWith("CivicProof: Caller is not an authorized administrator");
    });

    it("should reject status update from citizen themselves", async function () {
      await expect(
        civicProof.connect(citizen).updateComplaintStatus(complaintId1, 1, ackRecordHash, "Citizen update")
      ).to.be.revertedWith("CivicProof: Caller is not an authorized administrator");
    });

    it("should permit status update once an account is authorized by owner", async function () {
      await civicProof.connect(owner).setAdminAuthorization(newAdmin.address, true);

      await expect(
        civicProof.connect(newAdmin).updateComplaintStatus(complaintId1, 1, ackRecordHash, ackRemarks)
      ).to.emit(civicProof, "StatusUpdated");
    });

    it("should reject status update after authorization is revoked", async function () {
      await civicProof.connect(owner).setAdminAuthorization(newAdmin.address, true);
      await civicProof.connect(owner).setAdminAuthorization(newAdmin.address, false);

      await expect(
        civicProof.connect(newAdmin).updateComplaintStatus(complaintId1, 1, ackRecordHash, ackRemarks)
      ).to.be.revertedWith("CivicProof: Caller is not an authorized administrator");
    });
  });

  describe("7. Preservation of Historical Status Entries", function () {
    beforeEach(async function () {
      await civicProof.connect(citizen).registerComplaint(
        complaintId1,
        initialRecordHash,
        initialRemarks
      );
      await civicProof.connect(admin).updateComplaintStatus(
        complaintId1,
        1,
        ackRecordHash,
        ackRemarks
      );
      await civicProof.connect(admin).updateComplaintStatus(
        complaintId1,
        2,
        progressRecordHash,
        progressRemarks
      );
      await civicProof.connect(admin).updateComplaintStatus(
        complaintId1,
        3,
        resolvedRecordHash,
        resolvedRemarks
      );
    });

    it("should preserve all 4 chronological historical checkpoints without data loss", async function () {
      const historyCount = await civicProof.getStatusHistoryCount(complaintId1);
      expect(historyCount).to.equal(4n);

      const history = await civicProof.getStatusHistory(complaintId1);
      expect(history.length).to.equal(4);

      // Checkpoint 0: Submitted
      expect(history[0].status).to.equal(0n);
      expect(history[0].recordHash).to.equal(initialRecordHash);
      expect(history[0].updatedBy).to.equal(citizen.address);
      expect(history[0].remarks).to.equal(initialRemarks);
      expect(history[0].timestamp).to.be.greaterThan(0);

      // Checkpoint 1: Acknowledged
      expect(history[1].status).to.equal(1n);
      expect(history[1].recordHash).to.equal(ackRecordHash);
      expect(history[1].updatedBy).to.equal(admin.address);
      expect(history[1].remarks).to.equal(ackRemarks);

      // Checkpoint 2: InProgress
      expect(history[2].status).to.equal(2n);
      expect(history[2].recordHash).to.equal(progressRecordHash);
      expect(history[2].updatedBy).to.equal(admin.address);
      expect(history[2].remarks).to.equal(progressRemarks);

      // Checkpoint 3: Resolved
      expect(history[3].status).to.equal(3n);
      expect(history[3].recordHash).to.equal(resolvedRecordHash);
      expect(history[3].updatedBy).to.equal(admin.address);
      expect(history[3].remarks).to.equal(resolvedRemarks);
    });

    it("should allow querying individual checkpoints by index with bounds safety", async function () {
      const entry1 = await civicProof.getStatusHistoryEntry(complaintId1, 1);
      expect(entry1.status).to.equal(1n);
      expect(entry1.recordHash).to.equal(ackRecordHash);

      await expect(
        civicProof.getStatusHistoryEntry(complaintId1, 10)
      ).to.be.revertedWith("CivicProof: History index out of bounds");
    });
  });

  describe("8. Successful Cryptographic Verification of Matching Record Hashes", function () {
    beforeEach(async function () {
      await civicProof.connect(citizen).registerComplaint(
        complaintId1,
        initialRecordHash,
        initialRemarks
      );
      await civicProof.connect(admin).updateComplaintStatus(
        complaintId1,
        1,
        ackRecordHash,
        ackRemarks
      );
      await civicProof.connect(admin).updateComplaintStatus(
        complaintId1,
        2,
        progressRecordHash,
        progressRemarks
      );
      await civicProof.connect(admin).updateComplaintStatus(
        complaintId1,
        3,
        resolvedRecordHash,
        resolvedRemarks
      );
    });

    it("should successfully verify latest record with matching hash", async function () {
      const [isValid, currentStatus, currentTimestamp] = await civicProof.verifyLatestRecord(
        complaintId1,
        resolvedRecordHash
      );

      expect(isValid).to.be.true;
      expect(currentStatus).to.equal(3n);
      expect(currentTimestamp).to.be.greaterThan(0);
    });

    it("should successfully verify historical checkpoints with their matching hashes", async function () {
      // Verify Checkpoint 0 (Submitted)
      const [isValid0, status0, updatedBy0] = await civicProof.verifyHistoricalRecord(
        complaintId1,
        0,
        initialRecordHash
      );
      expect(isValid0).to.be.true;
      expect(status0).to.equal(0n);
      expect(updatedBy0).to.equal(citizen.address);

      // Verify Checkpoint 1 (Acknowledged)
      const [isValid1, status1, updatedBy1] = await civicProof.verifyHistoricalRecord(
        complaintId1,
        1,
        ackRecordHash
      );
      expect(isValid1).to.be.true;
      expect(status1).to.equal(1n);
      expect(updatedBy1).to.equal(admin.address);

      // Verify Checkpoint 2 (InProgress)
      const [isValid2, status2] = await civicProof.verifyHistoricalRecord(
        complaintId1,
        2,
        progressRecordHash
      );
      expect(isValid2).to.be.true;
      expect(status2).to.equal(2n);

      // Verify Checkpoint 3 (Resolved)
      const [isValid3, status3] = await civicProof.verifyHistoricalRecord(
        complaintId1,
        3,
        resolvedRecordHash
      );
      expect(isValid3).to.be.true;
      expect(status3).to.equal(3n);
    });
  });

  describe("9. Failure when Supplied Hash Does Not Match Recorded Hash", function () {
    const alteredFakeHash = ethers.keccak256(ethers.toUtf8Bytes("TAMPERED-DATA-RECORD"));

    beforeEach(async function () {
      await civicProof.connect(citizen).registerComplaint(
        complaintId1,
        initialRecordHash,
        initialRemarks
      );
      await civicProof.connect(admin).updateComplaintStatus(
        complaintId1,
        1,
        ackRecordHash,
        ackRemarks
      );
    });

    it("should fail verification when supplied hash does not match latest record", async function () {
      const [isValid, status] = await civicProof.verifyLatestRecord(
        complaintId1,
        alteredFakeHash
      );

      expect(isValid).to.be.false;
      expect(status).to.equal(1n); // Returns current status but isValid is false
    });

    it("should fail verification when supplied hash does not match historical checkpoint", async function () {
      // Mismatched hash on historical entry 0
      const [isValid0] = await civicProof.verifyHistoricalRecord(
        complaintId1,
        0,
        alteredFakeHash
      );
      expect(isValid0).to.be.false;

      // Cross-stage mismatch: passing ackRecordHash for entry 0 (which has initialRecordHash)
      const [isCrossStageMatch] = await civicProof.verifyHistoricalRecord(
        complaintId1,
        0,
        ackRecordHash
      );
      expect(isCrossStageMatch).to.be.false;
    });
  });
});
