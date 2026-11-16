from decimal import Decimal

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, F, Q
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import (
    BoardingHouse,
    BoardingTenancy,
    Booking,
    Commission,
    Inquiry,
    Listing,
    Property,
    UserProfile,
)
from .permissions import IsProvider, IsStudent, get_profile

COMMISSION_RATE = Decimal("0.10")  # 10% Nyumba commission
PROFILE_FIELDS = [
    "phone_number",
    "business_name",
    "institution",
    "student_id",
    "emergency_contact_name",
    "emergency_contact_phone",
]
OPEN_STATUSES = BoardingTenancy.OPEN_STATUSES


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------
def error_response(message, http_status=status.HTTP_400_BAD_REQUEST, fields=None):
    body = {"error": message}
    if fields:
        body["fields"] = fields
    return Response(body, status=http_status)


def validation_error_response(errors):
    """Flatten DRF's nested errors into one readable message, keeping the detail."""
    first = errors
    while isinstance(first, dict) and first:
        first = next(iter(first.values()))
    if isinstance(first, list) and first:
        first = first[0]
    message = str(first) if first else "Please check the form and try again."
    return error_response(message, fields=errors)


def validate_or_error(serializer):
    if serializer.is_valid():
        return None
    return validation_error_response(serializer.errors)


def occupied_count(house):
    return house.tenancies.filter(status=BoardingTenancy.STATUS_ACTIVE).count()


def auth_payload(user):
    profile = get_profile(user)
    token, _ = Token.objects.get_or_create(user=user)
    return {
        "token": token.key,
        "username": user.username,
        "role": profile.role,
        "user_type": profile.user_type,
        "profile": UserProfileSerializer(profile).data,
    }


# ---------------------------------------------------------------------------
# Listings (public catalogue)
# ---------------------------------------------------------------------------
class PropertySerializer(serializers.ModelSerializer):
    class Meta:
        model = Property
        fields = [
            "id",
            "title",
            "bedrooms",
            "address",
            "neighbourhood",
            "latitude",
            "longitude",
            "owner_verified",
            "property_verified",
        ]


class ListingSerializer(serializers.ModelSerializer):
    property = PropertySerializer(read_only=True)

    class Meta:
        model = Listing
        fields = ["id", "kind", "price", "status", "property"]


class ListingViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Listing.objects.filter(status="approved").select_related("property")
    serializer_class = ListingSerializer


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------
class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            "role",
            "user_type",
            "phone_number",
            "business_name",
            "verification_status",
            "institution",
            "student_id",
            "emergency_contact_name",
            "emergency_contact_phone",
        ]
        read_only_fields = ["role", "user_type", "verification_status"]


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    role = serializers.ChoiceField(choices=UserProfile.ROLE_CHOICES, default=UserProfile.ROLE_USER)
    user_type = serializers.ChoiceField(
        choices=UserProfile.USER_TYPE_CHOICES, required=False, allow_blank=True
    )
    phone_number = serializers.CharField(max_length=30, required=False, allow_blank=True)
    business_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    institution = serializers.CharField(max_length=150, required=False, allow_blank=True)
    student_id = serializers.CharField(max_length=50, required=False, allow_blank=True)
    emergency_contact_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(max_length=30, required=False, allow_blank=True)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("That username is already taken.")
        return value

    def validate(self, attrs):
        try:
            validate_password(attrs["password"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})

        if attrs["role"] == UserProfile.ROLE_PROVIDER:
            attrs["user_type"] = ""
        else:
            attrs["user_type"] = attrs.get("user_type") or UserProfile.TYPE_GENERAL
            if attrs["user_type"] == UserProfile.TYPE_STUDENT:
                missing = {
                    field: "This field is required for student accounts."
                    for field in ("institution", "student_id")
                    if not attrs.get(field)
                }
                if missing:
                    raise serializers.ValidationError(missing)
        return attrs

    def create(self, validated_data):
        is_provider = validated_data["role"] == UserProfile.ROLE_PROVIDER
        with transaction.atomic():
            user = User.objects.create_user(
                username=validated_data["username"],
                password=validated_data["password"],
            )
            UserProfile.objects.create(
                user=user,
                role=validated_data["role"],
                user_type=validated_data["user_type"],
                verification_status=(
                    UserProfile.VERIFY_PENDING if is_provider else UserProfile.VERIFY_UNVERIFIED
                ),
                **{field: validated_data.get(field, "") for field in PROFILE_FIELDS},
            )
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)


