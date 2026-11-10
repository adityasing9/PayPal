"""
Audit Database - Workstream 5
SQLite repository providing immutable audit logs and persistent records of signed authorizations.
"""

import sqlite3
import json
import threading
from typing import Optional, Dict, Any, List
from intentlock.core.config import config
from intentlock.core.models import AggregatedSecurityVerdict, SignedAuthorizationToken

class AuditDatabase:
    def __init__(self, db_path: str = config.DB_PATH):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    cursor = conn.cursor()
                    # Audit logs table
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS audit_logs (
                            intent_id TEXT PRIMARY KEY,
                            buyer_id TEXT,
                            merchant_id TEXT,
                            intent_hash TEXT,
                            risk_score REAL,
                            is_authorized INTEGER,
                            verdict_json TEXT,
                            created_at REAL
                        )
                    """)
                    # Authorization tokens table
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS auth_tokens (
                            token_id TEXT PRIMARY KEY,
                            intent_id TEXT,
                            intent_hash TEXT,
                            nonce TEXT UNIQUE,
                            compact_token TEXT,
                            public_key TEXT,
                            issued_at REAL,
                            expires_at REAL,
                            FOREIGN KEY (intent_id) REFERENCES audit_logs(intent_id)
                        )
                    """)
            finally:
                conn.close()

    def record_verdict(self,
                       intent_id: str,
                       buyer_id: str,
                       merchant_id: str,
                       intent_hash: str,
                       verdict: AggregatedSecurityVerdict):
        """Records an immutable audit entry for an evaluated intent."""
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        INSERT OR REPLACE INTO audit_logs 
                        (intent_id, buyer_id, merchant_id, intent_hash, risk_score, is_authorized, verdict_json, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        intent_id,
                        buyer_id,
                        merchant_id,
                        intent_hash,
                        verdict.overall_risk_score,
                        1 if verdict.is_authorized else 0,
                        json.dumps(verdict.to_dict()),
                        verdict.timestamp
                    ))
            finally:
                conn.close()

    def record_token(self, token: SignedAuthorizationToken):
        """Stores a cryptographically signed authorization token."""
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        INSERT INTO auth_tokens 
                        (token_id, intent_id, intent_hash, nonce, compact_token, public_key, issued_at, expires_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        token.token_id,
                        token.intent_id,
                        token.intent_hash,
                        token.nonce,
                        token.compact_token,
                        token.public_key,
                        token.issued_at,
                        token.expires_at
                    ))
            finally:
                conn.close()

    def get_audit_record(self, intent_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves audit details and token for a given intent_id."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM audit_logs WHERE intent_id = ?", (intent_id,))
                row = cursor.fetchone()
                if not row:
                    return None

                result = dict(row)
                result["verdict"] = json.loads(result["verdict_json"])
                del result["verdict_json"]

                cursor.execute("SELECT * FROM auth_tokens WHERE intent_id = ?", (intent_id,))
                token_row = cursor.fetchone()
                result["token"] = dict(token_row) if token_row else None

                return result
            finally:
                conn.close()
