"""Administrator dashboard API. Staff accounts only (user.is_staff)."""

from collections import OrderedDict
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .. import services
from ..models import (
    ZERO,
    BoardingHouse,
    Booking,
    Commission,
    CommissionRate,
    Listing,
    ListingReport,
    Payment,
    ProviderApplication,
    ProviderPayout,
    ProviderProfile,
    Refund,
    provider_status,
)
from ..permissions import IsPlatformAdmin
from ..serializers import (
    AdminProviderApplicationSerializer,
    BoardingHouseSerializer,
    BookingSerializer,
    CommissionRateSerializer,
    ListingSerializer,
    PaymentSerializer,
    PayoutSerializer,
    RefundSerializer,
    ReportSerializer,
)
from .common import m2, not_found, paginate, parse_date
from .marketplace import booking_queryset
from .provider import _months_back

A = [IsPlatformAdmin]


@api_view(["GET"])
@permission_classes(A)
def overview(request):
    services.expire_stale_bookings()
    now = timezone.now()
    earned = Commission.objects.filter(status__in=[Commission.STATUS_EARNED, Commission.STATUS_PAID_OUT])
    totals = earned.aggregate(gross=Sum("gross_amount"), commission=Sum("amount"))
    this_month = earned.filter(booking__confirmed_at__gte=now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)).aggregate(
        commission=Sum("amount")
    )
    monthly = OrderedDict((m.strftime("%Y-%m"), {"gross": ZERO, "commission": ZERO}) for m in _months_back(12))
    for row in earned.annotate(month=TruncMonth("booking__confirmed_at")).values("month").annotate(
        gross=Sum("gross_amount"), commission=Sum("amount")
    ):
        if row["month"] and row["month"].strftime("%Y-%m") in monthly:
            monthly[row["month"].strftime("%Y-%m")] = {"gross": row["gross"], "commission": row["commission"]}

    recent = []
    for app in ProviderApplication.objects.select_related("user").order_by("-created_at")[:5]:
        recent.append({"at": app.created_at, "kind": "application", "text": f"{app.business_name} applied to become a provider ({app.status})"})
    for b in Booking.objects.select_related("listing__property", "room__boarding_house").order_by("-created_at")[:5]:
        recent.append({"at": b.created_at, "kind": "booking", "text": f"{b.reference} for {b.target_title} is {b.get_status_display().lower()}"})
    for p in Payment.objects.select_related("booking").order_by("-created_at")[:5]:
        recent.append({"at": p.created_at, "kind": "payment", "text": f"Payment {p.tx_ref}: K{p.amount:,.2f} {p.status}"})
    for u in User.objects.order_by("-date_joined")[:5]:
        recent.append({"at": u.date_joined, "kind": "user", "text": f"{u.username} joined"})
    recent.sort(key=lambda r: r["at"], reverse=True)

    return Response(
        {
            "users": {
                "total": User.objects.count(),
                "active": User.objects.filter(is_active=True).count(),
                "new_last_30_days": User.objects.filter(date_joined__gte=now - timedelta(days=30)).count(),
            },
            "providers": {
                "approved": ProviderProfile.objects.filter(status=ProviderProfile.STATUS_APPROVED).count(),
                "suspended": ProviderProfile.objects.filter(status=ProviderProfile.STATUS_SUSPENDED).count(),
                "pending_applications": ProviderApplication.objects.filter(status=ProviderApplication.STATUS_PENDING).count(),
            },
            "listings": {
                "total": Listing.objects.count(),
                "live": Listing.public().count(),
                "pending_review": Listing.objects.filter(status=Listing.STATUS_PENDING).count(),
                "boarding_houses": BoardingHouse.objects.count(),
                "boarding_pending_review": BoardingHouse.objects.filter(is_approved=False).count(),
                "open_reports": ListingReport.objects.filter(status=ListingReport.STATUS_OPEN).count(),
            },
            "bookings": {
                "active": Booking.objects.filter(status__in=Booking.OPEN_STATUSES + (Booking.STATUS_CONFIRMED,)).count(),
                "confirmed": Booking.objects.filter(status=Booking.STATUS_CONFIRMED).count(),
                "total": Booking.objects.count(),
            },
            "revenue": {
                "gross_booking_value": m2(totals["gross"]),
                "platform_commission": m2(totals["commission"]),
                "commission_this_month": m2(this_month["commission"]),
                "pending_refunds": Refund.objects.filter(status=Refund.STATUS_PENDING).count(),
            },
            "monthly": [{"month": k, "gross": m2(v["gross"]), "commission": m2(v["commission"])} for k, v in monthly.items()],
            "recent_activity": recent[:12],
        }
    )


