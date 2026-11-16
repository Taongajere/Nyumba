"""Business rules for Nyumba. Views call these; nothing here trusts the client.

Every rule that decides money, availability or permissions lives in this module so
web and mobile clients get identical behaviour.
"""

import calendar
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from .models import (
    BOOKING_INSTANT,
    ZERO,
    BoardingHouse,
    BoardingRoom,
    BoardingTenancy,
    Booking,
    Commission,
    CommissionRate,
    Listing,
    Notification,
    Payment,
    ProviderApplication,
    ProviderProfile,
    Refund,
    UserProfile,
)

CENT = Decimal("0.01")


class BusinessRuleError(Exception):
    """A request that breaks a business rule. The message is shown to the user."""

    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def money(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Accounts and provider approval
# ---------------------------------------------------------------------------
def get_profile(user):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def is_active_provider(user):
    profile = getattr(user, "provider_profile", None)
    return bool(profile and profile.status == ProviderProfile.STATUS_APPROVED)


def notify(user, kind, title, body="", link=""):
    if user is None:
        return None
    return Notification.objects.create(user=user, kind=kind, title=title, body=body, link=link)


def notify_admins(kind, title, body="", link=""):
    from django.contrib.auth.models import User

    for admin in User.objects.filter(is_staff=True, is_active=True):
        notify(admin, kind, title, body, link)


def submit_provider_application(user, data):
    if is_active_provider(user):
        raise BusinessRuleError("Your provider account is already approved.")
    profile = getattr(user, "provider_profile", None)
    if profile and profile.status == ProviderProfile.STATUS_SUSPENDED:
        raise BusinessRuleError(
            "Your provider account is suspended. Contact Nyumba support to be reinstated."
        )
    latest = user.provider_applications.order_by("-created_at").first()
    if latest and latest.status == ProviderApplication.STATUS_PENDING:
        raise BusinessRuleError("You already have an application waiting for review.")
    if latest and latest.status == ProviderApplication.STATUS_REJECTED and not latest.can_reapply:
        raise BusinessRuleError("This account cannot reapply. Contact Nyumba support for help.")
    try:
        application = ProviderApplication.objects.create(user=user, **data)
    except IntegrityError:
        raise BusinessRuleError("You already have an application waiting for review.")
    notify_admins(
        "provider_application",
        f"New provider application: {application.business_name}",
        link="/admin/applications",
    )
    return application


@transaction.atomic
def approve_provider_application(application, admin):
    application = ProviderApplication.objects.select_for_update().get(pk=application.pk)
    if application.status != ProviderApplication.STATUS_PENDING:
        raise BusinessRuleError(f"This application is already {application.status}.")
    application.status = ProviderApplication.STATUS_APPROVED
    application.reviewed_by = admin
    application.reviewed_at = timezone.now()
    application.rejection_reason = ""
    application.save()
    ProviderProfile.objects.update_or_create(
        user=application.user,
        defaults={
            "application": application,
            "provider_type": application.provider_type,
            "business_name": application.business_name,
            "phone_number": application.phone_number,
            "status": ProviderProfile.STATUS_APPROVED,
            "suspension_reason": "",
            "approved_at": timezone.now(),
        },
    )
    notify(
        application.user,
        "provider_approved",
        "Your provider account is approved",
        "You can now switch to provider tools to list properties and manage boarding houses.",
        "/provider",
    )
    return application


@transaction.atomic
def reject_provider_application(application, admin, reason, can_reapply=True):
    application = ProviderApplication.objects.select_for_update().get(pk=application.pk)
    if application.status != ProviderApplication.STATUS_PENDING:
        raise BusinessRuleError(f"This application is already {application.status}.")
    if not reason.strip():
        raise BusinessRuleError("Give the applicant a reason so they know what to fix.")
    application.status = ProviderApplication.STATUS_REJECTED
    application.rejection_reason = reason.strip()
    application.can_reapply = can_reapply
    application.reviewed_by = admin
    application.reviewed_at = timezone.now()
    application.save()
    notify(
        application.user,
        "provider_rejected",
        "Your provider application was not approved",
        application.rejection_reason,
        "/become-provider",
    )
    return application


def set_provider_suspension(user, suspended, reason=""):
    profile = getattr(user, "provider_profile", None)
    if profile is None:
        raise BusinessRuleError("This user is not an approved provider.")
    if suspended and not reason.strip():
        raise BusinessRuleError("Give a reason for the suspension.")
    profile.status = ProviderProfile.STATUS_SUSPENDED if suspended else ProviderProfile.STATUS_APPROVED
    profile.suspension_reason = reason.strip() if suspended else ""
    profile.save(update_fields=["status", "suspension_reason", "updated_at"])
    user_profile = get_profile(user)
    if suspended and user_profile.active_mode == UserProfile.MODE_PROVIDER:
        user_profile.active_mode = UserProfile.MODE_MARKETPLACE
        user_profile.save(update_fields=["active_mode"])
    notify(
        user,
        "provider_suspended" if suspended else "provider_reinstated",
        "Your provider account is suspended" if suspended else "Your provider account is reinstated",
        profile.suspension_reason,
    )
    return profile


def switch_mode(user, mode):
    if mode not in dict(UserProfile.MODE_CHOICES):
        raise BusinessRuleError("Unknown experience.")
    if mode == UserProfile.MODE_PROVIDER and not is_active_provider(user):
        raise BusinessRuleError("Provider tools need an approved, active provider account.", 403)
    profile = get_profile(user)
    profile.active_mode = mode
    profile.save(update_fields=["active_mode"])
    return profile


# ---------------------------------------------------------------------------
# Money
# ---------------------------------------------------------------------------
def rates_for(category):
    rate, _ = CommissionRate.objects.get_or_create(category=category)
    return rate


def price_breakdown(category, gross):
    """Gross -> Nyumba commission, gateway fee, provider net. The only place this is calculated."""
    gross = money(gross)
    rate = rates_for(category)
    commission = money(gross * rate.rate)
    fee = money(gross * rate.processing_fee_rate)
    return {
        "gross_amount": gross,
        "rate": rate.rate,
        "amount": commission,
        "processing_fee": fee,
        "provider_net": gross - commission - fee,
    }


def add_months(start, months):
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------
def holding_bookings():
    """Bookings that currently block inventory: confirmed, or unpaid but inside the payment window."""
    now = timezone.now()
    return Booking.objects.filter(
        Q(status=Booking.STATUS_CONFIRMED)
        | Q(status=Booking.STATUS_AWAITING_PAYMENT, payment_due_at__gt=now)
    )


def listing_has_clash(listing, check_in, check_out, exclude_booking=None):
    qs = holding_bookings().filter(listing=listing, check_in__lt=check_out, check_out__gt=check_in)
    if exclude_booking is not None:
        qs = qs.exclude(pk=exclude_booking.pk)
    return qs.exists()


def room_occupancy(room, exclude_booking=None):
    """Bed counts for one room, from real occupancy records.

    occupied: occupants checked in
    reserved: paid reservations not yet checked in
    held:     unpaid bookings still inside their payment window
    """
    counts = room.tenancies.aggregate(
        occupied=Count("id", filter=Q(status=BoardingTenancy.STATUS_ACTIVE)),
        reserved=Count("id", filter=Q(status=BoardingTenancy.STATUS_RESERVED)),
    )
    held_qs = Booking.objects.filter(
        room=room, status=Booking.STATUS_AWAITING_PAYMENT, payment_due_at__gt=timezone.now()
    )
    if exclude_booking is not None:
        held_qs = held_qs.exclude(pk=exclude_booking.pk)
    held = held_qs.count()
    available = max(room.capacity - counts["occupied"] - counts["reserved"] - held, 0)
    return {
        "capacity": room.capacity,
        "occupied": counts["occupied"],
        "reserved": counts["reserved"],
        "held": held,
        "available": available,
    }


def house_occupancy(house):
    rooms = [(room, room_occupancy(room)) for room in house.rooms.filter(is_active=True)]
    totals = {"capacity": 0, "occupied": 0, "reserved": 0, "held": 0, "available": 0}
    for _, occ in rooms:
        for key in totals:
            totals[key] += occ[key]
    totals["occupancy_rate"] = (
        round(totals["occupied"] / totals["capacity"] * 100, 1) if totals["capacity"] else 0.0
    )
    return rooms, totals


def ensure_room_capacity_change_allowed(room, new_capacity):
    occ = room_occupancy(room)
    taken = occ["occupied"] + occ["reserved"] + occ["held"]
    if new_capacity < taken:
        raise BusinessRuleError(
            f"{room.name} has {taken} bed(s) taken or held. Capacity cannot go below that."
        )


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------
def expire_stale_bookings():
    """Release unpaid holds whose payment window has closed. Safe to call often."""
    now = timezone.now()
    stale = Booking.objects.filter(status=Booking.STATUS_AWAITING_PAYMENT, payment_due_at__lte=now)
    for booking in stale.select_related("user"):
        booking.status = Booking.STATUS_CANCELLED
        booking.cancelled_at = now
        booking.cancelled_by = "system"
        booking.decision_note = "Payment was not completed in time, so the booking was released."
        booking.save(update_fields=["status", "cancelled_at", "cancelled_by", "decision_note", "updated_at"])
        notify(
            booking.user,
            "booking_expired",
            f"Booking {booking.reference} was released",
            booking.decision_note,
            f"/bookings/{booking.id}",
        )


def complete_finished_stays():
    """Confirmed stays and rentals whose end date has passed become completed."""
    today = timezone.localdate()
    Booking.objects.filter(
        status=Booking.STATUS_CONFIRMED,
        listing__isnull=False,
        check_out__lt=today,
    ).update(status=Booking.STATUS_COMPLETED, updated_at=timezone.now())


def _payment_window(booking_mode):
    if booking_mode == BOOKING_INSTANT:
        return timezone.now() + timedelta(minutes=settings.NYUMBA_PAYMENT_HOLD_MINUTES)
    return timezone.now() + timedelta(hours=settings.NYUMBA_REQUEST_RESPONSE_HOURS / 2)


def create_listing_booking(user, listing_id, data):
    """Short stay (per night) or rental (per month). Sale listings are enquiry-only."""
    expire_stale_bookings()
    check_in = data["check_in"]
    if check_in < timezone.localdate():
        raise BusinessRuleError("Pick a start date from today onwards.")

    with transaction.atomic():
        listing = (
            Listing.public()
            .select_for_update(of=("self",))
            .select_related("property__owner")
            .filter(id=listing_id)
            .first()
        )
        if listing is None:
            raise BusinessRuleError("This listing is not available.", 404)
        if listing.kind == "sale":
            raise BusinessRuleError("Properties for sale can't be booked. Send the provider an enquiry instead.")
        if listing.property.owner_id == user.id:
            raise BusinessRuleError("You can't book your own listing.")
        if listing.available_from and check_in < listing.available_from:
            raise BusinessRuleError(f"This listing is available from {listing.available_from:%d %b %Y}.")

        if listing.kind == "stay":
            check_out = data.get("check_out")
            if not check_out or check_out <= check_in:
                raise BusinessRuleError("Check-out must be at least one night after check-in.")
            periods = (check_out - check_in).days
            category = Booking.CATEGORY_STAY
        else:
            periods = data.get("months") or 1
            if not 1 <= periods <= 24:
                raise BusinessRuleError("Choose between 1 and 24 months.")
            check_out = add_months(check_in, periods)
            category = Booking.CATEGORY_RENT

        if listing_has_clash(listing, check_in, check_out):
            raise BusinessRuleError("Those dates are already taken. Please pick different dates.", 409)

        booking = Booking.objects.create(
            category=category,
            user=user,
            listing=listing,
            booking_mode=listing.booking_mode,
            guest_name=data["guest_name"],
            guest_phone=data["guest_phone"],
            message=data.get("message", ""),
            check_in=check_in,
            check_out=check_out,
            periods=periods,
            unit_price=listing.price,
            total_amount=money(listing.price * periods),
            status=(
                Booking.STATUS_AWAITING_PAYMENT
                if listing.booking_mode == BOOKING_INSTANT
                else Booking.STATUS_PENDING
            ),
            payment_due_at=_payment_window(BOOKING_INSTANT) if listing.booking_mode == BOOKING_INSTANT else None,
        )
        Commission.objects.create(booking=booking, **price_breakdown(category, booking.total_amount))

    _announce_new_booking(booking)
    return booking


def create_room_booking(user, room_id, data):
    expire_stale_bookings()
    start = data["check_in"]
    if start < timezone.localdate():
        raise BusinessRuleError("Pick a move-in date from today onwards.")
    months = data.get("months") or 1
    if not 1 <= months <= 12:
        raise BusinessRuleError("Choose between 1 and 12 months.")

    with transaction.atomic():
        room = (
            BoardingRoom.objects.select_for_update(of=("self",))
            .select_related("boarding_house__property__owner")
            .filter(id=room_id, is_active=True, boarding_house__in=BoardingHouse.public())
            .first()
        )
        if room is None:
            raise BusinessRuleError("This room is not available.", 404)
        house = room.boarding_house
        if house.property.owner_id == user.id:
            raise BusinessRuleError("You can't book a bed in your own boarding house.")
        if BoardingTenancy.objects.filter(
            student=user, status__in=BoardingTenancy.BED_HOLDING_STATUSES
        ).exists():
            raise BusinessRuleError("You already have a boarding-house bed. Check out before booking another.")
        if Booking.objects.filter(
            user=user, room__isnull=False, status__in=Booking.OPEN_STATUSES
        ).exists():
            raise BusinessRuleError("You already have an open boarding-house booking. Finish or cancel it first.")
        if room_occupancy(room)["available"] < 1:
            raise BusinessRuleError("This room is full. Try another room.", 409)

        instant = house.booking_mode == BOOKING_INSTANT
        booking = Booking.objects.create(
            category=Booking.CATEGORY_BOARDING,
            user=user,
            room=room,
            booking_mode=house.booking_mode,
            guest_name=data["guest_name"],
            guest_phone=data["guest_phone"],
            message=data.get("message", ""),
            check_in=start,
            check_out=add_months(start, months),
            periods=months,
            unit_price=room.price_per_bed,
            total_amount=money(room.price_per_bed * months),
            status=Booking.STATUS_AWAITING_PAYMENT if instant else Booking.STATUS_PENDING,
            payment_due_at=_payment_window(BOOKING_INSTANT) if instant else None,
        )
        Commission.objects.create(
            booking=booking, **price_breakdown(Booking.CATEGORY_BOARDING, booking.total_amount)
        )

    # Keep optional student details on the profile for next time.
    profile = get_profile(user)
    changed = []
    for field in ("institution", "student_id", "emergency_contact_name", "emergency_contact_phone"):
        if data.get(field) and getattr(profile, field) != data[field]:
            setattr(profile, field, data[field])
            changed.append(field)
    if changed:
        profile.save(update_fields=changed)

    _announce_new_booking(booking)
    return booking


def _announce_new_booking(booking):
    provider = booking.provider
    if booking.status == Booking.STATUS_PENDING:
        notify(
            provider,
            "booking_request",
            f"New booking request for {booking.target_title}",
            f"{booking.guest_name} asked for {booking.check_in:%d %b %Y}. Accept or reject it.",
            "/provider/bookings",
        )
    else:
        notify(
            booking.user,
            "booking_awaiting_payment",
            f"Pay to confirm {booking.reference}",
            "Your dates are held while you pay.",
            f"/bookings/{booking.id}",
        )


def provider_can_manage_property(user, prop):
    return prop.owner_id == user.id or prop.managers.filter(id=user.id).exists()


def _lock_provider_booking(provider, booking_id):
    booking = (
        Booking.objects.select_for_update(of=("self",))
        .select_related("listing__property", "room__boarding_house__property", "user")
        .filter(id=booking_id)
        .first()
    )
    prop = None
    if booking is not None:
        prop = booking.listing.property if booking.listing_id else booking.room.boarding_house.property
    if booking is None or not provider_can_manage_property(provider, prop):
        raise BusinessRuleError("Booking not found.", 404)
    return booking


def accept_booking(provider, booking_id, note=""):
    expire_stale_bookings()
    with transaction.atomic():
        booking = _lock_provider_booking(provider, booking_id)
        if booking.status != Booking.STATUS_PENDING:
            raise BusinessRuleError(f"This booking is {booking.get_status_display().lower()}.")
        if booking.listing_id:
            Listing.objects.select_for_update().get(pk=booking.listing_id)
            if listing_has_clash(booking.listing, booking.check_in, booking.check_out):
                raise BusinessRuleError("Another booking already holds these dates. Reject this request.", 409)
        else:
            BoardingRoom.objects.select_for_update().get(pk=booking.room_id)
            if room_occupancy(booking.room)["available"] < 1:
                raise BusinessRuleError("This room has no free bed. Reject the request or add capacity.", 409)
        booking.status = Booking.STATUS_AWAITING_PAYMENT
        booking.decision_note = note
        booking.decided_at = timezone.now()
        booking.payment_due_at = _payment_window("request")
        booking.save()
    notify(
        booking.user,
        "booking_accepted",
        f"{booking.target_title} accepted your request",
        f"Pay by {timezone.localtime(booking.payment_due_at):%d %b %H:%M} to confirm it.",
        f"/bookings/{booking.id}",
    )
    return booking


def reject_booking(provider, booking_id, note=""):
    with transaction.atomic():
        booking = _lock_provider_booking(provider, booking_id)
        if booking.status != Booking.STATUS_PENDING:
            raise BusinessRuleError(f"This booking is {booking.get_status_display().lower()}.")
        booking.status = Booking.STATUS_REJECTED
        booking.decision_note = note
        booking.decided_at = timezone.now()
        booking.save()
        Commission.objects.filter(booking=booking).update(status=Commission.STATUS_REFUNDED)
    notify(
        booking.user,
        "booking_rejected",
        f"{booking.target_title} declined your request",
        note,
        f"/bookings/{booking.id}",
    )
    return booking


def guest_refund_amount(booking):
    """Cancellation policy (documented in the report):
    - before payment: nothing to refund
    - confirmed, more than NYUMBA_FREE_CANCEL_HOURS before check-in: full refund
    - confirmed, later than that: no automatic refund (an administrator can still refund)
    """
    paid = booking.payments.filter(status=Payment.STATUS_SUCCESSFUL).first()
    if paid is None:
        return None, ZERO
    start = timezone.make_aware(datetime.combine(booking.check_in, datetime.min.time()))
    hours_left = (start - timezone.now()).total_seconds() / 3600
    if hours_left >= settings.NYUMBA_FREE_CANCEL_HOURS:
        return paid, paid.amount
    return paid, ZERO


def cancel_booking(user, booking_id, by_provider=False, reason=""):
    with transaction.atomic():
        if by_provider:
            booking = _lock_provider_booking(user, booking_id)
        else:
            booking = Booking.objects.select_for_update().filter(id=booking_id, user=user).first()
            if booking is None:
                raise BusinessRuleError("Booking not found.", 404)
        cancellable = Booking.OPEN_STATUSES + (Booking.STATUS_CONFIRMED,)
        if booking.status not in cancellable:
            raise BusinessRuleError(f"A {booking.get_status_display().lower()} booking can't be cancelled.")

        if booking.room_id and hasattr(booking, "tenancy") and booking.tenancy.status == BoardingTenancy.STATUS_ACTIVE:
            raise BusinessRuleError("The occupant has already checked in. Check them out instead.")

        payment, refund_amount = (None, ZERO)
        if booking.status == Booking.STATUS_CONFIRMED:
            if by_provider:
                payment = booking.payments.filter(status=Payment.STATUS_SUCCESSFUL).first()
                refund_amount = payment.amount if payment else ZERO
            else:
                payment, refund_amount = guest_refund_amount(booking)

        booking.status = Booking.STATUS_CANCELLED
        booking.cancelled_at = timezone.now()
        booking.cancelled_by = "provider" if by_provider else "guest"
        booking.decision_note = reason
        booking.save()

        tenancy = getattr(booking, "tenancy", None)
        if tenancy and tenancy.status == BoardingTenancy.STATUS_RESERVED:
            tenancy.status = BoardingTenancy.STATUS_CANCELLED
            tenancy.save(update_fields=["status", "updated_at"])

        refund = None
        if payment and refund_amount > 0:
            refund = issue_refund(payment, refund_amount, f"Booking cancelled by {booking.cancelled_by}", user)
        elif not payment:
            Commission.objects.filter(booking=booking).update(status=Commission.STATUS_REFUNDED)

    other = booking.user if by_provider else booking.provider
    notify(
        other,
        "booking_cancelled",
        f"Booking {booking.reference} was cancelled",
        reason or f"Cancelled by the {booking.cancelled_by}.",
        f"/bookings/{booking.id}" if by_provider else "/provider/bookings",
    )
    return booking, refund


# ---------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------
def start_payment(user, booking_id):
    from . import gateways

    expire_stale_bookings()
    with transaction.atomic():
        booking = Booking.objects.select_for_update().filter(id=booking_id, user=user).first()
        if booking is None:
            raise BusinessRuleError("Booking not found.", 404)
        if booking.status != Booking.STATUS_AWAITING_PAYMENT:
            raise BusinessRuleError(f"This booking is {booking.get_status_display().lower()}, not awaiting payment.")
        if not booking.payment_window_open():
            raise BusinessRuleError("The payment window has closed. Make a new booking.")
        # Reuse an unfinished attempt instead of opening a second charge.
        existing = booking.payments.filter(status=Payment.STATUS_INITIATED).first()
        if existing and existing.checkout_url:
            return existing
        gateway = gateways.get_gateway()
        payment = Payment.objects.create(
            booking=booking,
            user=user,
            gateway=gateway.name,
            tx_ref=gateways.new_tx_ref(booking),
            amount=booking.total_amount,
            currency=settings.PAYMENT_CURRENCY,
        )
    try:
        payment.checkout_url = gateway.create_checkout(payment)
    except gateways.GatewayError as exc:
        payment.status = Payment.STATUS_FAILED
        payment.failure_reason = str(exc)[:255]
        payment.save(update_fields=["status", "failure_reason", "updated_at"])
        raise BusinessRuleError("The payment provider could not start the payment. Try again shortly.", 502)
    payment.save(update_fields=["checkout_url", "updated_at"])
    return payment


def verify_payment(tx_ref, gateway_transaction_id=None):
    """Ask the gateway, server to server, whether this payment really succeeded. Idempotent."""
    from . import gateways

    with transaction.atomic():
        payment = Payment.objects.select_for_update().filter(tx_ref=tx_ref).first()
        if payment is None:
            raise BusinessRuleError("Payment not found.", 404)
        if payment.status != Payment.STATUS_INITIATED:
            return payment  # already settled; never process twice

        gateway = gateways.get_gateway(payment.gateway)
        result = gateway.verify(payment, gateway_transaction_id)
        payment.gateway_response = result.raw
        if result.status == "pending":
            payment.save(update_fields=["gateway_response", "updated_at"])
            return payment
        if result.status != "successful":
            payment.status = Payment.STATUS_FAILED
            payment.failure_reason = result.message[:255]
            payment.save()
            return payment

        # Never trust amounts or references from the browser: compare with what we charged.
        if (
            result.tx_ref != payment.tx_ref
            or result.currency != payment.currency
            or money(result.amount) < payment.amount
        ):
            payment.status = Payment.STATUS_FAILED
            payment.failure_reason = "Amount, currency or reference did not match the booking."
            payment.save()
            return payment
        if (
            result.transaction_id
            and Payment.objects.filter(gateway_transaction_id=result.transaction_id).exclude(pk=payment.pk).exists()
        ):
            payment.status = Payment.STATUS_FAILED
            payment.failure_reason = "This gateway transaction was already used for another payment."
            payment.save()
            return payment

        payment.status = Payment.STATUS_SUCCESSFUL
        payment.gateway_transaction_id = result.transaction_id or None
        payment.method = result.method
        payment.verified_at = timezone.now()
        payment.save()
        _confirm_paid_booking(payment)
    return payment


def _confirm_paid_booking(payment):
    """Runs inside verify_payment's transaction."""
    booking = Booking.objects.select_for_update().get(pk=payment.booking_id)
    still_open = booking.status == Booking.STATUS_AWAITING_PAYMENT
    if booking.status == Booking.STATUS_CANCELLED and booking.cancelled_by == "system":
        # Paid just after the hold expired: confirm only if the inventory is still free.
        if booking.listing_id:
            still_open = not listing_has_clash(booking.listing, booking.check_in, booking.check_out, booking)
        else:
            BoardingRoom.objects.select_for_update().get(pk=booking.room_id)
            still_open = room_occupancy(booking.room, exclude_booking=booking)["available"] >= 1

    if not still_open:
        issue_refund(payment, payment.amount, "Paid after the booking was no longer available", None)
        notify(
            booking.user,
            "payment_refunded",
            f"Payment for {booking.reference} will be refunded",
            "The booking was no longer available when the payment arrived.",
            f"/bookings/{booking.id}",
        )
        return

    if booking.room_id:
        BoardingRoom.objects.select_for_update().get(pk=booking.room_id)
        profile = get_profile(booking.user)
        BoardingTenancy.objects.create(
            room=booking.room,
            student=booking.user,
            booking=booking,
            occupant_name=booking.user.get_full_name() or booking.guest_name,
            occupant_phone=booking.guest_phone,
            institution=profile.institution,
            student_number=profile.student_id,
            emergency_contact_name=profile.emergency_contact_name,
            emergency_contact_phone=profile.emergency_contact_phone,
            status=BoardingTenancy.STATUS_RESERVED,
            check_in_date=booking.check_in,
            lease_end=booking.check_out,
            rent_amount=booking.total_amount,
            amount_paid=payment.amount,
            payment_status=BoardingTenancy.PAYMENT_PAID,
        )

    booking.status = Booking.STATUS_CONFIRMED
    booking.confirmed_at = timezone.now()
    booking.save(update_fields=["status", "confirmed_at", "updated_at"])
    Commission.objects.filter(booking=booking).update(status=Commission.STATUS_EARNED)

    notify(
        booking.user,
        "booking_confirmed",
        f"Booking {booking.reference} is confirmed",
        f"We received K{payment.amount:,.2f}. Your receipt is ready.",
        f"/bookings/{booking.id}",
    )
    notify(
        booking.provider,
        "booking_paid",
        f"{booking.guest_name} paid for {booking.target_title}",
        f"K{payment.amount:,.2f} received for {booking.reference}.",
        "/provider/bookings",
    )


def issue_refund(payment, amount, reason, requested_by):
    """Record a refund and ask the gateway to send it. Commission follows the refund."""
    from . import gateways

    amount = money(amount)
    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(pk=payment.pk)
        if payment.status not in (Payment.STATUS_SUCCESSFUL, Payment.STATUS_PARTIALLY_REFUNDED):
            raise BusinessRuleError("Only a successful payment can be refunded.")
        remaining = payment.amount - payment.refunded_amount
        if amount <= 0 or amount > remaining:
            raise BusinessRuleError(f"Refund must be between K0.01 and K{remaining:,.2f}.")
        refund = Refund.objects.create(payment=payment, amount=amount, reason=reason, requested_by=requested_by)
        try:
            refund.gateway_reference = gateways.get_gateway(payment.gateway).refund(payment, amount)
            refund.status = Refund.STATUS_COMPLETED
            refund.processed_at = timezone.now()
        except gateways.GatewayError as exc:
            # Keep the record so an administrator can retry; money has not moved.
            refund.status = Refund.STATUS_PENDING
            refund.gateway_reference = str(exc)[:64]
        refund.save()
        fully = payment.refunded_amount >= payment.amount
        payment.status = Payment.STATUS_REFUNDED if fully else Payment.STATUS_PARTIALLY_REFUNDED
        payment.save(update_fields=["status", "updated_at"])
        if fully:
            Commission.objects.filter(booking_id=payment.booking_id).update(status=Commission.STATUS_REFUNDED)
    return refund


# ---------------------------------------------------------------------------
# Boarding-house operations
# ---------------------------------------------------------------------------
def register_occupant(room, data, student=None):
    with transaction.atomic():
        room = BoardingRoom.objects.select_for_update().get(pk=room.pk)
        if room_occupancy(room)["available"] < 1:
            raise BusinessRuleError(f"{room.name} is full ({room.capacity} of {room.capacity} beds taken).", 409)
        try:
            with transaction.atomic():
                return BoardingTenancy.objects.create(room=room, student=student, **data)
        except IntegrityError:
            raise BusinessRuleError("This account already holds a bed in a boarding house.")


def check_in_occupant(tenancy):
    if tenancy.status != BoardingTenancy.STATUS_RESERVED:
        raise BusinessRuleError(f"This occupant is {tenancy.get_status_display().lower()}.")
    tenancy.status = BoardingTenancy.STATUS_ACTIVE
    tenancy.check_in_date = timezone.localdate()
    tenancy.save(update_fields=["status", "check_in_date", "updated_at"])
    return tenancy


def check_out_occupant(tenancy):
    if tenancy.status != BoardingTenancy.STATUS_ACTIVE:
        raise BusinessRuleError(f"This occupant is {tenancy.get_status_display().lower()}.")
    tenancy.status = BoardingTenancy.STATUS_CHECKED_OUT
    tenancy.check_out_date = timezone.localdate()
    tenancy.save(update_fields=["status", "check_out_date", "updated_at"])
    if tenancy.booking_id:
        Booking.objects.filter(pk=tenancy.booking_id, status=Booking.STATUS_CONFIRMED).update(
            status=Booking.STATUS_COMPLETED, updated_at=timezone.now()
        )
    return tenancy


def provider_earnings(provider, start=None, end=None, property_id=None):
    """Earned money for a provider from verified payments (refunds excluded)."""
    qs = Commission.objects.filter(
        Q(booking__listing__property__owner=provider) | Q(booking__room__boarding_house__property__owner=provider),
        status__in=[Commission.STATUS_EARNED, Commission.STATUS_PAID_OUT],
    )
    if start:
        qs = qs.filter(booking__confirmed_at__date__gte=start)
    if end:
        qs = qs.filter(booking__confirmed_at__date__lte=end)
    if property_id:
        qs = qs.filter(
            Q(booking__listing__property_id=property_id) | Q(booking__room__boarding_house__property_id=property_id)
        )
    return qs
