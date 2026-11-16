from rest_framework.permissions import BasePermission

from .models import UserProfile


def get_profile(user):
    """Return the user's profile, creating a default seeker profile if none exists."""
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"role": UserProfile.ROLE_USER, "user_type": UserProfile.TYPE_GENERAL},
    )
    return profile


class IsProvider(BasePermission):
    message = "Only provider accounts can do this."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and get_profile(user).is_provider)


class IsStudent(BasePermission):
    message = "Only student accounts can do this."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and get_profile(user).is_student)
