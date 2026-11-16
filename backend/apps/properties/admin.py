"""Django admin (at /django-admin/) as a back-office fallback. Day-to-day moderation happens
in the Nyumba web admin dashboard, which uses the same services and rules."""

from django.contrib import admin, messages

from . import services
from .models import (
    BoardingHouse,
    BoardingRoom,
    BoardingTenancy,
    Booking,
    Commission,
    CommissionRate,
    Favourite,
    Inquiry,
    Listing,
    ListingReport,
    Notification,
    Payment,
    Property,
    PropertyImage,
    PropertyUnit,
    ProviderApplication,
    ProviderPayout,
    ProviderProfile,
    Refund,
    Review,
    UserProfile,
)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "phone_number", "town", "active_mode", "institution"]
    list_filter = ["active_mode", "town"]
    search_fields = ["user__username", "user__email", "institution", "student_id"]


@admin.register(ProviderApplication)
class ProviderApplicationAdmin(admin.ModelAdmin):
    list_display = ["business_name", "user", "provider_type", "status", "created_at", "reviewed_at"]
    list_filter = ["status", "provider_type"]
    search_fields = ["business_name", "user__username", "user__email"]
    readonly_fields = ["status", "reviewed_by", "reviewed_at", "created_at"]
    actions = ["approve"]

    @admin.action(description="Approve selected applications")
    def approve(self, request, queryset):
        for application in queryset:
            try:
                services.approve_provider_application(application, request.user)
            except services.BusinessRuleError as exc:
                self.message_user(request, f"{application}: {exc.message}", messages.WARNING)


@admin.register(ProviderProfile)
class ProviderProfileAdmin(admin.ModelAdmin):
    list_display = ["business_name", "user", "provider_type", "status", "approved_at"]
    list_filter = ["status", "provider_type"]
    search_fields = ["business_name", "user__username"]


class PropertyImageInline(admin.TabularInline):
    model = PropertyImage
    extra = 0


class PropertyUnitInline(admin.TabularInline):
    model = PropertyUnit
    extra = 0


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = ["title", "owner", "property_type", "neighbourhood", "town", "owner_verified", "property_verified"]
    list_filter = ["property_type", "town", "owner_verified", "property_verified"]
    search_fields = ["title", "address", "neighbourhood", "owner__username"]
    filter_horizontal = ["managers"]
    inlines = [PropertyImageInline, PropertyUnitInline]


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = ["id", "property", "kind", "price", "status", "is_published", "booking_mode", "created_at"]
    list_filter = ["kind", "status", "is_published", "booking_mode"]
    search_fields = ["property__title", "property__address"]
    actions = ["approve_listings", "reject_listings"]

    @admin.action(description="Approve selected listings")
    def approve_listings(self, request, queryset):
        queryset.update(status=Listing.STATUS_APPROVED)

    @admin.action(description="Reject selected listings")
    def reject_listings(self, request, queryset):
        queryset.update(status=Listing.STATUS_REJECTED)


class BoardingRoomInline(admin.TabularInline):
    model = BoardingRoom
    extra = 0


@admin.register(BoardingHouse)
class BoardingHouseAdmin(admin.ModelAdmin):
    list_display = ["name", "property", "gender_policy", "booking_mode", "is_active", "is_approved"]
    list_filter = ["is_active", "is_approved", "gender_policy"]
    search_fields = ["name", "property__title", "property__address"]
    inlines = [BoardingRoomInline]


@admin.register(BoardingTenancy)
class BoardingTenancyAdmin(admin.ModelAdmin):
    list_display = ["occupant_name", "room", "status", "payment_status", "rent_amount", "amount_paid", "check_in_date"]
    list_filter = ["status", "payment_status"]
    search_fields = ["occupant_name", "student__username", "room__boarding_house__name"]
    raw_id_fields = ["student", "booking"]


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ["reference", "guest_name", "category", "check_in", "check_out", "total_amount", "status"]
    list_filter = ["status", "category", "booking_mode"]
    search_fields = ["reference", "guest_name", "guest_phone", "user__username"]
    raw_id_fields = ["user", "listing", "room"]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["tx_ref", "user", "amount", "currency", "gateway", "status", "verified_at"]
    list_filter = ["status", "gateway"]
    search_fields = ["tx_ref", "gateway_transaction_id", "user__username"]
    # Payments change only through server-side verification.
    readonly_fields = [f.name for f in Payment._meta.fields]


admin.site.register(Inquiry)
admin.site.register(Commission)
admin.site.register(CommissionRate)
admin.site.register(Refund)
admin.site.register(ProviderPayout)
admin.site.register(Favourite)
admin.site.register(Notification)
admin.site.register(Review)
admin.site.register(ListingReport)
