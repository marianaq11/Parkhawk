export type Profile = {
  id: string;
  email: string;
  display_name: string;
  role: "USER" | "ADMIN";
  reliability_score: number;
  reporting_suspended_until: string | null;
  created_at: string;
};
export type Location = {
  id: string;
  name: string;
  description: string;
  location_type: "GARAGE" | "SURFACE_LOT" | "DECK";
  active: boolean;
  created_at: string;
};
export type Report = {
  id: string;
  user_id: string;
  parking_location_id: string;
  report_type: "OPEN_SPOT" | "LEAVING_SOON" | "SEARCHING" | "TRAFFIC";
  zone_or_floor: string | null;
  quantity: number | null;
  leaving_eta_minutes: number | null;
  traffic_level: "LIGHT" | "MODERATE" | "HEAVY" | null;
  note: string | null;
  status: "ACTIVE" | "CLOSED" | "REMOVED";
  created_at: string;
  expires_at: string;
};
export type Feedback = {
  id: string;
  report_id: string;
  user_id: string;
  feedback_type: "STILL_OPEN" | "TAKEN";
  created_at: string;
};
export type Snapshot = {
  profiles: Profile[];
  locations: Location[];
  reports: Report[];
  feedback: Feedback[];
};
