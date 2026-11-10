"""
IntentLock Error Taxonomy
Defines typed security exceptions across all workstreams.
"""

class IntentLockSecurityError(Exception):
    """Base exception for all IntentLock security violations."""
    def __init__(self, message: str, code: str = "SECURITY_VIOLATION", details: dict = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


class SchemaValidationError(IntentLockSecurityError):
    """Raised when an incoming intent payload violates the formal schema specification."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="SCHEMA_VALIDATION_ERROR", details=details)


class MerchantVerificationFailed(IntentLockSecurityError):
    """Raised when merchant domain or reputation fails verification."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="MERCHANT_VERIFICATION_FAILED", details=details)


class PriceManipulationDetected(IntentLockSecurityError):
    """Raised when price discrepancy or negative price tampering is detected."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="PRICE_MANIPULATION_DETECTED", details=details)


class HiddenCostViolation(IntentLockSecurityError):
    """Raised when sneaky drip pricing or unexpected fees exceed acceptable thresholds."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="HIDDEN_COST_VIOLATION", details=details)


class UnauthorizedSubscriptionTrap(IntentLockSecurityError):
    """Raised when hidden recurring billing or deceptive trial conversion is identified."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="SUBSCRIPTION_TRAP_DETECTED", details=details)


class PromptInjectionDetected(IntentLockSecurityError):
    """Raised when prompt injection, system prompt override, or jailbreak is identified."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="PROMPT_INJECTION_DETECTED", details=details)


class ParameterTamperingDetected(IntentLockSecurityError):
    """Raised when payload AST mutation, homoglyph attack, or obfuscation is caught."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="PARAMETER_TAMPERING_DETECTED", details=details)


class CryptographicSignatureError(IntentLockSecurityError):
    """Raised when cryptographic key or signature generation/verification fails."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="CRYPTO_SIGNATURE_ERROR", details=details)


class ReplayAttackDetected(IntentLockSecurityError):
    """Raised when a nonce is reused or a token timestamp is outside the validity window."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="REPLAY_ATTACK_DETECTED", details=details)
