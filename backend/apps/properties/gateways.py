"""Payment gateways behind one small interface.

Every gateway must:
- create_checkout(payment) -> URL the payer is sent to (no card data ever touches Nyumba)
- verify(payment, transaction_id) -> VerifyResult, asked server to server
- refund(payment, amount) -> gateway refund reference

"sandbox" is a local simulator so the full flow can be tested without real money.
It is refused unless PAYMENT_GATEWAY is "sandbox".
"""

import secrets
from dataclasses import dataclass, field
from decimal import Decimal

import requests
from django.conf import settings


class GatewayError(Exception):
    pass


@dataclass
class VerifyResult:
    status: str  # successful | failed | pending
    tx_ref: str = ""
    amount: Decimal = Decimal("0")
    currency: str = ""
    transaction_id: str = ""
    method: str = ""
    message: str = ""
    raw: dict = field(default_factory=dict)


def new_tx_ref(booking):
    return f"{booking.reference}-{secrets.token_hex(4)}"


class SandboxGateway:
    """Simulated checkout page served by the Nyumba web app at /payments/sandbox."""

    name = "sandbox"

    def create_checkout(self, payment):
        return f"{settings.FRONTEND_URL}/payments/sandbox?tx_ref={payment.tx_ref}"

    def verify(self, payment, transaction_id=None):
        outcome = payment.gateway_response.get("sandbox_outcome")
        if outcome == "successful":
            return VerifyResult(
                status="successful",
                tx_ref=payment.tx_ref,
                amount=payment.amount,
                currency=payment.currency,
                transaction_id=f"SBX-{payment.pk}",
                method=payment.gateway_response.get("sandbox_method", "mobilemoneyzambia"),
                raw={"sandbox_outcome": outcome},
            )
        if outcome == "failed":
            return VerifyResult(status="failed", message="Declined in the sandbox.", raw={"sandbox_outcome": outcome})
        return VerifyResult(status="pending", raw=payment.gateway_response)

    def refund(self, payment, amount):
        return f"SBX-RF-{secrets.token_hex(4)}"


class FlutterwaveGateway:
    """Flutterwave Standard (hosted checkout): cards and Zambian mobile money in ZMW."""

    name = "flutterwave"

    def __init__(self):
        if not settings.FLUTTERWAVE_SECRET_KEY:
            raise GatewayError("FLUTTERWAVE_SECRET_KEY is not set.")
        self.base = settings.FLUTTERWAVE_BASE_URL.rstrip("/")
        self.headers = {"Authorization": f"Bearer {settings.FLUTTERWAVE_SECRET_KEY}"}

    def _call(self, method, path, **kwargs):
        try:
            res = requests.request(method, f"{self.base}{path}", headers=self.headers, timeout=20, **kwargs)
            body = res.json()
        except (requests.RequestException, ValueError) as exc:
            raise GatewayError(f"Flutterwave unreachable: {exc}") from exc
        if res.status_code >= 400 or body.get("status") != "success":
            raise GatewayError(body.get("message") or f"Flutterwave error {res.status_code}")
        return body.get("data") or {}

    def create_checkout(self, payment):
        user = payment.user
        data = self._call(
            "POST",
            "/payments",
            json={
                "tx_ref": payment.tx_ref,
                "amount": str(payment.amount),
                "currency": payment.currency,
                "redirect_url": f"{settings.FRONTEND_URL}/payments/callback",
                "payment_options": "card,mobilemoneyzambia",
                "customer": {
                    "email": user.email or f"{user.username}@users.nyumba.local",
                    "name": user.get_full_name() or user.username,
                    "phonenumber": payment.booking.guest_phone,
                },
                "customizations": {
                    "title": "Nyumba",
                    "description": f"Booking {payment.booking.reference}",
                },
                "meta": {"booking_reference": payment.booking.reference},
            },
        )
        link = data.get("link")
        if not link:
            raise GatewayError("Flutterwave did not return a checkout link.")
        return link

    def verify(self, payment, transaction_id=None):
        if transaction_id:
            data = self._call("GET", f"/transactions/{int(transaction_id)}/verify")
        else:
            data = self._call("GET", "/transactions/verify_by_reference", params={"tx_ref": payment.tx_ref})
        status = data.get("status")
        return VerifyResult(
            status="successful" if status == "successful" else "pending" if status == "pending" else "failed",
            tx_ref=data.get("tx_ref", ""),
            amount=Decimal(str(data.get("amount", "0"))),
            currency=data.get("currency", ""),
            transaction_id=str(data.get("id", "")),
            method=data.get("payment_type", ""),
            message=data.get("processor_response", "") or status or "",
            raw={k: data.get(k) for k in ("id", "tx_ref", "amount", "currency", "status", "payment_type", "created_at")},
        )

    def refund(self, payment, amount):
        if not payment.gateway_transaction_id:
            raise GatewayError("No Flutterwave transaction id to refund.")
        data = self._call(
            "POST", f"/transactions/{payment.gateway_transaction_id}/refund", json={"amount": str(amount)}
        )
        return str(data.get("id", ""))


def get_gateway(name=None):
    name = name or settings.PAYMENT_GATEWAY
    if name == "sandbox":
        if settings.PAYMENT_GATEWAY != "sandbox":
            raise GatewayError("The sandbox gateway is disabled.")
        return SandboxGateway()
    if name == "flutterwave":
        return FlutterwaveGateway()
    raise GatewayError(f"Unknown payment gateway {name!r}.")
