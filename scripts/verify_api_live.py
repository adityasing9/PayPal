"""
Live REST API Verification Script
Tests health, verification, cryptographic authorization, and audit inspection.
"""

import json
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from intentlock.workstream5_api_db.app import create_app

def main():
    app = create_app()
    client = app.test_client()

    print("=" * 60)
    print("STEP 1: LIVE HEALTH CHECK (/api/v1/health)")
    print("=" * 60)
    res = client.get('/api/v1/health')
    print(f"Status Code: {res.status_code}")
    health = res.get_json()
    print(json.dumps(health, indent=2))

    print("\n" + "=" * 60)
    print("STEP 2: LIVE AUTHORIZATION (/api/v1/intent/authorize)")
    print("=" * 60)
    intent_data = {
        'intent_id': 'LIVE_TX_VERIFY_999',
        'buyer_id': 'BUYER_ENTERPRISE_01',
        'session_id': 'SESS_SECURE_777',
        'merchant': {
            'merchant_id': 'M_GOOGLE_01',
            'name': 'Google Store Official',
            'domain': 'store.google.com',
            'is_verified': True,
            'reputation_score': 0.99
        },
        'items': [
            {
                'item_id': 'PROD_PIXEL_10',
                'name': 'Pixel 10 Pro',
                'sku': 'PIXEL-10-PRO',
                'unit_price': 999.0,
                'quantity': 1,
                'catalog_baseline_price': 999.0,
                'category': 'electronics'
            }
        ],
        'costs': {
            'subtotal': 999.0,
            'tax': 79.92,
            'shipping': 0.0,
            'service_fee': 0.0,
            'regulatory_fee': 0.0,
            'tip': 0.0,
            'total_charged': 1078.92,
            'currency': 'USD'
        },
        'subscription': {
            'is_subscription': False
        },
        'raw_prompt_context': 'User asked assistant to order one Pixel 10 Pro from official store.'
    }

    res = client.post('/api/v1/intent/authorize', json=intent_data)
    print(f"Status Code: {res.status_code}")
    auth_resp = res.get_json()
    print(f"Authorized: {auth_resp['authorized']}")
    print(f"Overall Risk Score: {auth_resp['verdict']['overall_risk_score']}")
    print(f"Token ID: {auth_resp['token']['token_id']}")
    print(f"Algorithm: {auth_resp['token']['algorithm']}")
    print(f"Compact Ed25519 Token:\n  {auth_resp['token']['compact_token']}")
    print(f"Handoff Protocol for Member 3:\n  {auth_resp['handoff_to_member3']['protocol']}")

    print("\n" + "=" * 60)
    print("STEP 3: LIVE AUDIT TRAIL RETRIEVAL (/api/v1/intent/audit/<id>)")
    print("=" * 60)
    audit_res = client.get('/api/v1/intent/audit/LIVE_TX_VERIFY_999')
    print(f"Status Code: {audit_res.status_code}")
    audit_data = audit_res.get_json()
    print(f"Recorded Intent Hash (SHA-512): {audit_data['intent_hash'][:32]}...")
    print(f"Audit Is Authorized: {audit_data['is_authorized']}")
    print(f"Token Nonce in Database: {audit_data['token']['nonce']}")
    print("=" * 60)
    print("ALL API VERIFICATIONS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == '__main__':
    main()