@api_view(["POST"])
@permission_classes([AllowAny])
def register_user(request):
    serializer = RegisterSerializer(data=request.data)
    if (error := validate_or_error(serializer)) is not None:
        return error
    user = serializer.save()
    return Response(auth_payload(user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_user(request):
    serializer = LoginSerializer(data=request.data)
    if (error := validate_or_error(serializer)) is not None:
        return error
    user = authenticate(
        username=serializer.validated_data["username"],
        password=serializer.validated_data["password"],
    )
    if user is None:
        return error_response(
            "Invalid username or password.", status.HTTP_401_UNAUTHORIZED
        )
    return Response(auth_payload(user))


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def my_profile(request):
    profile = get_profile(request.user)
    if request.method == "PATCH":
        serializer = UserProfileSerializer(profile, data=request.data, partial=True)
        if (error := validate_or_error(serializer)) is not None:
            return error
        serializer.save()
    return Response(
        {
            "username": request.user.username,
            "role": profile.role,
            "user_type": profile.user_type,
            "profile": UserProfileSerializer(profile).data,
        }
    )


# ---------------------------------------------------------------------------
# Provider: listings, enquiries, bookings, dashboard
# ---------------------------------------------------------------------------
class CreateListingSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120)
    address = serializers.CharField(max_length=200)
    neighbourhood = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    latitude = serializers.FloatField(required=False, allow_null=True, default=None)
    longitude = serializers.FloatField(required=False, allow_null=True, default=None)
    bedrooms = serializers.IntegerField(min_value=1, required=False, default=1)
    kind = serializers.ChoiceField(choices=Listing.KINDS, required=False, default="rent")
    price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))


@api_view(["POST"])
@permission_classes([IsProvider])
def create_listing(request):
    serializer = CreateListingSerializer(data=request.data)
    if (error := validate_or_error(serializer)) is not None:
        return error
    data = serializer.validated_data

    with transaction.atomic():
        prop = Property.objects.create(
            owner=request.user,
            title=data["title"],
            address=data["address"],
            neighbourhood=data["neighbourhood"],
            latitude=data["latitude"],
            longitude=data["longitude"],
            bedrooms=data["bedrooms"],
        )
        listing = Listing.objects.create(
            property=prop,
            kind=data["kind"],
            price=data["price"],
            status="pending",
        )

    return Response(
        {
            "message": "Listing submitted! Waiting for admin approval.",
            "listing_id": listing.id,
            "property_id": prop.id,
        },
        status=status.HTTP_201_CREATED,
    )


class InquirySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=30)
    message = serializers.CharField(required=False, allow_blank=True, default="")


@api_view(["POST"])
@permission_classes([AllowAny])
def create_inquiry(request, listing_id):
    listing = Listing.objects.filter(id=listing_id, status="approved").first()
    if listing is None:
        return error_response("Listing not found.", status.HTTP_404_NOT_FOUND)

    serializer = InquirySerializer(data=request.data)
    if (error := validate_or_error(serializer)) is not None:
        return error
    data = serializer.validated_data

    Inquiry.objects.create(
        listing=listing,
        name=data["name"],
        phone=data["phone"],
        message=data["message"],
    )
    return Response(
        {"message": "Enquiry sent! The owner will contact you shortly."},
        status=status.HTTP_201_CREATED,
    )