# ---------------------------------------------------------------------------
# Users and providers
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes(A)
def users(request):
    qs = User.objects.select_related("profile", "provider_profile").order_by("-date_joined")
    q = request.query_params.get("q")
    if q:
        qs = qs.filter(Q(username__icontains=q) | Q(email__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q))
    role = request.query_params.get("role")
    if role == "provider":
        qs = qs.filter(provider_profile__isnull=False)
    elif role == "admin":
        qs = qs.filter(is_staff=True)
    page = paginate(request, qs, _UserRow)
    return page


class _UserRow:
    """Tiny serializer-compatible adapter so paginate() can render users."""

    def __init__(self, items, many=True, context=None):
        self.items = items

    @property
    def data(self):
        return [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "full_name": u.get_full_name(),
                "is_active": u.is_active,
                "is_admin": u.is_staff,
                "date_joined": u.date_joined,
                "last_login": u.last_login,
                "provider_status": provider_status(u),
                "business_name": getattr(getattr(u, "provider_profile", None), "business_name", ""),
                "bookings": u.bookings.count(),
            }
            for u in self.items
        ]


@api_view(["POST"])
@permission_classes(A)
def user_action(request, user_id, action):
    user = User.objects.filter(id=user_id).first()
    if user is None:
        return not_found("User not found.")
    if user == request.user:
        return Response({"error": "You can't change your own account here."}, status=400)
    reason = str(request.data.get("reason", ""))
    if action == "suspend":
        if user.is_superuser:
            return Response({"error": "Superusers can't be suspended from the dashboard."}, status=400)
        user.is_active = False
        user.save(update_fields=["is_active"])
        Token.objects.filter(user=user).delete()
    elif action == "reactivate":
        user.is_active = True
        user.save(update_fields=["is_active"])
    elif action == "suspend-provider":
        services.set_provider_suspension(user, True, reason)
    elif action == "reinstate-provider":
        services.set_provider_suspension(user, False)
    else:
        return not_found()
    return Response(_UserRow([user]).data[0])


@api_view(["GET"])
@permission_classes(A)
def applications(request):
    qs = ProviderApplication.objects.select_related("user", "reviewed_by")
    status_filter = request.query_params.get("status", "pending")
    if status_filter != "all":
        qs = qs.filter(status=status_filter)
    return Response(AdminProviderApplicationSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes(A)
def application_decision(request, application_id, decision):
    application = ProviderApplication.objects.filter(id=application_id).first()
    if application is None:
        return not_found("Application not found.")
    if decision == "approve":
        application = services.approve_provider_application(application, request.user)
    elif decision == "reject":
        application = services.reject_provider_application(
            application,
            request.user,
            str(request.data.get("reason", "")),
            can_reapply=bool(request.data.get("can_reapply", True)),
        )
    else:
        return not_found()
    return Response(AdminProviderApplicationSerializer(application).data)


# ---------------------------------------------------------------------------
# Marketplace moderation
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes(A)
def listings(request):
    qs = Listing.objects.select_related("property__owner").prefetch_related("property__images").order_by("-created_at")
    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)
    if request.query_params.get("q"):
        q = request.query_params["q"]
        qs = qs.filter(Q(property__title__icontains=q) | Q(property__owner__username__icontains=q))
    return paginate(request, qs, ListingSerializer)


@api_view(["POST"])
@permission_classes(A)
def listing_moderate(request, listing_id, decision):
    listing = Listing.objects.select_related("property__owner").filter(id=listing_id).first()
    if listing is None:
        return not_found("Listing not found.")
    note = str(request.data.get("note", ""))
    new_status = {"approve": Listing.STATUS_APPROVED, "reject": Listing.STATUS_REJECTED, "remove": Listing.STATUS_REMOVED}.get(decision)
    if new_status is None:
        return not_found()
    if decision in ("reject", "remove") and not note.strip():
        return Response({"error": "Tell the provider why."}, status=400)
    listing.status = new_status
    listing.moderation_note = note
    listing.save(update_fields=["status", "moderation_note", "updated_at"])
    if decision == "approve" and request.data.get("verify_property"):
        listing.property.property_verified = True
        listing.property.save(update_fields=["property_verified"])
    services.notify(
        listing.property.owner,
        f"listing_{decision}",
        {
            "approve": f"{listing.property.title} is live",
            "reject": f"{listing.property.title} needs changes",
            "remove": f"{listing.property.title} was removed",
        }[decision],
        note,
        "/provider/properties",
    )
    return Response(ListingSerializer(listing, context={"request": request}).data)


