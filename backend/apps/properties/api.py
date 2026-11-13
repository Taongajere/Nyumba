from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from rest_framework import serializers, viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from .models import Property, Listing


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