class BookingRequestSerializer(serializers.Serializer):
    guest_name = serializers.CharField(max_length=100)
    guest_phone = serializers.CharField(max_length=30)
    check_in = serializers.DateField()
    check_out = serializers.DateField()

    def validate(self, attrs):
        nights = (attrs["check_out"] - attrs["check_in"]).days
        if nights < 1:
            raise serializers.ValidationError(
                "Check-out date must be at least 1 night after check-in."
            )
        attrs["nights"] = nights
        return attrs


@api_view(["POST"])
@permission_classes([AllowAny])
def create_booking(request, listing_id):
    serializer = BookingRequestSerializer(data=request.data)
    if (error := validate_or_error(serializer)) is not None:
        return error
    data = serializer.validated_data
    nights = data["nights"]
    check_in, check_out = data["check_in"], data["check_out"]

    with transaction.atomic():
        # Lock the listing row so two requests cannot pass the clash check at once.
        listing = (
            Listing.objects.select_for_update()
            .filter(id=listing_id, status="approved", kind="stay")
            .first()
        )
        if listing is None:
            return error_response("Short-stay listing not found.", status.HTTP_404_NOT_FOUND)

        clash = (
            Booking.objects.filter(listing=listing, check_in__lt=check_out, check_out__gt=check_in)
            .exclude(status="cancelled")
            .exists()
        )
        if clash:
            return error_response(
                "Those dates are already taken. Please pick different dates."
            )

        total_amount = (listing.price * Decimal(nights)).quantize(Decimal("0.01"))
        commission_amount = (total_amount * COMMISSION_RATE).quantize(Decimal("0.01"))

        booking = Booking.objects.create(
            listing=listing,
            guest_name=data["guest_name"],
            guest_phone=data["guest_phone"],
            check_in=check_in,
            check_out=check_out,
            total_amount=total_amount,
            status="requested",
        )
        Commission.objects.create(
            booking=booking,
            rate=COMMISSION_RATE,
            amount=commission_amount,
            status="pending",
        )

    return Response(
        {
            "message": f"Booking requested for {nights} night(s)! Total: K{total_amount:,.2f}",
            "nights": nights,
            "total_amount": str(total_amount),
            "commission_amount": str(commission_amount),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsProvider])
def owner_dashboard(request):
    listings = (
        Listing.objects.filter(property__owner=request.user)
        .select_related("property")
        .order_by("-id")
    )

    inquiries = (
        Inquiry.objects.filter(listing__property__owner=request.user)
        .select_related("listing__property")
        .order_by("-created_at")
    )
    inquiries_data = [
        {
            "id": inq.id,
            "property_title": inq.listing.property.title,
            "name": inq.name,
            "phone": inq.phone,
            "message": inq.message,
            "created_at": inq.created_at.strftime("%Y-%m-%d %H:%M"),
        }
        for inq in inquiries
    ]

    bookings = (
        Booking.objects.filter(listing__property__owner=request.user)
        .select_related("listing__property", "commission")
        .order_by("-created_at")
    )
    bookings_data = []
    total_gross = Decimal("0.00")
    total_commission = Decimal("0.00")
    for bk in bookings:
        comm_amount = bk.commission.amount if hasattr(bk, "commission") else Decimal("0.00")
        if bk.status != "cancelled":
            total_gross += bk.total_amount
            total_commission += comm_amount
        bookings_data.append(
            {
                "id": bk.id,
                "property_title": bk.listing.property.title,
                "guest_name": bk.guest_name,
                "guest_phone": bk.guest_phone,
                "check_in": str(bk.check_in),
                "check_out": str(bk.check_out),
                "total_amount": str(bk.total_amount),
                "commission_amount": str(comm_amount),
                "status": bk.status,
            }
        )

    return Response(
        {
            "listings": ListingSerializer(listings, many=True).data,
            "inquiries": inquiries_data,
            "bookings": bookings_data,
            "earnings": {
                "gross": str(total_gross),
                "commission": str(total_commission),
                "net": str(total_gross - total_commission),
            },
        }
    )


