"""What every signed-in user can do: search, view, save, enquire, book, pay, review, report."""

import hmac

from django.conf import settings
from django.db.models import Count, F, Min, Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .. import services
from ..models import (
    BoardingHouse,
    BoardingRoom,
    BoardingTenancy,
    Booking,
    Favourite,
    Inquiry,
    Listing,
    ListingReport,
    Notification,
    Payment,
    Review,
)
from ..serializers import (
    BoardingHouseSerializer,
    BoardingSearchSerializer,
    BookingCreateSerializer,
    BookingSerializer,
    FavouriteSerializer,
    InquiryCreateSerializer,
    ListingSearchSerializer,
    ListingSerializer,
    NotificationSerializer,
    PaymentSerializer,
    ReportSerializer,
    ReviewSerializer,
)
from .common import not_found, paginate, validated

MAX_SEARCH_RESULTS = 200


def favourite_context(request):
    favs = Favourite.objects.filter(user=request.user)
    return {
        "request": request,
        "favourite_listing_ids": set(favs.exclude(listing=None).values_list("listing_id", flat=True)),
        "favourite_house_ids": set(favs.exclude(boarding_house=None).values_list("boarding_house_id", flat=True)),
    }


# ---------------------------------------------------------------------------
# Property search
# ---------------------------------------------------------------------------
@api_view(["GET"])
def search_listings(request):
    """Public listings (approved, published, active provider) with filters and an optional map box."""
    data = validated(ListingSearchSerializer, request.query_params)
    qs = Listing.public().select_related("property__owner__provider_profile").prefetch_related("property__images")
    # Boarding houses have their own experience; keep them out of ordinary property results.
    qs = qs.exclude(property__property_type="boarding_house")

    if "bbox" in data:
        west, south, east, north = data["bbox"]
        qs = qs.filter(
            property__latitude__gte=south,
            property__latitude__lte=north,
            property__longitude__gte=west,
            property__longitude__lte=east,
        )
    if data.get("q"):
        term = data["q"]
        qs = qs.filter(
            Q(property__title__icontains=term)
            | Q(property__address__icontains=term)
            | Q(property__neighbourhood__icontains=term)
            | Q(property__town__icontains=term)
        )
    simple = {
        "kind": "kind",
        "property_type": "property__property_type",
        "furnishing": "property__furnishing",
        "min_price": "price__gte",
        "max_price": "price__lte",
        "bedrooms": "property__bedrooms__gte",
        "bathrooms": "property__bathrooms__gte",
        "min_size": "property__size_sqm__gte",
        "max_size": "property__size_sqm__lte",
    }
    for param, lookup in simple.items():
        if data.get(param) not in (None, ""):
            qs = qs.filter(**{lookup: data[param]})
    if data.get("town"):
        qs = qs.filter(property__town__iexact=data["town"])
    if data.get("neighbourhood"):
        qs = qs.filter(property__neighbourhood__iexact=data["neighbourhood"])
    if data.get("available_by"):
        qs = qs.filter(Q(available_from__isnull=True) | Q(available_from__lte=data["available_by"]))
    if data.get("instant"):
        qs = qs.filter(booking_mode="instant")
    if data.get("verified"):
        qs = qs.filter(property__owner_verified=True, property__property_verified=True)
    for amenity in filter(None, (a.strip() for a in data.get("amenities", "").split(","))):
        qs = qs.filter(property__amenities__icontains=f'"{amenity}"')

    order = {"newest": "-created_at", "price-asc": "price", "price-desc": "-price"}[data["sort"]]
    total = qs.count()
    results = qs.order_by(order, "-id")[:MAX_SEARCH_RESULTS]
    return Response(
        {
            "count": total,
            "truncated": total > MAX_SEARCH_RESULTS,
            "results": ListingSerializer(results, many=True, context=favourite_context(request)).data,
        }
    )


