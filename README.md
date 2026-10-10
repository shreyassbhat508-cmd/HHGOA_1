# CivicProof
### Transparent Complaints. Verifiable Records. Greater Accountability.

CivicProof is a blockchain-powered public grievance tracking prototype that enables transparent complaint tracking through immutable status histories and cryptographic record verification.

By recording complaint references, status changes, and cryptographic hashes on a blockchain, CivicProof helps detect unauthorized modifications to application-side records and provides a verifiable audit trail of complaint progress.



---

## Problem Statement

Public grievance systems need transparent and reliable ways to track complaints and their progress. Citizens may find it difficult to verify whether a complaint's recorded status history has been modified.

Traditional application databases can be changed by users with sufficient access. Without an independently verifiable audit trail, detecting unauthorized modifications can be difficult.

CivicProof addresses this challenge by using blockchain technology to maintain a tamper-evident history of complaint registration and status updates.

## Our Solution

CivicProof combines a Solidity smart contract with cryptographic hashing to maintain an auditable complaint lifecycle.

Each complaint receives a unique identifier. Every valid status update creates a new historical entry associated with a cryptographic record hash. The application can then compare a record's hash with the corresponding hash stored on-chain.

If the hashes match, the record passes the integrity check. If the record has been modified and its hash no longer matches, verification fails.

## Key Features

- **Complaint Registration:** Register complaints with unique identifiers.
- **Status Tracking:** Track complaints through a defined lifecycle.
- **Access Control:** Restrict status updates to an authorized administrator.
- **Immutable Audit Trail:** Preserve historical complaint status entries on-chain.
- **Cryptographic Verification:** Verify records using `keccak256` hashes.
- **Tamper Detection:** Detect mismatches between supplied record hashes and authoritative on-chain hashes.
- **Historical Verification:** Verify individual historical records independently.
- **Duplicate Prevention:** Reject duplicate complaint registrations.
- **Controlled Status Transitions:** Reject invalid status changes.
- **Blockchain Events:** Emit events for complaint registration and status updates.

## Complaint Lifecycle

CivicProof supports the following status transitions:

`Submitted → Acknowledged → In Progress → Resolved`

Each successful transition creates a new historical entry, preserving the sequence of recorded status changes.

## How It Works

1. A complaint is registered with a unique complaint identifier.
2. The smart contract records the initial status and associated cryptographic hash.
3. An authorized administrator updates the complaint status.
4. Each successful update adds a new entry to the on-chain history.
5. The application retrieves the current status and historical entries.
6. A record's hash is compared against the corresponding authoritative on-chain hash.
7. Matching hashes pass verification; mismatched hashes fail verification.

This design provides a verifiable record of what the system recorded without requiring the entire complaint description to be stored on the blockchain.

## Technology Stack

| Technology | Purpose |
|---|---|
| Solidity 0.8.24 | Smart contract development |
| Hardhat 2 | Smart contract compilation, testing, and deployment |
| JavaScript | Development scripts and automated tests |
| Ethers.js | Ethereum-compatible blockchain interaction through the configured dependencies |
| Local Ethereum-compatible network | Local development and demonstration |
| keccak256 | Cryptographic record hashing |

## Architecture

CivicProof uses a smart-contract-based architecture.

### On-Chain Layer

The Solidity smart contract manages:

- Complaint identifiers
- Current complaint statuses
- Registration and update timestamps
- Cryptographic record hashes
- Historical status entries
- Administrator authorization
- Record verification

### Application Layer

The application interacts with the deployed contract to register complaints, retrieve status information, display complaint history, and verify record integrity.

Full complaint descriptions, personal information, and sensitive supporting documents should remain off-chain.

### Verification Layer

The verification process compares a supplied record hash against the corresponding hash stored on-chain.

A matching hash indicates that the supplied record is consistent with the recorded hash. A mismatch indicates that the record does not match the expected value.

**Important:** Blockchain verification proves record integrity relative to the stored hash. It does not independently prove that a complaint was genuinely investigated, that the information submitted was truthful, or that a reported resolution occurred in the real world.

## Getting Started

### Prerequisites

Install the following:

- Node.js
- npm

### 1. Clone the Repository

```bash
git clone https://github.com/shreyassbhat508-cmd/HHGOA_1.git
cd HHGOA_1