@api_view(["POST"])
@permission_classes([IsProvider])
def update_booking_status(request, booking_id):
    booking = Booking.objects.filter(
        id=booking_id, listing__property__owner=request.user
    ).first()
    if booking is None:
        return error_response("Booking not found.", status.HTTP_404_NOT_FOUND)

    new_status = request.data.get("status")
    if new_status not in ("confirmed", "cancelled"):
        return error_response("Invalid status.")
    if booking.status == "cancelled":
        return error_response("This booking is already cancelled.")

    with transaction.atomic():
        booking.status = new_status
        booking.save(update_fields=["status"])
        if new_status == "cancelled":
            Commission.objects.filter(booking=booking).update(status="refunded")

    return Response({"message": f"Booking marked as {new_status}."})


# ---------------------------------------------------------------------------
# Provider: properties and boarding houses
# ---------------------------------------------------------------------------
class BoardingHouseSerializer(serializers.ModelSerializer):
    property_id = serializers.IntegerField(source="property.id", read_only=True)
    property_title = serializers.CharField(source="property.title", read_only=True)
    address = serializers.CharField(source="property.address", read_only=True)
    neighbourhood = serializers.CharField(source="property.neighbourhood", read_only=True)
    occupied = serializers.SerializerMethodField()
    spaces_available = serializers.SerializerMethodField()

    class Meta:
        model = BoardingHouse
        fields = [
            "id",
            "property_id",
            "property_title",
            "address",
            "neighbourhood",
            "name",
            "capacity",
            "rent_per_bed",
            "is_active",
            "occupied",
            "spaces_available",
        ]

    def _occupied(self, obj):
        annotated = getattr(obj, "occupied_count", None)
        return annotated if annotated is not None else occupied_count(obj)

    def get_occupied(self, obj):
        return self._occupied(obj)

    def get_spaces_available(self, obj):
        return max(obj.capacity - self._occupied(obj), 0)


class BoardingHouseCreateSerializer(serializers.Serializer):
    property_id = serializers.IntegerField()
    name = serializers.CharField(max_length=120)
    capacity = serializers.IntegerField(min_value=1)
    rent_per_bed = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False, default=Decimal("0.00")
    )

    def validate_property_id(self, value):
        owner = self.context["request"].user
        prop = Property.objects.filter(id=value, owner=owner).first()
        if prop is None:
            raise serializers.ValidationError("Property not found in your account.")
        if BoardingHouse.objects.filter(property=prop).exists():
            raise serializers.ValidationError("This property is already a boarding house.")
        return prop


class BoardingHouseUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardingHouse
        fields = ["name", "capacity", "rent_per_bed", "is_active"]

    def validate_capacity(self, value):
        if self.instance and value < occupied_count(self.instance):
            raise serializers.ValidationError(
                f"Capacity cannot be below the {occupied_count(self.instance)} tenant(s) currently living here."
            )
        return value


class TenancySerializer(serializers.ModelSerializer):
    """What a seeker sees about their own placement."""

    boarding_house_id = serializers.IntegerField(source="boarding_house.id", read_only=True)
    boarding_house_name = serializers.CharField(source="boarding_house.name", read_only=True)
    address = serializers.CharField(source="boarding_house.property.address", read_only=True)
    balance = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = BoardingTenancy
        fields = [
            "id",
            "boarding_house_id",
            "boarding_house_name",
            "address",
            "status",
            "term",
            "move_in_date",
            "move_out_date",
            "lease_end",
            "rent_amount",
            "amount_paid",
            "balance",
            "payment_status",
            "created_at",
        ]