@api_view(["GET"])
def listing_detail(request, listing_id):
    listing = (
        Listing.objects.select_related("property__owner")
        .prefetch_related("property__images")
        .filter(id=listing_id)
        .first()
    )
    if listing is None:
        return not_found("Listing not found.")
    is_public = Listing.public().filter(id=listing_id).exists()
    can_manage = listing.property.can_manage(request.user) or request.user.is_staff
    if not is_public and not can_manage:
        return not_found("This listing isn't available.")
    payload = ListingSerializer(listing, context=favourite_context(request)).data
    payload["is_public"] = is_public
    payload["can_manage"] = can_manage
    payload["reviews"] = ReviewSerializer(
        Review.objects.filter(booking__listing=listing).select_related("user")[:20], many=True
    ).data
    # Booked date ranges so the calendar can grey them out (no guest details).
    payload["unavailable"] = list(
        services.holding_bookings()
        .filter(listing=listing, check_out__gte=services.timezone.localdate())
        .values("check_in", "check_out")
    )
    return Response(payload)


# ---------------------------------------------------------------------------
# Boarding houses (student accommodation)
# ---------------------------------------------------------------------------
@api_view(["GET"])
def search_boarding_houses(request):
    """Only houses with at least one free bed matching the filters are returned."""
    data = validated(BoardingSearchSerializer, request.query_params)
    houses = BoardingHouse.public().select_related("property__owner").prefetch_related("rooms", "property__images")
    if data.get("q"):
        term = data["q"]
        houses = houses.filter(
            Q(name__icontains=term)
            | Q(property__neighbourhood__icontains=term)
            | Q(property__town__icontains=term)
            | Q(near_institution__icontains=term)
        )
    if data.get("town"):
        houses = houses.filter(property__town__iexact=data["town"])
    if data.get("near"):
        houses = houses.filter(near_institution__icontains=data["near"])
    if data.get("gender"):
        houses = houses.filter(gender_policy=data["gender"])
    if "bbox" in data:
        west, south, east, north = data["bbox"]
        houses = houses.filter(
            property__latitude__gte=south,
            property__latitude__lte=north,
            property__longitude__gte=west,
            property__longitude__lte=east,
        )

    room_filter = Q(rooms__is_active=True)
    if data.get("room_type"):
        room_filter &= Q(rooms__room_type=data["room_type"])
    if data.get("sharing") == "shared":
        room_filter &= Q(rooms__capacity__gt=1)
    if data.get("sharing") == "private":
        room_filter &= Q(rooms__capacity=1)
    if data.get("min_price") is not None:
        room_filter &= Q(rooms__price_per_bed__gte=data["min_price"])
    if data.get("max_price") is not None:
        room_filter &= Q(rooms__price_per_bed__lte=data["max_price"])
    houses = houses.filter(room_filter).distinct()

    context = favourite_context(request)
    results = []
    for house in houses.order_by("name")[:MAX_SEARCH_RESULTS]:
        payload = BoardingHouseSerializer(house, context=context).data
        matching = [
            room
            for room in payload["rooms"]
            if room["occupancy"]["available"] > 0
            and (not data.get("room_type") or room["room_type"] == data["room_type"])
            and (data.get("sharing") != "shared" or room["capacity"] > 1)
            and (data.get("sharing") != "private" or room["capacity"] == 1)
            and (data.get("min_price") is None or float(room["price_per_bed"]) >= float(data["min_price"]))
            and (data.get("max_price") is None or float(room["price_per_bed"]) <= float(data["max_price"]))
        ]
        if not matching:
            continue  # students only see houses with space
        payload["rooms"] = matching
        payload["price_from"] = str(min(float(r["price_per_bed"]) for r in matching))
        results.append(payload)
    return Response({"count": len(results), "results": results})


