# Private Chat (End-to-End Encrypted)

An exceptionally secure, modern, one-to-one private chat application with WhatsApp/Signal-inspired styling and fully-functional **End-to-End Encryption (E2EE)**. 

No plaintext messages or file binaries are ever exposed to the backend server. Encryption, decryption, and key exchanges happen entirely inside the browser sandboxed environment using the native **W3C Web Crypto API**.

---

## 🔒 Cryptographic Protocol Design

The application implements a robust keyspace model following the classic security patterns of Signal and Proton:

### 1. Account Initialization & Keygen (PBKDF2 + AES-GCM + ECDH)
* **Master Key Derivation**: When a user registers or logs in, a 256-bit AES master key is derived locally in their browser from their password using **PBKDF2-HMAC-SHA256** with $100,000$ iterations and a cryptographically safe random salt.
* **E2EE Key Generation**: During registration, an **ECDH keypair** over the NIST **P-256** elliptic curve is generated in the browser for secure message exchanges.
* **Cipher Keychain Storage**: The P-256 private key is exported, encrypted locally via the PBKDF2 password master key (using **AES-255-GCM**), and sent to the server. The server stores only the public key in plaintext and the private key in its encrypted, unreachable form. 

### 2. Handshake & Message Delivery (ECDH + AES-256-GCM)
* **Symmetric Key Agreement**: To message a contact, the sender fetches the recipient's public key from the keyserver, and derives a shared 256-bit symmetric key locally via **ECDH**. The recipient does the identical derivation using the sender's public key.
* **Symmetric Encryption**: Every message is encrypted using **AES-256-GCM** using a single-use random IV. The server only receives and database-writes a randomized Base64-encoded encrypted payload block `{ iv, ciphertext }` that is cryptographically unreadable by anyone except the target participants.

### 3. Chunked File Delivery Up to 1GB
* **Local Slicing**: Large files are sliced into sequential $1\text{MB}$ chunk blocks inside the browser.
* **Chunk Cryptography**: Each chunk is independently encrypted on-the-fly via **AES-256-GCM** using the shared E2EE key.
* **Chunk Piping**: Encrypted chunks are posted to the backend sequentially and written directly to local folder paths (`./data/uploads/[fileId]/chunk_[index]`). This prevents server-side memory leaks or heap crashes.
* **Decryption & Merger**: The recipient downloads these chunks sequentially, decrypts them in the browser, merges them into a single binary block, and serves them local blob URLs for inline image, video, and audio players, or downloads.

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18.0 or newer)
* **npm** 

### Running Locally

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Boot Dev Server**:
   ```bash
   npm run dev
   ```
   The dev server launches natively on port `3000`. You can access it at `http://localhost:3000`.

3. **Build and Live Production Execution**:
   ```bash
   # Build Vite Frontend Assets and Compile Server.ts via Esbuild
   npm run build
   
   # Run the Compiled Production Container Entry point
   npm run start
   ```

---

## 🐳 Running with Docker

E2EE Chat is fully containerized and easily deployed using Docker and Docker Compose. All databases and attachments are mounted into persistent filesystem folders.

### Using Docker Compose
Simply run:
```bash
docker-compose up --build -d
```
The application will launch on port `3000`. Database files and asset uploads will be safely persistent and stored inside `./data` on your host machine.

### Hosting

This app runs as one Node.js web service:

* Build command: `npm run build`
* Start command: `npm run start`
* Required environment variable: `JWT_SECRET`
* Optional environment variable: `PORT` (most hosts set this automatically)
* Persistent storage path: `./data`

For container-based hosts, deploy the included `Dockerfile`. Make sure your host mounts a persistent disk or volume at `/usr/src/app/data`; otherwise accounts, encrypted messages, and uploaded file chunks will be lost when the instance restarts.

Recommended production settings:

```bash
NODE_ENV=production
JWT_SECRET=generate_a_long_random_secret
```

---

## 🛡️ Security Measures
* **No Unencrypted Keys on Server**: The server has absolutely no access to raw private encryption keys. It only acts as a public keyserver and encrypted payload courier.
* **Authenticity Fingerprinting / Safety Numbers**: Computes a SHA-256 verification hash of sorted public keys representing a Signal-like "Safety Number" fingerprint to prevent Man-in-the-Middle (MitM) interceptions.
* **Authentication Rate-Limiting**: Login and registration API endpoints are rate-limited per IP in-memory to prevent brute-force dictionary attacks.
* **Secure Headers**: Custom headers block XSS injections, sniffing, and framing.