class ProviderTenancySerializer(TenancySerializer):
    """What a provider sees: the tenant's details as well as the placement."""

    student_username = serializers.CharField(source="student.username", read_only=True)
    student_phone = serializers.SerializerMethodField()
    institution = serializers.SerializerMethodField()
    student_id = serializers.SerializerMethodField()
    emergency_contact_name = serializers.SerializerMethodField()
    emergency_contact_phone = serializers.SerializerMethodField()

    class Meta(TenancySerializer.Meta):
        fields = TenancySerializer.Meta.fields + [
            "student_username",
            "student_phone",
            "institution",
            "student_id",
            "emergency_contact_name",
            "emergency_contact_phone",
        ]

    def _profile(self, obj):
        return getattr(obj.student, "profile", None)

    def get_student_phone(self, obj):
        profile = self._profile(obj)
        return profile.phone_number if profile else ""

    def get_institution(self, obj):
        profile = self._profile(obj)
        return profile.institution if profile else ""

    def get_student_id(self, obj):
        profile = self._profile(obj)
        return profile.student_id if profile else ""

    def get_emergency_contact_name(self, obj):
        profile = self._profile(obj)
        return profile.emergency_contact_name if profile else ""

    def get_emergency_contact_phone(self, obj):
        profile = self._profile(obj)
        return profile.emergency_contact_phone if profile else ""


class TenancyUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardingTenancy
        fields = ["term", "lease_end", "rent_amount", "amount_paid", "payment_status"]

    def validate_rent_amount(self, value):
        if value < 0:
            raise serializers.ValidationError("Rent cannot be negative.")
        return value

    def validate_amount_paid(self, value):
        if value < 0:
            raise serializers.ValidationError("Amount paid cannot be negative.")
        return value


class PlacementDetailsSerializer(serializers.Serializer):
    term = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    move_in_date = serializers.DateField(required=False, allow_null=True, default=None)
    lease_end = serializers.DateField(required=False, allow_null=True, default=None)


class AssignStudentSerializer(PlacementDetailsSerializer):
    username = serializers.CharField(max_length=150)
    rent_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True, default=None
    )


def _owned_house(user, house_id):
    return BoardingHouse.objects.select_related("property").filter(
        id=house_id, property__owner=user
    ).first()


def _owned_tenancy(user, tenancy_id):
    return (
        BoardingTenancy.objects.select_related("boarding_house__property", "student__profile")
        .filter(id=tenancy_id, boarding_house__property__owner=user)
        .first()
    )


def _place_student(house, student, *, status_value, details, rent_amount):
    """Create a tenancy only if a bed space is free. Returns (tenancy, error_message)."""
    error = None
    tenancy = None
    try:
        with transaction.atomic():
            # Lock the house row so concurrent approvals cannot overfill it.
            locked = BoardingHouse.objects.select_for_update().get(pk=house.pk)
            if occupied_count(locked) >= locked.capacity:
                error = "This boarding house has no open bed spaces."
            else:
                tenancy = BoardingTenancy.objects.create(
                    boarding_house=locked,
                    student=student,
                    status=status_value,
                    term=details["term"],
                    move_in_date=details["move_in_date"],
                    lease_end=details["lease_end"],
                    rent_amount=rent_amount,
                )
    except IntegrityError:
        error = "This student already has a requested or active boarding place."
    return tenancy, error


@api_view(["GET", "POST"])
@permission_classes([IsProvider])
def provider_boarding_houses(request):
    if request.method == "GET":
        houses = (
            BoardingHouse.objects.filter(property__owner=request.user)
            .select_related("property")
            .annotate(occupied_count=Count("tenancies", filter=Q(tenancies__status="active")))
            .order_by("name")
        )
        return Response(BoardingHouseSerializer(houses, many=True).data)

    serializer = BoardingHouseCreateSerializer(data=request.data, context={"request": request})
    if (error := validate_or_error(serializer)) is not None:
        return error
    data = serializer.validated_data
    house = BoardingHouse.objects.create(
        property=data["property_id"],
        name=data["name"],
        capacity=data["capacity"],
        rent_per_bed=data["rent_per_bed"],
    )
    return Response(BoardingHouseSerializer(house).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsProvider])
def provider_boarding_house_detail(request, house_id):
    house = _owned_house(request.user, house_id)
    if house is None:
        return error_response("Boarding house not found.", status.HTTP_404_NOT_FOUND)

    if request.method == "PATCH":
        serializer = BoardingHouseUpdateSerializer(house, data=request.data, partial=True)
        if (error := validate_or_error(serializer)) is not None:
            return error
        serializer.save()

    return Response(BoardingHouseSerializer(house).data)