@api_view(["GET"])
@permission_classes(A)
def boarding_houses(request):
    qs = BoardingHouse.objects.select_related("property__owner").prefetch_related("rooms")
    if request.query_params.get("pending") == "1":
        qs = qs.filter(is_approved=False)
    return Response(BoardingHouseSerializer(qs, many=True, context={"request": request}).data)


@api_view(["POST"])
@permission_classes(A)
def boarding_moderate(request, house_id, decision):
    house = BoardingHouse.objects.select_related("property__owner").filter(id=house_id).first()
    if house is None:
        return not_found("Boarding house not found.")
    note = str(request.data.get("note", ""))
    if decision == "approve":
        house.is_approved = True
    elif decision in ("reject", "remove"):
        if not note.strip():
            return Response({"error": "Tell the provider why."}, status=400)
        house.is_approved = False
    else:
        return not_found()
    house.save(update_fields=["is_approved"])
    services.notify(
        house.property.owner,
        f"boarding_{decision}",
        f"{house.name} is live" if decision == "approve" else f"{house.name} is hidden from students",
        note,
        "/provider/boarding",
    )
    return Response(BoardingHouseSerializer(house, context={"request": request}).data)


@api_view(["POST"])
@permission_classes(A)
def verify_owner(request, user_id):
    """Second lock of two-lock verification: the owner's identity was checked offline."""
    from ..models import Property

    updated = Property.objects.filter(owner_id=user_id).update(owner_verified=bool(request.data.get("verified", True)))
    return Response({"properties_updated": updated})


@api_view(["GET"])
@permission_classes(A)
def reports(request):
    qs = ListingReport.objects.select_related("listing__property", "boarding_house", "reporter")
    if request.query_params.get("status", "open") != "all":
        qs = qs.filter(status=request.query_params.get("status", "open"))
    return Response(ReportSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes(A)
def report_resolve(request, report_id):
    report = ListingReport.objects.filter(id=report_id).first()
    if report is None:
        return not_found("Report not found.")
    outcome = request.data.get("status")
    if outcome not in (ListingReport.STATUS_RESOLVED, ListingReport.STATUS_DISMISSED):
        return Response({"error": "Resolve or dismiss the report."}, status=400)
    report.status = outcome
    report.resolved_at = timezone.now()
    report.save(update_fields=["status", "resolved_at"])
    return Response(ReportSerializer(report).data)


@api_view(["GET"])
@permission_classes(A)
def categories(request):
    """Fixed vocabularies clients use for filters and forms."""
    from ..models import BoardingRoom, Property

    return Response(
        {
            "listing_kinds": Listing.KINDS,
            "property_types": Property.PROPERTY_TYPES,
            "furnishing": Property.FURNISHING_CHOICES,
            "room_types": BoardingRoom.ROOM_TYPES,
            "gender_policies": BoardingHouse.GENDER_CHOICES,
            "provider_types": ProviderApplication.PROVIDER_TYPES,
        }
    )


# ---------------------------------------------------------------------------
# Money
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes(A)
def payments(request):
    qs = Payment.objects.select_related("booking", "user")
    if request.query_params.get("status"):
        qs = qs.filter(status=request.query_params["status"])
    return paginate(request, qs, PaymentSerializer)


@api_view(["GET"])
@permission_classes(A)
def bookings(request):
    qs = booking_queryset()
    if request.query_params.get("status"):
        qs = qs.filter(status=request.query_params["status"])
    return paginate(request, qs, BookingSerializer)


@api_view(["GET", "POST"])
@permission_classes(A)
def refunds(request):
    if request.method == "GET":
        return Response(RefundSerializer(Refund.objects.select_related("payment__booking"), many=True).data)
    payment = Payment.objects.filter(id=request.data.get("payment_id")).first()
    if payment is None:
        return not_found("Payment not found.")
    try:
        amount = Decimal(str(request.data.get("amount")))
    except Exception:  # noqa: BLE001
        return Response({"error": "Enter the refund amount."}, status=400)
    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"error": "Give a reason for the refund."}, status=400)
    refund = services.issue_refund(payment, amount, reason, request.user)
    services.notify(
        payment.user,
        "refund",
        f"Refund of K{refund.amount:,.2f} for {payment.booking.reference}",
        reason,
        f"/bookings/{payment.booking_id}",
    )
    return Response(RefundSerializer(refund).data, status=201)