@api_view(["GET"])
def boarding_house_detail(request, house_id):
    house = BoardingHouse.objects.select_related("property__owner").filter(id=house_id).first()
    if house is None:
        return not_found("Boarding house not found.")
    is_public = BoardingHouse.public().filter(id=house_id).exists()
    can_manage = house.property.can_manage(request.user) or request.user.is_staff
    if not is_public and not can_manage:
        return not_found("This boarding house isn't available.")
    payload = BoardingHouseSerializer(house, context=favourite_context(request)).data
    payload["is_public"] = is_public
    payload["can_manage"] = can_manage
    payload["reviews"] = ReviewSerializer(
        Review.objects.filter(booking__room__boarding_house=house).select_related("user")[:20], many=True
    ).data
    return Response(payload)


# ---------------------------------------------------------------------------
# Favourites
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
def favourites(request):
    if request.method == "GET":
        favs = Favourite.objects.filter(user=request.user).select_related(
            "listing__property__owner", "boarding_house__property__owner"
        )
        return Response(FavouriteSerializer(favs, many=True, context={"request": request}).data)

    listing_id = request.data.get("listing_id")
    house_id = request.data.get("boarding_house_id")
    if bool(listing_id) == bool(house_id):
        return Response({"error": "Save one listing or one boarding house."}, status=400)
    if listing_id and not Listing.public().filter(id=listing_id).exists():
        return not_found("Listing not found.")
    if house_id and not BoardingHouse.public().filter(id=house_id).exists():
        return not_found("Boarding house not found.")
    fav, created = Favourite.objects.get_or_create(
        user=request.user,
        listing_id=listing_id or None,
        boarding_house_id=house_id or None,
    )
    return Response({"id": fav.id, "saved": True}, status=status.HTTP_201_CREATED if created else 200)


@api_view(["DELETE"])
def remove_favourite(request):
    listing_id = request.query_params.get("listing_id")
    house_id = request.query_params.get("boarding_house_id")
    qs = Favourite.objects.filter(user=request.user)
    if listing_id:
        qs = qs.filter(listing_id=listing_id)
    elif house_id:
        qs = qs.filter(boarding_house_id=house_id)
    else:
        return Response({"error": "Say which listing or boarding house to remove."}, status=400)
    qs.delete()
    return Response({"saved": False})


