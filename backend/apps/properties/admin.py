from django.contrib import admin

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


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "role", "user_type", "verification_status", "phone_number"]
    list_filter = ["role", "user_type", "verification_status"]
    search_fields = ["user__username", "business_name", "institution", "student_id"]
    list_editable = ["verification_status"]


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = ["title", "owner", "neighbourhood", "owner_verified", "property_verified"]
    list_filter = ["owner_verified", "property_verified"]
    search_fields = ["title", "address", "neighbourhood", "owner__username"]


@admin.register(BoardingHouse)
class BoardingHouseAdmin(admin.ModelAdmin):
    list_display = ["name", "property", "capacity", "rent_per_bed", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name", "property__title", "property__address"]


@admin.register(BoardingTenancy)
class BoardingTenancyAdmin(admin.ModelAdmin):
    list_display = [
        "student",
        "boarding_house",
        "status",
        "payment_status",
        "rent_amount",
        "amount_paid",
        "move_in_date",
    ]
    list_filter = ["status", "payment_status"]
    search_fields = ["student__username", "boarding_house__name"]
    raw_id_fields = ["student"]


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = ["id", "property", "kind", "price", "status", "created_at"]
    list_filter = ["kind", "status"]
    search_fields = ["property__title", "property__address"]
    actions = ["approve_listings", "reject_listings"]

    @admin.action(description="Approve selected listings")
    def approve_listings(self, request, queryset):
        queryset.update(status="approved")

    @admin.action(description="Reject selected listings")
    def reject_listings(self, request, queryset):
        queryset.update(status="rejected")


@admin.register(Inquiry)
class InquiryAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "listing", "created_at"]
    search_fields = ["name", "phone", "listing__property__title"]


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ["guest_name", "listing", "check_in", "check_out", "total_amount", "status"]
    list_filter = ["status"]
    search_fields = ["guest_name", "guest_phone"]


@admin.register(Commission)
class CommissionAdmin(admin.ModelAdmin):
    list_display = ["booking", "rate", "amount", "status", "created_at"]
    list_filter = ["status"]
