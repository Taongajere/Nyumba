from rest_framework.permissions import BasePermission

from .services import is_active_provider


class IsApprovedProvider(BasePermission):
    """Approved and not suspended. Pending, rejected and suspended providers are refused."""

    message = "Provider tools need an approved, active provider account."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and is_active_provider(user))


class IsPlatformAdmin(BasePermission):
    message = "Only Nyumba administrators can do this."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_staff)
