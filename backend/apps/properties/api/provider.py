"""Provider tools. Every view requires an approved, non-suspended provider and only touches
properties the provider owns or has been authorised to manage."""

from collections import OrderedDict
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .. import services
from ..models import (
    ZERO,
    BoardingHouse,
    BoardingRoom,
    BoardingTenancy,
    Booking,
    Commission,
    Inquiry,
    Listing,
    Notification,
    Property,
    PropertyImage,
    PropertyUnit,
    ProviderPayout,
)
from ..permissions import IsApprovedProvider
from ..serializers import (
    BoardingHouseSerializer,
    BoardingHouseWriteSerializer,
    BoardingRoomSerializer,
    BoardingRoomWriteSerializer,
    BookingSerializer,
    InquirySerializer,
    ListingWriteSerializer,
    NotificationSerializer,
    OccupantCreateSerializer,
    PayoutSerializer,
    PropertyImageSerializer,
    PropertySerializer,
    PropertyUnitSerializer,
    ProviderPropertySerializer,
    TenancySerializer,
    TenancyUpdateSerializer,
)
from .common import m2, not_found, parse_date, validated
from .marketplace import booking_queryset

P = [IsApprovedProvider]
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def managed_properties(user):
    return Property.objects.filter(Q(owner=user) | Q(managers=user)).distinct()


def managed_property(user, property_id):
    return managed_properties(user).filter(id=property_id).first()


def managed_house(user, house_id):
    return (
        BoardingHouse.objects.select_related("property")
        .filter(id=house_id, property__in=managed_properties(user))
        .first()
    )


def managed_room(user, room_id):
    return (
        BoardingRoom.objects.select_related("boarding_house__property")
        .filter(id=room_id, boarding_house__property__in=managed_properties(user))
        .first()
    )


def managed_tenancy(user, tenancy_id):
    return (
        BoardingTenancy.objects.select_related("room__boarding_house__property", "student", "booking")
        .filter(id=tenancy_id, room__boarding_house__property__in=managed_properties(user))
        .first()
    )


def managed_bookings(user):
    props = managed_properties(user)
    return booking_queryset().filter(Q(listing__property__in=props) | Q(room__boarding_house__property__in=props))


