from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from rest_framework import serializers, viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from .models import Property, Listing, Inquiry, Booking, Commission
from datetime import date
from decimal import Decimal 



# --- Existing Serializers ---
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
            'longitude',
        ]


class ListingSerializer(serializers.ModelSerializer):
    property = PropertySerializer(read_only=True)

    class Meta:
        model = Listing
        fields = ["id", "kind", "price", "status", "property"]


class ListingViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Listing.objects.filter(status="approved")
    serializer_class = ListingSerializer


# --- NEW: 1. Register a New Account ---
@api_view(["POST"])
@permission_classes([AllowAny])
def register_user(request):
    username = request.data.get("username", "").strip()
    password = request.data.get("password", "").strip()

    if not username or not password:
        return Response(
            {"error": "Please provide both a username and a password."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {"error": "That username is already taken."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(username=username, password=password)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "username": user.username})


# --- NEW: 2. Log In ---
@api_view(["POST"])
@permission_classes([AllowAny])
def login_user(request):
    username = request.data.get("username", "").strip()
    password = request.data.get("password", "").strip()

    user = authenticate(username=username, password=password)
    if not user:
        return Response(
            {"error": "Invalid username or password."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "username": user.username})


# --- NEW: 3. Post a New Property & Listing (Requires Wristband!) ---
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_listing(request):
    title = request.data.get("title", "").strip()
    address = request.data.get("address", "").strip()
    neighbourhood = request.data.get("neighbourhood", "").strip()
    latitude = request.data.get("latitude")
    longitude = request.data.get("longitude")
    bedrooms = request.data.get("bedrooms", 1)
    kind = request.data.get("kind", "rent")
    price = request.data.get("price")

    if not title or not address or not price:
        return Response(
            {"error": "Please fill in title, address, and price."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    prop = Property.objects.create(
        owner=request.user,
        title=title,
        address=address,
        neighbourhood=neighbourhood,
        latitude=float(latitude) if latitude else None,
        longitude=float(longitude) if longitude else None,
        bedrooms=int(bedrooms),
    )

    listing = Listing.objects.create(
        property=prop,
        kind=kind,
        price=price,
        status="pending",
    )

    return Response(
        {
            "message": "Listing submitted! Waiting for admin approval.",
            "listing_id": listing.id,
        },
        status=status.HTTP_201_CREATED,
    )

# --- NEW: 4. Submit a Viewing Enquiry (Rentals & Sales) ---
@api_view(["POST"])
@permission_classes([AllowAny])
def create_inquiry(request, listing_id):
    try:
        listing = Listing.objects.get(id=listing_id, status="approved")
    except Listing.DoesNotExist:
        return Response({"error": "Listing not found."}, status=status.HTTP_404_NOT_FOUND)

    name = request.data.get("name", "").strip()
    phone = request.data.get("phone", "").strip()
    message = request.data.get("message", "").strip()

    if not name or not phone:
        return Response(
            {"error": "Please enter your name and phone number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    Inquiry.objects.create(
        listing=listing,
        name=name,
        phone=phone,
        message=message,
    )

    return Response(
        {"message": "Enquiry sent! The owner will contact you shortly."},
        status=status.HTTP_201_CREATED,
    )


# --- NEW: 5. Request a Short-Stay Booking + Record Commission ---
@api_view(["POST"])
@permission_classes([AllowAny])
def create_booking(request, listing_id):
    try:
        listing = Listing.objects.get(id=listing_id, status="approved", kind="stay")
    except Listing.DoesNotExist:
        return Response(
            {"error": "Short-stay listing not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    guest_name = request.data.get("guest_name", "").strip()
    guest_phone = request.data.get("guest_phone", "").strip()
    check_in_str = request.data.get("check_in", "")
    check_out_str = request.data.get("check_out", "")

    if not guest_name or not guest_phone or not check_in_str or not check_out_str:
        return Response(
            {"error": "Please fill in your name, phone, check-in, and check-out dates."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        check_in = date.fromisoformat(check_in_str)
        check_out = date.fromisoformat(check_out_str)
    except ValueError:
        return Response(
            {"error": "Invalid date format."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    nights = (check_out - check_in).days
    if nights < 1:
        return Response(
            {"error": "Check-out date must be at least 1 night after check-in."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Rule: Stop double bookings!
    clash = Booking.objects.filter(
        listing=listing,
        check_in__lt=check_out,
        check_out__gt=check_in,
    ).exclude(status="cancelled").exists()

    if clash:
        return Response(
            {"error": "Those dates are already taken. Please pick different dates."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Rule: Calculate exact money math on the server using Decimal
    total_amount = (listing.price * Decimal(nights)).quantize(Decimal("0.01"))
    commission_rate = Decimal("0.10")  # 10% Nyumba commission
    commission_amount = (total_amount * commission_rate).quantize(Decimal("0.01"))

    booking = Booking.objects.create(
        listing=listing,
        guest_name=guest_name,
        guest_phone=guest_phone,
        check_in=check_in,
        check_out=check_out,
        total_amount=total_amount,
        status="requested",
    )

    Commission.objects.create(
        booking=booking,
        rate=commission_rate,
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