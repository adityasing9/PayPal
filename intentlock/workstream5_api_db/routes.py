"""
REST API Routes - Workstream 5
Endpoints for intent verification, cryptographic authorization, and audit inspection.
"""

import hmac
import os
import re
from decimal import Decimal, InvalidOperation
from flask import Blueprint, request, jsonify
from intentlock.core.models import IntentPayload
from intentlock.core.errors import SchemaValidationError
from intentlock.core.config import get_trusted_public_key
from intentlock.workstream5_api_db.team_contracts import TeamMemberContracts

def build_api_blueprint(engine) -> Blueprint:
    api = Blueprint("intentlock_api", __name__, url_prefix="/api/v1")

    @api.route("/health", methods=["GET"])
    def health():
        trusted_pub = get_trusted_public_key()
        is_persistent = getattr(engine, "is_persistent_key", False)
        trusted_matched = getattr(engine, "trusted_key_matched", False)

        return jsonify({
            "status": "HEALTHY",
            "service": "IntentLock Commerce Security Engine",
            "member_role": "Member 2 of 5",
            "public_key": engine.public_key_hex,
            "trusted_public_key": trusted_pub or engine.public_key_hex,
            "is_persistent_key": is_persistent,
            "trusted_key_matched": trusted_matched,
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
        except SchemaValidationError as e:
            return jsonify({
                "error": f"Schema validation error: {str(e)}",
                "code": e.code,
                "details": e.details
            }), 400
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
        except SchemaValidationError as e:
            return jsonify({
                "error": f"Schema validation error: {str(e)}",
                "code": e.code,
                "details": e.details
            }), 400
        except Exception as e:
            return jsonify({"error": f"Authorization pipeline error: {str(e)}"}), 500

    @api.route("/intent/audit/<intent_id>", methods=["GET"])
    def get_audit(intent_id: str):
        record = engine.db.get_audit_record(intent_id)
        if not record:
            return jsonify({"error": f"Audit record for intent '{intent_id}' not found"}), 404
        return jsonify(record), 200

    return api


def build_v2_api_blueprint(engine) -> Blueprint:
    api = Blueprint("intentlock_v2_api", __name__, url_prefix="/api/v2")

    @api.route("/intent/authorize", methods=["POST"])
    def authorize_v2():
        expected_service_token = os.environ.get("INTENTLOCK_SERVICE_TOKEN", "")
        supplied_service_token = request.headers.get("X-IntentLock-Service-Token", "")
        if not expected_service_token:
            return jsonify({"error": "V2 authorization service is not configured"}), 503
        if not hmac.compare_digest(supplied_service_token, expected_service_token):
            return jsonify({"error": "Service authentication failed"}), 401

        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Invalid or missing JSON payload"}), 400

        try:
            binding_context = data.get("authorization_context")
            if not isinstance(binding_context, dict):
                raise SchemaValidationError("authorization_context is required")

            required_strings = (
                "user_id", "intent_id", "proposal_id", "snapshot_id",
                "snapshot_hash", "amount_minor", "currency", "merchant_id",
                "paypal_merchant_id"
            )
            if any(not isinstance(binding_context.get(field), str) for field in required_strings):
                raise SchemaValidationError("authorization_context contains missing or invalid fields")
            if any(not binding_context[field].strip() for field in required_strings):
                raise SchemaValidationError("authorization_context string fields cannot be empty")
            for field in ("user_id", "intent_id", "proposal_id", "snapshot_id"):
                if not re.fullmatch(r"[0-9a-fA-F]{24}", binding_context[field]):
                    raise SchemaValidationError(f"authorization_context.{field} must be a MongoDB ObjectId")
            if not re.fullmatch(r"[0-9a-fA-F]{64}", binding_context["snapshot_hash"]):
                raise SchemaValidationError("authorization_context.snapshot_hash must be a SHA-256 hex digest")
            if not re.fullmatch(r"(0|[1-9][0-9]*)", binding_context["amount_minor"]):
                raise SchemaValidationError("authorization_context.amount_minor must be a canonical decimal integer string")
            amount_minor = int(binding_context["amount_minor"])
            if amount_minor <= 0 or amount_minor > 9007199254740991:
                raise SchemaValidationError("authorization_context.amount_minor is outside the supported numeric range")
            if not re.fullmatch(r"[A-Za-z]{3}", binding_context["currency"]):
                raise SchemaValidationError("authorization_context.currency must be a three-letter code")
            exponent = binding_context.get("minor_unit_exponent")
            version = binding_context.get("intent_version")
            if (
                not isinstance(exponent, int) or isinstance(exponent, bool) or
                exponent < 0 or exponent > 3 or
                not isinstance(version, int) or isinstance(version, bool) or version < 1
            ):
                raise SchemaValidationError("authorization_context version or currency exponent is invalid")

            intent_data = {key: value for key, value in data.items() if key != "authorization_context"}
            intent = IntentPayload.from_dict(intent_data)
            normalized_currency = binding_context["currency"].upper()
            normalized_binding = {
                "user_id": binding_context["user_id"],
                "intent_id": binding_context["intent_id"],
                "intent_version": version,
                "proposal_id": binding_context["proposal_id"],
                "snapshot_id": binding_context["snapshot_id"],
                "snapshot_hash": binding_context["snapshot_hash"].lower(),
                "amount_minor": binding_context["amount_minor"],
                "currency": normalized_currency,
                "minor_unit_exponent": exponent,
                "merchant_id": binding_context["merchant_id"],
                "paypal_merchant_id": binding_context["paypal_merchant_id"]
            }
            if (
                intent.buyer_id != binding_context["user_id"] or
                intent.intent_id != binding_context["intent_id"] or
                intent.merchant.merchant_id != binding_context["merchant_id"] or
                intent.costs.currency != normalized_currency
            ):
                raise SchemaValidationError("authorization_context does not match the normalized intent")

            try:
                charged_minor = Decimal(str(intent.costs.total_charged)) * (Decimal(10) ** exponent)
            except InvalidOperation as error:
                raise SchemaValidationError("Intent total cannot be represented in minor units") from error
            if charged_minor != charged_minor.to_integral_value() or int(charged_minor) != amount_minor:
                raise SchemaValidationError("Intent total does not match authorization_context.amount_minor")

            authorized, verdict, token = engine.authorize_intent(
                intent,
                binding_context=normalized_binding
            )
            response = {
                "authorized": authorized,
                "verdict": verdict.to_dict(),
                "token": token.to_dict() if token else None,
                "handoff_to_member3": TeamMemberContracts.member3_handoff_contract(token) if token else None
            }
            return jsonify(response), 200 if authorized else 403
        except SchemaValidationError as error:
            return jsonify({
                "error": f"Schema validation error: {error}",
                "code": error.code,
                "details": error.details
            }), 400
        except Exception as error:
            return jsonify({"error": f"Authorization pipeline error: {str(error)}"}), 500

    return api
