"""
REST API Routes - Workstream 5
Endpoints for intent verification, cryptographic authorization, and audit inspection.
"""

from flask import Blueprint, request, jsonify
from intentlock.core.models import IntentPayload
from intentlock.workstream5_api_db.team_contracts import TeamMemberContracts

def build_api_blueprint(engine) -> Blueprint:
    api = Blueprint("intentlock_api", __name__, url_prefix="/api/v1")

    @api.route("/health", methods=["GET"])
    def health():
        return jsonify({
            "status": "HEALTHY",
            "service": "IntentLock Commerce Security Engine",
            "member_role": "Member 2 of 5",
            "public_key": engine.public_key_hex,
            "crypto_algorithm": "Ed25519 (RFC 8032)",
            "canonicalization": "RFC 8785 (JCS)"
        }), 200

    @api.route("/intent/verify", methods=["POST"])
    def verify():
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Invalid or missing JSON payload"}), 400

        try:
            intent = IntentPayload.from_dict(data)
            verdict = engine.verify_intent(intent)
            return jsonify(verdict.to_dict()), 200
        except Exception as e:
            return jsonify({"error": f"Verification failed: {str(e)}"}), 500

    @api.route("/intent/authorize", methods=["POST"])
    def authorize():
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Invalid or missing JSON payload"}), 400

        try:
            intent = IntentPayload.from_dict(data)
            authorized, verdict, token = engine.authorize_intent(intent)

            response = {
                "authorized": authorized,
                "verdict": verdict.to_dict(),
                "token": token.to_dict() if token else None,
                "handoff_to_member3": TeamMemberContracts.member3_handoff_contract(token) if token else None
            }

            status_code = 200 if authorized else 403
            return jsonify(response), status_code
        except Exception as e:
            return jsonify({"error": f"Authorization pipeline error: {str(e)}"}), 500

    @api.route("/intent/audit/<intent_id>", methods=["GET"])
    def get_audit(intent_id: str):
        record = engine.db.get_audit_record(intent_id)
        if not record:
            return jsonify({"error": f"Audit record for intent '{intent_id}' not found"}), 404
        return jsonify(record), 200

    return api