@api_view(["GET", "POST"])
@permission_classes([IsProvider])
def provider_house_tenants(request, house_id):
    house = _owned_house(request.user, house_id)
    if house is None:
        return error_response("Boarding house not found.", status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        tenancies = BoardingTenancy.objects.filter(boarding_house=house).select_related(
            "boarding_house__property", "student__profile"
        )
        status_filter = request.query_params.get("status")
        if status_filter:
            tenancies = tenancies.filter(status=status_filter)
        occupied = occupied_count(house)
        return Response(
            {
                "boarding_house": BoardingHouseSerializer(house).data,
                "summary": {
                    "capacity": house.capacity,
                    "occupied": occupied,
                    "available": max(house.capacity - occupied, 0),
                },
                "tenancies": ProviderTenancySerializer(tenancies, many=True).data,
            }
        )

    serializer = AssignStudentSerializer(data=request.data)
    if (error := validate_or_error(serializer)) is not None:
        return error
    data = serializer.validated_data

    student = User.objects.filter(username=data["username"]).first()
    if student is None:
        return error_response("No account with that username.", status.HTTP_404_NOT_FOUND)
    if not get_profile(student).is_student:
        return error_response("That account is not a student account.")

    rent = data["rent_amount"] if data["rent_amount"] is not None else house.rent_per_bed
    tenancy, error_message = _place_student(
        house,
        student,
        status_value=BoardingTenancy.STATUS_ACTIVE,
        details=data,
        rent_amount=rent,
    )
    if error_message:
        return error_response(error_message)
    return Response(ProviderTenancySerializer(tenancy).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsProvider])
def provider_tenancy_update(request, tenancy_id):
    tenancy = _owned_tenancy(request.user, tenancy_id)
    if tenancy is None:
        return error_response("Tenancy not found.", status.HTTP_404_NOT_FOUND)

    serializer = TenancyUpdateSerializer(tenancy, data=request.data, partial=True)
    if (error := validate_or_error(serializer)) is not None:
        return error
    serializer.save()
    return Response(ProviderTenancySerializer(tenancy).data)


def _transition_tenancy(request, tenancy_id, *, allowed_from, to_status, message):
    """Shared handler for approve / reject / check-out, guarded by the current status."""
    tenancy = _owned_tenancy(request.user, tenancy_id)
    if tenancy is None:
        return error_response("Tenancy not found.", status.HTTP_404_NOT_FOUND)
    if tenancy.status != allowed_from:
        return error_response(f"This placement is {tenancy.get_status_display().lower()}.")

    if to_status == BoardingTenancy.STATUS_ACTIVE:
        # Approval takes a bed space, so re-check capacity under a row lock.
        with transaction.atomic():
            house = BoardingHouse.objects.select_for_update().get(pk=tenancy.boarding_house_id)
            if occupied_count(house) >= house.capacity:
                return error_response("No free bed spaces. Check out a tenant or raise capacity.")
            tenancy.status = to_status
            tenancy.move_in_date = tenancy.move_in_date or timezone.localdate()
            tenancy.save(update_fields=["status", "move_in_date", "updated_at"])
    else:
        tenancy.status = to_status
        if to_status == BoardingTenancy.STATUS_CHECKED_OUT:
            tenancy.move_out_date = timezone.localdate()
        tenancy.save(update_fields=["status", "move_out_date", "updated_at"])

    return Response({"message": message, "tenancy": ProviderTenancySerializer(tenancy).data})


@api_view(["POST"])
@permission_classes([IsProvider])
def approve_tenancy(request, tenancy_id):
    return _transition_tenancy(
        request, tenancy_id,
        allowed_from=BoardingTenancy.STATUS_REQUESTED,
        to_status=BoardingTenancy.STATUS_ACTIVE,
        message="Placement approved.",
    )


