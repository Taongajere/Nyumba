"""Sign up, sign in, sign out, password reset, profile, experience switching, provider applications."""

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .. import services
from ..models import UserProfile
from ..serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProviderApplicationSerializer,
    RegisterSerializer,
    UserProfileSerializer,
    me_payload,
)
from .common import validated


class AuthThrottle(SimpleRateThrottle):
    """Per-IP limit on sign-in, sign-up and reset, signed in or not, to slow password guessing."""

    scope = "auth"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


def session_payload(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"token": token.key, "user": me_payload(user)}


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def register(request):
    data = validated(RegisterSerializer, request.data)
    with transaction.atomic():
        user = User.objects.create_user(
            username=data["username"],
            email=data["email"],
            password=data["password"],
            first_name=data["first_name"],
            last_name=data["last_name"],
        )
        UserProfile.objects.create(user=user, phone_number=data["phone_number"], town=data["town"] or "Lusaka")
    return Response(session_payload(user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def login(request):
    data = validated(LoginSerializer, request.data)
    identifier = data["login"].strip()
    username = identifier
    if "@" in identifier:
        match = User.objects.filter(email__iexact=identifier).first()
        username = match.username if match else identifier
    user = authenticate(request, username=username, password=data["password"])
    if user is None:
        return Response({"error": "Wrong username, email or password."}, status=status.HTTP_401_UNAUTHORIZED)
    return Response(session_payload(user))


@api_view(["POST"])
def logout(request):
    Token.objects.filter(user=request.user).delete()
    return Response({"message": "Logged out."})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def password_reset_request(request):
    data = validated(PasswordResetRequestSerializer, request.data)
    user = User.objects.filter(email__iexact=data["email"], is_active=True).first()
    if user is not None:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
        send_mail(
            "Reset your Nyumba password",
            f"Hi {user.first_name or user.username},\n\nUse this link to choose a new password:\n{link}\n\n"
            "The link expires in two hours. If you didn't ask for this, ignore this email.",
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
        )
    # Same answer either way, so the form can't be used to discover accounts.
    return Response({"message": "If that email has an account, a reset link is on its way."})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def password_reset_confirm(request):
    data = validated(PasswordResetConfirmSerializer, request.data)
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(data["uid"])), is_active=True)
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        user = None
    if user is None or not default_token_generator.check_token(user, data["token"]):
        return Response(
            {"error": "This reset link is invalid or has expired. Ask for a new one."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        validate_password(data["password"], user=user)
    except DjangoValidationError as exc:
        return Response({"error": exc.messages[0], "fields": {"password": exc.messages}}, status=400)
    user.set_password(data["password"])
    user.save(update_fields=["password"])
    Token.objects.filter(user=user).delete()  # sign out everywhere
    return Response({"message": "Password changed. Log in with your new password."})


@api_view(["POST"])
def change_password(request):
    data = validated(ChangePasswordSerializer, request.data)
    if not request.user.check_password(data["current_password"]):
        return Response({"error": "Your current password is wrong."}, status=400)
    try:
        validate_password(data["new_password"], user=request.user)
    except DjangoValidationError as exc:
        return Response({"error": exc.messages[0], "fields": {"new_password": exc.messages}}, status=400)
    request.user.set_password(data["new_password"])
    request.user.save(update_fields=["password"])
    Token.objects.filter(user=request.user).delete()
    return Response(session_payload(request.user))


@api_view(["GET", "PATCH"])
def me(request):
    if request.method == "PATCH":
        user = request.user
        for field in ("first_name", "last_name"):
            if field in request.data:
                setattr(user, field, str(request.data[field])[:150])
        user.save()
        serializer = UserProfileSerializer(services.get_profile(user), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response(me_payload(request.user))


@api_view(["POST"])
def switch_mode(request):
    services.switch_mode(request.user, request.data.get("mode", ""))
    return Response(me_payload(request.user))


@api_view(["GET", "POST"])
def provider_application(request):
    if request.method == "GET":
        applications = request.user.provider_applications.order_by("-created_at")
        return Response(ProviderApplicationSerializer(applications, many=True).data)
    serializer = ProviderApplicationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    application = services.submit_provider_application(request.user, serializer.validated_data)
    return Response(ProviderApplicationSerializer(application).data, status=status.HTTP_201_CREATED)
