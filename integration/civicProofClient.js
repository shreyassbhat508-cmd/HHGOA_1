/**
 * CivicProof Integration Module
 * Ethers.js v6 – compatible with ethers@6.17.0
 *
 * Usage:
 *   const client = require('./integration/civicProofClient');
 *   await client.connect(providerOrSigner);
 *
 * Status enum (matches Solidity):
 *   0 = Submitted  1 = Acknowledged  2 = InProgress  3 = Resolved
 */

"use strict";

const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS = Object.freeze({
  SUBMITTED: 0,
  ACKNOWLEDGED: 1,
  IN_PROGRESS: 2,
  RESOLVED: 3,
});

const STATUS_LABELS = Object.freeze({
  0: "Submitted",
  1: "Acknowledged",
  2: "InProgress",
  3: "Resolved",
});

// ---------------------------------------------------------------------------
// Module state (set once via connect())
// ---------------------------------------------------------------------------

let _contract = null;   // ethers.Contract instance
let _provider = null;   // JsonRpcProvider or BrowserProvider
let _signer = null;     // Signer (required for write operations)

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Loads deployment manifest from deployments/<network>.json.
 * @param {string} networkName - 'localhost' | 'hardhat' | any network name.
 */
function _loadManifest(networkName) {
  const manifestPath = path.resolve(
    __dirname, "..", "deployments", `${networkName}.json`
  );
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `CivicProofClient: No deployment manifest found at ${manifestPath}.\n` +
      `Run:  npx hardhat run scripts/deploy.js --network ${networkName}`
    );
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

/**
 * Loads the ABI from deployments/<network>.abi.json.
 */
function _loadABI(networkName) {
  const abiPath = path.resolve(
    __dirname, "..", "deployments", `${networkName}.abi.json`
  );
  if (!fs.existsSync(abiPath)) {
    throw new Error(
      `CivicProofClient: No ABI file found at ${abiPath}. Re-run the deploy script.`
    );
  }
  return JSON.parse(fs.readFileSync(abiPath, "utf8"));
}

/** Asserts that the module has been connected before any call. */
function _assertConnected() {
  if (!_contract) {
    throw new Error(
      "CivicProofClient: Not connected. Call civicProofClient.connect() first."
    );
  }
}

/** Derives a bytes32 complaint ID from any string using keccak256. */
function makeComplaintId(rawId) {
  return ethers.keccak256(ethers.toUtf8Bytes(rawId));
}

/** Derives a bytes32 details hash from raw string content using keccak256. */
function makeDetailsHash(rawContent) {
  return ethers.keccak256(ethers.toUtf8Bytes(rawContent));
}

/** Maps a numeric status back to a human-readable label. */
function statusLabel(statusInt) {
  return STATUS_LABELS[Number(statusInt)] ?? `Unknown(${statusInt})`;
}

/** Serialises a Complaint struct returned from the contract into a plain object. */
function _serializeComplaint(raw) {
  return {
    complaintId: raw.complaintId,
    currentStatus: Number(raw.currentStatus),
    currentStatusLabel: statusLabel(raw.currentStatus),
    currentTimestamp: Number(raw.currentTimestamp),
    latestRecordHash: raw.latestRecordHash,
    exists: raw.exists,
  };
}

