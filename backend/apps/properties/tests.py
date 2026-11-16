"""Behaviour tests for Nyumba's rules. Run with:
    python manage.py test apps.properties.tests
"""

import re
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from . import gateways
from .models import (
    BoardingHouse,
    BoardingRoom,
    BoardingTenancy,
    Booking,
    Commission,
    CommissionRate,
    Favourite,
    Listing,
    Notification,
    Payment,
    Property,
    ProviderProfile,
)

PASSWORD = "Sturdy-pass-2026"
FAST = override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    PAYMENT_GATEWAY="sandbox",
    FRONTEND_URL="http://testserver-web",
)


class Base(APITestCase):
    def setUp(self):
        cache.clear()  # reset rate limits between tests
        self.admin = User.objects.create_user("admin", "admin@x.test", PASSWORD, is_staff=True)

    # -- helpers -----------------------------------------------------------
    def register(self, username, **extra):
        payload = {
            "username": username,
            "email": f"{username}@x.test",
            "password": PASSWORD,
            "first_name": username.title(),
            **extra,
        }
        return self.client.post("/api/auth/register/", payload, format="json")

    def make_user(self, username):
        res = self.register(username)
        self.assertEqual(res.status_code, 201, res.data)
        return User.objects.get(username=username), res.data["token"]

    def as_user(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")

    def as_admin(self):
        self.client.force_authenticate(self.admin)

    def logout_client(self):
        self.client.force_authenticate(None)
        self.client.credentials()

    def make_provider(self, username):
        user, token = self.make_user(username)
        self.as_user(token)
        res = self.client.post(
            "/api/provider-applications/",
            {"provider_type": "landlord", "business_name": f"{username} Homes", "phone_number": "0977000000"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.as_admin()
        res = self.client.post(f"/api/admin/applications/{res.data['id']}/approve/")
        self.assertEqual(res.status_code, 200, res.data)
        self.logout_client()
        return user, token

    def make_listing(self, token, kind="stay", price="500.00", booking_mode="request", approve=True):
        self.as_user(token)
        res = self.client.post(
            "/api/provider/properties/",
            {
                "title": f"Kabulonga {kind}",
                "address": "Plot 1, Lusaka",
                "neighbourhood": "Kabulonga",
                "latitude": -15.41,
                "longitude": 28.31,
                "bedrooms": 2,
                "bathrooms": 1,
                "listing": {"kind": kind, "price": price, "booking_mode": booking_mode},
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        listing_id = res.data["listings"][0]["id"]
        if approve:
            self.as_admin()
            self.assertEqual(self.client.post(f"/api/admin/listings/{listing_id}/approve/").status_code, 200)
        self.logout_client()
        return Listing.objects.get(pk=listing_id)

    def make_boarding_house(self, token, rooms=None, booking_mode="request", approve=True):
        self.as_user(token)
        res = self.client.post(
            "/api/provider/boarding-houses/",
            {
                "name": "University Boarding House",
                "near_institution": "UNZA",
                "booking_mode": booking_mode,
                "property": {"title": "UBH", "address": "Great East Rd", "neighbourhood": "Chudleigh", "latitude": -15.39, "longitude": 28.33},
                "rooms": rooms
                or [
                    {"name": "Room 01", "room_type": "dorm", "capacity": 4, "price_per_bed": "800.00"},
                    {"name": "Room 02", "room_type": "double", "capacity": 2, "price_per_bed": "1000.00"},
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        house = BoardingHouse.objects.get(pk=res.data["id"])
        if approve:
            self.as_admin()
            self.assertEqual(self.client.post(f"/api/admin/boarding-houses/{house.id}/approve/").status_code, 200)
        self.logout_client()
        return house

    def pay(self, token, booking_id, outcome="successful"):
        self.as_user(token)
        res = self.client.post(f"/api/bookings/{booking_id}/pay/")
        self.assertEqual(res.status_code, 201, res.data)
        tx_ref = res.data["tx_ref"]
        res = self.client.post("/api/payments/sandbox/complete/", {"tx_ref": tx_ref, "outcome": outcome}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        return res.data

    def book_stay(self, token, listing, days_ahead=10, nights=3):
        self.as_user(token)
        start = timezone.localdate() + timedelta(days=days_ahead)
        return self.client.post(
            "/api/bookings/",
            {
                "listing_id": listing.id,
                "guest_name": "Guest",
                "guest_phone": "0977123456",
                "check_in": str(start),
                "check_out": str(start + timedelta(days=nights)),
            },
            format="json",
        )

    def book_room(self, token, room, months=2):
        self.as_user(token)
        return self.client.post(
            "/api/bookings/",
            {
                "room_id": room.id,
                "guest_name": "Student",
                "guest_phone": "0977123456",
                "check_in": str(timezone.localdate() + timedelta(days=5)),
                "months": months,
                "institution": "UNZA",
                "student_id": "2026-01",
            },
            format="json",
        )


# ---------------------------------------------------------------------------
@FAST
class AuthenticationTests(Base):
    def test_register_login_logout(self):
        user, token = self.make_user("taonga")
        self.assertEqual(user.email, "taonga@x.test")
        self.assertTrue(user.password.startswith("md5$"))  # hashed, never raw
        self.logout_client()
        res = self.client.post("/api/auth/login/", {"login": "taonga@x.test", "password": PASSWORD}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["user"]["provider_status"], "none")
        self.as_user(res.data["token"])
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 200)
        self.assertEqual(self.client.get("/api/me/").status_code, 401)

    def test_wrong_password(self):
        self.make_user("anna")
        self.logout_client()
        res = self.client.post("/api/auth/login/", {"login": "anna", "password": "nope"}, format="json")
        self.assertEqual(res.status_code, 401)

    def test_duplicate_email_and_weak_password(self):
        self.make_user("dupe")
        self.assertEqual(self.register("other", email="dupe@x.test").status_code, 400)
        res = self.register("weak", password="123")
        self.assertEqual(res.status_code, 400)
        self.assertIn("password", res.data["fields"])

    def test_everything_requires_login(self):
        for url in ["/api/listings/search/", "/api/boarding-houses/", "/api/favourites/", "/api/bookings/", "/api/me/"]:
            self.assertEqual(self.client.get(url).status_code, 401, url)

    def test_password_reset_flow(self):
        user, _ = self.make_user("forgetful")
        self.logout_client()
        res = self.client.post("/api/auth/password-reset/", {"email": "forgetful@x.test"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        uid, token = re.search(r"uid=([^&]+)&token=(\S+)", mail.outbox[0].body).groups()
        res = self.client.post(
            "/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "password": "New-sturdy-2027"}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        # Token can't be reused.
        res = self.client.post(
            "/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "password": "Another-one-2028"}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        res = self.client.post("/api/auth/login/", {"login": "forgetful", "password": "New-sturdy-2027"}, format="json")
        self.assertEqual(res.status_code, 200)

    def test_reset_for_unknown_email_looks_the_same(self):
        res = self.client.post("/api/auth/password-reset/", {"email": "nobody@x.test"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_suspended_account_cannot_use_api(self):
        user, token = self.make_user("bad")
        self.as_admin()
        self.client.post(f"/api/admin/users/{user.id}/suspend/")
        self.logout_client()
        self.as_user(token)
        self.assertEqual(self.client.get("/api/me/").status_code, 401)


# ---------------------------------------------------------------------------
@FAST
class ProviderApprovalTests(Base):
    def test_full_application_lifecycle(self):
        user, token = self.make_user("landlord")
        self.as_user(token)
        # General users can't use provider tools.
        self.assertEqual(self.client.get("/api/provider/dashboard/").status_code, 403)
        res = self.client.post(
            "/api/provider-applications/",
            {"provider_type": "boarding_house", "business_name": "Chudleigh Rooms", "phone_number": "0977"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        app_id = res.data["id"]
        # Pending: still can't use provider tools, can't apply twice, can still browse.
        self.assertEqual(self.client.get("/api/me/").data["provider_status"], "pending")
        self.assertEqual(self.client.get("/api/provider/dashboard/").status_code, 403)
        self.assertEqual(self.client.post("/api/me/mode/", {"mode": "provider"}).status_code, 403)
        self.assertEqual(
            self.client.post("/api/provider-applications/", {"provider_type": "landlord", "business_name": "x", "phone_number": "1"}).status_code,
            400,
        )
        self.assertEqual(self.client.get("/api/listings/search/").status_code, 200)
        # Admin rejects with a reason; user sees it and reapplies.
        self.as_admin()
        self.assertEqual(self.client.post(f"/api/admin/applications/{app_id}/reject/", {}).status_code, 400)
        self.client.post(f"/api/admin/applications/{app_id}/reject/", {"reason": "Add a phone number we can call."}, format="json")
        self.logout_client()
        self.as_user(token)
        me = self.client.get("/api/me/").data
        self.assertEqual(me["provider_status"], "rejected")
        self.assertEqual(me["latest_application"]["rejection_reason"], "Add a phone number we can call.")
        res = self.client.post(
            "/api/provider-applications/",
            {"provider_type": "boarding_house", "business_name": "Chudleigh Rooms", "phone_number": "0977 111 222"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        # Approve: same account, now can switch to provider tools and back.
        self.as_admin()
        self.client.post(f"/api/admin/applications/{res.data['id']}/approve/")
        self.logout_client()
        self.as_user(token)
        me = self.client.post("/api/me/mode/", {"mode": "provider"}).data
        self.assertEqual(me["active_mode"], "provider")
        self.assertEqual(self.client.get("/api/provider/dashboard/").status_code, 200)
        self.assertEqual(self.client.post("/api/me/mode/", {"mode": "marketplace"}).data["active_mode"], "marketplace")
        self.assertEqual(User.objects.filter(email="landlord@x.test").count(), 1)  # one account
        self.assertTrue(Notification.objects.filter(user=user, kind="provider_approved").exists())

    def test_no_reapply_when_blocked(self):
        user, token = self.make_user("spammer")
        self.as_user(token)
        res = self.client.post("/api/provider-applications/", {"provider_type": "agent", "business_name": "S", "phone_number": "1"})
        self.as_admin()
        self.client.post(f"/api/admin/applications/{res.data['id']}/reject/", {"reason": "Fraud", "can_reapply": False}, format="json")
        self.logout_client()
        self.as_user(token)
        res = self.client.post("/api/provider-applications/", {"provider_type": "agent", "business_name": "S", "phone_number": "1"})
        self.assertEqual(res.status_code, 400)

    def test_suspension_removes_access_and_hides_listings(self):
        provider, token = self.make_provider("susp")
        listing = self.make_listing(token)
        seeker, stoken = self.make_user("seeker")
        self.as_user(stoken)
        self.assertEqual(self.client.get("/api/listings/search/").data["count"], 1)
        self.as_admin()
        self.assertEqual(self.client.post(f"/api/admin/users/{provider.id}/suspend-provider/", {}).status_code, 400)
        self.client.post(f"/api/admin/users/{provider.id}/suspend-provider/", {"reason": "Complaints"}, format="json")
        self.logout_client()
        self.as_user(token)
        self.assertEqual(self.client.get("/api/provider/properties/").status_code, 403)
        self.assertEqual(self.client.get("/api/me/").data["provider_status"], "suspended")
        self.as_user(stoken)
        self.assertEqual(self.client.get("/api/listings/search/").data["count"], 0)
        self.assertEqual(self.client.get(f"/api/listings/{listing.id}/").status_code, 404)
        # Reinstated: back again.
        self.as_admin()
        self.client.post(f"/api/admin/users/{provider.id}/reinstate-provider/")
        self.logout_client()
        self.as_user(token)
        self.assertEqual(self.client.get("/api/provider/properties/").status_code, 200)

    def test_only_admin_reviews_applications(self):
        _, token = self.make_user("notadmin")
        self.as_user(token)
        self.assertEqual(self.client.get("/api/admin/applications/").status_code, 403)
        self.assertEqual(self.client.get("/api/admin/overview/").status_code, 403)


# ---------------------------------------------------------------------------
@FAST
class PropertyManagementTests(Base):
    def test_listing_visibility_rules(self):
        _, token = self.make_provider("owner")
        listing = self.make_listing(token, approve=False)
        _, stoken = self.make_user("viewer")
        self.as_user(stoken)
        self.assertEqual(self.client.get("/api/listings/search/").data["count"], 0)  # pending review
        self.as_admin()
        self.client.post(f"/api/admin/listings/{listing.id}/approve/")
        self.as_user(stoken)
        self.logout_client()
        self.as_user(stoken)
        self.assertEqual(self.client.get("/api/listings/search/").data["count"], 1)
        # Provider unpublishes: gone from search.
        self.as_user(token)
        res = self.client.patch(f"/api/provider/listings/{listing.id}/", {"is_published": False}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.as_user(stoken)
        self.assertEqual(self.client.get("/api/listings/search/").data["count"], 0)

    def test_providers_cannot_touch_each_others_properties(self):
        _, token_a = self.make_provider("alice")
        _, token_b = self.make_provider("bob")
        listing = self.make_listing(token_a)
        prop_id = listing.property_id
        self.as_user(token_b)
        self.assertEqual(self.client.patch(f"/api/provider/properties/{prop_id}/", {"title": "Mine now"}, format="json").status_code, 404)
        self.assertEqual(self.client.patch(f"/api/provider/listings/{listing.id}/", {"price": "1"}, format="json").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/provider/properties/{prop_id}/").status_code, 404)
        self.assertEqual(Property.objects.get(pk=prop_id).title, "Kabulonga stay")

    def test_unapproved_user_cannot_create_listing(self):
        _, token = self.make_user("eager")
        self.as_user(token)
        res = self.client.post("/api/provider/properties/", {"title": "x", "address": "y"}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_search_filters(self):
        _, token = self.make_provider("filters")
        self.make_listing(token, kind="rent", price="3000")
        self.make_listing(token, kind="sale", price="900000")
        _, stoken = self.make_user("searcher")
        self.as_user(stoken)
        self.assertEqual(self.client.get("/api/listings/search/?kind=rent").data["count"], 1)
        self.assertEqual(self.client.get("/api/listings/search/?max_price=5000").data["count"], 1)
        self.assertEqual(self.client.get("/api/listings/search/?bedrooms=3").data["count"], 0)
        self.assertEqual(self.client.get("/api/listings/search/?bbox=28.0,-15.6,28.5,-15.2").data["count"], 2)
        self.assertEqual(self.client.get("/api/listings/search/?min_price=10&max_price=1").status_code, 400)


# ---------------------------------------------------------------------------
@FAST
class BoardingHouseTests(Base):
    def setUp(self):
        super().setUp()
        self.provider, self.token = self.make_provider("ubh")
        self.house = self.make_boarding_house(self.token)
        self.room1 = self.house.rooms.get(name="Room 01")
        self.room2 = self.house.rooms.get(name="Room 02")

    def register_occupant(self, room, name, **extra):
        self.as_user(self.token)
        return self.client.post(
            f"/api/provider/boarding-houses/{self.house.id}/occupants/",
            {"room_id": room.id, "occupant_name": name, **extra},
            format="json",
        )

    def test_occupancy_is_calculated_and_capacity_enforced(self):
        for i in range(3):
            self.assertEqual(self.register_occupant(self.room1, f"Student {i}").status_code, 201)
        for i in range(2):
            self.assertEqual(self.register_occupant(self.room2, f"Pair {i}").status_code, 201)
        res = self.register_occupant(self.room2, "One too many")
        self.assertEqual(res.status_code, 409)
        report = self.client.get(f"/api/provider/boarding-houses/{self.house.id}/report/").data
        rooms = {r["name"]: r for r in report["rooms"]}
        self.assertEqual((rooms["Room 01"]["capacity"], rooms["Room 01"]["occupied"], rooms["Room 01"]["available"]), (4, 3, 1))
        self.assertEqual((rooms["Room 02"]["occupied"], rooms["Room 02"]["available"]), (2, 0))
        self.assertEqual(report["totals"]["occupancy_rate"], round(5 / 6 * 100, 1))

    def test_capacity_cannot_drop_below_occupants(self):
        self.register_occupant(self.room2, "A")
        self.register_occupant(self.room2, "B")
        res = self.client.patch(f"/api/provider/rooms/{self.room2.id}/", {"capacity": 1}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.client.patch(f"/api/provider/rooms/{self.room2.id}/", {"capacity": 3}, format="json").status_code, 200)

    def test_check_out_frees_the_bed(self):
        a = self.register_occupant(self.room2, "A").data
        self.register_occupant(self.room2, "B")
        self.assertEqual(self.register_occupant(self.room2, "C").status_code, 409)
        self.assertEqual(self.client.post(f"/api/provider/occupants/{a['id']}/check-out/").status_code, 200)
        self.assertEqual(self.register_occupant(self.room2, "C").status_code, 201)

    def test_students_only_see_houses_with_space(self):
        _, stoken = self.make_user("student")
        self.as_user(stoken)
        res = self.client.get("/api/boarding-houses/?sharing=shared")
        self.assertEqual(res.data["count"], 1)
        for i in range(4):
            self.register_occupant(self.room1, f"S{i}")
        for i in range(2):
            self.register_occupant(self.room2, f"P{i}")
        self.as_user(stoken)
        self.assertEqual(self.client.get("/api/boarding-houses/").data["count"], 0)

    def test_room_filters(self):
        _, stoken = self.make_user("picky")
        self.as_user(stoken)
        res = self.client.get("/api/boarding-houses/?max_price=900")
        self.assertEqual([r["name"] for r in res.data["results"][0]["rooms"]], ["Room 01"])
        self.assertEqual(self.client.get("/api/boarding-houses/?sharing=private").data["count"], 0)

    def test_other_provider_cannot_manage_rooms(self):
        _, other = self.make_provider("rival")
        self.as_user(other)
        self.assertEqual(self.client.get(f"/api/provider/boarding-houses/{self.house.id}/report/").status_code, 404)
        self.assertEqual(self.client.patch(f"/api/provider/rooms/{self.room1.id}/", {"capacity": 20}, format="json").status_code, 404)


# ---------------------------------------------------------------------------
@FAST
class BookingAndPaymentTests(Base):
    def setUp(self):
        super().setUp()
        self.provider, self.ptoken = self.make_provider("host")
        self.guest, self.gtoken = self.make_user("guest")
        CommissionRate.objects.filter(category="stay").update(rate=Decimal("0.12"), processing_fee_rate=Decimal("0.02"))

    def test_request_booking_flow_with_payment_and_commission(self):
        listing = self.make_listing(self.ptoken, kind="stay", price="500.00")
        res = self.book_stay(self.gtoken, listing, nights=3)
        self.assertEqual(res.status_code, 201, res.data)
        booking = res.data
        self.assertEqual((booking["status"], booking["total_amount"]), ("pending", "1500.00"))
        self.assertTrue(Notification.objects.filter(user=self.provider, kind="booking_request").exists())
        # Can't pay before acceptance.
        self.as_user(self.gtoken)
        self.assertEqual(self.client.post(f"/api/bookings/{booking['id']}/pay/").status_code, 400)
        # Provider accepts.
        self.as_user(self.ptoken)
        res = self.client.post(f"/api/provider/bookings/{booking['id']}/accept/", {"note": "Welcome"}, format="json")
        self.assertEqual(res.data["status"], "awaiting_payment")
        # Guest pays; backend verifies and confirms.
        payment = self.pay(self.gtoken, booking["id"])
        self.assertEqual(payment["status"], "successful")
        b = Booking.objects.get(pk=booking["id"])
        self.assertEqual(b.status, "confirmed")
        c = b.commission
        self.assertEqual(
            (c.gross_amount, c.amount, c.processing_fee, c.provider_net, c.status),
            (Decimal("1500.00"), Decimal("180.00"), Decimal("30.00"), Decimal("1290.00"), "earned"),
        )
        # Receipt.
        receipt = self.client.get(f"/api/payments/{payment['id']}/receipt/").data
        self.assertEqual(receipt["amount"], "1500.00")
        # Provider dashboard reflects the money.
        self.as_user(self.ptoken)
        dash = self.client.get("/api/provider/dashboard/").data
        self.assertEqual(dash["money"]["net_revenue"], "1290.00")

    def test_rejection(self):
        listing = self.make_listing(self.ptoken)
        booking = self.book_stay(self.gtoken, listing).data
        self.as_user(self.ptoken)
        res = self.client.post(f"/api/provider/bookings/{booking['id']}/reject/", {"note": "Closed"}, format="json")
        self.assertEqual(res.data["status"], "rejected")
        self.assertTrue(Notification.objects.filter(user=self.guest, kind="booking_rejected").exists())

    def test_instant_booking_and_double_booking_prevention(self):
        listing = self.make_listing(self.ptoken, booking_mode="instant")
        res = self.book_stay(self.gtoken, listing, days_ahead=10, nights=3)
        self.assertEqual(res.data["status"], "awaiting_payment")
        # Same dates while the first guest's hold is live: refused.
        _, other = self.make_user("other")
        self.assertEqual(self.book_stay(other, listing, days_ahead=11, nights=1).status_code, 409)
        # Adjacent dates are fine.
        self.assertEqual(self.book_stay(other, listing, days_ahead=13, nights=2).status_code, 201)
        self.pay(self.gtoken, res.data["id"])
        self.assertEqual(Booking.objects.get(pk=res.data["id"]).status, "confirmed")

    def test_unpaid_hold_expires_and_releases_dates(self):
        listing = self.make_listing(self.ptoken, booking_mode="instant")
        first = self.book_stay(self.gtoken, listing).data
        Booking.objects.filter(pk=first["id"]).update(payment_due_at=timezone.now() - timedelta(minutes=1))
        _, other = self.make_user("other")
        self.assertEqual(self.book_stay(other, listing).status_code, 201)
        self.assertEqual(Booking.objects.get(pk=first["id"]).status, "cancelled")

    def test_failed_payment_keeps_booking_unpaid(self):
        listing = self.make_listing(self.ptoken, booking_mode="instant")
        booking = self.book_stay(self.gtoken, listing).data
        result = self.pay(self.gtoken, booking["id"], outcome="failed")
        self.assertEqual(result["status"], "failed")
        self.assertEqual(Booking.objects.get(pk=booking["id"]).status, "awaiting_payment")

    def test_payment_cannot_be_settled_twice_or_by_others(self):
        listing = self.make_listing(self.ptoken, booking_mode="instant")
        booking = self.book_stay(self.gtoken, listing).data
        self.as_user(self.gtoken)
        tx_ref = self.client.post(f"/api/bookings/{booking['id']}/pay/").data["tx_ref"]
        _, thief = self.make_user("thief")
        self.as_user(thief)
        self.assertEqual(
            self.client.post("/api/payments/sandbox/complete/", {"tx_ref": tx_ref, "outcome": "successful"}).status_code, 404
        )
        self.assertEqual(self.client.get(f"/api/bookings/{booking['id']}/").status_code, 404)
        self.as_user(self.gtoken)
        self.client.post("/api/payments/sandbox/complete/", {"tx_ref": tx_ref, "outcome": "successful"})
        again = self.client.post("/api/payments/sandbox/complete/", {"tx_ref": tx_ref, "outcome": "successful"})
        self.assertEqual(again.status_code, 400)
        self.assertEqual(Payment.objects.filter(status="successful").count(), 1)

    def test_amount_comes_from_server_not_client(self):
        listing = self.make_listing(self.ptoken, booking_mode="instant", price="700.00")
        self.as_user(self.gtoken)
        start = timezone.localdate() + timedelta(days=3)
        res = self.client.post(
            "/api/bookings/",
            {"listing_id": listing.id, "guest_name": "G", "guest_phone": "0977123456", "check_in": str(start), "check_out": str(start + timedelta(days=2)), "total_amount": "1.00"},
            format="json",
        )
        self.assertEqual(res.data["total_amount"], "1400.00")

    def test_tampered_gateway_amount_is_rejected(self):
        listing = self.make_listing(self.ptoken, booking_mode="instant")
        booking = self.book_stay(self.gtoken, listing).data
        self.as_user(self.gtoken)
        tx_ref = self.client.post(f"/api/bookings/{booking['id']}/pay/").data["tx_ref"]
        cheap = gateways.VerifyResult(status="successful", tx_ref=tx_ref, amount=Decimal("1"), currency="ZMW", transaction_id="99")
        with mock.patch.object(gateways.SandboxGateway, "verify", return_value=cheap):
            res = self.client.post("/api/payments/verify/", {"tx_ref": tx_ref}, format="json")
        self.assertEqual(res.data["status"], "failed")
        self.assertEqual(Booking.objects.get(pk=booking["id"]).status, "awaiting_payment")

    def test_guest_cancellation_refund_policy(self):
        listing = self.make_listing(self.ptoken, booking_mode="instant")
        booking = self.book_stay(self.gtoken, listing, days_ahead=10).data
        self.pay(self.gtoken, booking["id"])
        self.as_user(self.gtoken)
        res = self.client.post(f"/api/bookings/{booking['id']}/cancel/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("refund", res.data["message"])
        payment = Payment.objects.get(booking_id=booking["id"])
        self.assertEqual(payment.status, "refunded")
        self.assertEqual(Commission.objects.get(booking_id=booking["id"]).status, "refunded")

    def test_webhook_requires_secret(self):
        res = self.client.post("/api/payments/webhooks/flutterwave/", {"data": {"tx_ref": "x"}}, format="json")
        self.assertEqual(res.status_code, 401)

    def test_sale_listings_are_enquiry_only(self):
        listing = self.make_listing(self.ptoken, kind="sale", price="900000")
        self.as_user(self.gtoken)
        start = timezone.localdate() + timedelta(days=2)
        res = self.client.post(
            "/api/bookings/",
            {"listing_id": listing.id, "guest_name": "G", "guest_phone": "0977123456", "check_in": str(start), "months": 1},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        res = self.client.post("/api/enquiries/", {"listing_id": listing.id, "name": "G", "phone": "0977", "message": "Viewing?"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertTrue(Notification.objects.filter(user=self.provider, kind="enquiry").exists())


# ---------------------------------------------------------------------------
@FAST
class StudentBookingTests(Base):
    def setUp(self):
        super().setUp()
        self.provider, self.ptoken = self.make_provider("bhouse")
        self.house = self.make_boarding_house(
            self.ptoken,
            rooms=[{"name": "Room 01", "room_type": "single", "capacity": 1, "price_per_bed": "900.00"}],
            booking_mode="instant",
        )
        self.room = self.house.rooms.get()
        self.student, self.stoken = self.make_user("student")

    def test_paid_room_booking_reserves_bed_then_check_in(self):
        res = self.book_room(self.stoken, self.room, months=2)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["total_amount"], "1800.00")
        # The bed is held while unpaid: a second student can't take it.
        _, other = self.make_user("other")
        self.assertEqual(self.book_room(other, self.room).status_code, 409)
        self.pay(self.stoken, res.data["id"])
        tenancy = BoardingTenancy.objects.get(student=self.student)
        self.assertEqual(tenancy.status, "reserved")
        self.assertEqual(tenancy.institution, "UNZA")
        self.as_user(self.ptoken)
        self.client.post(f"/api/provider/occupants/{tenancy.id}/check-in/")
        report = self.client.get(f"/api/provider/boarding-houses/{self.house.id}/report/").data
        self.assertEqual((report["totals"]["occupied"], report["totals"]["available"]), (1, 0))
        self.as_user(self.stoken)
        self.assertEqual(self.client.get("/api/placement/").data["placement"]["status"], "active")
        # Check-out completes the booking and allows a review.
        self.as_user(self.ptoken)
        self.client.post(f"/api/provider/occupants/{tenancy.id}/check-out/")
        self.as_user(self.stoken)
        review = self.client.post(f"/api/bookings/{res.data['id']}/review/", {"rating": 5, "comment": "Clean"}, format="json")
        self.assertEqual(review.status_code, 201)

    def test_one_bed_per_student(self):
        self.book_room(self.stoken, self.room)
        self.as_user(self.ptoken)
        self.client.patch(f"/api/provider/rooms/{self.room.id}/", {"capacity": 2}, format="json")
        self.assertEqual(self.book_room(self.stoken, self.room).status_code, 400)


# ---------------------------------------------------------------------------
@FAST
class FavouritesTests(Base):
    def test_favourites_belong_to_the_user(self):
        _, ptoken = self.make_provider("favprov")
        listing = self.make_listing(ptoken)
        house = self.make_boarding_house(ptoken)
        _, a = self.make_user("abel")
        _, b = self.make_user("bupe")
        self.as_user(a)
        self.assertEqual(self.client.post("/api/favourites/", {"listing_id": listing.id}).status_code, 201)
        self.assertEqual(self.client.post("/api/favourites/", {"listing_id": listing.id}).status_code, 200)  # idempotent
        self.client.post("/api/favourites/", {"boarding_house_id": house.id})
        self.assertEqual(len(self.client.get("/api/favourites/").data), 2)
        self.assertTrue(self.client.get(f"/api/listings/{listing.id}/").data["is_favourite"])
        self.as_user(b)
        self.assertEqual(len(self.client.get("/api/favourites/").data), 0)
        self.as_user(a)
        self.client.delete(f"/api/favourites/remove/?listing_id={listing.id}")
        self.assertEqual(Favourite.objects.count(), 1)


# ---------------------------------------------------------------------------
@FAST
class AdminTests(Base):
    def test_overview_and_commission_rates(self):
        self.as_admin()
        self.assertEqual(self.client.get("/api/admin/overview/").status_code, 200)
        res = self.client.patch("/api/admin/commission-rates/", {"category": "boarding", "rate": "0.08"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(CommissionRate.objects.get(category="boarding").rate, Decimal("0.0800"))
        res = self.client.patch("/api/admin/commission-rates/", {"category": "boarding", "rate": "0.9"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_payout_settles_earned_commissions(self):
        provider, ptoken = self.make_provider("payee")
        listing = self.make_listing(ptoken, booking_mode="instant")
        _, gtoken = self.make_user("payer")
        booking = self.book_stay(gtoken, listing).data
        self.pay(gtoken, booking["id"])
        self.as_admin()
        owed = self.client.get("/api/admin/payouts/").data["owed"]
        self.assertEqual(owed[0]["amount"], "1350.00")
        res = self.client.post("/api/admin/payouts/", {"provider_id": provider.id, "reference": "MTN-123"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Commission.objects.get(booking_id=booking["id"]).status, "paid_out")
        self.assertEqual(self.client.get("/api/admin/payouts/").data["owed"], [])


# ---------------------------------------------------------------------------
@FAST
class SecurityAndModerationTests(Base):
    def setUp(self):
        super().setUp()
        self.provider, self.ptoken = self.make_provider("ownerx")
        self.other, self.otoken = self.make_provider("otherx")
        self.guest, self.gtoken = self.make_user("guestx")

    def test_provider_cannot_decide_another_providers_booking(self):
        listing = self.make_listing(self.ptoken)
        booking = self.book_stay(self.gtoken, listing).data
        self.as_user(self.otoken)
        self.assertEqual(self.client.post(f"/api/provider/bookings/{booking['id']}/accept/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/bookings/{booking['id']}/").status_code, 404)
        self.assertEqual(Booking.objects.get(pk=booking["id"]).status, "pending")

    def test_cannot_book_own_listing_or_pay_someone_elses_booking(self):
        listing = self.make_listing(self.ptoken, booking_mode="instant")
        self.assertEqual(self.book_stay(self.ptoken, listing).status_code, 400)
        booking = self.book_stay(self.gtoken, listing).data
        self.as_user(self.otoken)
        self.assertEqual(self.client.post(f"/api/bookings/{booking['id']}/pay/").status_code, 404)
        self.assertEqual(self.client.post(f"/api/bookings/{booking['id']}/cancel/").status_code, 404)

    def test_removed_listing_disappears_and_cannot_be_booked(self):
        listing = self.make_listing(self.ptoken, booking_mode="instant")
        self.as_admin()
        self.assertEqual(self.client.post(f"/api/admin/listings/{listing.id}/remove/", {}).status_code, 400)  # reason required
        self.client.post(f"/api/admin/listings/{listing.id}/remove/", {"note": "Fake photos"}, format="json")
        self.logout_client()
        self.as_user(self.gtoken)
        self.assertEqual(self.client.get("/api/listings/search/").data["count"], 0)
        self.assertEqual(self.book_stay(self.gtoken, listing).status_code, 404)
        self.as_user(self.ptoken)
        res = self.client.patch(f"/api/provider/listings/{listing.id}/", {"is_published": True}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_request_based_room_booking_with_acceptance(self):
        house = self.make_boarding_house(self.ptoken, rooms=[{"name": "R1", "room_type": "double", "capacity": 2, "price_per_bed": "1000"}])
        room = house.rooms.get()
        res = self.book_room(self.gtoken, room)
        self.assertEqual(res.data["status"], "pending")
        # Pending requests don't hold the bed, so availability is unchanged until acceptance.
        self.as_user(self.gtoken)
        self.assertEqual(self.client.get(f"/api/boarding-houses/{house.id}/").data["totals"]["available"], 2)
        self.as_user(self.ptoken)
        self.assertEqual(self.client.post(f"/api/provider/bookings/{res.data['id']}/accept/").data["status"], "awaiting_payment")
        self.as_user(self.gtoken)
        self.assertEqual(self.client.get(f"/api/boarding-houses/{house.id}/").data["totals"]["available"], 1)
        self.pay(self.gtoken, res.data["id"])
        self.assertEqual(BoardingTenancy.objects.get(booking_id=res.data["id"]).status, "reserved")

    def test_unapproved_or_unpublished_boarding_house_is_hidden(self):
        house = self.make_boarding_house(self.ptoken, approve=False)
        self.as_user(self.gtoken)
        self.assertEqual(self.client.get("/api/boarding-houses/").data["count"], 0)
        self.assertEqual(self.client.get(f"/api/boarding-houses/{house.id}/").status_code, 404)
        self.as_admin()
        self.client.post(f"/api/admin/boarding-houses/{house.id}/approve/")
        self.logout_client()
        self.as_user(self.ptoken)
        self.client.patch(f"/api/provider/boarding-houses/{house.id}/", {"is_active": False}, format="json")
        self.as_user(self.gtoken)
        self.assertEqual(self.client.get("/api/boarding-houses/").data["count"], 0)

    def test_users_cannot_read_each_others_notifications_or_payments(self):
        listing = self.make_listing(self.ptoken, booking_mode="instant")
        booking = self.book_stay(self.gtoken, listing).data
        payment = self.pay(self.gtoken, booking["id"])
        self.as_user(self.otoken)
        self.assertEqual(self.client.get(f"/api/payments/{payment['id']}/receipt/").status_code, 404)
        self.assertEqual(self.client.get("/api/payments/").data, [])
        self.assertFalse(any(n["kind"] == "booking_confirmed" for n in self.client.get("/api/notifications/").data["results"]))

    def test_occupant_registration_never_exceeds_capacity_under_repeated_requests(self):
        house = self.make_boarding_house(self.ptoken, rooms=[{"name": "Solo", "room_type": "single", "capacity": 1, "price_per_bed": "900"}])
        room = house.rooms.get()
        self.as_user(self.ptoken)
        codes = [
            self.client.post(f"/api/provider/boarding-houses/{house.id}/occupants/", {"room_id": room.id, "occupant_name": f"P{i}"}, format="json").status_code
            for i in range(3)
        ]
        self.assertEqual(codes, [201, 409, 409])
        self.assertEqual(BoardingTenancy.objects.filter(room=room, status="active").count(), 1)


@FAST
class ImageUploadTests(Base):
    def test_upload_validates_type_and_ownership(self):
        import io
        import shutil
        import tempfile

        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image

        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        with override_settings(MEDIA_ROOT=media):
            _, token = self.make_provider("photog")
            _, rival = self.make_provider("rivalp")
            listing = self.make_listing(token)
            buf = io.BytesIO()
            Image.new("RGB", (40, 30), "white").save(buf, "JPEG")
            good = SimpleUploadedFile("house.jpg", buf.getvalue(), content_type="image/jpeg")
            fake = SimpleUploadedFile("evil.jpg", b"not an image", content_type="image/jpeg")
            url = f"/api/provider/properties/{listing.property_id}/images/"
            self.as_user(rival)
            self.assertEqual(self.client.post(url, {"images": [good]}, format="multipart").status_code, 404)
            self.as_user(token)
            self.assertEqual(self.client.post(url, {"images": [fake]}, format="multipart").status_code, 400)
            good.seek(0)
            res = self.client.post(url, {"images": [good]}, format="multipart")
            self.assertEqual(res.status_code, 201, res.data)
            self.assertEqual(Property.objects.get(pk=listing.property_id).images.count(), 1)
