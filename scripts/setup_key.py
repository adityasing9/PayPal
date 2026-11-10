"""
Interactive Setup Script for IntentLock Persistent Private Key
Safely prompts for the 64-character private key hex and configures keys/intentlock_private_key.hex.
"""

import getpass
import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from intentlock.workstream4_crypto_auth.signer import _publickey
from intentlock.core.config import get_trusted_public_key, find_project_path

def main():
    print("=" * 65)
    print("IntentLock Security Engine - Key Setup Utility")
    print("=" * 65)
    trusted_pub = get_trusted_public_key()
    if trusted_pub:
        print(f"Target Trusted Public Key: {trusted_pub}")
    else:
        print("Note: keys/intentlock_public_key.hex not found.")

    print("\nEnter your 64-character Ed25519 private key hex (input is hidden):")
    try:
        raw_key = getpass.getpass("Private Key Hex: ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\nSetup cancelled.")
        return 1

    if len(raw_key) != 64:
        print(f"Error: Key must be exactly 64 hexadecimal characters. Got length {len(raw_key)}.")
        return 1

    try:
        key_bytes = bytes.fromhex(raw_key)
    except ValueError:
        print("Error: Input is not a valid hexadecimal string.")
        return 1

    derived_pub = _publickey(key_bytes).hex()
    print(f"Derived Public Key:       {derived_pub}")

    if trusted_pub:
        if derived_pub.lower() == trusted_pub.lower():
            print("MATCH: Derived public key matches keys/intentlock_public_key.hex!")
        else:
            print("MISMATCH: The entered private key does NOT correspond to keys/intentlock_public_key.hex!")
            confirm = input("Save anyway? (y/N): ").strip().lower()
            if confirm != 'y':
                print("Aborted.")
                return 1

    # Choose destination
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    keys_dir = os.path.join(repo_root, "keys")
    os.makedirs(keys_dir, exist_ok=True)
    target_file = os.path.join(keys_dir, "intentlock_private_key.hex")

    with open(target_file, "w", encoding="utf-8") as f:
        f.write(raw_key)

    print(f"\nSuccessfully written to {target_file}")
    print("This file is ignored by Git (.gitignore) and will not be pushed.")
    print("You can now start the Flask service: python intentlock/workstream5_api_db/app.py")
    return 0

if __name__ == "__main__":
    sys.exit(main())

