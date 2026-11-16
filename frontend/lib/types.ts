// Shapes returned by the Django API.

export type ProviderStatus = "none" | "pending" | "rejected" | "approved" | "suspended";
export type Mode = "marketplace" | "provider";

export type ProviderApplication = {
  id: number;
  provider_type: string;
  business_name: string;
  phone_number: string;
  town: string;
  business_registration_number: string;
  property_count_estimate: number;
  description: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string;
  can_reapply: boolean;
  reviewed_at: string | null;
  created_at: string;
};

export type Me = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_admin: boolean;
  provider_status: ProviderStatus;
  can_use_provider_tools: boolean;
  active_mode: Mode;
  profile: {
    phone_number: string;
    town: string;
    institution: string;
    student_id: string;
    emergency_contact_name: string;
    emergency_contact_phone: string;
    active_mode: Mode;
  };
  provider: { business_name: string; provider_type: string; status: string; suspension_reason: string } | null;
  latest_application: ProviderApplication | null;
};

export type ListingKind = "rent" | "sale" | "stay";

export type PropertyImage = { id: number; url: string; caption: string; order: number };

export type Property = {
  id: number;
  title: string;
  description: string;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  size_sqm: number | null;
  furnishing: string;
  amenities: string[];
  address: string;
  neighbourhood: string;
  town: string;
  latitude: number | null;
  longitude: number | null;
  owner_verified: boolean;
  property_verified: boolean;
  images: PropertyImage[];
};

export type ProviderCard = { id: number; name: string; provider_type: string; phone_number: string; member_since: number };

export type Listing = {
  id: number;
  kind: ListingKind;
  price: string;
  status: string;
  is_published: boolean;
  booking_mode: "request" | "instant";
  available_from: string | null;
  property: Property;
  provider: ProviderCard;
  is_favourite: boolean;
  rating: { average: number | null; count: number };
  created_at: string;
};

export type Occupancy = { capacity: number; occupied: number; reserved: number; held: number; available: number };

export type Room = {
  id: number;
  name: string;
  room_type: string;
  capacity: number;
  price_per_bed: string;
  has_private_bathroom: boolean;
  is_active: boolean;
  is_shared: boolean;
  occupancy: Occupancy;
};

export type BoardingHouse = {
  id: number;
  name: string;
  description: string;
  near_institution: string;
  gender_policy: "mixed" | "female" | "male";
  amenities: string[];
  rules: string;
  booking_mode: "request" | "instant";
  is_active: boolean;
  is_approved: boolean;
  property: Property;
  rooms: Room[];
  totals: Occupancy & { occupancy_rate: number };
  price_from: string | null;
  provider: ProviderCard;
  is_favourite: boolean;
};

export type Payment = {
  id: number;
  booking: number;
  booking_reference: string;
  gateway: string;
  tx_ref: string;
  gateway_transaction_id: string | null;
  amount: string;
  currency: string;
  method: string;
  status: string;
  checkout_url: string;
  failure_reason: string;
  refunded_amount: string;
  verified_at: string | null;
  created_at: string;
};

export type BookingStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "awaiting_payment"
  | "confirmed"
  | "cancelled"
  | "completed";

export type Booking = {
  id: number;
  reference: string;
  category: "stay" | "rent" | "boarding";
  booking_mode: "request" | "instant";
  status: BookingStatus;
  guest_name: string;
  guest_phone: string;
  guest_username: string | null;
  message: string;
  check_in: string;
  check_out: string;
  periods: number;
  unit_price: string;
  total_amount: string;
  payment_due_at: string | null;
  decision_note: string;
  decided_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string;
  created_at: string;
  target: {
    type: "listing" | "room";
    listing_id?: number;
    boarding_house_id?: number;
    room_id?: number;
    kind?: ListingKind;
    title: string;
    address: string;
    neighbourhood: string;
    provider: ProviderCard;
  };
  commission: {
    gross_amount: string;
    rate: string;
    amount: string;
    processing_fee: string;
    provider_net: string;
    status: string;
  } | null;
  payments: Payment[];
  can_pay: boolean;
  can_cancel: boolean;
  can_review: boolean;
};

export type Notification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  is_read: boolean;
  created_at: string;
};

export type Tenancy = {
  id: number;
  room_id: number;
  room_name: string;
  boarding_house_id: number;
  boarding_house_name: string;
  username: string | null;
  booking_reference: string | null;
  occupant_name: string;
  occupant_phone: string;
  institution: string;
  student_number: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  status: "reserved" | "active" | "checked_out" | "cancelled";
  term: string;
  check_in_date: string | null;
  check_out_date: string | null;
  lease_end: string | null;
  rent_amount: string;
  amount_paid: string;
  balance: string;
  payment_status: string;
  notes: string;
  created_at: string;
};
