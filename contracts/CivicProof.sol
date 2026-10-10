// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CivicProof
 * @notice Transparent public grievance tracking system with verifiable, immutable status history.
 * @dev Protects citizen privacy by storing cryptographic record hashes instead of raw grievance details or PII.
 *
 * NOTE ON CRYPTOGRAPHIC INTEGRITY:
 * A matching cryptographic record hash verifies consistency and non-tampering of the off-chain record
 * against the authoritative timestamped on-chain checkpoint. It does NOT claim or prove that a complaint
 * was genuinely investigated, physically resolved, or truthful in the real world; it strictly verifies
 * cryptographic data integrity and historical consistency.
 */
contract CivicProof {
    /// @notice Permitted complaint lifecycle statuses in strict sequential order
    enum Status {
        Submitted,    // 0: Registered by citizen
        Acknowledged, // 1: Verified and acknowledged by admin
        InProgress,   // 2: Actively being addressed by department
        Resolved      // 3: Successfully addressed and closed
    }

    /// @notice On-chain state for a registered complaint
    struct Complaint {
        bytes32 complaintId;
        Status currentStatus;
        uint256 currentTimestamp;
        bytes32 latestRecordHash;
        bool exists;
    }

    /// @notice Immutable historical checkpoint for grievance lifecycle auditing
    struct StatusHistoryEntry {
        Status status;
        bytes32 recordHash;
        address updatedBy;
        uint256 timestamp;
        string remarks;
    }

    /// @notice Contract owner (initial administrator)
    address public owner;

    /// @notice Whitelist of authorized administrators
    mapping(address => bool) public authorizedAdmins;

    /// @notice Storage for complaint state keyed by unique bytes32 ID
    mapping(bytes32 => Complaint) private _complaints;

    /// @notice Storage for sequential status history keyed by complaint ID
    mapping(bytes32 => StatusHistoryEntry[]) private _statusHistory;

    // --- EVENTS ---

    /// @notice Emitted when a new grievance is registered
    event ComplaintRegistered(
        bytes32 indexed complaintId,
        address indexed citizen,
        bytes32 indexed initialRecordHash,
        uint256 timestamp,
        string remarks
    );

    /// @notice Emitted when an authorized admin progresses the status of a complaint
    event StatusUpdated(
        bytes32 indexed complaintId,
        Status previousStatus,
        Status newStatus,
        bytes32 latestRecordHash,
        address indexed updatedBy,
        uint256 timestamp,
        string remarks
    );

    /// @notice Emitted when administrator access is granted or revoked
    event AdminAccessSet(address indexed admin, bool isAuthorized);

    // --- ACCESS CONTROL MODIFIERS ---

    modifier onlyOwner() {
        require(msg.sender == owner, "CivicProof: Only contract owner allowed");
        _;
    }

    modifier onlyAdmin() {
        require(
            msg.sender == owner || authorizedAdmins[msg.sender],
            "CivicProof: Caller is not an authorized administrator"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedAdmins[msg.sender] = true;
        emit AdminAccessSet(msg.sender, true);
    }

    // --- ADMIN MANAGEMENT ---

    /**
     * @notice Grants or revokes administrator privileges
     * @param admin Address to modify authorization for
     * @param authorized True to authorize, false to revoke
     */
    function setAdminAuthorization(address admin, bool authorized) external onlyOwner {
        require(admin != address(0), "CivicProof: Invalid admin address");
        authorizedAdmins[admin] = authorized;
        emit AdminAccessSet(admin, authorized);
    }

    // --- DETERMINISTIC CRYPTOGRAPHIC RECORD HASHING ---

    /**
     * @notice Computes a deterministic cryptographic hash for a complaint record checkpoint.
     * @dev Consistent canonical schema:
     *      keccak256(abi.encode(complaintId, status, detailsHash, keccak256(bytes(remarks))))
     *      Guarantees that identical record inputs always produce the identical hash.
     * @param complaintId Unique 32-byte identifier for the grievance.
     * @param status Lifecycle status for this checkpoint.
     * @param detailsHash Cryptographic digest of off-chain grievance details/evidence (e.g. SHA-256 / IPFS CID digest).
     * @param remarks Brief audit note or category tag.
     * @return Deterministic 32-byte record hash.
     */
    function computeRecordHash(
        bytes32 complaintId,
        Status status,
        bytes32 detailsHash,
        string calldata remarks
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                complaintId,
                status,
                detailsHash,
                keccak256(bytes(remarks))
            )
        );
    }

    // --- CORE GRIEVANCE REGISTRATION & UPDATES ---

    /**
     * @notice Registers a new complaint on-chain with a precomputed or deterministic record hash.
     * @dev Anyone can register a unique complaint. Duplicate IDs and zero hashes are rejected.
     * @param complaintId Unique 32-byte identifier for the grievance.
     * @param recordHash Cryptographic record hash for this initial submission.
     * @param remarks Brief initial remark or category tag (no PII).
     */
    function registerComplaint(
        bytes32 complaintId,
        bytes32 recordHash,
        string calldata remarks
    ) public {
        require(complaintId != bytes32(0), "CivicProof: Invalid complaint ID");
        require(recordHash != bytes32(0), "CivicProof: Invalid record hash");
        require(!_complaints[complaintId].exists, "CivicProof: Complaint already registered");

        _complaints[complaintId] = Complaint({
            complaintId: complaintId,
            currentStatus: Status.Submitted,
            currentTimestamp: block.timestamp,
            latestRecordHash: recordHash,
            exists: true
        });

        _statusHistory[complaintId].push(StatusHistoryEntry({
            status: Status.Submitted,
            recordHash: recordHash,
            updatedBy: msg.sender,
            timestamp: block.timestamp,
            remarks: remarks
        }));

        emit ComplaintRegistered(complaintId, msg.sender, recordHash, block.timestamp, remarks);
    }

    /**
     * @notice Convenience registration helper that computes the canonical deterministic record hash on-chain.
     * @param complaintId Unique 32-byte identifier for the grievance.
     * @param detailsHash Hash of off-chain complaint details.
     * @param remarks Category or submission remark.
     * @return recordHash The generated canonical record hash stored on-chain.
     */
    function registerComplaintWithDetails(
        bytes32 complaintId,
        bytes32 detailsHash,
        string calldata remarks
    ) external returns (bytes32 recordHash) {
        recordHash = computeRecordHash(complaintId, Status.Submitted, detailsHash, remarks);
        registerComplaint(complaintId, recordHash, remarks);
    }

    /**
     * @notice Updates the lifecycle status of an existing complaint.
     * @dev Only authorized administrators can update status. Enforces sequential transitions.
     * @param complaintId Unique 32-byte identifier for the grievance.
     * @param newStatus Next sequential status (Submitted -> Acknowledged -> InProgress -> Resolved).
     * @param newRecordHash Cryptographic hash reflecting latest resolution / inspection notes.
     * @param remarks Reason or audit remark for this transition.
     */
    function updateComplaintStatus(
        bytes32 complaintId,
        Status newStatus,
        bytes32 newRecordHash,
        string calldata remarks
    ) public onlyAdmin {
        require(_complaints[complaintId].exists, "CivicProof: Unknown complaint ID");
        require(newRecordHash != bytes32(0), "CivicProof: Invalid record hash");

        Complaint storage complaint = _complaints[complaintId];
        Status current = complaint.currentStatus;

        require(_isValidTransition(current, newStatus), "CivicProof: Invalid status transition");

        complaint.currentStatus = newStatus;
        complaint.currentTimestamp = block.timestamp;
        complaint.latestRecordHash = newRecordHash;

        _statusHistory[complaintId].push(StatusHistoryEntry({
            status: newStatus,
            recordHash: newRecordHash,
            updatedBy: msg.sender,
            timestamp: block.timestamp,
            remarks: remarks
        }));

        emit StatusUpdated(
            complaintId,
            current,
            newStatus,
            newRecordHash,
            msg.sender,
            block.timestamp,
            remarks
        );
    }

    /**
     * @notice Convenience status update helper that computes the canonical deterministic record hash on-chain.
     * @param complaintId Unique 32-byte identifier for the grievance.
     * @param newStatus Next sequential status.
     * @param detailsHash Hash of updated off-chain inspection/action details.
     * @param remarks Reason or audit remark for this transition.
     * @return newRecordHash The generated canonical record hash stored on-chain.
     */
    function updateComplaintStatusWithDetails(
        bytes32 complaintId,
        Status newStatus,
        bytes32 detailsHash,
        string calldata remarks
    ) external onlyAdmin returns (bytes32 newRecordHash) {
        newRecordHash = computeRecordHash(complaintId, newStatus, detailsHash, remarks);
        updateComplaintStatus(complaintId, newStatus, newRecordHash, remarks);
    }

    // --- RECORD INTEGRITY VERIFICATION FUNCTIONS ---

    /**
     * @notice Compares a recomputed record hash against the authoritative latest record stored on-chain.
     * @dev Pass if hashes match; fails if they differ. Validates consistency with recorded data only.
     * @param complaintId Unique 32-byte identifier.
     * @param recomputedHash Recomputed cryptographic hash to verify against authoritative on-chain state.
     * @return isValid True if recomputed hash matches authoritative latest record hash.
     * @return currentStatus Current grievance status.
     * @return currentTimestamp Timestamp of last status change.
     */
    function verifyLatestRecord(
        bytes32 complaintId,
        bytes32 recomputedHash
    ) public view returns (bool isValid, Status currentStatus, uint256 currentTimestamp) {
        require(_complaints[complaintId].exists, "CivicProof: Unknown complaint ID");
        Complaint memory complaint = _complaints[complaintId];
        isValid = (complaint.latestRecordHash == recomputedHash);
        return (isValid, complaint.currentStatus, complaint.currentTimestamp);
    }

    /**
     * @notice Verifies latest record data by computing the canonical hash on-chain and checking match.
     * @param complaintId Unique 32-byte identifier.
     * @param detailsHash Off-chain details hash to verify.
     * @param remarks Audit remarks to verify.
     */
    function verifyLatestRecordData(
        bytes32 complaintId,
        bytes32 detailsHash,
        string calldata remarks
    ) external view returns (bool isValid, Status currentStatus, uint256 currentTimestamp) {
        require(_complaints[complaintId].exists, "CivicProof: Unknown complaint ID");
        Status current = _complaints[complaintId].currentStatus;
        bytes32 recomputed = computeRecordHash(complaintId, current, detailsHash, remarks);
        return verifyLatestRecord(complaintId, recomputed);
    }

    /**
     * @notice Compares a recomputed record hash against an authoritative historical checkpoint by index.
     * @dev Validates historical record consistency to ensure past states were not tampered with.
     * @param complaintId Unique 32-byte identifier.
     * @param historyIndex 0-indexed position in the complaint's history.
     * @param recomputedHash Recomputed cryptographic hash for this specific historical entry.
     * @return isValid True if recomputed hash matches authoritative historical record hash.
     * @return recordStatus Status stored in this historical checkpoint.
     * @return updatedBy Signer who created this historical checkpoint.
     * @return timestamp Timestamp when this checkpoint was recorded.
     */
    function verifyHistoricalRecord(
        bytes32 complaintId,
        uint256 historyIndex,
        bytes32 recomputedHash
    ) public view returns (
        bool isValid,
        Status recordStatus,
        address updatedBy,
        uint256 timestamp
    ) {
        require(_complaints[complaintId].exists, "CivicProof: Unknown complaint ID");
        require(historyIndex < _statusHistory[complaintId].length, "CivicProof: History index out of bounds");

        StatusHistoryEntry memory entry = _statusHistory[complaintId][historyIndex];
        isValid = (entry.recordHash == recomputedHash);
        return (isValid, entry.status, entry.updatedBy, entry.timestamp);
    }

    /**
     * @notice Verifies historical record data by computing the canonical hash on-chain and checking match.
     * @param complaintId Unique 32-byte identifier.
     * @param historyIndex 0-indexed position in the complaint's history.
     * @param detailsHash Off-chain details hash for this historical checkpoint.
     * @param remarks Audit remarks for this historical checkpoint.
     */
    function verifyHistoricalRecordData(
        bytes32 complaintId,
        uint256 historyIndex,
        bytes32 detailsHash,
        string calldata remarks
    ) external view returns (
        bool isValid,
        Status recordStatus,
        address updatedBy,
        uint256 timestamp
    ) {
        require(_complaints[complaintId].exists, "CivicProof: Unknown complaint ID");
        require(historyIndex < _statusHistory[complaintId].length, "CivicProof: History index out of bounds");

        StatusHistoryEntry memory entry = _statusHistory[complaintId][historyIndex];
        bytes32 recomputed = computeRecordHash(complaintId, entry.status, detailsHash, remarks);
        isValid = (entry.recordHash == recomputed);
        return (isValid, entry.status, entry.updatedBy, entry.timestamp);
    }

    /**
     * @notice Finds a historical entry matching targetStatus and verifies its hash integrity.
     * @param complaintId Unique 32-byte identifier.
     * @param targetStatus The lifecycle status to look up in history.
     * @param recomputedHash Recomputed hash to verify.
     * @return isValid True if recomputed hash matches historical entry hash.
     * @return historyIndex Index where this status was recorded.
     * @return timestamp Timestamp when this status was recorded.
     */
    function verifyRecordByStatus(
        bytes32 complaintId,
        Status targetStatus,
        bytes32 recomputedHash
    ) external view returns (
        bool isValid,
        uint256 historyIndex,
        uint256 timestamp
    ) {
        require(_complaints[complaintId].exists, "CivicProof: Unknown complaint ID");
        StatusHistoryEntry[] memory history = _statusHistory[complaintId];

        for (uint256 i = 0; i < history.length; i++) {
            if (history[i].status == targetStatus) {
                isValid = (history[i].recordHash == recomputedHash);
                return (isValid, i, history[i].timestamp);
            }
        }

        revert("CivicProof: Target status not found in history");
    }

    /**
     * @notice Backward-compatible verification alias for latest record.
     */
    function verifyRecordHash(
        bytes32 complaintId,
        bytes32 expectedHash
    ) external view returns (bool isMatch, Status currentStatus, uint256 currentTimestamp) {
        return verifyLatestRecord(complaintId, expectedHash);
    }

    // --- VIEW / AUDIT FUNCTIONS ---

    /**
     * @notice Fetches current state summary of a complaint.
     * @param complaintId Unique 32-byte identifier.
     */
    function getComplaint(bytes32 complaintId) external view returns (Complaint memory) {
        require(_complaints[complaintId].exists, "CivicProof: Unknown complaint ID");
        return _complaints[complaintId];
    }

    /**
     * @notice Retrieves the full audit trail of status changes for a complaint.
     * @param complaintId Unique 32-byte identifier.
     */
    function getStatusHistory(bytes32 complaintId) external view returns (StatusHistoryEntry[] memory) {
        require(_complaints[complaintId].exists, "CivicProof: Unknown complaint ID");
        return _statusHistory[complaintId];
    }

    /**
     * @notice Returns total number of status history entries for pagination / count checks.
     * @param complaintId Unique 32-byte identifier.
     */
    function getStatusHistoryCount(bytes32 complaintId) external view returns (uint256) {
        require(_complaints[complaintId].exists, "CivicProof: Unknown complaint ID");
        return _statusHistory[complaintId].length;
    }

    /**
     * @notice Retrieves a specific historical checkpoint entry by index.
     * @param complaintId Unique 32-byte identifier.
     * @param index Historical entry index (0-based).
     */
    function getStatusHistoryEntry(
        bytes32 complaintId,
        uint256 index
    ) external view returns (StatusHistoryEntry memory) {
        require(_complaints[complaintId].exists, "CivicProof: Unknown complaint ID");
        require(index < _statusHistory[complaintId].length, "CivicProof: History index out of bounds");
        return _statusHistory[complaintId][index];
    }

    // --- INTERNAL HELPERS ---

    /**
     * @dev Enforces strict linear progression: Submitted -> Acknowledged -> InProgress -> Resolved.
     * Skipping steps, moving backward, or transitioning from Resolved is disallowed.
     */
    function _isValidTransition(Status current, Status next) internal pure returns (bool) {
        if (current == Status.Submitted && next == Status.Acknowledged) {
            return true;
        }
        if (current == Status.Acknowledged && next == Status.InProgress) {
            return true;
        }
        if (current == Status.InProgress && next == Status.Resolved) {
            return true;
        }
        return false;
    }
}