@api_view(["GET", "PATCH"])
@permission_classes(A)
def commission_rates(request):
    if request.method == "PATCH":
        for row in request.data if isinstance(request.data, list) else [request.data]:
            rate = CommissionRate.objects.filter(category=row.get("category")).first()
            if rate is None:
                return not_found("Unknown category.")
            serializer = CommissionRateSerializer(rate, data=row, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
    for category, _ in Booking.CATEGORIES:
        CommissionRate.objects.get_or_create(category=category)
    return Response(CommissionRateSerializer(CommissionRate.objects.order_by("category"), many=True).data)


@api_view(["GET"])
@permission_classes(A)
def financial_report(request):
    """Totals per category and per provider for a date range (by confirmation date)."""
    start = parse_date(request.query_params.get("from"))
    end = parse_date(request.query_params.get("to"))
    qs = Commission.objects.filter(status__in=[Commission.STATUS_EARNED, Commission.STATUS_PAID_OUT])
    if start:
        qs = qs.filter(booking__confirmed_at__date__gte=start)
    if end:
        qs = qs.filter(booking__confirmed_at__date__lte=end)
    sums = dict(gross=Sum("gross_amount"), commission=Sum("amount"), fees=Sum("processing_fee"), net=Sum("provider_net"), n=Count("id"))

    def fmt(row):
        return {k: (m2(v) if k != "n" else v) for k, v in row.items()}

    providers = {}
    for c in qs.select_related("booking__listing__property__owner", "booking__room__boarding_house__property__owner"):
        owner = c.booking.provider
        entry = providers.setdefault(owner.id, {"provider": owner.username, "gross": ZERO, "commission": ZERO, "net": ZERO, "bookings": 0})
        entry["gross"] += c.gross_amount
        entry["commission"] += c.amount
        entry["net"] += c.provider_net
        entry["bookings"] += 1
    by_provider = [
        {k: m2(v) if isinstance(v, Decimal) else v for k, v in entry.items()}
        for entry in sorted(providers.values(), key=lambda e: e["gross"], reverse=True)
    ]
    return Response(
        {
            "range": {"from": start, "to": end},
            "totals": fmt(qs.aggregate(**sums)),
            "by_category": {row["booking__category"]: fmt({k: row[k] for k in ("gross", "commission", "fees", "net", "n")}) for row in qs.values("booking__category").annotate(**sums)},
            "by_provider": by_provider,
            "refunds": m2(Refund.objects.filter(status=Refund.STATUS_COMPLETED, **({"created_at__date__gte": start} if start else {}), **({"created_at__date__lte": end} if end else {})).aggregate(s=Sum("amount"))["s"] or ZERO),
        }
    )


@api_view(["GET", "POST"])
@permission_classes(A)
def payouts(request):
    """Settle providers: bundle their unpaid earned commissions into a payout."""
    if request.method == "GET":
        owed = {}
        for c in Commission.objects.filter(status=Commission.STATUS_EARNED, payout__isnull=True).select_related(
            "booking__listing__property__owner", "booking__room__boarding_house__property__owner"
        ):
            owner = c.booking.provider
            entry = owed.setdefault(owner.id, {"provider_id": owner.id, "provider": owner.username, "amount": ZERO, "bookings": 0})
            entry["amount"] += c.provider_net
            entry["bookings"] += 1
        return Response(
            {
                "owed": [{**e, "amount": m2(e["amount"])} for e in owed.values()],
                "history": PayoutSerializer(ProviderPayout.objects.select_related("provider")[:100], many=True).data,
            }
        )
    provider_id = request.data.get("provider_id")
    reference = str(request.data.get("reference", "")).strip()
    if not reference:
        return Response({"error": "Enter the bank or mobile-money reference for this payout."}, status=400)
    with transaction.atomic():
        commissions = list(
            Commission.objects.select_for_update()
            .filter(status=Commission.STATUS_EARNED, payout__isnull=True)
            .filter(Q(booking__listing__property__owner_id=provider_id) | Q(booking__room__boarding_house__property__owner_id=provider_id))
        )
        if not commissions:
            return Response({"error": "Nothing is owed to this provider."}, status=400)
        payout = ProviderPayout.objects.create(
            provider_id=provider_id,
            amount=sum((c.provider_net for c in commissions), ZERO),
            status=ProviderPayout.STATUS_PAID,
            reference=reference,
            paid_at=timezone.now(),
        )
        Commission.objects.filter(pk__in=[c.pk for c in commissions]).update(payout=payout, status=Commission.STATUS_PAID_OUT)
    services.notify(payout.provider, "payout", f"Payout of K{payout.amount:,.2f} sent", f"Reference {reference}", "/provider/earnings")
    return Response(PayoutSerializer(payout).data, status=201)