# ---------------------------------------------------------------------------
# Properties, listings, images, units
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes(P)
def properties(request):
    if request.method == "GET":
        qs = (
            managed_properties(request.user)
            .prefetch_related("images", "listings", "units")
            .select_related("boarding_house")
            .order_by("-created_at")
        )
        return Response(ProviderPropertySerializer(qs, many=True, context={"request": request}).data)

    serializer = PropertySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    listing_data = None
    if request.data.get("listing"):
        listing_data = validated(ListingWriteSerializer, request.data["listing"])
    with transaction.atomic():
        prop = serializer.save(owner=request.user)
        if listing_data:
            Listing.objects.create(property=prop, status=Listing.STATUS_PENDING, **listing_data)
    if listing_data:
        services.notify_admins("listing_review", f"New listing to review: {prop.title}", link="/admin/listings")
    return Response(
        ProviderPropertySerializer(prop, context={"request": request}).data, status=status.HTTP_201_CREATED
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes(P)
def property_detail(request, property_id):
    prop = managed_property(request.user, property_id)
    if prop is None:
        return not_found("Property not found in your account.")
    if request.method == "PATCH":
        serializer = PropertySerializer(prop, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
    elif request.method == "DELETE":
        if prop.owner_id != request.user.id:
            return Response({"error": "Only the owner can delete a property."}, status=403)
        if Booking.objects.filter(
            Q(listing__property=prop) | Q(room__boarding_house__property=prop),
            status__in=Booking.OPEN_STATUSES + (Booking.STATUS_CONFIRMED,),
        ).exists():
            return Response({"error": "This property has open or confirmed bookings. Unpublish it instead."}, status=400)
        if Booking.objects.filter(Q(listing__property=prop) | Q(room__boarding_house__property=prop)).exists():
            # Keep financial history: hide everything instead of deleting.
            prop.listings.update(is_published=False)
            BoardingHouse.objects.filter(property=prop).update(is_active=False)
            return Response({"message": "This property has booking history, so it was unpublished instead of deleted."})
        prop.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    prop.refresh_from_db()
    return Response(ProviderPropertySerializer(prop, context={"request": request}).data)


@api_view(["POST"])
@permission_classes(P)
def property_listings(request, property_id):
    prop = managed_property(request.user, property_id)
    if prop is None:
        return not_found("Property not found in your account.")
    data = validated(ListingWriteSerializer, request.data)
    if prop.listings.filter(kind=data["kind"]).exclude(status=Listing.STATUS_REMOVED).exists():
        return Response({"error": f"This property already has a {data['kind']} listing. Edit that one."}, status=400)
    listing = Listing.objects.create(property=prop, status=Listing.STATUS_PENDING, **data)
    services.notify_admins("listing_review", f"New listing to review: {prop.title}", link="/admin/listings")
    return Response({"id": listing.id, "status": listing.status}, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes(P)
def listing_update(request, listing_id):
    listing = Listing.objects.filter(id=listing_id, property__in=managed_properties(request.user)).first()
    if listing is None:
        return not_found("Listing not found in your account.")
    if listing.status == Listing.STATUS_REMOVED:
        return Response({"error": "An administrator removed this listing. Contact support."}, status=400)
    serializer = ListingWriteSerializer(data={**{
        "kind": listing.kind,
        "price": listing.price,
        "booking_mode": listing.booking_mode,
        "available_from": listing.available_from,
        "is_published": listing.is_published,
    }, **request.data})
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    if data["kind"] != listing.kind:
        return Response({"error": "Create a new listing to change the type."}, status=400)
    for field in ("price", "booking_mode", "available_from", "is_published"):
        setattr(listing, field, data[field])
    if listing.status == Listing.STATUS_REJECTED and request.data.get("resubmit"):
        listing.status = Listing.STATUS_PENDING
        services.notify_admins("listing_review", f"Listing resubmitted: {listing.property.title}", link="/admin/listings")
    listing.save()
    return Response(
        {"id": listing.id, "status": listing.status, "is_published": listing.is_published, "price": str(listing.price)}
    )


@api_view(["POST"])
@permission_classes(P)
@parser_classes([MultiPartParser, FormParser])
def property_images(request, property_id):
    prop = managed_property(request.user, property_id)
    if prop is None:
        return not_found("Property not found in your account.")
    files = request.FILES.getlist("images")
    if not files:
        return Response({"error": "Choose at least one photo."}, status=400)
    if prop.images.count() + len(files) > 20:
        return Response({"error": "A property can have up to 20 photos."}, status=400)
    for f in files:
        if f.content_type not in ALLOWED_IMAGE_TYPES:
            return Response({"error": f"{f.name} isn't a JPEG, PNG or WebP image."}, status=400)
        if f.size > settings.MAX_IMAGE_UPLOAD_BYTES:
            return Response({"error": f"{f.name} is larger than 5 MB."}, status=400)
    start = prop.images.count()
    created = []
    from PIL import Image, UnidentifiedImageError

    for i, f in enumerate(files):
        try:
            Image.open(f).verify()  # reject files that only pretend to be images
            f.seek(0)
        except (UnidentifiedImageError, OSError):
            return Response({"error": f"{f.name} couldn't be read as an image."}, status=400)
        created.append(PropertyImage.objects.create(property=prop, image=f, order=start + i))
    return Response(PropertyImageSerializer(created, many=True, context={"request": request}).data, status=201)


@api_view(["DELETE"])
@permission_classes(P)
def property_image_delete(request, image_id):
    image = PropertyImage.objects.filter(id=image_id, property__in=managed_properties(request.user)).first()
    if image is None:
        return not_found("Photo not found.")
    image.image.delete(save=False)
    image.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "POST"])
@permission_classes(P)
def property_units(request, property_id):
    prop = managed_property(request.user, property_id)
    if prop is None:
        return not_found("Property not found in your account.")
    if request.method == "GET":
        return Response(PropertyUnitSerializer(prop.units.all(), many=True).data)
    serializer = PropertyUnitSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    if prop.units.filter(name__iexact=serializer.validated_data["name"]).exists():
        return Response({"error": "A unit with that name already exists here."}, status=400)
    serializer.save(property=prop)
    return Response(serializer.data, status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes(P)
def unit_detail(request, unit_id):
    unit = PropertyUnit.objects.filter(id=unit_id, property__in=managed_properties(request.user)).first()
    if unit is None:
        return not_found("Unit not found.")
    if request.method == "DELETE":
        unit.delete()
        return Response(status=204)
    serializer = PropertyUnitSerializer(unit, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# ---------------------------------------------------------------------------
# Boarding houses, rooms, occupants
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes(P)
def boarding_houses(request):
    if request.method == "GET":
        houses = BoardingHouse.objects.filter(property__in=managed_properties(request.user)).select_related(
            "property__owner"
        ).prefetch_related("rooms", "property__images")
        return Response(BoardingHouseSerializer(houses, many=True, context={"request": request}).data)

    house_data = validated(BoardingHouseWriteSerializer, request.data)
    property_id = request.data.get("property_id")
    with transaction.atomic():
        if property_id:
            prop = managed_property(request.user, property_id)
            if prop is None:
                return not_found("Property not found in your account.")
            if hasattr(prop, "boarding_house"):
                return Response({"error": "This property is already a boarding house."}, status=400)
            prop.property_type = Property.TYPE_BOARDING
            prop.save(update_fields=["property_type"])
        else:
            prop_serializer = PropertySerializer(data={**request.data.get("property", {}), "property_type": "boarding_house"})
            prop_serializer.is_valid(raise_exception=True)
            prop = prop_serializer.save(owner=request.user)
        house = BoardingHouse.objects.create(property=prop, **house_data)
        rooms = request.data.get("rooms") or []
        for room in rooms:
            room_data = validated(BoardingRoomWriteSerializer, room)
            if house.rooms.filter(name__iexact=room_data["name"]).exists():
                return Response({"error": f"Two rooms are called {room_data['name']}."}, status=400)
            BoardingRoom.objects.create(boarding_house=house, **room_data)
    services.notify_admins("boarding_review", f"New boarding house to review: {house.name}", link="/admin/listings")
    return Response(BoardingHouseSerializer(house, context={"request": request}).data, status=201)


@api_view(["GET", "PATCH"])
@permission_classes(P)
def boarding_house_detail(request, house_id):
    house = managed_house(request.user, house_id)
    if house is None:
        return not_found("Boarding house not found in your account.")
    if request.method == "PATCH":
        serializer = BoardingHouseWriteSerializer(house, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response(BoardingHouseSerializer(house, context={"request": request}).data)


@api_view(["POST"])
@permission_classes(P)
def rooms(request, house_id):
    house = managed_house(request.user, house_id)
    if house is None:
        return not_found("Boarding house not found in your account.")
    data = validated(BoardingRoomWriteSerializer, request.data)
    if house.rooms.filter(name__iexact=data["name"]).exists():
        return Response({"error": f"There's already a room called {data['name']}."}, status=400)
    room = BoardingRoom.objects.create(boarding_house=house, **data)
    return Response(BoardingRoomSerializer(room).data, status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes(P)
def room_detail(request, room_id):
    with transaction.atomic():
        room = managed_room(request.user, room_id)
        if room is None:
            return not_found("Room not found.")
        room = BoardingRoom.objects.select_for_update().get(pk=room.pk)
        if request.method == "DELETE":
            if room.tenancies.exists() or room.bookings.exists():
                room.is_active = False
                room.save(update_fields=["is_active"])
                if room.tenancies.filter(status__in=BoardingTenancy.BED_HOLDING_STATUSES).exists():
                    return Response({"message": "Room hidden from search. Its current occupants stay registered."})
                return Response({"message": "Room has history, so it was hidden instead of deleted."})
            room.delete()
            return Response(status=204)
        serializer = BoardingRoomWriteSerializer(room, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if "capacity" in serializer.validated_data:
            services.ensure_room_capacity_change_allowed(room, serializer.validated_data["capacity"])
        name = serializer.validated_data.get("name")
        if name and room.boarding_house.rooms.filter(name__iexact=name).exclude(pk=room.pk).exists():
            return Response({"error": f"There's already a room called {name}."}, status=400)
        serializer.save()
    return Response(BoardingRoomSerializer(room).data)


@api_view(["GET", "POST"])
@permission_classes(P)
def occupants(request, house_id):
    house = managed_house(request.user, house_id)
    if house is None:
        return not_found("Boarding house not found in your account.")
    if request.method == "GET":
        qs = BoardingTenancy.objects.filter(room__boarding_house=house).select_related(
            "room__boarding_house", "student", "booking"
        )
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        if request.query_params.get("room"):
            qs = qs.filter(room_id=request.query_params["room"])
        return Response(TenancySerializer(qs, many=True).data)

    data = dict(validated(OccupantCreateSerializer, request.data))
    room = house.rooms.filter(id=data.pop("room_id")).first()
    if room is None:
        return not_found("Room not found in this boarding house.")
    username = data.pop("username")
    student = None
    if username:
        student = User.objects.filter(username__iexact=username, is_active=True).first()
        if student is None:
            return not_found("No Nyumba account with that username. Leave it blank to register a walk-in occupant.")
    if data["rent_amount"] is None:
        data["rent_amount"] = room.price_per_bed
    if data["status"] == BoardingTenancy.STATUS_ACTIVE and not data["check_in_date"]:
        data["check_in_date"] = timezone.localdate()
    paid = data["amount_paid"]
    data["payment_status"] = (
        BoardingTenancy.PAYMENT_UNPAID if paid <= 0 else
        BoardingTenancy.PAYMENT_PARTIAL if paid < data["rent_amount"] else BoardingTenancy.PAYMENT_PAID
    )
    tenancy = services.register_occupant(room, data, student=student)
    return Response(TenancySerializer(tenancy).data, status=201)


@api_view(["GET", "PATCH"])
@permission_classes(P)
def tenancy_detail(request, tenancy_id):
    tenancy = managed_tenancy(request.user, tenancy_id)
    if tenancy is None:
        return not_found("Occupant not found.")
    if request.method == "PATCH":
        serializer = TenancyUpdateSerializer(tenancy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response(TenancySerializer(tenancy).data)


@api_view(["POST"])
@permission_classes(P)
def tenancy_check_in(request, tenancy_id):
    tenancy = managed_tenancy(request.user, tenancy_id)
    if tenancy is None:
        return not_found("Occupant not found.")
    services.check_in_occupant(tenancy)
    return Response(TenancySerializer(tenancy).data)


@api_view(["POST"])
@permission_classes(P)
def tenancy_check_out(request, tenancy_id):
    tenancy = managed_tenancy(request.user, tenancy_id)
    if tenancy is None:
        return not_found("Occupant not found.")
    services.check_out_occupant(tenancy)
    return Response(TenancySerializer(tenancy).data)


@api_view(["GET"])
@permission_classes(P)
def occupancy_report(request, house_id):
    house = managed_house(request.user, house_id)
    if house is None:
        return not_found("Boarding house not found in your account.")
    rooms_occ, totals = services.house_occupancy(house)
    tenancies = BoardingTenancy.objects.filter(room__boarding_house=house)
    balances = tenancies.filter(status__in=BoardingTenancy.BED_HOLDING_STATUSES).aggregate(
        rent=Sum("rent_amount"), paid=Sum("amount_paid")
    )
    return Response(
        {
            "boarding_house": {"id": house.id, "name": house.name, "address": house.property.address},
            "generated_at": timezone.now(),
            "totals": totals,
            "rooms": [
                {
                    "id": room.id,
                    "name": room.name,
                    "room_type": room.room_type,
                    "price_per_bed": str(room.price_per_bed),
                    **occ,
                    "occupants": [
                        {"name": t.occupant_name, "status": t.status, "check_in_date": t.check_in_date, "lease_end": t.lease_end}
                        for t in room.tenancies.filter(status__in=BoardingTenancy.BED_HOLDING_STATUSES)
                    ],
                }
                for room, occ in rooms_occ
            ],
            "money": {
                "rent_due": m2(balances["rent"]),
                "collected": m2(balances["paid"]),
                "outstanding": m2((balances["rent"] or ZERO) - (balances["paid"] or ZERO)),
            },
            "movements_last_30_days": {
                "checked_in": tenancies.filter(check_in_date__gte=timezone.localdate() - timedelta(days=30)).count(),
                "checked_out": tenancies.filter(check_out_date__gte=timezone.localdate() - timedelta(days=30)).count(),
            },
        }
    )


@api_view(["GET"])
@permission_classes(P)
def all_occupants(request):
    qs = BoardingTenancy.objects.filter(
        room__boarding_house__property__in=managed_properties(request.user)
    ).select_related("room__boarding_house", "student", "booking")
    if request.query_params.get("status"):
        qs = qs.filter(status=request.query_params["status"])
    else:
        qs = qs.filter(status__in=BoardingTenancy.BED_HOLDING_STATUSES)
    return Response(TenancySerializer(qs, many=True).data)


# ---------------------------------------------------------------------------
# Bookings and enquiries
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes(P)
def bookings(request):
    services.expire_stale_bookings()
    services.complete_finished_stays()
    qs = managed_bookings(request.user)
    if request.query_params.get("status"):
        qs = qs.filter(status=request.query_params["status"])
    return Response(BookingSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes(P)
def booking_decision(request, booking_id, decision):
    note = str(request.data.get("note", ""))[:500]
    if decision == "accept":
        booking = services.accept_booking(request.user, booking_id, note)
    elif decision == "reject":
        booking = services.reject_booking(request.user, booking_id, note)
    elif decision == "cancel":
        booking, _ = services.cancel_booking(request.user, booking_id, by_provider=True, reason=note)
    else:
        return not_found()
    return Response(BookingSerializer(booking_queryset().get(pk=booking.pk)).data)


@api_view(["GET"])
@permission_classes(P)
def enquiries(request):
    props = managed_properties(request.user)
    qs = Inquiry.objects.filter(
        Q(listing__property__in=props) | Q(boarding_house__property__in=props)
    ).select_related("listing__property", "boarding_house", "user")
    return Response(InquirySerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes(P)
def enquiry_mark_read(request, inquiry_id):
    props = managed_properties(request.user)
    updated = Inquiry.objects.filter(
        Q(listing__property__in=props) | Q(boarding_house__property__in=props), id=inquiry_id
    ).update(is_read=True)
    if not updated:
        return not_found("Enquiry not found.")
    return Response({"is_read": True})


@api_view(["GET"])
@permission_classes(P)
def payouts(request):
    return Response(PayoutSerializer(ProviderPayout.objects.filter(provider=request.user), many=True).data)


# ---------------------------------------------------------------------------
# Dashboard and analytics
# ---------------------------------------------------------------------------
def _months_back(n):
    today = timezone.localdate().replace(day=1)
    months = []
    for i in range(n - 1, -1, -1):
        y, m = today.year, today.month - i
        while m <= 0:
            m += 12
            y -= 1
        months.append(today.replace(year=y, month=m))
    return months


@api_view(["GET"])
@permission_classes(P)
def dashboard(request):
    """Headline numbers and charts. Filters: ?from=YYYY-MM-DD&to=YYYY-MM-DD&property=<id>"""
    services.expire_stale_bookings()
    services.complete_finished_stays()
    user = request.user
    start = parse_date(request.query_params.get("from"))
    end = parse_date(request.query_params.get("to"))
    property_id = request.query_params.get("property") or None

    props = managed_properties(user)
    if property_id:
        props = props.filter(id=property_id)
    listings = Listing.objects.filter(property__in=props)
    houses = BoardingHouse.objects.filter(property__in=props)
    units = PropertyUnit.objects.filter(property__in=props)

    # Occupancy: boarding beds plus individual units.
    bed_totals = {"capacity": 0, "occupied": 0, "reserved": 0, "available": 0}
    for house in houses:
        _, t = services.house_occupancy(house)
        for k in bed_totals:
            bed_totals[k] += t[k]
    unit_counts = units.aggregate(
        total=Count("id"),
        occupied=Count("id", filter=Q(status=PropertyUnit.STATUS_OCCUPIED)),
        available=Count("id", filter=Q(status=PropertyUnit.STATUS_AVAILABLE)),
    )
    capacity = bed_totals["capacity"] + unit_counts["total"]
    occupied = bed_totals["occupied"] + unit_counts["occupied"]

    bookings_qs = managed_bookings(user)
    if property_id:
        bookings_qs = bookings_qs.filter(Q(listing__property_id=property_id) | Q(room__boarding_house__property_id=property_id))
    period_bookings = bookings_qs
    if start:
        period_bookings = period_bookings.filter(created_at__date__gte=start)
    if end:
        period_bookings = period_bookings.filter(created_at__date__lte=end)
    by_status = dict(period_bookings.values_list("status").annotate(n=Count("id")))
    decided = sum(by_status.get(s, 0) for s in ("awaiting_payment", "confirmed", "completed", "rejected"))
    accepted = sum(by_status.get(s, 0) for s in ("awaiting_payment", "confirmed", "completed"))
    paid = by_status.get("confirmed", 0) + by_status.get("completed", 0)

    earned = services.provider_earnings(user, start, end, property_id)
    money = earned.aggregate(gross=Sum("gross_amount"), commission=Sum("amount"), fees=Sum("processing_fee"), net=Sum("provider_net"))
    rental = earned.filter(booking__category__in=["rent", "boarding"]).aggregate(net=Sum("provider_net"))
    pending_payments = bookings_qs.filter(status=Booking.STATUS_AWAITING_PAYMENT).aggregate(
        n=Count("id"), total=Sum("total_amount")
    )
    tenancy_balance = BoardingTenancy.objects.filter(
        room__boarding_house__in=houses, status__in=BoardingTenancy.BED_HOLDING_STATUSES
    ).aggregate(rent=Sum("rent_amount"), paid=Sum("amount_paid"))

    # Monthly revenue for the last 12 months (or the filtered range).
    monthly = OrderedDict((m.strftime("%Y-%m"), {"gross": ZERO, "net": ZERO, "bookings": 0}) for m in _months_back(12))
    for row in (
        services.provider_earnings(user, property_id=property_id)
        .annotate(month=TruncMonth("booking__confirmed_at"))
        .values("month")
        .annotate(gross=Sum("gross_amount"), net=Sum("provider_net"), n=Count("id"))
    ):
        if row["month"] is None:
            continue
        key = row["month"].strftime("%Y-%m")
        if key in monthly:
            monthly[key] = {"gross": row["gross"], "net": row["net"], "bookings": row["n"]}

    by_category = {
        row["booking__category"]: row["net"]
        for row in earned.values("booking__category").annotate(net=Sum("provider_net"))
    }

    tenants = (
        BoardingTenancy.objects.filter(room__boarding_house__in=houses, status=BoardingTenancy.STATUS_ACTIVE).count()
        + unit_counts["occupied"]
    )
    activity = Notification.objects.filter(user=user).order_by("-created_at")[:8]
    return Response(
        {
            "filters": {"from": start, "to": end, "property": property_id},
            "properties": [{"id": p.id, "title": p.title} for p in managed_properties(user).order_by("title")],
            "totals": {
                "properties": props.count(),
                "active_listings": listings.filter(status=Listing.STATUS_APPROVED, is_published=True).count()
                + houses.filter(is_active=True, is_approved=True).count(),
                "pending_review": listings.filter(status=Listing.STATUS_PENDING).count()
                + houses.filter(is_approved=False).count(),
                "boarding_houses": houses.count(),
                "units_total": capacity,
                "units_occupied": occupied,
                "units_available": bed_totals["available"] + unit_counts["available"],
                "beds_reserved": bed_totals["reserved"],
                "tenants": tenants,
                "occupancy_rate": round(occupied / capacity * 100, 1) if capacity else 0.0,
                "booking_requests": bookings_qs.filter(status=Booking.STATUS_PENDING).count(),
                "unread_enquiries": Inquiry.objects.filter(
                    Q(listing__property__in=props) | Q(boarding_house__property__in=props), is_read=False
                ).count(),
            },
            "money": {
                "gross": m2(money["gross"]),
                "commission": m2(money["commission"]),
                "processing_fees": m2(money["fees"]),
                "net_revenue": m2(money["net"]),
                "rental_income": m2(rental["net"]),
                "pending_payments": {
                    "bookings": pending_payments["n"],
                    "amount": m2(pending_payments["total"]),
                    "occupant_balances": m2((tenancy_balance["rent"] or ZERO) - (tenancy_balance["paid"] or ZERO)),
                },
                "paid_out": m2(
                    ProviderPayout.objects.filter(provider=user, status=ProviderPayout.STATUS_PAID).aggregate(s=Sum("amount"))["s"] or ZERO
                ),
                "by_category": {k: m2(v) for k, v in by_category.items()},
            },
            "monthly_revenue": [{"month": k, "gross": m2(v["gross"]), "net": m2(v["net"]), "bookings": v["bookings"]} for k, v in monthly.items()],
            "booking_performance": {
                "by_status": by_status,
                "total": sum(by_status.values()),
                "acceptance_rate": round(accepted / decided * 100, 1) if decided else None,
                "payment_conversion": round(paid / accepted * 100, 1) if accepted else None,
            },
            "recent_activity": NotificationSerializer(activity, many=True).data,
        }
    )
