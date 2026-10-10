/**
 * CivicProof Blockchain Service & Integration Bridge
 * Ethers.js v6 Browser Client for CivicProof Smart Contract
 *
 * How to load from HTML pages:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.2/ethers.umd.min.js"></script>
 *   <script src="app.js"></script>
 *   <script src="blockchain.js"></script>
 *
 * Standard API exposed on window.BlockchainService and window.blockchain:
 *   - connect(signerOrProvider, networkName)
 *   - registerComplaint(id, recordHashOrDetails, remarks)
 *   - registerComplaintWithDetails(id, detailsHash, remarks)
 *   - updateStatus(id, newStatus, recordHashOrDetails, remarks)
 *   - updateComplaintStatusWithDetails(id, newStatus, detailsHash, remarks)
 *   - verifyComplaint(id, localComplaintRecord)
 *   - getHistory(id) / getStatusHistory(id)
 *   - computeRecordHash(id, status, detailsHash, remarks)
 *   - makeComplaintId(rawId)
 *   - makeDetailsHash(rawContent)
 */

(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Embedded Deployment Artifacts (Fallback if HTTP fetch is unavailable)
  // ---------------------------------------------------------------------------
  const DEFAULT_DEPLOYMENT = {
    network: "localhost",
    chainId: "31337",
    contractName: "CivicProof",
    address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    admin: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    rpcUrl: "http://127.0.0.1:8545"
  };

  const DEFAULT_ABI = [
    "constructor()",
    "event AdminAccessSet(address indexed admin, bool isAuthorized)",
    "event ComplaintRegistered(bytes32 indexed complaintId, address indexed citizen, bytes32 indexed initialRecordHash, uint256 timestamp, string remarks)",
    "event StatusUpdated(bytes32 indexed complaintId, uint8 previousStatus, uint8 newStatus, bytes32 latestRecordHash, address indexed updatedBy, uint256 timestamp, string remarks)",
    "function authorizedAdmins(address) view returns (bool)",
    "function computeRecordHash(bytes32 complaintId, uint8 status, bytes32 detailsHash, string remarks) pure returns (bytes32)",
    "function getComplaint(bytes32 complaintId) view returns (tuple(bytes32 complaintId, uint8 currentStatus, uint256 currentTimestamp, bytes32 latestRecordHash, bool exists))",
    "function getStatusHistory(bytes32 complaintId) view returns (tuple(uint8 status, bytes32 recordHash, address updatedBy, uint256 timestamp, string remarks)[])",
    "function getStatusHistoryCount(bytes32 complaintId) view returns (uint256)",
    "function getStatusHistoryEntry(bytes32 complaintId, uint256 index) view returns (tuple(uint8 status, bytes32 recordHash, address updatedBy, uint256 timestamp, string remarks))",
    "function owner() view returns (address)",
    "function registerComplaint(bytes32 complaintId, bytes32 recordHash, string remarks)",
    "function registerComplaintWithDetails(bytes32 complaintId, bytes32 detailsHash, string remarks) returns (bytes32 recordHash)",
    "function setAdminAuthorization(address admin, bool authorized)",
    "function updateComplaintStatus(bytes32 complaintId, uint8 newStatus, bytes32 newRecordHash, string remarks)",
    "function updateComplaintStatusWithDetails(bytes32 complaintId, uint8 newStatus, bytes32 detailsHash, string remarks) returns (bytes32 newRecordHash)",
    "function verifyHistoricalRecord(bytes32 complaintId, uint256 historyIndex, bytes32 recomputedHash) view returns (bool isValid, uint8 recordStatus, address updatedBy, uint256 timestamp)",
    "function verifyHistoricalRecordData(bytes32 complaintId, uint256 historyIndex, bytes32 detailsHash, string remarks) view returns (bool isValid, uint8 recordStatus, address updatedBy, uint256 timestamp)",
    "function verifyLatestRecord(bytes32 complaintId, bytes32 recomputedHash) view returns (bool isValid, uint8 currentStatus, uint256 currentTimestamp)",
    "function verifyLatestRecordData(bytes32 complaintId, bytes32 detailsHash, string remarks) view returns (bool isValid, uint8 currentStatus, uint256 currentTimestamp)",
    "function verifyRecordByStatus(bytes32 complaintId, uint8 targetStatus, bytes32 recomputedHash) view returns (bool isValid, uint256 historyIndex, uint256 timestamp)",
    "function verifyRecordHash(bytes32 complaintId, bytes32 expectedHash) view returns (bool isMatch, uint8 currentStatus, uint256 currentTimestamp)"
  ];

  // ---------------------------------------------------------------------------
  // Constants & Enums
  // ---------------------------------------------------------------------------
  const STATUS = Object.freeze({
    SUBMITTED: 0,
    ACKNOWLEDGED: 1,
    IN_PROGRESS: 2,
    RESOLVED: 3
  });

  const STATUS_LABELS = Object.freeze({
    0: "Submitted",
    1: "Acknowledged",
    2: "InProgress",
    3: "Resolved"
  });

  const STATUS_MAP = Object.freeze({
    open: 0,
    submitted: 0,
    acknowledged: 1,
    progress: 2,
    inprogress: 2,
    resolved: 3,
    closed: 3
  });

  // ---------------------------------------------------------------------------
  // Internal State
  // ---------------------------------------------------------------------------
  let _contract = null;
  let _provider = null;
  let _signer = null;
  let _contractAddress = DEFAULT_DEPLOYMENT.address;
  let _abi = DEFAULT_ABI;
  let _network = DEFAULT_DEPLOYMENT.network;
  let _chainId = DEFAULT_DEPLOYMENT.chainId;
  let _adminAddress = DEFAULT_DEPLOYMENT.admin;
  let _isConnecting = false;

  // Helper to ensure Ethers v6 is available
  async function _ensureEthers() {
    if (global.ethers) return global.ethers;

    // Try dynamic CDN load if ethers is missing
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src*="ethers"]')) {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (global.ethers) {
            clearInterval(interval);
            resolve(global.ethers);
          } else if (attempts > 50) {
            clearInterval(interval);
            reject(new Error("Ethers.js script tag found but global.ethers failed to load."));
          }
        }, 100);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.2/ethers.umd.min.js";
      script.onload = () => {
        if (global.ethers) resolve(global.ethers);
        else reject(new Error("Ethers.js loaded from CDN but window.ethers is undefined."));
      };
      script.onerror = () => reject(new Error("Failed to load Ethers.js library from CDN."));
      document.head.appendChild(script);
    });
  }

  /** Normalizes raw complaint ID to 32-byte hex bytes32 string */
  function makeComplaintId(rawId) {
    if (!rawId) throw new Error("makeComplaintId requires a valid ID");
    const eth = global.ethers;
    if (typeof rawId === "string" && rawId.startsWith("0x") && rawId.length === 66) {
      return rawId;
    }
    return eth.keccak256(eth.toUtf8Bytes(String(rawId)));
  }

  /** Normalizes raw details content to 32-byte hex bytes32 string */
  function makeDetailsHash(rawContent) {
    if (!rawContent && rawContent !== "") throw new Error("makeDetailsHash requires content");
    const eth = global.ethers;
    if (typeof rawContent === "string" && rawContent.startsWith("0x") && rawContent.length === 66) {
      return rawContent;
    }
    return eth.keccak256(eth.toUtf8Bytes(String(rawContent)));
  }

  /** Map status string or integer to canonical status enum integer */
  function parseStatusEnum(statusVal) {
    if (typeof statusVal === "number" && statusVal >= 0 && statusVal <= 3) {
      return statusVal;
    }
    const key = String(statusVal).toLowerCase().trim();
    if (STATUS_MAP[key] !== undefined) {
      return STATUS_MAP[key];
    }
    return STATUS.SUBMITTED;
  }

  /** Returns human readable status label */
  function statusLabel(statusInt) {
    return STATUS_LABELS[Number(statusInt)] ?? `Unknown(${statusInt})`;
  }

  /** Off-chain deterministic hash computation matching Solidity computeRecordHash */
  function computeRecordHash(complaintId, status, detailsHash, remarks) {
    const eth = global.ethers;
    const cId = makeComplaintId(complaintId);
    const sInt = parseStatusEnum(status);
    const dHash = makeDetailsHash(detailsHash);
    const remarksHash = eth.keccak256(eth.toUtf8Bytes(remarks || ""));

    const abiCoder = eth.AbiCoder.defaultAbiCoder();
    const encoded = abiCoder.encode(
      ["bytes32", "uint8", "bytes32", "bytes32"],
      [cId, sInt, dHash, remarksHash]
    );
    return eth.keccak256(encoded);
  }

  /** Fetches deployment manifest if served via HTTP, fallback to defaults */
  async function _loadDeploymentArtifacts(networkName = "localhost") {
    try {
      const manifestRes = await fetch(`/deployments/${networkName}.json`);
      if (manifestRes.ok) {
        const manifest = await manifestRes.json();
        _contractAddress = manifest.address || DEFAULT_DEPLOYMENT.address;
        _network = manifest.network || networkName;
        _chainId = manifest.chainId || DEFAULT_DEPLOYMENT.chainId;
        _adminAddress = manifest.admin || DEFAULT_DEPLOYMENT.admin;
      }
    } catch {
      // Ignore fetch errors when opening directly from file system
    }

    try {
      const abiRes = await fetch(`/deployments/${networkName}.abi.json`);
      if (abiRes.ok) {
        _abi = await abiRes.json();
      }
    } catch {
      // Fallback to DEFAULT_ABI
    }
  }

  /**
   * Main connection method for CivicProof contract (Read-only or provided signer)
   */
  async function connect(signerOrProvider = null, networkName = "localhost") {
    if (_isConnecting) return;
    _isConnecting = true;

    try {
      const eth = await _ensureEthers();
      await _loadDeploymentArtifacts(networkName);

      if (signerOrProvider) {
        if (typeof signerOrProvider.sendTransaction === "function") {
          _signer = signerOrProvider;
          _provider = signerOrProvider.provider;
        } else {
          _provider = signerOrProvider;
          _signer = null;
        }
      } else if (global.ethereum) {
        try {
          const browserProvider = new eth.BrowserProvider(global.ethereum);
          _provider = browserProvider;
          const accounts = await browserProvider.listAccounts();
          if (accounts && accounts.length > 0) {
            _signer = await browserProvider.getSigner();
          } else {
            _signer = null;
          }
        } catch {
          _provider = new eth.JsonRpcProvider(DEFAULT_DEPLOYMENT.rpcUrl);
          _signer = null;
        }
      } else {
        _provider = new eth.JsonRpcProvider(DEFAULT_DEPLOYMENT.rpcUrl);
        _signer = null;
      }

      const connectionTarget = _signer || _provider;
      _contract = new eth.Contract(_contractAddress, _abi, connectionTarget);

      return {
        connected: true,
        address: _contractAddress,
        admin: _adminAddress,
        chainId: _chainId,
        network: _network,
        hasSigner: !!_signer
      };
    } catch (err) {
      console.warn("CivicProof BlockchainService connect warning:", err.message);
      return {
        connected: false,
        error: err.message,
        address: _contractAddress,
        hasSigner: false
      };
    } finally {
      _isConnecting = false;
    }
  }

  /**
   * Explicitly requests browser Web3 wallet account access (MetaMask eth_requestAccounts)
   */
  async function connectWallet() {
    const eth = await _ensureEthers();
    if (!global.ethereum) {
      throw new Error("No Web3 wallet extension detected in browser. Please install MetaMask or use a Web3 browser.");
    }
    const browserProvider = new eth.BrowserProvider(global.ethereum);
    _provider = browserProvider;
    await browserProvider.send("eth_requestAccounts", []);
    _signer = await browserProvider.getSigner();
    _contract = new eth.Contract(_contractAddress, _abi, _signer);
    const address = await _signer.getAddress();
    return {
      connected: true,
      address,
      signer: _signer,
      provider: _provider
    };
  }

  /** Assert connected contract */
  async function _requireContract() {
    if (!_contract) {
      await connect();
    }
    if (!_contract) {
      throw new Error("BlockchainService: Smart contract connection unavailable.");
    }
    return _contract;
  }

  /** Helper to validate smart contract sequential transition rules */
  function _isValidTransition(currentStatus, nextStatus) {
    const c = Number(currentStatus);
    const n = Number(nextStatus);
    if (c === 0 && n === 1) return true; // Submitted -> Acknowledged
    if (c === 1 && n === 2) return true; // Acknowledged -> InProgress
    if (c === 2 && n === 3) return true; // InProgress -> Resolved
    return false;
  }

  /**
   * Register a new complaint on-chain
   */
  async function registerComplaint(complaintId, recordHashOrDetails, remarks = "") {
    const eth = await _ensureEthers();
    const contract = await _requireContract();

    const cId = makeComplaintId(complaintId);

    // 1. Check if already registered on-chain to prevent duplicate registration
    try {
      const existing = await contract.getComplaint(cId);
      if (existing && existing.exists) {
        return {
          success: true,
          alreadyRegistered: true,
          complaintId: cId,
          recordHash: existing.latestRecordHash,
          currentStatus: Number(existing.currentStatus),
          message: "Complaint is already registered on-chain."
        };
      }
    } catch {
      // Proceed with registration if check fails
    }

    // Ensure transaction-capable signer is available
    if (!_signer && global.ethereum) {
      try { await connectWallet(); } catch { /* Ignore if user declines */ }
    }

    let isDirectHash = typeof recordHashOrDetails === "string" && recordHashOrDetails.startsWith("0x") && recordHashOrDetails.length === 66;

    let tx, receipt;
    if (isDirectHash) {
      tx = await contract.registerComplaint(cId, recordHashOrDetails, remarks);
      receipt = await tx.wait();
      return {
        success: true,
        alreadyRegistered: false,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        complaintId: cId,
        recordHash: recordHashOrDetails
      };
    } else {
      const detailsHash = makeDetailsHash(recordHashOrDetails);
      tx = await contract.registerComplaintWithDetails(cId, detailsHash, remarks);
      receipt = await tx.wait();

      const parsedEvent = receipt.logs
        .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
        .find(e => e?.name === "ComplaintRegistered");

      const generatedHash = parsedEvent?.args?.initialRecordHash || computeRecordHash(cId, STATUS.SUBMITTED, detailsHash, remarks);
      return {
        success: true,
        alreadyRegistered: false,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        complaintId: cId,
        recordHash: generatedHash
      };
    }
  }

  /** Convenience alias for registration with details */
  async function registerComplaintWithDetails(complaintId, detailsHash, remarks = "") {
    return registerComplaint(complaintId, detailsHash, remarks);
  }

  /**
   * Update complaint status on-chain (admin authorized)
   */
  async function updateStatus(complaintId, newStatus, recordHashOrDetails, remarks = "") {
    const eth = await _ensureEthers();
    const contract = await _requireContract();

    const cId = makeComplaintId(complaintId);
    const sInt = parseStatusEnum(newStatus);

    // 1. Check on-chain complaint existence
    const existing = await contract.getComplaint(cId);
    if (!existing || !existing.exists) {
      throw new Error(`Cannot update status: Complaint '${complaintId}' is not registered on-chain.`);
    }

    // 2. Enforce sequential status transition rules
    const currentStatus = Number(existing.currentStatus);
    if (!_isValidTransition(currentStatus, sInt)) {
      const currLabel = statusLabel(currentStatus);
      const nextLabel = statusLabel(sInt);
      throw new Error(`Invalid status transition: Cannot move from '${currLabel}' (${currentStatus}) to '${nextLabel}' (${sInt}). Allowed order: Submitted -> Acknowledged -> InProgress -> Resolved.`);
    }

    // 3. Admin signer authorization check
    if (!_signer && global.ethereum) {
      try {
        await connectWallet();
      } catch (wErr) {
        throw new Error(`Wallet connection required: ${wErr.message || "User rejected connection."}`);
      }
    }

    if (!_signer) {
      throw new Error("No transaction-capable Web3 signer wallet connected. Admin status updates require an authorized wallet signer.");
    }

    const signerAddr = await _signer.getAddress();
    const isOwner = (await contract.owner()).toLowerCase() === signerAddr.toLowerCase();
    const isAuthorizedAdmin = await contract.authorizedAdmins(signerAddr);

    if (!isOwner && !isAuthorizedAdmin) {
      throw new Error(`Unauthorized wallet address (${signerAddr}). Only authorized administrators can update status on CivicProof.`);
    }

    const isDirectHash = typeof recordHashOrDetails === "string" && recordHashOrDetails.startsWith("0x") && recordHashOrDetails.length === 66;

    let tx, receipt;
    if (isDirectHash) {
      tx = await contract.updateComplaintStatus(cId, sInt, recordHashOrDetails, remarks);
      receipt = await tx.wait();
      return {
        success: true,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        complaintId: cId,
        newStatus: sInt,
        recordHash: recordHashOrDetails
      };
    } else {
      const detailsHash = makeDetailsHash(recordHashOrDetails);
      tx = await contract.updateComplaintStatusWithDetails(cId, sInt, detailsHash, remarks);
      receipt = await tx.wait();

      const parsedEvent = receipt.logs
        .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
        .find(e => e?.name === "StatusUpdated");

      const generatedHash = parsedEvent?.args?.latestRecordHash || computeRecordHash(cId, sInt, detailsHash, remarks);
      return {
        success: true,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        complaintId: cId,
        newStatus: sInt,
        recordHash: generatedHash
      };
    }
  }

  /** Convenience alias for status updates */
  async function updateComplaintStatusWithDetails(complaintId, newStatus, detailsHash, remarks = "") {
    return updateStatus(complaintId, newStatus, detailsHash, remarks);
  }

  /**
   * Fetch on-chain status history
   */
  async function getHistory(complaintId) {
    const eth = await _ensureEthers();
    const contract = await _requireContract();

    const cId = makeComplaintId(complaintId);
    const rawHistory = await contract.getStatusHistory(cId);

    return rawHistory.map(entry => ({
      status: Number(entry.status),
      statusLabel: statusLabel(entry.status),
      recordHash: entry.recordHash,
      updatedBy: entry.updatedBy,
      timestamp: Number(entry.timestamp),
      remarks: entry.remarks
    }));
  }

  /**
   * Comprehensive verification function used by verify.html
   * Verifies EVERY historical checkpoint using exact stored on-chain remarks and contract interface.
   */
  async function verifyComplaint(id, localComplaintRecord) {
    try {
      const eth = await _ensureEthers();
      await connect();

      if (!_contract) {
        return {
          status: "DEMO_UNCONNECTED",
          isValid: false,
          message: "The blockchain network is disconnected. Connect a local Hardhat node (http://127.0.0.1:8545) or Web3 provider to verify live on-chain audit checkpoints."
        };
      }

      const cId = makeComplaintId(id);
      let complaint;
      try {
        complaint = await _contract.getComplaint(cId);
      } catch (e) {
        return {
          status: "NOT_FOUND_ON_CHAIN",
          isValid: false,
          message: "Record not found on-chain. This complaint exists in the local database but has no recorded on-chain checkpoint.",
          contractAddress: _contractAddress
        };
      }

      if (!complaint || !complaint.exists) {
        return {
          status: "NOT_FOUND_ON_CHAIN",
          isValid: false,
          message: "Record not found on-chain. This complaint exists in the local database but has no recorded on-chain checkpoint.",
          contractAddress: _contractAddress
        };
      }

      // Fetch complete on-chain status history array
      let rawHistory;
      try {
        rawHistory = await _contract.getStatusHistory(cId);
      } catch (histErr) {
        return {
          status: "DEMO_UNCONNECTED",
          isValid: false,
          message: `History Read Failure: Could not read complete on-chain status history (${histErr.message}). Verification aborted.`
        };
      }

      if (!rawHistory || rawHistory.length === 0) {
        return {
          status: "TAMPERED",
          isValid: false,
          message: "On-Chain History Empty! No history entries found on-chain for registered complaint.",
          contractAddress: _contractAddress
        };
      }

      const historyLogs = rawHistory.map(h => ({
        status: Number(h.status),
        statusLabel: statusLabel(h.status),
        recordHash: h.recordHash,
        updatedBy: h.updatedBy,
        timestamp: Number(h.timestamp),
        remarks: h.remarks
      }));

      const localHistory = localComplaintRecord?.history || [];

      // Verify EVERY historical checkpoint on-chain using contract verifyHistoricalRecord
      for (let i = 0; i < historyLogs.length; i++) {
        const onChainEntry = historyLogs[i];

        // Determine details for checkpoint i
        let detailsContent;
        if (i === 0) {
          detailsContent = localComplaintRecord?.description || localComplaintRecord?.title || id;
        } else {
          detailsContent = localHistory[i]?.description || localComplaintRecord?.description || localComplaintRecord?.title || id;
        }
        const detailsHash = makeDetailsHash(detailsContent);

        // Exact remarks recorded on-chain for checkpoint i
        const checkpointRemarks = onChainEntry.remarks || (i === 0 ? (localComplaintRecord?.title || "") : `Admin status update: ${statusLabel(onChainEntry.status)}`);

        // Compute expected hash for checkpoint i using checkpoint's own status, detailsHash, and remarks
        const expectedHashForCheck = computeRecordHash(cId, onChainEntry.status, detailsHash, checkpointRemarks);

        // Call smart contract view function verifyHistoricalRecord
        let isCheckValid = false;
        try {
          const [isValid] = await _contract.verifyHistoricalRecord(cId, i, expectedHashForCheck);
          isCheckValid = isValid;
        } catch {
          isCheckValid = (onChainEntry.recordHash.toLowerCase() === expectedHashForCheck.toLowerCase());
        }

        if (!isCheckValid) {
          return {
            status: "TAMPERED",
            isValid: false,
            failingIndex: i,
            failingStatus: onChainEntry.statusLabel,
            message: `Integrity Check Failed at Checkpoint #${i} (${onChainEntry.statusLabel})! Off-chain details digest does not match on-chain record hash (${onChainEntry.recordHash}).`,
            contractAddress: _contractAddress,
            latestRecordHash: complaint.latestRecordHash,
            expectedHash: expectedHashForCheck,
            history: historyLogs
          };
        }
      }

      // Check current status match
      const localCurrentStatusInt = parseStatusEnum(localComplaintRecord?.status ?? complaint.currentStatus);
      if (localCurrentStatusInt !== Number(complaint.currentStatus)) {
        return {
          status: "TAMPERED",
          isValid: false,
          message: `Status Mismatch! Local status '${localComplaintRecord?.status}' (${localCurrentStatusInt}) differs from latest on-chain status '${statusLabel(complaint.currentStatus)}' (${complaint.currentStatus}).`,
          contractAddress: _contractAddress,
          latestRecordHash: complaint.latestRecordHash,
          currentStatus: Number(complaint.currentStatus),
          history: historyLogs
        };
      }

      // Explicitly verify latest record hash
      const latestExpectedHash = historyLogs[historyLogs.length - 1].recordHash;
      let isLatestValid = false;
      try {
        const [isVal] = await _contract.verifyLatestRecord(cId, latestExpectedHash);
        isLatestValid = isVal;
      } catch {
        isLatestValid = (complaint.latestRecordHash.toLowerCase() === latestExpectedHash.toLowerCase());
      }

      if (!isLatestValid) {
        return {
          status: "TAMPERED",
          isValid: false,
          message: "Latest Checkpoint Verification Failed! The latest on-chain record hash failed contract verification.",
          contractAddress: _contractAddress,
          latestRecordHash: complaint.latestRecordHash,
          history: historyLogs
        };
      }

      // All historical checkpoints and latest status pass verification
      return {
        status: "VERIFIED",
        isValid: true,
        message: `Cryptographic Audit Passed! Verified all ${historyLogs.length} historical checkpoints and current status on-chain.`,
        contractAddress: _contractAddress,
        latestRecordHash: complaint.latestRecordHash,
        currentStatus: Number(complaint.currentStatus),
        currentStatusLabel: statusLabel(complaint.currentStatus),
        currentTimestamp: Number(complaint.currentTimestamp),
        history: historyLogs
      };

    } catch (err) {
      console.warn("verifyComplaint error:", err);
      return {
        status: "DEMO_UNCONNECTED",
        isValid: false,
        message: `Verification error: ${err.message || "Failed to communicate with smart contract."}`
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Expose API Service on window.BlockchainService & window.blockchain
  // ---------------------------------------------------------------------------
  const BlockchainService = {
    // Core state
    STATUS,
    STATUS_LABELS,

    // Methods
    connect,
    connectWallet,
    registerComplaint,
    registerComplaintWithDetails,
    updateStatus,
    updateComplaintStatusWithDetails,
    getHistory,
    getStatusHistory: getHistory,
    verifyComplaint,
    computeRecordHash,
    makeComplaintId,
    makeDetailsHash,

    // Low-level contract direct methods
    getComplaint: async (id) => {
      const contract = await _requireContract();
      return contract.getComplaint(makeComplaintId(id));
    },
    verifyLatestRecord: async (id, hash) => {
      const contract = await _requireContract();
      return contract.verifyLatestRecord(makeComplaintId(id), hash);
    },
    verifyHistoricalRecord: async (id, idx, hash) => {
      const contract = await _requireContract();
      return contract.verifyHistoricalRecord(makeComplaintId(id), idx, hash);
    }
  };

  // Assign to global scope for browser compatibility
  global.BlockchainService = BlockchainService;
  global.blockchain = BlockchainService;

  // Auto-connect in background if window is ready
  if (typeof document !== "undefined") {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      setTimeout(() => connect(), 100);
    } else {
      document.addEventListener("DOMContentLoaded", () => connect());
    }
  }

})(typeof window !== "undefined" ? window : globalThis);