# ---------------------------------------------------------------------------
# Enquiries, reports, reviews, notifications
# ---------------------------------------------------------------------------
@api_view(["POST"])
def create_inquiry(request):
    data = validated(InquiryCreateSerializer, request.data)
    if data.get("listing_id"):
        target = Listing.public().select_related("property__owner").filter(id=data["listing_id"]).first()
        if target is None:
            return not_found("Listing not found.")
        owner, title = target.property.owner, target.property.title
        inquiry = Inquiry.objects.create(listing=target, user=request.user, name=data["name"], phone=data["phone"], message=data["message"])
    else:
        target = BoardingHouse.public().select_related("property__owner").filter(id=data["boarding_house_id"]).first()
        if target is None:
            return not_found("Boarding house not found.")
        owner, title = target.property.owner, target.name
        inquiry = Inquiry.objects.create(boarding_house=target, user=request.user, name=data["name"], phone=data["phone"], message=data["message"])
    if owner == request.user:
        inquiry.delete()
        return Response({"error": "You can't send an enquiry to yourself."}, status=400)
    services.notify(owner, "enquiry", f"New enquiry about {title}", f"{data['name']}: {data['message'][:140]}", "/provider/enquiries")
    return Response({"message": "Enquiry sent. The provider will contact you."}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
def create_report(request):
    serializer = ReportSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(reporter=request.user)
    services.notify_admins("report", "A listing was reported", serializer.validated_data["reason"], "/admin/reports")
    return Response({"message": "Thanks. An administrator will review this."}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
def create_review(request, booking_id):
    booking = Booking.objects.filter(id=booking_id, user=request.user).first()
    if booking is None:
        return not_found("Booking not found.")
    if booking.status != Booking.STATUS_COMPLETED:
        return Response({"error": "You can review a place after your stay is completed."}, status=400)
    if hasattr(booking, "review"):
        return Response({"error": "You already reviewed this booking."}, status=400)
    serializer = ReviewSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(booking=booking, user=request.user)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def notifications(request):
    qs = Notification.objects.filter(user=request.user)
    if request.query_params.get("unread") == "1":
        qs = qs.filter(is_read=False)
    response = paginate(request, qs, NotificationSerializer)
    response.data["unread"] = Notification.objects.filter(user=request.user, is_read=False).count()
    return response


@api_view(["POST"])
def mark_notifications_read(request):
    qs = Notification.objects.filter(user=request.user, is_read=False)
    ids = request.data.get("ids")
    if ids:
        qs = qs.filter(id__in=ids)
    updated = qs.update(is_read=True)
    return Response({"marked": updated})


# ---------------------------------------------------------------------------
# Bookings (guest side)
# ---------------------------------------------------------------------------
def booking_queryset():
    return Booking.objects.select_related(
        "listing__property__owner", "room__boarding_house__property__owner", "commission", "user"
    ).prefetch_related("payments")


@api_view(["GET", "POST"])
def my_bookings(request):
    if request.method == "GET":
        services.expire_stale_bookings()
        services.complete_finished_stays()
        qs = booking_queryset().filter(user=request.user)
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        return Response(BookingSerializer(qs, many=True).data)

    data = validated(BookingCreateSerializer, request.data)
    if data.get("listing_id"):
        booking = services.create_listing_booking(request.user, data["listing_id"], data)
    else:
        booking = services.create_room_booking(request.user, data["room_id"], data)
    return Response(BookingSerializer(booking_queryset().get(pk=booking.pk)).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def booking_detail(request, booking_id):
    services.expire_stale_bookings()
    booking = booking_queryset().filter(id=booking_id).first()
    if booking is None:
        return not_found("Booking not found.")
    prop = booking.listing.property if booking.listing_id else booking.room.boarding_house.property
    if booking.user_id != request.user.id and not prop.can_manage(request.user) and not request.user.is_staff:
        return not_found("Booking not found.")
    return Response(BookingSerializer(booking).data)


@api_view(["POST"])
def cancel_my_booking(request, booking_id):
    booking, refund = services.cancel_booking(request.user, booking_id, reason=request.data.get("reason", ""))
    message = "Booking cancelled."
    if refund:
        message += f" A refund of K{refund.amount:,.2f} is {refund.status}."
    elif booking.payments.filter(status=Payment.STATUS_SUCCESSFUL).exists():
        message += " It was inside the no-refund window, so no automatic refund applies."
    return Response({"message": message, "booking": BookingSerializer(booking_queryset().get(pk=booking.pk)).data})


@api_view(["GET"])
def my_placement(request):
    tenancy = (
        BoardingTenancy.objects.select_related("room__boarding_house__property")
        .filter(student=request.user, status__in=BoardingTenancy.BED_HOLDING_STATUSES)
        .first()
    )
    if tenancy is None:
        return Response({"placement": None})
    return Response(
        {
            "placement": {
                "boarding_house_id": tenancy.room.boarding_house_id,
                "boarding_house": tenancy.room.boarding_house.name,
                "address": tenancy.room.boarding_house.property.address,
                "room": tenancy.room.name,
                "status": tenancy.status,
                "check_in_date": tenancy.check_in_date,
                "lease_end": tenancy.lease_end,
                "rent_amount": str(tenancy.rent_amount),
                "amount_paid": str(tenancy.amount_paid),
                "balance": str(tenancy.balance),
            }
        }
    )


# ---------------------------------------------------------------------------
# Payments (payer side)
# ---------------------------------------------------------------------------
@api_view(["POST"])
def pay_booking(request, booking_id):
    payment = services.start_payment(request.user, booking_id)
    return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
def verify_payment(request):
    """Called by the web app after the gateway redirects back. The gateway is asked directly."""
    tx_ref = str(request.data.get("tx_ref", ""))
    payment = Payment.objects.filter(tx_ref=tx_ref, user=request.user).first()
    if payment is None:
        return not_found("Payment not found.")
    payment = services.verify_payment(tx_ref, request.data.get("transaction_id") or None)
    return Response(PaymentSerializer(payment).data)


@api_view(["GET"])
def my_payments(request):
    qs = Payment.objects.filter(user=request.user).select_related("booking")
    return Response(PaymentSerializer(qs, many=True).data)


@api_view(["GET"])
def payment_receipt(request, payment_id):
    payment = (
        Payment.objects.select_related("booking__commission", "user")
        .filter(id=payment_id)
        .first()
    )
    if payment is None:
        return not_found("Receipt not found.")
    booking = payment.booking
    prop = booking.listing.property if booking.listing_id else booking.room.boarding_house.property
    if payment.user_id != request.user.id and not prop.can_manage(request.user) and not request.user.is_staff:
        return not_found("Receipt not found.")
    if payment.status not in (Payment.STATUS_SUCCESSFUL, Payment.STATUS_REFUNDED, Payment.STATUS_PARTIALLY_REFUNDED):
        return Response({"error": "Receipts are issued for successful payments only."}, status=400)
    return Response(
        {
            "receipt_number": f"RCPT-{payment.pk:06d}",
            "issued_at": payment.verified_at,
            "payer": payment.user.get_full_name() or payment.user.username,
            "payer_email": payment.user.email,
            "booking_reference": booking.reference,
            "description": booking.target_title,
            "period": {"from": booking.check_in, "to": booking.check_out, "units": booking.periods, "category": booking.category},
            "unit_price": str(booking.unit_price),
            "amount": str(payment.amount),
            "currency": payment.currency,
            "method": payment.method,
            "gateway": payment.gateway,
            "tx_ref": payment.tx_ref,
            "gateway_transaction_id": payment.gateway_transaction_id,
            "refunded_amount": str(payment.refunded_amount),
            "status": payment.status,
        }
    )


@api_view(["POST"])
def sandbox_complete(request):
    """Local simulator only: the sandbox checkout page reports the payer's choice here."""
    if settings.PAYMENT_GATEWAY != "sandbox":
        return not_found()
    payment = Payment.objects.filter(
        tx_ref=str(request.data.get("tx_ref", "")), user=request.user, gateway="sandbox"
    ).first()
    if payment is None:
        return not_found("Payment not found.")
    outcome = request.data.get("outcome")
    if outcome not in ("successful", "failed") or payment.status != Payment.STATUS_INITIATED:
        return Response({"error": "This sandbox payment can't be changed."}, status=400)
    payment.gateway_response = {
        "sandbox_outcome": outcome,
        "sandbox_method": request.data.get("method") if request.data.get("method") in ("card", "mobilemoneyzambia") else "mobilemoneyzambia",
    }
    payment.save(update_fields=["gateway_response", "updated_at"])
    payment = services.verify_payment(payment.tx_ref)
    return Response(PaymentSerializer(payment).data)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([])
def flutterwave_webhook(request):
    """Flutterwave calls this. The shared secret header is checked, then the payment is
    re-verified with Flutterwave's API, so a forged body can't confirm anything."""
    expected = settings.FLUTTERWAVE_WEBHOOK_HASH
    received = request.headers.get("verif-hash", "")
    if not expected or not hmac.compare_digest(expected, received):
        return Response(status=status.HTTP_401_UNAUTHORIZED)
    data = request.data.get("data") or {}
    tx_ref = str(data.get("tx_ref", ""))
    if tx_ref and Payment.objects.filter(tx_ref=tx_ref, gateway="flutterwave").exists():
        try:
            services.verify_payment(tx_ref, data.get("id"))
        except Exception:  # noqa: BLE001 - always 200 so Flutterwave doesn't hammer retries; logged below
            import logging

            logging.getLogger(__name__).exception("Webhook verification failed for %s", tx_ref)
    return Response({"received": True})