@api_view(["POST"])
@permission_classes([IsProvider])
def reject_tenancy(request, tenancy_id):
    return _transition_tenancy(
        request, tenancy_id,
        allowed_from=BoardingTenancy.STATUS_REQUESTED,
        to_status=BoardingTenancy.STATUS_REJECTED,
        message="Request rejected.",
    )


@api_view(["POST"])
@permission_classes([IsProvider])
def checkout_tenancy(request, tenancy_id):
    return _transition_tenancy(
        request, tenancy_id,
        allowed_from=BoardingTenancy.STATUS_ACTIVE,
        to_status=BoardingTenancy.STATUS_CHECKED_OUT,
        message="Tenant checked out.",
    )


@api_view(["GET"])
@permission_classes([IsProvider])
def provider_properties(request):
    properties = (
        Property.objects.filter(owner=request.user)
        .annotate(boarding_count=Count("boarding_house"))
        .order_by("-id")
    )
    return Response(
        [
            {
                "id": p.id,
                "title": p.title,
                "address": p.address,
                "neighbourhood": p.neighbourhood,
                "is_boarding_house": p.boarding_count > 0,
            }
            for p in properties
        ]
    )


# ---------------------------------------------------------------------------
# Student: browse, apply, placement
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsStudent])
def browse_boarding_houses(request):
    houses = (
        BoardingHouse.objects.filter(is_active=True)
        .select_related("property")
        .annotate(occupied_count=Count("tenancies", filter=Q(tenancies__status="active")))
        .filter(occupied_count__lt=F("capacity"))
        .order_by("name")
    )
    neighbourhood = request.query_params.get("neighbourhood")
    if neighbourhood:
        houses = houses.filter(property__neighbourhood__icontains=neighbourhood)
    return Response(BoardingHouseSerializer(houses, many=True).data)


@api_view(["POST"])
@permission_classes([IsStudent])
def apply_boarding_house(request, house_id):
    house = BoardingHouse.objects.filter(id=house_id, is_active=True).first()
    if house is None:
        return error_response("Boarding house not found.", status.HTTP_404_NOT_FOUND)

    if BoardingTenancy.objects.filter(student=request.user, status__in=OPEN_STATUSES).exists():
        return error_response("You already have a requested or active boarding place.")

    serializer = PlacementDetailsSerializer(data=request.data)
    if (error := validate_or_error(serializer)) is not None:
        return error

    tenancy, error_message = _place_student(
        house,
        request.user,
        status_value=BoardingTenancy.STATUS_REQUESTED,
        details=serializer.validated_data,
        rent_amount=house.rent_per_bed,
    )
    if error_message:
        return error_response(error_message)
    return Response(
        {"message": "Request sent to the boarding house provider.", "tenancy": TenancySerializer(tenancy).data},
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsStudent])
def my_placement(request):
    tenancies = BoardingTenancy.objects.filter(student=request.user).select_related(
        "boarding_house__property"
    )
    active = tenancies.filter(status=BoardingTenancy.STATUS_ACTIVE).first()
    requests_qs = tenancies.filter(status=BoardingTenancy.STATUS_REQUESTED)
    history = tenancies.exclude(status__in=OPEN_STATUSES)[:20]
    return Response(
        {
            "active": TenancySerializer(active).data if active else None,
            "requests": TenancySerializer(requests_qs, many=True).data,
            "history": TenancySerializer(history, many=True).data,
        }
    )


@api_view(["POST"])
@permission_classes([IsStudent])
def cancel_tenancy(request, tenancy_id):
    tenancy = BoardingTenancy.objects.filter(id=tenancy_id, student=request.user).first()
    if tenancy is None:
        return error_response("Placement not found.", status.HTTP_404_NOT_FOUND)
    if tenancy.status != BoardingTenancy.STATUS_REQUESTED:
        return error_response(
            "Only a pending request can be cancelled. Ask your provider to check you out of an active placement."
        )
    tenancy.status = BoardingTenancy.STATUS_CANCELLED
    tenancy.save(update_fields=["status", "updated_at"])
    return Response({"message": "Request cancelled."})