/** Serialises a StatusHistoryEntry struct into a plain object. */
function _serializeHistoryEntry(raw) {
  return {
    status: Number(raw.status),
    statusLabel: statusLabel(raw.status),
    recordHash: raw.recordHash,
    updatedBy: raw.updatedBy,
    timestamp: Number(raw.timestamp),
    remarks: raw.remarks,
  };
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * Connects the client to the deployed CivicProof contract.
 *
 * @param {ethers.Signer | ethers.Provider} signerOrProvider
 *   - Pass a Signer for write operations (register, update status).
 *   - Pass a Provider for read-only access (queries, verification).
 * @param {string} [networkName='localhost']
 *   Name of the deployment network (must match a file in deployments/).
 * @returns {{ address: string, admin: string, chainId: string }}
 *   Deployment metadata.
 *
 * Node.js example:
 *   const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
 *   const signer = await provider.getSigner();
 *   await civicProofClient.connect(signer, 'localhost');
 *
 * Browser / MetaMask example:
 *   const provider = new ethers.BrowserProvider(window.ethereum);
 *   const signer = await provider.getSigner();
 *   await civicProofClient.connect(signer, 'localhost');
 */
async function connect(signerOrProvider, networkName = "localhost") {
  const manifest = _loadManifest(networkName);
  const abi = _loadABI(networkName);

  // Duck-type check: signers expose sendTransaction; providers do not
  if (typeof signerOrProvider.sendTransaction === "function") {
    _signer = signerOrProvider;
    _provider = signerOrProvider.provider;
  } else {
    _provider = signerOrProvider;
    _signer = null;
  }

  _contract = new ethers.Contract(manifest.address, abi, signerOrProvider);

  return {
    address: manifest.address,
    admin: manifest.admin,
    chainId: manifest.chainId,
    network: manifest.network,
  };
}

// ---------------------------------------------------------------------------
// Complaint Registration
// ---------------------------------------------------------------------------

/**
 * Registers a new grievance on-chain.
 *
 * The caller supplies a pre-computed recordHash (bytes32).
 * Use computeRecordHash() or makeDetailsHash() to produce this off-chain.
 *
 * @param {string} complaintId - bytes32 hex string (use makeComplaintId()).
 * @param {string} recordHash  - bytes32 hex string (use makeDetailsHash() + computeRecordHash()).
 * @param {string} remarks     - Short audit remark or category tag. No PII.
 * @returns {object} { tx, receipt, complaintId, recordHash }
 */
async function registerComplaint(complaintId, recordHash, remarks) {
  _assertConnected();
  try {
    const tx = await _contract.registerComplaint(complaintId, recordHash, remarks);
    const receipt = await tx.wait();
    return { tx, receipt, complaintId, recordHash };
  } catch (err) {
    throw new Error(`registerComplaint failed: ${_parseError(err)}`);
  }
}

/**
 * Convenience registration: computes the canonical on-chain record hash
 * from (complaintId, detailsHash, remarks) and registers in one call.
 *
 * @param {string} complaintId  - bytes32 hex string.
 * @param {string} detailsHash  - bytes32 sha-256 / keccak of off-chain document.
 * @param {string} remarks      - Short audit tag.
 * @returns {object} { tx, receipt, complaintId, recordHash }
 */
async function registerComplaintWithDetails(complaintId, detailsHash, remarks) {
  _assertConnected();
  try {
    const tx = await _contract.registerComplaintWithDetails(
      complaintId,
      detailsHash,
      remarks
    );
    const receipt = await tx.wait();
    // Recover the generated recordHash from the emitted event
    const event = receipt.logs
      .map((log) => {
        try { return _contract.interface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "ComplaintRegistered");
    const recordHash = event?.args?.initialRecordHash ?? null;
    return { tx, receipt, complaintId, recordHash };
  } catch (err) {
    throw new Error(`registerComplaintWithDetails failed: ${_parseError(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Status Updates (admin only)
// ---------------------------------------------------------------------------

/**
 * Updates the lifecycle status of an existing complaint.
 * Caller must be an authorized administrator.
 *
 * @param {string} complaintId   - bytes32 hex string.
 * @param {number} newStatus     - Use STATUS constant: STATUS.ACKNOWLEDGED etc.
 * @param {string} newRecordHash - bytes32 hash of latest off-chain evidence.
 * @param {string} remarks       - Audit remark for this transition.
 * @returns {object} { tx, receipt }
 */
async function updateComplaintStatus(complaintId, newStatus, newRecordHash, remarks) {
  _assertConnected();
  try {
    const tx = await _contract.updateComplaintStatus(
      complaintId,
      newStatus,
      newRecordHash,
      remarks
    );
    const receipt = await tx.wait();
    return { tx, receipt };
  } catch (err) {
    throw new Error(`updateComplaintStatus failed: ${_parseError(err)}`);
  }
}

/**
 * Convenience update: computes canonical on-chain record hash then updates.
 *
 * @param {string} complaintId - bytes32 hex string.
 * @param {number} newStatus   - STATUS.ACKNOWLEDGED | IN_PROGRESS | RESOLVED.
 * @param {string} detailsHash - bytes32 digest of off-chain evidence.
 * @param {string} remarks     - Audit remark.
 * @returns {object} { tx, receipt, newRecordHash }
 */
async function updateComplaintStatusWithDetails(
  complaintId,
  newStatus,
  detailsHash,
  remarks
) {
  _assertConnected();
  try {
    const tx = await _contract.updateComplaintStatusWithDetails(
      complaintId,
      newStatus,
      detailsHash,
      remarks
    );
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => {
        try { return _contract.interface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "StatusUpdated");
    const newRecordHash = event?.args?.latestRecordHash ?? null;
    return { tx, receipt, newRecordHash };
  } catch (err) {
    throw new Error(`updateComplaintStatusWithDetails failed: ${_parseError(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Complaint Retrieval
// ---------------------------------------------------------------------------

/**
 * Returns current state of a complaint.
 *
 * @param {string} complaintId - bytes32 hex string.
 * @returns {object} Serialised Complaint struct.
 */
async function getComplaint(complaintId) {
  _assertConnected();
  try {
    const raw = await _contract.getComplaint(complaintId);
    return _serializeComplaint(raw);
  } catch (err) {
    throw new Error(`getComplaint failed: ${_parseError(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Status History Retrieval
// ---------------------------------------------------------------------------

/**
 * Returns the full chronological status history of a complaint.
 *
 * @param {string} complaintId - bytes32 hex string.
 * @returns {Array} Array of serialised StatusHistoryEntry objects.
 */
async function getStatusHistory(complaintId) {
  _assertConnected();
  try {
    const raw = await _contract.getStatusHistory(complaintId);
    return raw.map(_serializeHistoryEntry);
  } catch (err) {
    throw new Error(`getStatusHistory failed: ${_parseError(err)}`);
  }
}

/**
 * Returns the total count of status history entries.
 *
 * @param {string} complaintId - bytes32 hex string.
 * @returns {number}
 */
async function getStatusHistoryCount(complaintId) {
  _assertConnected();
  try {
    const count = await _contract.getStatusHistoryCount(complaintId);
    return Number(count);
  } catch (err) {
    throw new Error(`getStatusHistoryCount failed: ${_parseError(err)}`);
  }
}

/**
 * Returns a single historical checkpoint by index.
 *
 * @param {string} complaintId - bytes32 hex string.
 * @param {number} index       - 0-based index.
 * @returns {object} Serialised StatusHistoryEntry.
 */
async function getStatusHistoryEntry(complaintId, index) {
  _assertConnected();
  try {
    const raw = await _contract.getStatusHistoryEntry(complaintId, index);
    return _serializeHistoryEntry(raw);
  } catch (err) {
    throw new Error(`getStatusHistoryEntry failed: ${_parseError(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Cryptographic Record Verification
// ---------------------------------------------------------------------------

/**
 * Computes the deterministic canonical record hash on-chain.
 * Use the result as the expected value in verify calls.
 *
 * Canonical schema:
 *   keccak256(abi.encode(complaintId, status, detailsHash, keccak256(bytes(remarks))))
 *
 * @param {string} complaintId - bytes32 hex string.
 * @param {number} status      - Status integer (0-3).
 * @param {string} detailsHash - bytes32 off-chain document digest.
 * @param {string} remarks     - Audit remark (must match stored value exactly).
 * @returns {string} bytes32 record hash.
 */
async function computeRecordHash(complaintId, status, detailsHash, remarks) {
  _assertConnected();
  try {
    return await _contract.computeRecordHash(complaintId, status, detailsHash, remarks);
  } catch (err) {
    throw new Error(`computeRecordHash failed: ${_parseError(err)}`);
  }
}

/**
 * Verifies the latest on-chain record hash for a complaint.
 *
 * NOTE: A match proves cryptographic consistency with recorded data.
 * It does NOT prove real-world resolution.
 *
 * @param {string} complaintId    - bytes32 hex string.
 * @param {string} recomputedHash - bytes32 to compare against.
 * @returns {{ isValid: boolean, currentStatus: number, currentStatusLabel: string, currentTimestamp: number }}
 */
async function verifyLatestRecord(complaintId, recomputedHash) {
  _assertConnected();
  try {
    const [isValid, currentStatus, currentTimestamp] =
      await _contract.verifyLatestRecord(complaintId, recomputedHash);
    return {
      isValid,
      currentStatus: Number(currentStatus),
      currentStatusLabel: statusLabel(currentStatus),
      currentTimestamp: Number(currentTimestamp),
    };
  } catch (err) {
    throw new Error(`verifyLatestRecord failed: ${_parseError(err)}`);
  }
}

/**
 * Verifies a historical checkpoint by index.
 *
 * @param {string} complaintId    - bytes32 hex string.
 * @param {number} historyIndex   - 0-based index.
 * @param {string} recomputedHash - bytes32 to compare against.
 * @returns {{ isValid: boolean, recordStatus: number, recordStatusLabel: string, updatedBy: string, timestamp: number }}
 */
async function verifyHistoricalRecord(complaintId, historyIndex, recomputedHash) {
  _assertConnected();
  try {
    const [isValid, recordStatus, updatedBy, timestamp] =
      await _contract.verifyHistoricalRecord(complaintId, historyIndex, recomputedHash);
    return {
      isValid,
      recordStatus: Number(recordStatus),
      recordStatusLabel: statusLabel(recordStatus),
      updatedBy,
      timestamp: Number(timestamp),
    };
  } catch (err) {
    throw new Error(`verifyHistoricalRecord failed: ${_parseError(err)}`);
  }
}

/**
 * Finds the history entry matching targetStatus and verifies its hash.
 *
 * @param {string} complaintId - bytes32 hex string.
 * @param {number} targetStatus - STATUS constant (0-3).
 * @param {string} recomputedHash - bytes32 to compare.
 * @returns {{ isValid: boolean, historyIndex: number, timestamp: number }}
 */
async function verifyRecordByStatus(complaintId, targetStatus, recomputedHash) {
  _assertConnected();
  try {
    const [isValid, historyIndex, timestamp] =
      await _contract.verifyRecordByStatus(complaintId, targetStatus, recomputedHash);
    return { isValid, historyIndex: Number(historyIndex), timestamp: Number(timestamp) };
  } catch (err) {
    throw new Error(`verifyRecordByStatus failed: ${_parseError(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Internal error parser
// ---------------------------------------------------------------------------

function _parseError(err) {
  // Unwrap Ethers v6 revert reason if available
  if (err?.revert?.args?.length) return err.revert.args[0];
  if (err?.reason) return err.reason;
  if (err?.message) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Connection
  connect,

  // Utility
  makeComplaintId,
  makeDetailsHash,
  statusLabel,
  computeRecordHash,
  STATUS,
  STATUS_LABELS,

  // Registration
  registerComplaint,
  registerComplaintWithDetails,

  // Admin status updates
  updateComplaintStatus,
  updateComplaintStatusWithDetails,

  // Retrieval
  getComplaint,
  getStatusHistory,
  getStatusHistoryCount,
  getStatusHistoryEntry,

  // Verification
  verifyLatestRecord,
  verifyHistoricalRecord,
  verifyRecordByStatus,
};
