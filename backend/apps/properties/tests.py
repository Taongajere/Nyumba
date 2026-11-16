from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .models import BoardingHouse, BoardingTenancy, Property, UserProfile

PASSWORD = "Sturdy-pass-2026"

# Production hashing (PBKDF2) is deliberately slow; tests use a fast hasher.
FAST_HASHERS = override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"]
)


@FAST_HASHERS
class AccountTests(APITestCase):
    def register(self, username, **extra):
        payload = {"username": username, "password": PASSWORD, **extra}
        return self.client.post("/api/register/", payload, format="json")

    def test_register_provider(self):
        res = self.register("landlord1", role="provider", business_name="Kabwata Rooms")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["role"], "provider")
        self.assertEqual(res.data["user_type"], "")
        self.assertEqual(res.data["profile"]["verification_status"], "pending")
        self.assertEqual(res.data["profile"]["business_name"], "Kabwata Rooms")
        self.assertIn("token", res.data)

    def test_register_student_requires_institution_and_student_id(self):
        res = self.register("stud1", role="user", user_type="student")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("institution", res.data["fields"])
        self.assertIn("student_id", res.data["fields"])

    def test_register_student_with_details(self):
        res = self.register(
            "stud2",
            role="user",
            user_type="student",
            institution="UNZA",
            student_id="2026-0042",
            emergency_contact_name="Mum",
            emergency_contact_phone="+260971000000",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["user_type"], "student")
        self.assertEqual(res.data["profile"]["institution"], "UNZA")

    def test_general_seeker_defaults(self):
        res = self.register("seeker1")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["role"], "user")
        self.assertEqual(res.data["user_type"], "general_seeker")

    def test_invalid_role_rejected(self):
        res = self.register("bad1", role="admin")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_username_rejected(self):
        self.register("dupe")
        res = self.register("dupe")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already taken", res.data["error"])

    def test_login_returns_role_and_profile(self):
        self.register("landlord2", role="provider")
        res = self.client.post(
            "/api/login/", {"username": "landlord2", "password": PASSWORD}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["role"], "provider")
        self.assertEqual(res.data["profile"]["role"], "provider")

    def test_login_wrong_password(self):
        self.register("seeker2")
        res = self.client.post("/api/login/", {"username": "seeker2", "password": "nope"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_get_and_patch(self):
        self.register("seeker3")
        token = self.client.post(
            "/api/login/", {"username": "seeker3", "password": PASSWORD}, format="json"
        ).data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")

        res = self.client.patch("/api/profile/", {"phone_number": "+260977000111"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["profile"]["phone_number"], "+260977000111")

        # Role is fixed at registration and cannot be changed through the profile endpoint.
        res = self.client.patch("/api/profile/", {"role": "provider"}, format="json")
        self.assertEqual(res.data["role"], "user")


@FAST_HASHERS
class ProviderPermissionTests(APITestCase):
    def setUp(self):
        self.provider = User.objects.create_user("prov", password=PASSWORD)
        UserProfile.objects.create(user=self.provider, role="provider")
        self.other_provider = User.objects.create_user("prov2", password=PASSWORD)
        UserProfile.objects.create(user=self.other_provider, role="provider")
        self.student = User.objects.create_user("stud", password=PASSWORD)
        UserProfile.objects.create(
            user=self.student, role="user", user_type="student", institution="UNZA", student_id="1"
        )
        self.seeker = User.objects.create_user("seek", password=PASSWORD)
        UserProfile.objects.create(user=self.seeker, role="user", user_type="general_seeker")

    def as_user(self, user):
        self.client.force_authenticate(user=user)

    def test_seeker_cannot_create_listing(self):
        self.as_user(self.student)
        res = self.client.post(
            "/api/listings/create/",
            {"title": "X", "address": "Y", "price": "1000", "kind": "rent"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Property.objects.exists())

    def test_provider_creates_listing(self):
        self.as_user(self.provider)
        res = self.client.post(
            "/api/listings/create/",
            {"title": "Roomy", "address": "Plot 4", "price": "1500.50", "kind": "rent", "bedrooms": 3},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Property.objects.get().owner, self.provider)

    def test_listing_rejects_bad_price_without_500(self):
        self.as_user(self.provider)
        res = self.client.post(
            "/api/listings/create/",
            {"title": "X", "address": "Y", "price": "-5", "kind": "rent"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Property.objects.exists())

    def test_dashboard_is_provider_only(self):
        self.as_user(self.seeker)
        self.assertEqual(self.client.get("/api/dashboard/").status_code, status.HTTP_403_FORBIDDEN)
        self.as_user(self.provider)
        self.assertEqual(self.client.get("/api/dashboard/").status_code, status.HTTP_200_OK)


@FAST_HASHERS
class BoardingHouseTests(APITestCase):
    def setUp(self):
        self.provider = User.objects.create_user("owner", password=PASSWORD)
        UserProfile.objects.create(user=self.provider, role="provider")
        self.other_provider = User.objects.create_user("owner2", password=PASSWORD)
        UserProfile.objects.create(user=self.other_provider, role="provider")

        self.student_a = self.make_student("stud_a")
        self.student_b = self.make_student("stud_b")
        self.student_c = self.make_student("stud_c")

        self.prop = Property.objects.create(
            owner=self.provider, title="Kalundu House", address="Plot 12", neighbourhood="Kalundu"
        )
        self.house = BoardingHouse.objects.create(
            property=self.prop, name="Kalundu Boarders", capacity=2, rent_per_bed=Decimal("900.00")
        )

    def make_student(self, username):
        user = User.objects.create_user(username, password=PASSWORD)
        UserProfile.objects.create(
            user=user, role="user", user_type="student", institution="UNZA", student_id=username
        )
        return user

    def make_seeker(self, username):
        user = User.objects.create_user(username, password=PASSWORD)
        UserProfile.objects.create(user=user, role="user", user_type="general_seeker")
        return user

    def as_user(self, user):
        self.client.force_authenticate(user=user)

    def assign(self, username):
        return self.client.post(
            f"/api/provider/boarding-houses/{self.house.id}/tenants/",
            {"username": username, "term": "2027 S1", "move_in_date": "2027-01-15"},
            format="json",
        )

    def test_provider_creates_boarding_house_for_own_property_only(self):
        self.as_user(self.provider)
        other_prop = Property.objects.create(owner=self.other_provider, title="Other", address="Z")
        res = self.client.post(
            "/api/provider/boarding-houses/",
            {"property_id": other_prop.id, "name": "Nope", "capacity": 3},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        new_prop = Property.objects.create(owner=self.provider, title="Chilenje", address="Plot 9")
        res = self.client.post(
            "/api/provider/boarding-houses/",
            {"property_id": new_prop.id, "name": "Chilenje Rooms", "capacity": 4, "rent_per_bed": "850"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["capacity"], 4)
        self.assertEqual(res.data["spaces_available"], 4)

    def test_seeker_cannot_manage_boarding_houses(self):
        self.as_user(self.make_seeker("nosy"))
        res = self.client.get("/api/provider/boarding-houses/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_provider_cannot_see_other_providers_house(self):
        self.as_user(self.other_provider)
        res = self.client.get(f"/api/provider/boarding-houses/{self.house.id}/tenants/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_assign_respects_capacity(self):
        self.as_user(self.provider)
        self.assertEqual(self.assign("stud_a").status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.assign("stud_b").status_code, status.HTTP_201_CREATED)
        res = self.assign("stud_c")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no open bed spaces", res.data["error"])

        summary = self.client.get(f"/api/provider/boarding-houses/{self.house.id}/tenants/").data["summary"]
        self.assertEqual(summary, {"capacity": 2, "occupied": 2, "available": 0})

    def test_assign_rejects_non_student(self):
        self.as_user(self.provider)
        self.make_seeker("walkin")
        res = self.assign("walkin")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_capacity_cannot_drop_below_occupancy(self):
        self.as_user(self.provider)
        self.assign("stud_a")
        self.assign("stud_b")
        res = self.client.patch(
            f"/api/provider/boarding-houses/{self.house.id}/", {"capacity": 1}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_student_apply_approve_and_checkout(self):
        self.as_user(self.student_a)
        res = self.client.post(
            f"/api/boarding-houses/{self.house.id}/apply/", {"term": "2027 S1"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        tenancy_id = res.data["tenancy"]["id"]
        self.assertEqual(res.data["tenancy"]["status"], "requested")

        self.as_user(self.provider)
        res = self.client.post(f"/api/provider/tenancies/{tenancy_id}/approve/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["tenancy"]["status"], "active")
        self.assertIsNotNone(res.data["tenancy"]["move_in_date"])

        res = self.client.post(f"/api/provider/tenancies/{tenancy_id}/checkout/")
        self.assertEqual(res.data["tenancy"]["status"], "checked_out")
        self.assertEqual(res.data["tenancy"]["student_username"], "stud_a")

        # Once checked out, the bed space is free again.
        self.assertEqual(self.assign("stud_c").status_code, status.HTTP_201_CREATED)

    def test_approval_blocked_when_house_is_full(self):
        self.as_user(self.student_a)
        first = self.client.post(f"/api/boarding-houses/{self.house.id}/apply/", {}, format="json")
        self.as_user(self.student_b)
        second = self.client.post(f"/api/boarding-houses/{self.house.id}/apply/", {}, format="json")

        self.as_user(self.provider)
        self.assertEqual(self.assign("stud_c").status_code, status.HTTP_201_CREATED)
        res = self.client.post(f"/api/provider/tenancies/{first.data['tenancy']['id']}/approve/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        res = self.client.post(f"/api/provider/tenancies/{second.data['tenancy']['id']}/approve/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_student_holds_one_open_place_at_a_time(self):
        other = BoardingHouse.objects.create(
            property=Property.objects.create(owner=self.provider, title="Second", address="B"),
            name="Second House",
            capacity=5,
        )
        self.as_user(self.student_a)
        self.assertEqual(
            self.client.post(f"/api/boarding-houses/{self.house.id}/apply/", {}, format="json").status_code,
            status.HTTP_201_CREATED,
        )
        res = self.client.post(f"/api/boarding-houses/{other.id}/apply/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_browse_hides_full_and_inactive_houses(self):
        self.as_user(self.provider)
        self.assign("stud_a")
        self.assign("stud_b")

        self.as_user(self.student_c)
        self.assertEqual(self.client.get("/api/boarding-houses/").data, [])

        self.as_user(self.provider)
        self.client.patch(f"/api/provider/boarding-houses/{self.house.id}/", {"capacity": 3}, format="json")
        self.as_user(self.student_c)
        houses = self.client.get("/api/boarding-houses/").data
        self.assertEqual(len(houses), 1)
        self.assertEqual(houses[0]["spaces_available"], 1)

        self.as_user(self.provider)
        self.client.patch(f"/api/provider/boarding-houses/{self.house.id}/", {"is_active": False}, format="json")
        self.as_user(self.student_c)
        self.assertEqual(self.client.get("/api/boarding-houses/").data, [])

    def test_general_seeker_cannot_apply(self):
        self.as_user(self.make_seeker("casual"))
        res = self.client.post(f"/api/boarding-houses/{self.house.id}/apply/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_can_cancel_only_their_request(self):
        self.as_user(self.student_a)
        res = self.client.post(f"/api/boarding-houses/{self.house.id}/apply/", {}, format="json")
        tenancy_id = res.data["tenancy"]["id"]
        res = self.client.post(f"/api/student/tenancies/{tenancy_id}/cancel/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(BoardingTenancy.objects.get(id=tenancy_id).status, "cancelled")

        self.as_user(self.student_b)
        res = self.client.post(f"/api/student/tenancies/{tenancy_id}/cancel/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_placement_summary_and_payment_tracking(self):
        self.as_user(self.provider)
        res = self.assign("stud_a")
        tenancy_id = res.data["id"]

        res = self.client.patch(
            f"/api/provider/tenancies/{tenancy_id}/",
            {"amount_paid": "500.00", "payment_status": "partial"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["payment_status"], "partial")

        self.as_user(self.student_a)
        placement = self.client.get("/api/student/placement/").data
        self.assertEqual(placement["active"]["boarding_house_name"], "Kalundu Boarders")
        self.assertEqual(placement["active"]["balance"], "400.00")
        self.assertEqual(placement["requests"], [])
